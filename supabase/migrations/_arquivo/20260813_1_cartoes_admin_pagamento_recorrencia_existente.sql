-- Correcao operacional de cartoes: Rose admin, baixa transacional e adocao de compra existente.

update public.user_profiles
   set role = 'admin'
 where id = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'::uuid
   and role is distinct from 'admin';

create or replace function public.financeiro_cartoes_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_profiles up
     where up.id = (select auth.uid())
       and up.role = 'admin'
  );
$$;

revoke all on function public.financeiro_cartoes_is_admin() from public, anon;
grant execute on function public.financeiro_cartoes_is_admin() to authenticated, service_role;

grant update on table public.financeiro_cartao_faturas to authenticated;
alter table public.financeiro_cartao_faturas enable row level security;

drop policy if exists financeiro_cartao_faturas_update_admin on public.financeiro_cartao_faturas;
create policy financeiro_cartao_faturas_update_admin
  on public.financeiro_cartao_faturas
  for update
  to authenticated
  using (public.financeiro_cartoes_is_admin())
  with check (public.financeiro_cartoes_is_admin());

create or replace function public.financeiro_cartoes_resolve_ator(ator jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_created_by uuid;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    if not public.financeiro_cartoes_is_admin() then
      raise exception 'Perfil administrativo obrigatorio para operar cartoes.' using errcode = '42501';
    end if;
    v_ator_tipo := 'web';
    v_created_by := auth.uid();
    if v_created_by is null then
      raise exception 'Usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
    v_ator_ref := v_created_by::text;
  elsif v_role = 'service_role' then
    v_ator_tipo := coalesce(nullif(ator->>'tipo', ''), 'sistema');
    if v_ator_tipo not in ('maria','openfinance','sistema') then
      raise exception 'ator.tipo nao permitido para service_role.';
    end if;
    v_ator_ref := nullif(ator->>'ref', '');
  elsif v_role = 'maria_operacional' then
    v_ator_tipo := coalesce(nullif(ator->>'tipo', ''), 'maria');
    if v_ator_tipo <> 'maria' then
      raise exception 'ator.tipo nao permitido para maria_operacional.' using errcode = '42501';
    end if;
    v_ator_ref := nullif(ator->>'ref', '');
    if v_ator_ref is null then
      raise exception 'ator.ref obrigatorio para maria_operacional.' using errcode = '42501';
    end if;
  else
    raise exception 'papel nao autorizado para RPC de cartoes: %', v_role using errcode = '42501';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'ator_tipo', v_ator_tipo,
    'ator_ref', v_ator_ref,
    'created_by', v_created_by
  );
end;
$$;

