-- Maria Email Ledger — teste vivo com rollback
-- Executar SOMENTE depois de aplicar a migration em ambiente de teste/staging.
-- Este script cria dados sintéticos, valida guards/RPCs e termina com ROLLBACK.

begin;

-- 1. Grants fechados: service_role nao pode acessar tabelas diretamente.
do $$
begin
  if has_table_privilege('service_role', 'public.maria_email_messages', 'insert') then
    raise exception 'FAIL: service_role nao pode ter INSERT direto em maria_email_messages';
  end if;
  if has_table_privilege('service_role', 'public.maria_email_extracted_payables', 'update') then
    raise exception 'FAIL: service_role nao pode ter UPDATE direto em maria_email_extracted_payables';
  end if;
end $$;

-- 2. Fluxo tecnico minimo via RPC.
select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_gmail',
  'label', 'Teste Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_gmail',
  'last_known_uidvalidity', 10
)) as source_upsert_result;

create temp table _maria_email_test_ids as
select
  (public.maria_email_processing_run_start(jsonb_build_object(
    'source_key', 'test_gmail',
    'run_kind', 'autopush',
    'parser_version', 'rollback-test',
    'code_version', 'rollback-test'
  ))->>'run_id')::uuid as run_id,
  null::uuid as message_id,
  null::uuid as message_id_uidvalidity_11,
  null::uuid as payable_id,
  null::uuid as match_id,
  null::uuid as conta_pagar_id;

update _maria_email_test_ids
   set message_id = (public.maria_email_message_registrar(jsonb_build_object(
     'source_key', 'test_gmail',
     'processing_run_id', run_id,
     'uidvalidity', 10,
     'imap_uid', '42',
     'from_domain', 'example.com',
     'from_email_hash', repeat('a', 64),
     'from_email_masked', 'te***@example.com',
     'subject', 'Boleto teste',
     'snippet', 'Snippet teste',
     'received_at', now(),
     'body_hash', repeat('b', 64),
     'has_attachments', true,
     'relevance_status', 'relevante',
     'processing_status', 'processado'
   ))->>'message_id')::uuid;

update _maria_email_test_ids
   set message_id_uidvalidity_11 = (public.maria_email_message_registrar(jsonb_build_object(
     'source_key', 'test_gmail',
     'processing_run_id', run_id,
     'uidvalidity', 11,
     'imap_uid', '42',
     'from_domain', 'example.com',
     'from_email_hash', repeat('c', 64),
     'subject', 'Mesmo UID em UIDVALIDITY nova',
     'received_at', now(),
     'body_hash', repeat('d', 64),
     'processing_status', 'processado'
   ))->>'message_id')::uuid;

-- UID igual em UIDVALIDITY diferente precisa virar mensagem nova.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.maria_email_messages
   where source_key = 'test_gmail'
     and imap_uid = '42'
     and uidvalidity in (10, 11);

  if v_count <> 2 then
    raise exception 'FAIL: UID repetido em UIDVALIDITY nova deveria gerar 2 mensagens, gerou %', v_count;
  end if;
end $$;

update _maria_email_test_ids
   set payable_id = (public.maria_email_payable_registrar(jsonb_build_object(
     'message_id', message_id,
     'processing_run_id', run_id,
     'document_kind', 'boleto',
     'fornecedor_nome', 'Fornecedor Teste',
     'payer_name_masked', 'Pag*** Teste',
     'payer_name_hash', repeat('e', 64),
     'vencimento', current_date + 5,
     'valor_centavos', 12345,
     'extraction_method', 'body',
     'confidence', 0.9100,
     'dedupe_group_key', 'test_gmail:fornecedor:2026-07:12345',
     'dedupe_group_quality', 'forte'
   ))->>'payable_id')::uuid;

with ins as (
  insert into public.contas_pagar (descricao, valor, data_vencimento, competencia, status)
  values ('ROLLBACK TEST Maria Email Ledger', 123.45, current_date + 5, date_trunc('month', current_date)::date, 'pendente')
  returning id
)
update _maria_email_test_ids
   set conta_pagar_id = (select id from ins);

update _maria_email_test_ids
   set match_id = (public.maria_email_match_sugerir(jsonb_build_object(
     'email_payable_id', payable_id,
     'conta_pagar_id', conta_pagar_id,
     'match_score', 0.9300,
     'match_reason', 'rollback test',
     'superfolha_status_snapshot', 'pendente',
     'superfolha_valor_centavos_snapshot', 12345,
     'superfolha_vencimento_snapshot', current_date + 5
   ))->>'match_id')::uuid;

