-- Maria Email Ledger — Fase 3A teste vivo com rollback
-- Valida kill switch de source_upsert e versionamento atomico de payable.

begin;

-- Ator humano fake, somente dentro da transacao de teste.
do $$
declare
  v_numero text := '550000000001';
begin
  insert into public.maria_whatsapp_atores (nome, papel, numero_hash, numero_last4, observacao)
  values (
    'Teste Fase3A',
    'owner_full',
    encode(extensions.digest(public.maria_normalizar_numero(v_numero), 'sha256'), 'hex'),
    right(public.maria_normalizar_numero(v_numero), 4),
    'ator sintetico rollback fase3a'
  )
  on conflict (numero_hash) do update
  set nome = excluded.nome,
      papel = excluded.papel,
      ativo = true,
      updated_at = now();
end $$;

-- 1. Kill switch: ativo=false nao pode religar em upsert sem ativo explicito.
select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_fase3a_gmail',
  'label', 'Teste Fase3A Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_fase3a_gmail',
  'last_known_uidvalidity', 100,
  'ativo', false
)) as source_disabled;

select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_fase3a_gmail',
  'label', 'Teste Fase3A Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_fase3a_gmail',
  'last_known_uidvalidity', 101
)) as source_uid_update_without_ativo;

do $$
declare
  v_ativo boolean;
  v_uidvalidity bigint;
begin
  select ativo, last_known_uidvalidity
    into v_ativo, v_uidvalidity
    from public.maria_email_sources
   where source_key = 'test_fase3a_gmail';

  if v_ativo is distinct from false then
    raise exception 'FAIL: upsert sem ativo religou fonte inativa';
  end if;

  if v_uidvalidity <> 101 then
    raise exception 'FAIL: upsert sem ativo deveria atualizar UIDVALIDITY preservando ativo=false';
  end if;
end $$;

-- Reativa explicitamente para montar dados sintenticos de versionamento.
select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_fase3a_gmail',
  'label', 'Teste Fase3A Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_fase3a_gmail',
  'last_known_uidvalidity', 101,
  'ativo', true
)) as source_enabled;

create temp table _maria_email_fase3a_ids as
select
  (public.maria_email_processing_run_start(jsonb_build_object(
    'source_key', 'test_fase3a_gmail',
    'run_kind', 'autopush',
    'parser_version', 'fase3a-rollback-test',
    'code_version', 'fase3a-rollback-test'
  ))->>'run_id')::uuid as run_id,
  null::uuid as message_id,
  null::uuid as payable_id,
  null::uuid as payable_novo_id;

update _maria_email_fase3a_ids
   set message_id = (public.maria_email_message_registrar(jsonb_build_object(
     'source_key', 'test_fase3a_gmail',
     'processing_run_id', run_id,
     'uidvalidity', 101,
     'imap_uid', '9001',
     'from_domain', 'example.com',
     'from_email_hash', repeat('1', 64),
     'from_email_masked', 'te***@example.com',
     'subject', 'Teste Fase3A',
     'snippet', 'Snippet teste Fase3A',
     'received_at', now(),
     'body_hash', repeat('2', 64),
     'has_attachments', true,
     'relevance_status', 'relevante',
     'processing_status', 'processado'
   ))->>'message_id')::uuid;

update _maria_email_fase3a_ids
   set payable_id = (public.maria_email_payable_registrar(jsonb_build_object(
     'message_id', message_id,
     'processing_run_id', run_id,
     'document_kind', 'boleto',
     'fornecedor_nome', 'Fornecedor Teste Fase3A',
     'payer_name_masked', 'Pag*** Fase3A',
     'payer_name_hash', repeat('3', 64),
     'document_number', 'DOC-FASE3A-1',
     'vencimento', current_date + 7,
     'valor_centavos', 23456,
     'extraction_method', 'body',
     'confidence', 0.8700,
     'status', 'extraido',
     'dedupe_group_key', 'test-fase3a-old-key-23456',
     'dedupe_group_quality', 'media'
   ))->>'payable_id')::uuid;

-- 2. Falha antes de versionar nao pode alterar o antigo.
do $$
declare
  v_old uuid;
  v_status text;