revoke all on function public.financeiro_cartoes_resolve_ator(jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;

create or replace function public.financeiro_cartao_faturas_sync_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo_lancamento = 'fatura_cartao'
     and new.status = 'pago'
     and old.status is distinct from 'pago' then
    update public.financeiro_cartao_faturas
       set status = 'paga',
           updated_at = now()
     where conta_pagar_id = new.id
       and status <> 'paga';
  end if;

  return new;
end;
$$;

revoke all on function public.financeiro_cartao_faturas_sync_pagamento()
  from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

drop trigger if exists trg_financeiro_cartao_faturas_sync_pagamento on public.contas_pagar;
create trigger trg_financeiro_cartao_faturas_sync_pagamento
  after update of status on public.contas_pagar
  for each row execute function public.financeiro_cartao_faturas_sync_pagamento();

create or replace function public.financeiro_cartao_recorrencia_adotar(
  payload jsonb,
  ator jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_transacao public.financeiro_cartao_transacoes%rowtype;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_recorrencia public.financeiro_cartao_recorrencias%rowtype;
  v_previsao_id uuid;
  v_transacao_id uuid;
  v_data_inicio date;
  v_dia_base smallint;
  v_descricao text;
  v_estabelecimento text;
  v_valor numeric;
  v_empresa_id uuid;
  v_plano_conta_id uuid;
  v_centro_custo_id uuid;
  v_classificacao_status text;
  v_mes_candidato date;
  v_proxima_data date;
  v_candidato_competencia date;
  v_next_open jsonb;
  v_idx integer;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_transacao_id := nullif(payload->>'transacao_id', '')::uuid;
  if v_transacao_id is null then
    raise exception 'transacao_id obrigatorio para tornar compra recorrente.';
  end if;

  select * into v_transacao
    from public.financeiro_cartao_transacoes
   where id = v_transacao_id;
  if not found then
    raise exception 'transacao de cartao nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_transacao.cartao_id::text, 0));

  select * into v_transacao
    from public.financeiro_cartao_transacoes
   where id = v_transacao_id
   for update;
  if not found then
    raise exception 'transacao de cartao nao encontrada.';
  end if;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = v_transacao.fatura_id
   for update;
  if not found then
    raise exception 'fatura de origem da compra nao encontrada.';
  end if;

  select * into v_recorrencia
    from public.financeiro_cartao_recorrencias
   where transacao_origem_id = v_transacao.id
   for update;
  if found then
    select id into v_previsao_id
      from public.financeiro_cartao_recorrencia_previsoes
     where recorrencia_id = v_recorrencia.id
       and competencia > v_fatura.competencia
     order by competencia
     limit 1;
    return jsonb_build_object(
      'success', true,
      'transacao_id', v_transacao.id,
      'recorrencia_id', v_recorrencia.id,
      'previsao_id', v_previsao_id,
      'idempotent', true
    );
  end if;

  if v_fatura.status <> 'aberta' then
    raise exception 'A fatura precisa estar aberta para criar a recorrencia.';
  end if;
  if v_transacao.tipo_transacao <> 'compra' then
    raise exception 'Somente compras podem ser transformadas em recorrentes.';
  end if;
  if v_transacao.compra_parcelada_id is not null
     or coalesce(v_transacao.total_parcelas, 1) > 1
     or v_transacao.parcela_atual is not null then
    raise exception 'Compras parceladas nao podem ser transformadas em recorrentes.';
  end if;

  v_data_inicio := coalesce(nullif(payload->>'data_inicio', '')::date, v_transacao.data_compra);
  v_dia_base := coalesce(nullif(payload->>'dia_base', '')::smallint, extract(day from v_data_inicio)::smallint);
  if v_dia_base < 1 or v_dia_base > 31 then
    raise exception 'dia_base deve estar entre 1 e 31.';
  end if;

  v_descricao := coalesce(nullif(trim(payload->>'descricao'), ''), nullif(trim(v_transacao.descricao), ''));
  if v_descricao is null then
    raise exception 'descricao obrigatoria para recorrencia de cartao.';
  end if;
  v_estabelecimento := coalesce(
    nullif(trim(payload->>'estabelecimento'), ''),
    nullif(trim(v_transacao.estabelecimento), '')
  );
  if lower(trim(coalesce(payload->>'valor', v_transacao.valor::text))) in ('nan', 'infinity', '+infinity', '-infinity') then
    raise exception 'valor invalido para criar recorrencia.';
  end if;
  v_valor := round(abs(coalesce(nullif(payload->>'valor', '')::numeric, v_transacao.valor)), 2);
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor deve ser maior que zero para recorrencia de cartao.';
  end if;

  v_empresa_id := coalesce(nullif(payload->>'empresa_id', '')::uuid, v_transacao.empresa_id);
  v_plano_conta_id := coalesce(nullif(payload->>'plano_conta_id', '')::uuid, v_transacao.plano_conta_id);
  v_centro_custo_id := coalesce(nullif(payload->>'centro_custo_id', '')::uuid, v_transacao.centro_custo_id);
  v_classificacao_status := coalesce(
    nullif(payload->>'classificacao_status', ''),
    v_transacao.classificacao_status,
    'pendente'
  );
  if v_classificacao_status not in ('pendente', 'sugerida', 'confirmada') then
    raise exception 'classificacao_status invalido para recorrencia de cartao.';
  end if;
  if v_classificacao_status = 'confirmada'
     and (v_empresa_id is null or v_plano_conta_id is null or v_centro_custo_id is null) then
    raise exception 'empresa_id, plano_conta_id e centro_custo_id obrigatorios para classificacao confirmada.';
  end if;

  insert into public.financeiro_cartao_recorrencias (
    cartao_id,
    transacao_origem_id,
    data_inicio,
    dia_base,
    descricao,
    estabelecimento,
    valor,
    empresa_id,
    plano_conta_id,
    centro_custo_id,
    classificacao_status,
    ator_tipo,
    ator_ref,
    created_by
  ) values (
    v_transacao.cartao_id,
    v_transacao.id,
    v_data_inicio,
    v_dia_base,
    v_descricao,
    v_estabelecimento,
    v_valor,
    v_empresa_id,
    v_plano_conta_id,
    v_centro_custo_id,
    v_classificacao_status,
    v_actor->>'ator_tipo',
    v_actor->>'ator_ref',
    nullif(v_actor->>'created_by', '')::uuid
  )
  returning * into v_recorrencia;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_recorrencias',
    'cartao_recorrencia',
    v_recorrencia.id,
    'adotar_recorrencia_cartao',
    null,
    to_jsonb(v_recorrencia),
    payload->>'motivo'
  );

  v_mes_candidato := date_trunc('month', v_data_inicio + interval '1 month')::date;
  for v_idx in 1..24 loop
    v_proxima_data := public.financeiro_cartao_clamp_dia(
      extract(year from v_mes_candidato)::int,
      extract(month from v_mes_candidato)::int,
      v_dia_base
    );
    select c.competencia
      into v_candidato_competencia
      from public.financeiro_cartao_ciclo(v_transacao.cartao_id, v_proxima_data) c;
    if v_candidato_competencia <= v_fatura.competencia then
      v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
      continue;
    end if;

    v_next_open := public.financeiro_cartao_fatura_abrir(
      jsonb_build_object(
        'cartao_id', v_transacao.cartao_id,
        'data_compra', v_proxima_data,
        'motivo', payload->>'motivo'
      ),
      ator
    );
    if coalesce(v_next_open->>'status', '') <> 'aberta' then
      v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
      continue;
    end if;

    select id into v_previsao_id
      from public.financeiro_cartao_recorrencia_previsoes
     where recorrencia_id = v_recorrencia.id
       and fatura_id = nullif(v_next_open->>'fatura_id', '')::uuid
       and competencia > v_fatura.competencia
     limit 1;
    if v_previsao_id is not null then
      exit;
    end if;
    v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
  end loop;

  if v_previsao_id is null then
    raise exception 'nao foi possivel gerar previsao na proxima fatura aberta.';
  end if;

  return jsonb_build_object(
    'success', true,
    'transacao_id', v_transacao.id,
    'recorrencia_id', v_recorrencia.id,
    'previsao_id', v_previsao_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.financeiro_cartao_recorrencia_adotar(jsonb, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_recorrencia_adotar(jsonb, jsonb)
  to authenticated, service_role;
