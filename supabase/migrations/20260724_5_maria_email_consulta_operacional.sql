-- Maria Email Ledger — Fase 4
-- Consulta operacional ledger-first para WhatsApp da Maria.
-- Read-only: nao cria conta, nao baixa, nao confirma match e nao expõe codigo/Pix cru.

create or replace function public.maria_email_consultar_operacional(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := public.maria_email_match_text_norm(public.maria_email_payload_text(coalesce(p_payload, '{}'::jsonb), 'query', 120));
  v_source_key text := nullif(public.maria_email_payload_text(coalesce(p_payload, '{}'::jsonb), 'source_key', 80), '');
  v_days integer := least(greatest(coalesce(nullif(p_payload->>'days', '')::integer, 30), 1), 365);
  v_limit integer := least(greatest(coalesce(nullif(p_payload->>'limit', '')::integer, 5), 1), 20);
  v_items jsonb;
begin
  with base as (
    select
      p.id as email_payable_id,
      m.id as email_message_id,
      s.source_key,
      s.label as source_label,
      m.received_at,
      m.uidvalidity,
      m.imap_uid,
      m.subject,
      p.document_kind,
      p.fornecedor_nome,
      p.vencimento,
      p.valor_centavos,
      p.unidade_snapshot,
      p.plano_snapshot,
      p.dedupe_group_quality,
      p.status as payable_status,
      public.maria_email_match_text_norm(concat_ws(' ',
        m.subject,
        p.document_kind,
        p.fornecedor_nome,
        p.unidade_snapshot,
        p.plano_snapshot,
        p.status,
        s.source_key,
        s.label
      )) as search_text
    from public.maria_email_extracted_payables p
    join public.maria_email_messages m on m.id = p.message_id
    join public.maria_email_sources s on s.id = m.source_id
    where m.received_at >= now() - make_interval(days => v_days)
      and (v_source_key is null or s.source_key = v_source_key)
      and p.valor_centavos is not null
      and p.dedupe_group_quality in ('forte', 'media')
      and p.status in ('recebido','extraido','pendente_conferencia','vinculado','lancado','pago','divergente')
  ), filtered as (
    select b.*
    from base b
    where v_query is null
       or b.search_text like '%' || v_query || '%'
       or exists (
         select 1
         from regexp_split_to_table(v_query, '\s+') part
         where length(part) >= 3 and b.search_text like '%' || part || '%'
       )
  ), deduped as (
    select distinct on (
      case when v_source_key is null then coalesce(public.maria_email_match_text_norm(fornecedor_nome), '') else email_payable_id::text end,
      case when v_source_key is null then coalesce(valor_centavos, -1) else 0 end,
      case when v_source_key is null then coalesce(vencimento, date '1900-01-01') else date '1900-01-01' end,
      case when v_source_key is null then coalesce(public.maria_email_match_text_norm(unidade_snapshot), '') else '' end
    )
      f.*
    from filtered f
    order by
      case when v_source_key is null then coalesce(public.maria_email_match_text_norm(fornecedor_nome), '') else email_payable_id::text end,
      case when v_source_key is null then coalesce(valor_centavos, -1) else 0 end,
      case when v_source_key is null then coalesce(vencimento, date '1900-01-01') else date '1900-01-01' end,
      case when v_source_key is null then coalesce(public.maria_email_match_text_norm(unidade_snapshot), '') else '' end,
      received_at desc,
      case source_key when 'rose_financeiro_zoho' then 0 else 1 end
  ), ranked as (
    select d.*
    from deduped d
    order by d.received_at desc, d.valor_centavos desc nulls last
    limit v_limit
  ), with_match as (
    select
      r.*,
      mt.id as match_id,
      mt.match_status,
      mt.match_score,
      mt.match_reason,
      mt.superfolha_status_snapshot,
      mt.superfolha_valor_centavos_snapshot,
      mt.superfolha_vencimento_snapshot,
      c.status as conta_status_atual,
      c.descricao as conta_descricao_atual,
      round((c.valor * 100)::numeric)::integer as conta_valor_centavos_atual,
      c.data_vencimento as conta_vencimento_atual,
      c.unidade as conta_unidade_atual
    from ranked r
    left join lateral (
      select mt.*
      from public.maria_email_payable_matches mt
      where mt.email_payable_id = r.email_payable_id
        and mt.match_status in ('confirmado_humano', 'sugerido')
      order by case mt.match_status when 'confirmado_humano' then 0 else 1 end,
               mt.match_score desc,
               mt.created_at desc
      limit 1
    ) mt on true
    left join public.contas_pagar c on c.id = mt.conta_pagar_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'email_payable_id', email_payable_id,
    'email_message_id', email_message_id,
    'source_key', source_key,
    'source_label', source_label,
    'received_at', received_at,
    'uidvalidity', uidvalidity,
    'imap_uid', imap_uid,
    'subject', subject,
    'document_kind', document_kind,
    'fornecedor_nome', fornecedor_nome,
    'vencimento', vencimento,
    'valor_centavos', valor_centavos,
    'unidade_snapshot', unidade_snapshot,
    'plano_snapshot', plano_snapshot,
    'dedupe_group_quality', dedupe_group_quality,
    'payable_status', payable_status,
    'match_status', match_status,
    'match_score', match_score,
    'match_reason', match_reason,
    'superfolha_status_snapshot', coalesce(conta_status_atual, superfolha_status_snapshot),
    'superfolha_descricao_snapshot', conta_descricao_atual,
    'superfolha_valor_centavos_snapshot', coalesce(conta_valor_centavos_atual, superfolha_valor_centavos_snapshot),
    'superfolha_vencimento_snapshot', coalesce(conta_vencimento_atual, superfolha_vencimento_snapshot),
    'superfolha_unidade_snapshot', conta_unidade_atual
  ) order by received_at desc, valor_centavos desc nulls last), '[]'::jsonb)
  into v_items
  from with_match;

  return jsonb_build_object(
    'success', true,
    'source', 'ledger',
    'query', coalesce(v_query, ''),
    'source_key', coalesce(v_source_key, ''),
    'days', v_days,
    'count', jsonb_array_length(v_items),
    'items', v_items
  );
end;
$$;

revoke all on function public.maria_email_consultar_operacional(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
grant execute on function public.maria_email_consultar_operacional(jsonb) to service_role;
