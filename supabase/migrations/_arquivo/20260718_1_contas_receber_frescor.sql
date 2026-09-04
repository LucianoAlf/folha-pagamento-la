-- Fatia 3b: identidade historica, ausencia da origem e prova server-side do preflight.

alter table public.contas_receber
  add column if not exists source_missing boolean not null default false,
  add column if not exists source_missing_reason text,
  add column if not exists source_last_seen_at timestamptz,
  add column if not exists source_missing_detected_at timestamptz,
  add column if not exists source_missing_resolved_at timestamptz,
  add column if not exists source_sync_run_id uuid,
  add column if not exists source_sync_run_item_id uuid;

alter table public.contas_receber
  drop constraint if exists contas_receber_la_report_unidade_id_emusys_fatura_id_key;

alter table public.contas_receber
  add constraint contas_receber_unidade_fatura_competencia_key
  unique (la_report_unidade_id, emusys_fatura_id, competencia);

create index if not exists contas_receber_source_missing_idx
  on public.contas_receber (competencia, source_missing)
  where source_missing = true;

alter table public.contas_receber_sync_execucoes
  add column if not exists sync_run_id uuid,
  add column if not exists preflight_id uuid,
  add column if not exists resultado jsonb;

create table public.contas_receber_preflight_provas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competencia date not null,
  sync_run_id uuid not null,
  manifest_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_result jsonb,
  check (competencia = date_trunc('month', competencia)::date),
  check (expires_at > created_at),
  check (
    (consumed_at is null and consumed_result is null)
    or (consumed_at is not null and consumed_result is not null)
  )
);

create index contas_receber_preflight_user_competencia_idx
  on public.contas_receber_preflight_provas (user_id, competencia, created_at desc);

alter table public.contas_receber_preflight_provas enable row level security;
revoke all on public.contas_receber_preflight_provas
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant select, insert, update on public.contas_receber_preflight_provas to service_role;

