-- Maria Email Ledger — Fase 3E
-- Sugestao automatica de match entre payable extraido e contas_pagar.
-- Nao confirma match, nao altera contas_pagar, nao cria conta e nao faz baixa.

create or replace function public.maria_email_match_text_norm(p_value text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'), '');
$$;

create or replace function public.maria_email_match_sugerir_auto(
  p_email_payable_id uuid,
  p_max_results integer default 5,
  p_min_score numeric default 0.6000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable public.maria_email_extracted_payables%rowtype;
  v_max integer := least(greatest(coalesce(p_max_results, 5), 1), 10);
  v_min numeric := least(greatest(coalesce(p_min_score, 0.6000), 0), 1);
  v_inserted integer := 0;
  v_candidates jsonb := '[]'::jsonb;
begin
  if p_email_payable_id is null then
    raise exception 'email_payable_id obrigatorio' using errcode = '22023';
  end if;

  select * into v_payable
    from public.maria_email_extracted_payables
   where id = p_email_payable_id;

  if not found then
    raise exception 'payable nao encontrado' using errcode = '22023';
  end if;

  -- Idempotencia por payable: sem isso a sugestao pode duplicar linhas e DELETE e bloqueado.
  perform pg_advisory_xact_lock(hashtextextended('maria_email_match_sugerir_auto:' || p_email_payable_id::text, 0));

  create temp table if not exists pg_temp._maria_email_match_candidates (
    conta_pagar_id uuid,
    score numeric(5,4),
    reason text,
    status_snapshot text,
    valor_centavos_snapshot integer,
    vencimento_snapshot date
  ) on commit drop;

  truncate pg_temp._maria_email_match_candidates;

  insert into pg_temp._maria_email_match_candidates (
    conta_pagar_id, score, reason, status_snapshot, valor_centavos_snapshot, vencimento_snapshot
  )
  with payable as (
    select
      v_payable.id as payable_id,
      v_payable.valor_centavos as valor_centavos,
      v_payable.vencimento as vencimento,
      public.maria_email_match_text_norm(v_payable.unidade_snapshot) as unidade_norm,
      v_payable.plano_conta_id,
      v_payable.centro_custo_id,
      v_payable.empresa_id,
      public.maria_email_match_text_norm(v_payable.fornecedor_nome) as fornecedor_norm
  ), candidates as (
    select
      c.id,
      c.status,
      round((c.valor * 100)::numeric)::integer as valor_centavos,
      c.data_vencimento,
      public.maria_email_match_text_norm(c.unidade) as unidade_norm,
      c.plano_conta_id,
      c.centro_custo_id,
      c.empresa_id,
      public.maria_email_match_text_norm(c.descricao) as descricao_norm,
      p.valor_centavos as p_valor_centavos,
      p.vencimento as p_vencimento,
      p.unidade_norm as p_unidade_norm,
      p.plano_conta_id as p_plano_conta_id,
      p.centro_custo_id as p_centro_custo_id,
      p.empresa_id as p_empresa_id,
      p.fornecedor_norm as p_fornecedor_norm
    from public.contas_pagar c
    cross join payable p
    where c.status in ('pendente', 'pago', 'cancelado')
      and (
        p.valor_centavos is null
        or abs(round((c.valor * 100)::numeric)::integer - p.valor_centavos) <= 500
      )
      and (
        p.vencimento is null
        or c.data_vencimento between p.vencimento - interval '10 days' and p.vencimento + interval '10 days'
      )
  ), scored as (
    select
      id,
      status,
      valor_centavos,
      data_vencimento,
      least(1.0000, greatest(0.0000,
        case
          when p_valor_centavos is null then 0
          when valor_centavos = p_valor_centavos then 0.4500
          when abs(valor_centavos - p_valor_centavos) <= 100 then 0.3500
          when abs(valor_centavos - p_valor_centavos) <= 500 then 0.2200
          else 0
        end
        + case
          when p_vencimento is null then 0
          when data_vencimento = p_vencimento then 0.2500
          when abs(data_vencimento - p_vencimento) <= 3 then 0.1800
          when abs(data_vencimento - p_vencimento) <= 10 then 0.1000
          else 0
        end
        + case when p_unidade_norm is not null and unidade_norm = p_unidade_norm then 0.1200 else 0 end
        + case when p_plano_conta_id is not null and plano_conta_id = p_plano_conta_id then 0.0600 else 0 end
        + case when p_centro_custo_id is not null and centro_custo_id = p_centro_custo_id then 0.0600 else 0 end
        + case when p_empresa_id is not null and empresa_id = p_empresa_id then 0.0600 else 0 end
        + case
          when p_fornecedor_norm is not null and descricao_norm is not null and position(p_fornecedor_norm in descricao_norm) > 0 then 0.0800
          when p_fornecedor_norm is not null and descricao_norm is not null and position(descricao_norm in p_fornecedor_norm) > 0 then 0.0400
          else 0
        end
        + case when status = 'pago' then 0.0200 when status = 'cancelado' then -0.1500 else 0 end
      ))::numeric(5,4) as score,
      concat_ws('; ',
        case when p_valor_centavos is not null and valor_centavos = p_valor_centavos then 'valor_exato'
             when p_valor_centavos is not null and abs(valor_centavos - p_valor_centavos) <= 500 then 'valor_aproximado' end,
        case when p_vencimento is not null and data_vencimento = p_vencimento then 'vencimento_exato'
             when p_vencimento is not null and abs(data_vencimento - p_vencimento) <= 10 then 'vencimento_proximo' end,
        case when p_unidade_norm is not null and unidade_norm = p_unidade_norm then 'unidade' end,
        case when p_plano_conta_id is not null and plano_conta_id = p_plano_conta_id then 'plano_conta' end,
        case when p_centro_custo_id is not null and centro_custo_id = p_centro_custo_id then 'centro_custo' end,
        case when p_empresa_id is not null and empresa_id = p_empresa_id then 'empresa' end,
        case when p_fornecedor_norm is not null and descricao_norm is not null and position(p_fornecedor_norm in descricao_norm) > 0 then 'fornecedor_descricao' end,
        case when status = 'pago' then 'status_pago' when status = 'cancelado' then 'status_cancelado_penalizado' end
      ) as reason
    from candidates
  )
  select id, score, left(reason, 300), status, valor_centavos, data_vencimento
    from scored s
   where score >= v_min
     and not exists (
       select 1
         from public.maria_email_payable_matches m
        where m.email_payable_id = v_payable.id
          and m.conta_pagar_id = s.id
          and m.match_status in ('sugerido', 'confirmado_humano')
     )
   order by score desc, case status when 'pendente' then 0 when 'pago' then 1 else 2 end, data_vencimento nulls last
   limit v_max;

  perform set_config('app.maria_email_rpc', 'on', true);

  insert into public.maria_email_payable_matches (
    email_payable_id,
    conta_pagar_id,
    match_status,
    match_score,
    match_reason,
    superfolha_status_snapshot,
    superfolha_valor_centavos_snapshot,
    superfolha_vencimento_snapshot
  )
  select
    v_payable.id,
    conta_pagar_id,
    'sugerido',
    score,
    reason,
    status_snapshot,
    valor_centavos_snapshot,
    vencimento_snapshot
  from pg_temp._maria_email_match_candidates;

  get diagnostics v_inserted = row_count;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match_score', score,
    'match_reason', reason,
    'superfolha_status_snapshot', status_snapshot,
    'superfolha_valor_centavos_snapshot', valor_centavos_snapshot,
    'superfolha_vencimento_snapshot', vencimento_snapshot
  ) order by score desc), '[]'::jsonb)
    into v_candidates
    from pg_temp._maria_email_match_candidates;

  return jsonb_build_object(
    'success', true,
    'email_payable_id', v_payable.id,
    'suggestions_inserted', v_inserted,
    'candidates', v_candidates
  );
end;
$$;

revoke all on function public.maria_email_match_text_norm(text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_match_sugerir_auto(uuid, integer, numeric) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

grant execute on function public.maria_email_match_sugerir_auto(uuid, integer, numeric) to service_role;