begin
  select payable_id into v_old from _maria_email_fase3a_ids;

  begin
    perform public.maria_email_payable_versionar(
      '550000000001',
      'owner_full',
      v_old,
      jsonb_build_object('valor_centavos', 23456),
      'rollback teste sem dedupe',
      'texto sintetico'
    );
    raise exception 'FAIL: versionamento sem dedupe_group_key deveria falhar';
  exception when invalid_parameter_value then
    null;
  end;

  select status into v_status from public.maria_email_extracted_payables where id = v_old;
  if v_status <> 'extraido' then
    raise exception 'FAIL: falha de versionamento alterou status antigo para %', v_status;
  end if;
end $$;

-- 2b. Chave nova sem quality recalculada tambem deve falhar sem alterar antigo.
do $$
declare
  v_old uuid;
  v_status text;
begin
  select payable_id into v_old from _maria_email_fase3a_ids;

  begin
    perform public.maria_email_payable_versionar(
      '550000000001',
      'owner_full',
      v_old,
      jsonb_build_object('dedupe_group_key', 'test-fase3a-new-key-without-quality'),
      'rollback teste sem quality',
      'texto sintetico'
    );
    raise exception 'FAIL: versionamento sem dedupe_group_quality deveria falhar';
  exception when invalid_parameter_value then
    null;
  end;

  select status into v_status from public.maria_email_extracted_payables where id = v_old;
  if v_status <> 'extraido' then
    raise exception 'FAIL: falha sem quality alterou status antigo para %', v_status;
  end if;
end $$;

-- 3. Versionamento atomico: antigo substituido, novo criado, status novo forcado e auditado.
update _maria_email_fase3a_ids
   set payable_novo_id = (
     public.maria_email_payable_versionar(
       '550000000001',
       'owner_full',
       payable_id,
       jsonb_build_object(
         'dedupe_group_key', 'test-fase3a-new-key-23456',
         'dedupe_group_quality', 'forte',
         'unidade_snapshot', 'Barra',
         'plano_snapshot', '5.2.11 Softwares e Plataformas',
         'status', 'pago'
       ),
       'rollback teste versionamento atomico',
       'texto sintetico fase3a'
     )->>'payable_novo_id'
   )::uuid;

do $$
declare
  v_old uuid;
  v_new uuid;
  v_old_status text;
  v_new_status text;
  v_new_super uuid;
  v_new_dedupe text;
  v_audit_count integer;
begin
  select payable_id, payable_novo_id into v_old, v_new from _maria_email_fase3a_ids;

  select status into v_old_status from public.maria_email_extracted_payables where id = v_old;
  select status, supersedes_payable_id, dedupe_group_key
    into v_new_status, v_new_super, v_new_dedupe
    from public.maria_email_extracted_payables
   where id = v_new;

  if v_old_status <> 'substituido' then
    raise exception 'FAIL: antigo deveria estar substituido, esta %', v_old_status;
  end if;

  if v_new_status <> 'pendente_conferencia' then
    raise exception 'FAIL: novo deveria forcar pendente_conferencia, esta %', v_new_status;
  end if;

  if v_new_super is distinct from v_old then
    raise exception 'FAIL: novo nao aponta supersedes_payable_id para antigo';
  end if;

  if v_new_dedupe <> 'test-fase3a-new-key-23456' then
    raise exception 'FAIL: novo nao recebeu dedupe recalculado';
  end if;

  select count(*) into v_audit_count
    from public.maria_audit_log
   where tabela = 'maria_email_extracted_payables'
     and entidade_tipo = 'maria_email_payable'
     and entidade_id = v_old
     and operacao = 'versionar_payable_email';

  if v_audit_count <> 1 then
    raise exception 'FAIL: versionamento deveria registrar 1 auditoria, registrou %', v_audit_count;
  end if;
end $$;

rollback;

-- 4. Confirma rollback dos sinteticos.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.maria_email_sources where source_key = 'test_fase3a_gmail';
  if v_count <> 0 then
    raise exception 'FAIL: rollback deixou source sintetica';
  end if;
end $$;