-- 3. Direct UPDATE sem flag deve falhar.
do $$
declare
  v_message_id uuid;
begin
  select message_id into v_message_id from _maria_email_test_ids;
  begin
    update public.maria_email_messages set snippet = 'NAO PODE' where id = v_message_id;
    raise exception 'FAIL: UPDATE direto em mensagem deveria falhar';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 4. DELETE sempre bloqueado, mesmo como owner da transacao.
do $$
declare
  v_message_id uuid;
begin
  select message_id into v_message_id from _maria_email_test_ids;
  begin
    delete from public.maria_email_messages where id = v_message_id;
    raise exception 'FAIL: DELETE em mensagem deveria falhar';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 5. Flag errada nao autoriza a outra trilha.
do $$
declare
  v_message_id uuid;
begin
  select message_id into v_message_id from _maria_email_test_ids;

  perform set_config('app.maria_email_rpc', '', true);
  perform set_config('app.maria_email_redaction', 'on', true);
  begin
    update public.maria_email_messages set processing_status = 'reprocessar' where id = v_message_id;
    raise exception 'FAIL: redaction nao pode mudar processing_status';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('app.maria_email_redaction', '', true);
end $$;

do $$
declare
  v_message_id uuid;
begin
  select message_id into v_message_id from _maria_email_test_ids;

  perform set_config('app.maria_email_redaction', '', true);
  perform set_config('app.maria_email_rpc', 'on', true);
  begin
    update public.maria_email_messages set snippet = null where id = v_message_id;
    raise exception 'FAIL: rpc normal nao pode expurgar snippet';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('app.maria_email_rpc', '', true);
end $$;

-- 6. Expurgo real so toca campos pessoais e nao muda status.
do $$
declare
  v_message_id uuid;
  v_status text;
begin
  select message_id into v_message_id from _maria_email_test_ids;
  perform set_config('app.maria_email_redaction', 'on', true);
  update public.maria_email_messages
     set subject = null,
         snippet = null,
         from_name = null,
         from_email_masked = null,
         person_data_redaction_status = 'expurgado'
   where id = v_message_id;

  select processing_status into v_status from public.maria_email_messages where id = v_message_id;
  if v_status <> 'processado' then
    raise exception 'FAIL: expurgo alterou processing_status para %', v_status;
  end if;
  perform set_config('app.maria_email_redaction', '', true);
end $$;

-- 7. on delete set null de contas_pagar se comporta conforme decisao registrada.
delete from public.contas_pagar
 where id = (select conta_pagar_id from _maria_email_test_ids);

do $$
declare
  v_match_id uuid;
  v_conta uuid;
begin
  select match_id into v_match_id from _maria_email_test_ids;
  select conta_pagar_id into v_conta from public.maria_email_payable_matches where id = v_match_id;
  if v_conta is not null then
    raise exception 'FAIL: on delete set null nao limpou conta_pagar_id no match';
  end if;
end $$;

-- 8. Finalizacao de run via RPC, depois run finalizado nao altera.
select public.maria_email_processing_run_finish(
  (select run_id from _maria_email_test_ids),
  jsonb_build_object(
    'status', 'success',
    'uidvalidity_after', 11,
    'uidnext_observed', 43,
    'messages_seen', 2,
    'messages_processed', 2,
    'messages_ignored', 0,
    'payables_extracted', 1
  )
) as run_finish_result;

do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id from _maria_email_test_ids;
  perform set_config('app.maria_email_rpc', 'on', true);
  begin
    update public.maria_email_processing_runs set messages_seen = 99 where id = v_run_id;
    raise exception 'FAIL: run finalizado deveria ser imutavel';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;

-- 9. Flag local nao vaza para fora da transacao.
-- Este trecho commita apenas uma configuracao local sem dados, para provar que a flag some ao fim da transacao.
begin;
select set_config('app.maria_email_rpc', 'on', true);
commit;

begin;
do $$
begin
  if coalesce(current_setting('app.maria_email_rpc', true), '') = 'on' then
    raise exception 'FAIL: app.maria_email_rpc vazou para outra transacao';
  end if;
end $$;
rollback;