create or replace function public.contas_receber_preflight_registrar(
  p_user_id uuid,
  p_competencia date,
  p_sync_run_id uuid,
  p_manifest_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_prova public.contas_receber_preflight_provas%rowtype;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  if v_role not in ('service_role', 'postgres') then
    raise exception 'registro de preflight exige service_role.' using errcode = '42501';
  end if;
  if p_user_id is null or p_sync_run_id is null or nullif(trim(p_manifest_hash), '') is null then
    raise exception 'usuario, sync_run_id e manifest_hash sao obrigatorios.';
  end if;
  if p_competencia is null or p_competencia <> date_trunc('month', p_competencia)::date then
    raise exception 'competencia deve ser o primeiro dia do mes.';
  end if;

  update public.contas_receber_preflight_provas
     set expires_at = least(expires_at, now())
   where user_id = p_user_id
     and competencia = p_competencia
     and consumed_at is null
     and expires_at > now();

  insert into public.contas_receber_preflight_provas (
    user_id, competencia, sync_run_id, manifest_hash
  ) values (
    p_user_id, p_competencia, p_sync_run_id, trim(p_manifest_hash)
  )
  returning * into v_prova;

  return jsonb_build_object(
    'id', v_prova.id,
    'user_id', v_prova.user_id,
    'competencia', v_prova.competencia,
    'sync_run_id', v_prova.sync_run_id,
    'manifest_hash', v_prova.manifest_hash,
    'expires_at', v_prova.expires_at
  );
end;
$$;

create or replace function public.contas_receber_preflight_obter(
  p_preflight_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_prova public.contas_receber_preflight_provas%rowtype;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  if v_role not in ('service_role', 'postgres') then
    raise exception 'leitura de preflight exige service_role.' using errcode = '42501';
  end if;

  select * into v_prova
    from public.contas_receber_preflight_provas
   where id = p_preflight_id
     and user_id = p_user_id;
  if not found then
    raise exception 'prova de preflight nao encontrada para este usuario.';
  end if;
  if v_prova.consumed_at is null and v_prova.expires_at <= now() then
    raise exception 'prova de preflight expirada. Execute uma nova conferencia.';
  end if;

  return jsonb_build_object(
    'id', v_prova.id,
    'competencia', v_prova.competencia,
    'sync_run_id', v_prova.sync_run_id,
    'manifest_hash', v_prova.manifest_hash,
    'expires_at', v_prova.expires_at,
    'consumed_at', v_prova.consumed_at,
    'consumed_result', v_prova.consumed_result
  );
end;
$$;

drop function if exists public.contas_receber_sync_aplicar(date, text, jsonb, jsonb, jsonb);

create or replace function public.contas_receber_sync_aplicar(
  p_preflight_id uuid,
  p_user_id uuid,
  p_competencia date,
  p_sync_run_id uuid,
  p_manifest_hash text,
  p_itens jsonb,
  p_manifesto jsonb,
  p_ator jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_prova public.contas_receber_preflight_provas%rowtype;
  v_item jsonb;
  v_plano_mensalidade uuid;
  v_plano_matricula uuid;
  v_plano_locacao uuid;
  v_descricao_normalizada text;
  v_plano_automatico uuid;
  v_centro_automatico uuid;
  v_excluido_automatico boolean;
  v_motivo_exclusao text;
  v_status text;
  v_classificacao_status text;
  v_classificacao_origem text;
  v_source_missing boolean;
  v_total integer := 0;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_manuais_preservados integer := 0;
  v_existente public.contas_receber%rowtype;
  v_resultado jsonb;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  if v_role not in ('service_role', 'postgres') then
    raise exception 'sincronizacao de contas a receber exige service_role.' using errcode = '42501';
  end if;

  select * into v_prova
    from public.contas_receber_preflight_provas
   where id = p_preflight_id
   for update;
  if not found or v_prova.user_id <> p_user_id then
    raise exception 'prova de preflight nao pertence ao usuario autenticado.';
  end if;
  if v_prova.consumed_at is not null then
    if v_prova.consumed_result is null then
      raise exception 'prova consumida sem resultado persistido.';
    end if;
    return v_prova.consumed_result || jsonb_build_object('idempotent_retry', true);
  end if;
  if v_prova.expires_at <= now() then
    raise exception 'prova de preflight expirada. Execute uma nova conferencia.';
  end if;
  if v_prova.competencia <> p_competencia
     or v_prova.sync_run_id <> p_sync_run_id
     or v_prova.manifest_hash <> p_manifest_hash then
    raise exception 'prova de preflight diverge do snapshot solicitado.';
  end if;
  if p_competencia is null or p_competencia <> date_trunc('month', p_competencia)::date then
    raise exception 'competencia deve ser o primeiro dia do mes.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens deve ser um array.';
  end if;
  if p_manifesto is null or jsonb_typeof(p_manifesto) <> 'object' then
    raise exception 'manifesto deve ser um objeto.';
  end if;
  if coalesce(p_manifesto->>'manifest_hash', '') <> p_manifest_hash then
    raise exception 'manifest_hash diverge do manifesto.';
  end if;
  if coalesce((p_manifesto->>'snapshot_complete')::boolean, false) is not true then
    raise exception 'snapshot incompleto nao pode ser aplicado.';
  end if;
  if nullif(p_manifesto->>'sync_run_id', '') is null
     or (p_manifesto->>'sync_run_id')::uuid <> p_sync_run_id then
    raise exception 'sync_run_id diverge do manifesto.';
  end if;
  if jsonb_array_length(p_itens) <> coalesce(
    nullif(p_manifesto->>'total_itens', '')::integer,
    nullif(p_manifesto->>'total_linhas', '')::integer,
    -1
  ) then
    raise exception 'quantidade de itens diverge do manifesto.';
  end if;

  select id into v_plano_mensalidade
    from public.plano_contas
   where codigo = '3.1.1' and nivel = 3 and natureza = 'entrada' and ativo = true;
  select id into v_plano_matricula
    from public.plano_contas
   where codigo = '3.1.2' and nivel = 3 and natureza = 'entrada' and ativo = true;
  select id into v_plano_locacao
    from public.plano_contas
   where codigo = '3.4.1' and nivel = 3 and natureza = 'entrada' and ativo = true;
  if v_plano_mensalidade is null or v_plano_matricula is null or v_plano_locacao is null then
    raise exception 'planos automaticos 3.1.1, 3.1.2 e 3.4.1 precisam estar ativos como folhas de entrada.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if (v_item->>'competencia')::date <> p_competencia then
      raise exception 'item % pertence a outra competencia.', v_item->>'emusys_fatura_id';
    end if;
    if nullif(v_item->>'sync_run_id', '') is null
       or (v_item->>'sync_run_id')::uuid <> p_sync_run_id then
      raise exception 'item % pertence a outro sync_run.', v_item->>'emusys_fatura_id';
    end if;
    if nullif(v_item->>'row_source_hash', '') is null then
      raise exception 'item % nao possui row_source_hash.', v_item->>'emusys_fatura_id';
    end if;

    v_descricao_normalizada := translate(
      lower(coalesce(v_item->>'descricao', '')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );
    v_plano_automatico := null;
    v_centro_automatico := null;
    v_excluido_automatico := false;
    v_motivo_exclusao := null;
    v_classificacao_status := 'pendente';
    v_classificacao_origem := 'pendente';

    if v_descricao_normalizada ~ '^\s*parcela' then
      v_plano_automatico := v_plano_mensalidade;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ '(passaporte|matricula)' then
      v_plano_automatico := v_plano_matricula;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ 'locacao' then
      v_plano_automatico := v_plano_locacao;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ 'rateio' then
      v_excluido_automatico := true;
      v_motivo_exclusao := 'Rateio interno excluido automaticamente da receita.';
      v_classificacao_status := 'excluida';
      v_classificacao_origem := 'exclusao_automatica';
    end if;

    select id into v_centro_automatico
      from public.centros_custo
     where lower(codigo) = v_item->>'unidade'
       and ativo = true
     limit 1;
    if v_centro_automatico is null then
      raise exception 'centro de custo ativo nao encontrado para a unidade %.', v_item->>'unidade';
    end if;

    v_source_missing := coalesce((v_item->>'source_missing')::boolean, false);
    v_status := case
      when v_source_missing then 'revisar'
      else case lower(coalesce(v_item->>'status_origem', ''))
        when 'paga' then 'recebido'
        when 'pago' then 'recebido'
        when 'aberta' then 'pendente'
        when 'pendente' then 'pendente'
        when 'cancelada' then 'cancelado'
        when 'cancelado' then 'cancelado'
        else 'revisar'
      end
    end;

    select * into v_existente
      from public.contas_receber
     where la_report_unidade_id = (v_item->>'la_report_unidade_id')::uuid
       and emusys_fatura_id = (v_item->>'emusys_fatura_id')::bigint
       and competencia = p_competencia;
    if found then
      v_atualizados := v_atualizados + 1;
      if v_existente.classificacao_origem = 'manual' then
        v_manuais_preservados := v_manuais_preservados + 1;
      end if;
    else
      v_inseridos := v_inseridos + 1;
    end if;

    insert into public.contas_receber (
      la_report_fatura_id, la_report_unidade_id, emusys_fatura_id,
      emusys_matricula_id, emusys_student_id, unidade, descricao,
      aluno_nome, curso_nome, cadastro_match_status, curso_candidatos,
      status_origem, status, competencia, data_vencimento, data_recebimento,
      valor_original, valor_pago, juros_e_multa, desconto_aplicado,
      desconto_fixo, desconto_condicional, valor_liquido,
      plano_conta_id, centro_custo_id, excluido_da_receita, motivo_exclusao,
      classificacao_status, classificacao_origem, classificado_por, classificado_em,
      row_source_hash, manifest_hash, source_updated_at, source_synced_at,
      source_missing, source_missing_reason, source_last_seen_at,
      source_missing_detected_at, source_missing_resolved_at,
      source_sync_run_id, source_sync_run_item_id, imported_at, updated_at
    ) values (
      (v_item->>'la_report_fatura_id')::uuid,
      (v_item->>'la_report_unidade_id')::uuid,
      (v_item->>'emusys_fatura_id')::bigint,
      nullif(v_item->>'emusys_matricula_id', '')::bigint,
      nullif(v_item->>'emusys_student_id', '')::bigint,
      v_item->>'unidade', v_item->>'descricao',
      nullif(v_item->>'aluno_nome', ''), nullif(v_item->>'curso_nome', ''),
      v_item->>'cadastro_match_status', coalesce(v_item->'curso_candidatos', '[]'::jsonb),
      v_item->>'status_origem', v_status, p_competencia,
      nullif(v_item->>'data_vencimento', '')::date,
      nullif(v_item->>'data_recebimento', '')::date,
      coalesce((v_item->>'valor_original')::numeric, 0),
      nullif(v_item->>'valor_pago', '')::numeric,
      coalesce((v_item->>'juros_e_multa')::numeric, 0),
      coalesce((v_item->>'desconto_aplicado')::numeric, 0),
      coalesce((v_item->>'desconto_fixo')::numeric, 0),
      coalesce((v_item->>'desconto_condicional')::numeric, 0),
      coalesce((v_item->>'valor_liquido')::numeric, 0),
      v_plano_automatico, v_centro_automatico, v_excluido_automatico, v_motivo_exclusao,
      v_classificacao_status, v_classificacao_origem,
      case when v_classificacao_status = 'confirmada' then 'sincronizacao-automatica' end,
      case when v_classificacao_status = 'confirmada' then now() end,
      v_item->>'row_source_hash', p_manifest_hash,
      nullif(v_item->>'source_updated_at', '')::timestamptz,
      nullif(v_item->>'source_synced_at', '')::timestamptz,
      v_source_missing, nullif(v_item->>'source_missing_reason', ''),
      nullif(v_item->>'source_last_seen_at', '')::timestamptz,
      nullif(v_item->>'source_missing_detected_at', '')::timestamptz,
      nullif(v_item->>'source_missing_resolved_at', '')::timestamptz,
      p_sync_run_id, nullif(v_item->>'sync_run_item_id', '')::uuid, now(), now()
    )
    on conflict (la_report_unidade_id, emusys_fatura_id, competencia) do update set
      la_report_fatura_id = excluded.la_report_fatura_id,
      emusys_matricula_id = excluded.emusys_matricula_id,
      emusys_student_id = excluded.emusys_student_id,
      unidade = excluded.unidade,
      descricao = excluded.descricao,
      aluno_nome = excluded.aluno_nome,
      curso_nome = excluded.curso_nome,
      cadastro_match_status = excluded.cadastro_match_status,
      curso_candidatos = excluded.curso_candidatos,
      status_origem = excluded.status_origem,
      status = excluded.status,
      data_vencimento = excluded.data_vencimento,
      data_recebimento = excluded.data_recebimento,
      valor_original = excluded.valor_original,
      valor_pago = excluded.valor_pago,
      juros_e_multa = excluded.juros_e_multa,
      desconto_aplicado = excluded.desconto_aplicado,
      desconto_fixo = excluded.desconto_fixo,
      desconto_condicional = excluded.desconto_condicional,
      valor_liquido = excluded.valor_liquido,
      plano_conta_id = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.plano_conta_id else excluded.plano_conta_id end,
      centro_custo_id = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.centro_custo_id else excluded.centro_custo_id end,
      excluido_da_receita = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.excluido_da_receita else excluded.excluido_da_receita end,
      motivo_exclusao = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.motivo_exclusao else excluded.motivo_exclusao end,
      classificacao_status = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.classificacao_status else excluded.classificacao_status end,
      classificacao_origem = case when contas_receber.classificacao_origem = 'manual'
        then 'manual' else excluded.classificacao_origem end,
      classificado_por = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.classificado_por else excluded.classificado_por end,
      classificado_em = case when contas_receber.classificacao_origem = 'manual'
        then contas_receber.classificado_em else excluded.classificado_em end,
      row_source_hash = excluded.row_source_hash,
      manifest_hash = excluded.manifest_hash,
      source_updated_at = excluded.source_updated_at,
      source_synced_at = excluded.source_synced_at,
      source_missing = excluded.source_missing,
      source_missing_reason = excluded.source_missing_reason,
      source_last_seen_at = excluded.source_last_seen_at,
      source_missing_detected_at = excluded.source_missing_detected_at,
      source_missing_resolved_at = excluded.source_missing_resolved_at,
      source_sync_run_id = excluded.source_sync_run_id,
      source_sync_run_item_id = excluded.source_sync_run_item_id,
      imported_at = now(),
      updated_at = now();

    v_total := v_total + 1;
  end loop;

  v_resultado := jsonb_build_object(
    'success', true,
    'competencia', p_competencia,
    'sync_run_id', p_sync_run_id,
    'manifest_hash', p_manifest_hash,
    'preflight_id', p_preflight_id,
    'total', v_total,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'classificacoes_manuais_preservadas', v_manuais_preservados,
    'idempotent_retry', false
  );

  insert into public.contas_receber_sync_execucoes (
    competencia, manifest_hash, modo, total_itens, manifesto, ator,
    sync_run_id, preflight_id, resultado
  ) values (
    p_competencia, p_manifest_hash, 'apply', v_total, p_manifesto, p_ator,
    p_sync_run_id, p_preflight_id, v_resultado
  )
  on conflict (competencia, manifest_hash) do update set
    sync_run_id = excluded.sync_run_id,
    preflight_id = excluded.preflight_id,
    resultado = excluded.resultado;

  update public.contas_receber_preflight_provas
     set consumed_at = now(),
         consumed_result = v_resultado
   where id = p_preflight_id;

  return v_resultado;
end;
$$;

revoke all on function public.contas_receber_preflight_registrar(uuid, date, uuid, text)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_preflight_registrar(uuid, date, uuid, text)
  to service_role;

revoke all on function public.contas_receber_preflight_obter(uuid, uuid)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_preflight_obter(uuid, uuid)
  to service_role;

revoke all on function public.contas_receber_sync_aplicar(uuid, uuid, date, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_sync_aplicar(uuid, uuid, date, uuid, text, jsonb, jsonb, jsonb)
  to service_role;
