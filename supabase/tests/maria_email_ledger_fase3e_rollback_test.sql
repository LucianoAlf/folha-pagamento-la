-- Maria Email Ledger — Fase 3E teste vivo com rollback
-- Valida sugestao automatica de match sem confirmar, sem mexer em contas_pagar e sem duplicar.

begin;

select public.maria_email_source_upsert(jsonb_build_object(
  'source_key', 'test_fase3e_gmail',
  'label', 'Teste Fase3E Gmail',
  'provider', 'gmail',
  'credential_ref', 'private_runtime:test_fase3e_gmail',
  'last_known_uidvalidity', 401,
  'ativo', true
)) as source_enabled;

create temp table _maria_email_fase3e_ids as
select
  (public.maria_email_processing_run_start(jsonb_build_object(
    'source_key', 'test_fase3e_gmail',
    'run_kind', 'autopush',
    'parser_version', 'fase3e-rollback-test',
    'code_version', 'fase3e-rollback-test'
  ))->>'run_id')::uuid as run_id,
  null::uuid as message_id,
  null::uuid as payable_id,
  null::uuid as conta_id,
  null::uuid as plano_id,
  null::uuid as centro_id,
  null::uuid as empresa_id;

update _maria_email_fase3e_ids
   set plano_id = (select id from public.plano_contas limit 1),
       centro_id = (select id from public.centros_custo where codigo = 'bar' limit 1),
       empresa_id = (select id from public.financeiro_empresas where label_operacional = 'Barra' and ativo = true limit 1);

update _maria_email_fase3e_ids
   set message_id = (public.maria_email_message_registrar(jsonb_build_object(
     'source_key', 'test_fase3e_gmail',
     'processing_run_id', run_id,
     'uidvalidity', 401,
     'imap_uid', '9301',
     'from_domain', 'example.com',
     'from_email_hash', repeat('a', 64),
     'from_email_masked', 'te***@example.com',
     'subject', 'Teste Fase3E',
     'snippet', 'Snippet teste Fase3E',
     'received_at', now(),
     'body_hash', repeat('b', 64),
     'has_attachments', true,
     'relevance_status', 'relevante',
     'processing_status', 'processado'
   ))->>'message_id')::uuid;

update _maria_email_fase3e_ids
   set payable_id = (public.maria_email_payable_registrar(jsonb_build_object(
     'message_id', message_id,
     'processing_run_id', run_id,
     'document_kind', 'boleto',
     'fornecedor_nome', 'Fornecedor Sintetico Fase3E',
     'fornecedor_documento_hash', repeat('c', 64),
     'document_number', 'DOC-FASE3E-1',
     'vencimento', current_date + 5,
     'valor_centavos', 12345,
     'unidade_snapshot', 'bar',
     'plano_conta_id', plano_id,
     'centro_custo_id', centro_id,
     'empresa_id', empresa_id,
     'extraction_method', 'body',
     'confidence', 0.9100,
     'status', 'extraido',
     'dedupe_group_key', 'test-fase3e-key-12345',
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
    'Fornecedor Sintetico Fase3E boleto teste',
    'bar',
    123.45,
    current_date + 5,
    date_trunc('month', current_date)::date,
    'pendente',
    'eventual',
    plano_id,
    centro_id,
    empresa_id
  from _maria_email_fase3e_ids
  returning id
)
update _maria_email_fase3e_ids
   set conta_id = (select id from inserted);

-- 1. Sugere exatamente uma conta com score alto.
do $$
declare
  v_result jsonb;
  v_count integer;
  v_score numeric;
  v_status text;
begin
  select public.maria_email_match_sugerir_auto(payable_id, 5, 0.6000)
    into v_result
    from _maria_email_fase3e_ids;

  if coalesce((v_result->>'suggestions_inserted')::integer, 0) <> 1 then
    raise exception 'FAIL: deveria inserir 1 sugestao, resultado %', v_result;
  end if;

  select count(*), max(match_score), max(match_status)
    into v_count, v_score, v_status
    from public.maria_email_payable_matches m
    join _maria_email_fase3e_ids i on i.payable_id = m.email_payable_id
   where m.conta_pagar_id = i.conta_id;

  if v_count <> 1 then
    raise exception 'FAIL: deveria haver 1 match, encontrou %', v_count;
  end if;

  if v_status <> 'sugerido' then
    raise exception 'FAIL: match deveria ser sugerido, veio %', v_status;
  end if;

  if v_score < 0.9000 then
    raise exception 'FAIL: score deveria ser alto, veio %', v_score;
  end if;
end $$;

-- 2. Idempotencia: rodar de novo nao duplica.
do $$
declare
  v_result jsonb;
  v_count integer;
begin
  select public.maria_email_match_sugerir_auto(payable_id, 5, 0.6000)
    into v_result
    from _maria_email_fase3e_ids;

  if coalesce((v_result->>'suggestions_inserted')::integer, 0) <> 0 then
    raise exception 'FAIL: segunda execucao nao deveria inserir, resultado %', v_result;
  end if;

  select count(*)
    into v_count
    from public.maria_email_payable_matches m
    join _maria_email_fase3e_ids i on i.payable_id = m.email_payable_id
   where m.conta_pagar_id = i.conta_id;

  if v_count <> 1 then
    raise exception 'FAIL: segunda execucao duplicou match, count %', v_count;
  end if;
end $$;

-- 3. Nao confirma, nao audita como acao humana e nao altera a conta.
do $$
declare
  v_confirmed integer;
  v_audit integer;
  v_conta_status text;
begin
  select count(*) into v_confirmed
    from public.maria_email_payable_matches m
    join _maria_email_fase3e_ids i on i.payable_id = m.email_payable_id
   where m.match_status = 'confirmado_humano';

  if v_confirmed <> 0 then
    raise exception 'FAIL: sugestao automatica confirmou match humano';
  end if;

  select count(*) into v_audit
    from public.maria_audit_log
   where tabela = 'maria_email_payable_matches'
     and operacao ilike '%match%'
     and created_at > now() - interval '5 minutes';

  if v_audit <> 0 then
    raise exception 'FAIL: sugestao tecnica nao deveria gerar audit_log humano, registrou %', v_audit;
  end if;

  select c.status into v_conta_status
    from public.contas_pagar c
    join _maria_email_fase3e_ids i on i.conta_id = c.id;

  if v_conta_status <> 'pendente' then
    raise exception 'FAIL: sugestao alterou status de conta_pagar para %', v_conta_status;
  end if;
end $$;

rollback;
