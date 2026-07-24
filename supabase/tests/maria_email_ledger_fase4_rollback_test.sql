-- Maria Email Ledger — Fase 4 teste vivo com rollback
-- Valida consulta operacional ledger-first sem escrita e com status Super Folha quando houver match sugerido.

begin;

select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_fase4_gmail',
  'label', 'Teste Fase4 Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_fase4_gmail',
  'last_known_uidvalidity', 501,
  'ativo', true
)) as source_enabled;

create temp table _maria_email_fase4_ids as
select
  (public.maria_email_processing_run_start(jsonb_build_object(
    'source_key', 'test_fase4_gmail',
    'run_kind', 'autopush',
    'parser_version', 'fase4-rollback-test',
    'code_version', 'fase4-rollback-test'
  ))->>'run_id')::uuid as run_id,
  null::uuid as message_id,
  null::uuid as payable_id,
  null::uuid as conta_id,
  null::uuid as plano_id,
  null::uuid as centro_id,
  null::uuid as empresa_id;

update _maria_email_fase4_ids
   set plano_id = (select id from public.plano_contas limit 1),
       centro_id = (select id from public.centros_custo where codigo = 'bar' limit 1),
       empresa_id = (select id from public.financeiro_empresas where label_operacional = 'Barra' and ativo = true limit 1);

update _maria_email_fase4_ids
   set message_id = (public.maria_email_message_registrar(jsonb_build_object(
     'source_key', 'test_fase4_gmail',
     'processing_run_id', run_id,
     'uidvalidity', 501,
     'imap_uid', '9401',
     'from_domain', 'example.com',
     'from_email_hash', repeat('d', 64),
     'from_email_masked', 'te***@example.com',
     'subject', 'Boleto Fornecedor Sintetico Fase4',
     'snippet', 'Snippet teste Fase4',
     'received_at', now(),
     'body_hash', repeat('e', 64),
     'has_attachments', true,
     'relevance_status', 'relevante',
     'processing_status', 'processado'
   ))->>'message_id')::uuid;

update _maria_email_fase4_ids
   set payable_id = (public.maria_email_payable_registrar(jsonb_build_object(
     'message_id', message_id,
     'processing_run_id', run_id,
     'document_kind', 'boleto',
     'fornecedor_nome', 'Fornecedor Sintetico Fase4',
     'fornecedor_documento_hash', repeat('f', 64),
     'document_number', 'DOC-FASE4-1',
     'vencimento', current_date + 5,
     'valor_centavos', 22222,
     'unidade_snapshot', 'bar',
     'plano_conta_id', plano_id,
     'centro_custo_id', centro_id,
     'empresa_id', empresa_id,
     'extraction_method', 'body',
     'confidence', 0.9100,
     'status', 'extraido',
     'dedupe_group_key', 'test-fase4-key-22222',
     'dedupe_group_quality', 'forte',
     'person_data_redaction_status', 'nao_aplicavel'
   ))->>'payable_id')::uuid;

with inserted as (
  insert into public.contas_pagar (
    descricao,
    unidade,
    valor,
    data_vencimento,
    competencia,
    status,
    tipo_lancamento,
    plano_conta_id,
    centro_custo_id,
    empresa_id
  )
  select
    'Fornecedor Sintetico Fase4 boleto teste',
    'bar',
    222.22,
    current_date + 5,
    date_trunc('month', current_date)::date,
    'pendente',
    'eventual',
    plano_id,
    centro_id,
    empresa_id
  from _maria_email_fase4_ids
  returning id
)
update _maria_email_fase4_ids
   set conta_id = (select id from inserted);

-- Usa a RPC tecnica ja validada para criar sugestao. A consulta operacional deve apenas ler isso.
select public.maria_email_match_sugerir_auto(payable_id, 3, 0.7500)
from _maria_email_fase4_ids;

do $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_item jsonb;
begin
  select jsonb_build_object(
    'sources',(select count(*) from public.maria_email_sources where source_key='test_fase4_gmail'),
    'messages',(select count(*) from public.maria_email_messages m join public.maria_email_sources s on s.id=m.source_id where s.source_key='test_fase4_gmail'),
    'payables',(select count(*) from public.maria_email_extracted_payables p join public.maria_email_messages m on m.id=p.message_id join public.maria_email_sources s on s.id=m.source_id where s.source_key='test_fase4_gmail'),
    'matches',(select count(*) from public.maria_email_payable_matches mt join _maria_email_fase4_ids i on i.payable_id=mt.email_payable_id)
  ) into v_before;

  select public.maria_email_consultar_operacional(jsonb_build_object(
    'query', 'Fornecedor Sintetico Fase4',
    'source_key', 'test_fase4_gmail',
    'days', 1,
    'limit', 5
  )) into v_result;

  if coalesce((v_result->>'count')::integer, 0) <> 1 then
    raise exception 'FAIL: consulta deveria retornar 1 item, retornou %', v_result;
  end if;

  v_item := (v_result->'items'->0);
  if v_item->>'match_status' <> 'sugerido' then
    raise exception 'FAIL: consulta deveria refletir match sugerido, veio %', v_item;
  end if;

  if v_item->>'superfolha_status_snapshot' <> 'pendente' then
    raise exception 'FAIL: consulta deveria trazer status pendente do Super Folha, veio %', v_item;
  end if;

  if (v_item ? 'barcode_hash') or (v_item ? 'pix_payload_hash') or (v_item ? 'raw_extraction_sanitized') then
    raise exception 'FAIL: consulta expôs campo sensível/hash bruto: %', v_item;
  end if;

  select jsonb_build_object(
    'sources',(select count(*) from public.maria_email_sources where source_key='test_fase4_gmail'),
    'messages',(select count(*) from public.maria_email_messages m join public.maria_email_sources s on s.id=m.source_id where s.source_key='test_fase4_gmail'),
    'payables',(select count(*) from public.maria_email_extracted_payables p join public.maria_email_messages m on m.id=p.message_id join public.maria_email_sources s on s.id=m.source_id where s.source_key='test_fase4_gmail'),
    'matches',(select count(*) from public.maria_email_payable_matches mt join _maria_email_fase4_ids i on i.payable_id=mt.email_payable_id)
  ) into v_after;

  if v_before is distinct from v_after then
    raise exception 'FAIL: consulta operacional mudou dados. before %, after %', v_before, v_after;
  end if;
end $$;

rollback;
