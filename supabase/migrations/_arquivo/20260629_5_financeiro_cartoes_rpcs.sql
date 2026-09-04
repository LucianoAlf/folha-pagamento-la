-- Fase 2: RPCs de ingestao, fechamento e reabertura de faturas de cartao.
-- Toda escrita operacional passa por estas portas; authenticated nunca recebe DML direto nas tabelas.

create or replace function public.financeiro_cartoes_resolve_ator(ator jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_created_by uuid;
begin
  v_role := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text);

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_created_by := auth.uid();
    v_ator_ref := coalesce(v_created_by::text, 'authenticated');
  elsif v_role = 'service_role' then
    v_ator_tipo := coalesce(nullif(ator->>'tipo', ''), 'sistema');
    if v_ator_tipo not in ('maria','openfinance','sistema') then
      raise exception 'ator.tipo nao permitido para service_role.';
    end if;
    v_ator_ref := nullif(ator->>'ref', '');
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

create or replace function public.financeiro_cartoes_audit_insert(
  p_ator jsonb,
  p_tabela text,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_operacao text,
  p_antes jsonb,
  p_depois jsonb,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ator_tipo text;
  v_ator_ref text;
  v_numero_hash text;
  v_last4 text;
begin
  v_ator_tipo := coalesce(nullif(p_ator->>'ator_tipo', ''), 'sistema');
  v_ator_ref := coalesce(nullif(p_ator->>'ator_ref', ''), v_ator_tipo);
  v_numero_hash := encode(extensions.digest(v_ator_ref, 'sha256'), 'hex');
  v_last4 := right(regexp_replace(v_ator_ref, '\D', '', 'g'), 4);
  if v_last4 = '' then
    v_last4 := 'n/a';
  end if;

  insert into public.maria_audit_log (
    ator_nome,
    ator_numero,
    ator_numero_hash,
    ator_numero_last4,
    papel,
    origem,
    canal,
    invoker_role,
    tabela,
    entidade_tipo,
    entidade_id,
    operacao,
    antes,
    depois,
    motivo,
    texto_original
  )
  values (
    case v_ator_tipo
      when 'web' then 'Super Folha Web'
      when 'maria' then 'Maria'
      when 'openfinance' then 'Open Finance'
      else 'Sistema'
    end,
    v_ator_ref,
    v_numero_hash,
    v_last4,
    v_ator_tipo,
    'cartoes',
    v_ator_tipo,
    coalesce(nullif(p_ator->>'role', ''), nullif(auth.role(), ''), session_user::text),
    p_tabela,
    p_entidade_tipo,
    p_entidade_id,
    p_operacao,
    p_antes,
    p_depois,
    nullif(p_motivo, ''),
    null
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.financeiro_cartao_transacao_registrar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_cartao public.financeiro_cartoes%rowtype;
  v_existing public.financeiro_cartao_transacoes%rowtype;
  v_after public.financeiro_cartao_transacoes%rowtype;
  v_fatura_id uuid;
  v_importacao_id uuid;
  v_plano_conta_id uuid;
  v_centro_custo_id uuid;
  v_empresa_id uuid;
  v_id_externo text;
  v_fingerprint text;
  v_numero_linha text;
  v_descricao text;
  v_data_compra date;
  v_valor numeric;
  v_tipo_transacao text;
  v_classificacao_status text;
  v_possivel_duplicata boolean;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);

  v_fatura_id := nullif(payload->>'fatura_id', '')::uuid;
  if v_fatura_id is null then
    raise exception 'fatura_id obrigatorio para transacao de cartao.';
  end if;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = v_fatura_id;
  if not found then
    raise exception 'fatura_id nao encontrada.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = v_fatura.cartao_id;
  if not found then
    raise exception 'cartao da fatura nao encontrado.';
  end if;

  v_descricao := nullif(trim(payload->>'descricao'), '');
  if v_descricao is null then
    raise exception 'descricao obrigatoria para transacao de cartao.';
  end if;

  v_data_compra := nullif(payload->>'data_compra', '')::date;
  if v_data_compra is null then
    raise exception 'data_compra obrigatoria para transacao de cartao.';
  end if;

  v_valor := nullif(payload->>'valor', '')::numeric;
  if v_valor is null or v_valor = 0 then
    raise exception 'valor obrigatorio e diferente de zero para transacao de cartao.';
  end if;

  v_tipo_transacao := coalesce(nullif(payload->>'tipo_transacao', ''), 'compra');
  if v_tipo_transacao not in ('compra','estorno','tarifa','anuidade','ajuste') then
    raise exception 'tipo_transacao invalido.';
  end if;

  v_importacao_id := nullif(payload->>'importacao_id', '')::uuid;
  v_plano_conta_id := nullif(payload->>'plano_conta_id', '')::uuid;
  v_centro_custo_id := nullif(payload->>'centro_custo_id', '')::uuid;
  v_empresa_id := nullif(payload->>'empresa_id', '')::uuid;
  v_id_externo := nullif(trim(payload->>'id_externo'), '');
  v_numero_linha := coalesce(nullif(trim(payload->>'numero_linha'), ''), '');

  if v_id_externo is not null then
    select * into v_existing
      from public.financeiro_cartao_transacoes
     where cartao_id = v_fatura.cartao_id
       and id_externo = v_id_externo
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'transacao_id', v_existing.id,
        'ator_tipo', v_existing.ator_tipo
      );
    end if;
  end if;

  v_fingerprint := encode(extensions.digest(
    concat_ws('|',
      v_fatura.cartao_id::text,
      v_fatura.competencia::text,
      v_numero_linha,
      v_data_compra::text,
      round(v_valor, 2)::text,
      lower(regexp_replace(v_descricao, '\s+', ' ', 'g'))
    ),
    'sha256'
  ), 'hex');

  v_possivel_duplicata := exists (
    select 1
      from public.financeiro_cartao_transacoes t
     where t.fatura_id = v_fatura.id
       and t.fingerprint = v_fingerprint
  );

  v_classificacao_status := coalesce(
    nullif(payload->>'classificacao_status', ''),
    case when v_plano_conta_id is not null then 'sugerida' else 'pendente' end
  );

  if v_classificacao_status not in ('pendente','sugerida','confirmada') then
    raise exception 'classificacao_status invalido.';
  end if;

  insert into public.financeiro_cartao_transacoes (
    fatura_id,
    cartao_id,
    importacao_id,
    data_compra,
    descricao,
    estabelecimento,
    valor,
    tipo_transacao,
    empresa_id,
    plano_conta_id,
    centro_custo_id,
    classificacao_status,
    classificado_por,
    classificado_em,
    compra_parcelada_id,
    parcela_atual,
    total_parcelas,
    valor_total_compra,
    fingerprint,
    possivel_duplicata,
    id_externo,
    fonte_tipo,
    ator_tipo,
    ator_ref,
    created_by,
    observacoes
  )
  values (
    v_fatura.id,
    v_fatura.cartao_id,
    v_importacao_id,
    v_data_compra,
    v_descricao,
    nullif(payload->>'estabelecimento', ''),
    round(v_valor, 2),
    v_tipo_transacao,
    v_empresa_id,
    v_plano_conta_id,
    v_centro_custo_id,
    v_classificacao_status,
    case when v_classificacao_status in ('sugerida','confirmada') then v_actor->>'ator_tipo' else null end,
    case when v_classificacao_status in ('sugerida','confirmada') then now() else null end,
    nullif(payload->>'compra_parcelada_id', '')::uuid,
    nullif(payload->>'parcela_atual', '')::int,
    nullif(payload->>'total_parcelas', '')::int,
    nullif(payload->>'valor_total_compra', '')::numeric,
    v_fingerprint,
    v_possivel_duplicata,
    v_id_externo,
    coalesce(nullif(payload->>'fonte_tipo', ''), v_actor->>'ator_tipo'),
    v_actor->>'ator_tipo',
    v_actor->>'ator_ref',
    nullif(v_actor->>'created_by', '')::uuid,
    nullif(payload->>'observacoes', '')
  )
  returning * into v_after;

  if v_importacao_id is not null then
    update public.financeiro_cartao_importacoes i
       set linhas_importadas = stats.total,
           linhas_classificadas = stats.classificadas,
           linhas_pendentes = stats.pendentes,
           status = case
             when stats.total = 0 then i.status
             when stats.pendentes > 0 then 'parcial'
             else 'concluida'
           end,
           updated_at = now()
      from (
        select
          count(*)::int as total,
          count(*) filter (where classificacao_status = 'confirmada')::int as classificadas,
          count(*) filter (where classificacao_status <> 'confirmada')::int as pendentes
        from public.financeiro_cartao_transacoes
        where importacao_id = v_importacao_id
      ) stats
     where i.id = v_importacao_id;
  end if;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_transacoes',
    'cartao_transacao',
    v_after.id,
    'registrar_transacao_cartao',
    null,
    to_jsonb(v_after),
    payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'transacao_id', v_after.id,
    'classificacao_status', v_after.classificacao_status,
    'possivel_duplicata', v_after.possivel_duplicata,
    'ator_tipo', v_after.ator_tipo
  );
end;
$$;

create or replace function public.financeiro_cartao_fatura_fechar(p_fatura_id uuid, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_cartao public.financeiro_cartoes%rowtype;
  v_conta public.contas_pagar%rowtype;
  v_centro public.centros_custo%rowtype;
  v_total numeric;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = p_fatura_id
   for update;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  if v_fatura.conta_pagar_id is not null then
    select * into v_conta from public.contas_pagar where id = v_fatura.conta_pagar_id;
    return jsonb_build_object('success', true, 'idempotent', true, 'fatura_id', v_fatura.id, 'conta_pagar_id', v_fatura.conta_pagar_id, 'status', v_fatura.status);
  end if;

  if v_fatura.status not in ('aberta','fechada') then
    raise exception 'status da fatura nao permite fechamento: %', v_fatura.status;
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = v_fatura.cartao_id
   for update;
  if not found then
    raise exception 'cartao da fatura nao encontrado.';
  end if;

  if v_cartao.empresa_id is null or v_cartao.conta_pagadora_id is null or v_cartao.centro_custo_id is null then
    raise exception 'cartao sem empresa, conta pagadora ou centro; fechamento fiscal bloqueado.';
  end if;

  select * into v_centro
    from public.centros_custo
   where id = v_cartao.centro_custo_id;
  if not found then
    raise exception 'centro de custo do cartao nao encontrado.';
  end if;

  select coalesce(sum(valor), 0) into v_total
    from public.financeiro_cartao_transacoes
   where fatura_id = v_fatura.id;

  insert into public.contas_pagar (
    descricao,
    unidade,
    valor,
    data_lancamento,
    data_vencimento,
    competencia,
    status,
    data_pagamento,
    metodo_pagamento,
    tipo_lancamento,
    parcela_atual,
    total_parcelas,
    observacoes,
    fonte_tipo,
    plano_conta_id,
    centro_custo_id,
    empresa_id,
    conta_pagadora_id
  )
  values (
    concat('Fatura ', v_cartao.apelido, ' ', to_char(v_fatura.competencia, 'YYYY-MM')),
    v_centro.codigo,
    round(v_total, 2),
    (now() at time zone 'America/Sao_Paulo')::date,
    v_fatura.data_vencimento,
    date_trunc('month', v_fatura.competencia)::date,
    'pendente',
    null,
    null,
    'fatura_cartao',
    null,
    null,
    'Conta a pagar gerada pelo fechamento de fatura de cartao. DRE/plano somam as transacoes, nao esta fatura.',
    'cartao',
    null,
    v_cartao.centro_custo_id,
    v_cartao.empresa_id,
    v_cartao.conta_pagadora_id
  )
  returning * into v_conta;

  update public.financeiro_cartao_faturas
     set valor_total = round(v_total, 2),
         status = 'fechada',
         conta_pagar_id = v_conta.id,
         updated_at = now()
   where id = v_fatura.id
   returning * into v_fatura;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_faturas',
    'cartao_fatura',
    v_fatura.id,
    'fechar_fatura_cartao',
    null,
    to_jsonb(v_fatura),
    ator->>'motivo'
  );

  return jsonb_build_object('success', true, 'fatura_id', v_fatura.id, 'conta_pagar_id', v_conta.id, 'valor_total', v_fatura.valor_total, 'status', v_fatura.status);
end;
$$;

create or replace function public.financeiro_cartao_fatura_reabrir(p_fatura_id uuid, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_before public.financeiro_cartao_faturas%rowtype;
  v_after public.financeiro_cartao_faturas%rowtype;
  v_conta public.contas_pagar%rowtype;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);

  select * into v_before
    from public.financeiro_cartao_faturas
   where id = p_fatura_id
   for update;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  if v_before.status = 'paga' then
    raise exception 'fatura paga nao pode ser reaberta.';
  end if;

  if v_before.status <> 'fechada' then
    return jsonb_build_object('success', true, 'idempotent', true, 'fatura_id', v_before.id, 'status', v_before.status);
  end if;

  if v_before.conta_pagar_id is not null then
    select * into v_conta
      from public.contas_pagar
     where id = v_before.conta_pagar_id
     for update;

    if found and v_conta.status = 'pago' then
      raise exception 'conta_pagar da fatura ja esta paga; reabertura bloqueada.';
    end if;

    if found then
      update public.contas_pagar
         set status = 'cancelado',
             updated_at = now()
       where id = v_conta.id;
    end if;
  end if;

  update public.financeiro_cartao_faturas
     set status = 'aberta',
         conta_pagar_id = null,
         updated_at = now()
   where id = v_before.id
   returning * into v_after;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_faturas',
    'cartao_fatura',
    v_after.id,
    'reabrir_fatura_cartao',
    to_jsonb(v_before),
    to_jsonb(v_after),
    ator->>'motivo'
  );

  return jsonb_build_object('success', true, 'fatura_id', v_after.id, 'status', v_after.status);
end;
$$;

revoke all on function public.financeiro_cartoes_resolve_ator(jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartoes_audit_insert(jsonb, text, text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated, maria_operacional, maria_leitura;

revoke all on function public.financeiro_cartao_transacao_registrar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_transacao_registrar(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_fatura_fechar(uuid, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_fatura_fechar(uuid, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_fatura_reabrir(uuid, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_fatura_reabrir(uuid, jsonb) to authenticated, service_role;

comment on function public.financeiro_cartao_transacao_registrar(jsonb, jsonb) is
  'Fase 2 Cartoes: registra transacao por porta unica com ator derivado do papel, dedupe forte por id_externo e alerta heuristico por fingerprint.';

comment on function public.financeiro_cartao_fatura_fechar(uuid, jsonb) is
  'Fase 2 Cartoes: fecha fatura e cria uma conta_pagar fatura_cartao, sem dupla contagem no DRE/plano.';
