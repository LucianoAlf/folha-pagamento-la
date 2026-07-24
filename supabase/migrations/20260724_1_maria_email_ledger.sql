-- Maria Email Ledger — SPEC v3.6 final pre-migration
-- Fase 1: schema/RPCs/views/guards, sem backfill e sem escrita em producao nesta etapa.
-- Decisoes centrais:
-- - Email prova recebimento; Super Folha prova lancamento/baixa/pagamento.
-- - Credenciais, pepper e HMAC sensivel ficam no runtime privado da Maria, nao no Supabase.
-- - service_role nao recebe grants diretos nas tabelas; escreve/le via RPCs/views allowlisted.
-- - Historico financeiro e append-only por trigger, com excecoes por flags locais separadas.

create extension if not exists pg_cron;

-- =====================================================
-- 1. Tabelas
-- =====================================================

create table if not exists public.maria_email_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  label text not null,
  provider text not null check (provider in ('gmail','zoho','imap')),
  email_hint text null,
  credential_ref text null,
  retention_policy_key text null default 'financeiro_email_v1',
  last_known_uidvalidity bigint null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maria_email_sources_source_key_clean check (source_key = lower(trim(source_key)) and source_key ~ '^[a-z0-9_:-]+$'),
  constraint maria_email_sources_no_plain_secret check (
    credential_ref is null
    or (
      credential_ref !~* '(password|senha|token|secret|app[_ -]?password|oauth|bearer|apikey|api[_ -]?key)'
      and credential_ref !~ '[[:space:]]'
    )
  )
);

create table if not exists public.maria_email_processing_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.maria_email_sources(id) on delete restrict,
  run_kind text not null check (run_kind in ('autopush','manual_query','backfill','reprocess','retention')),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running' check (status in ('running','success','partial','error')),
  uidvalidity_before bigint null,
  uidvalidity_after bigint null,
  uidvalidity_changed boolean not null default false,
  uidnext_observed bigint null,
  messages_seen integer not null default 0 check (messages_seen >= 0),
  messages_processed integer not null default 0 check (messages_processed >= 0),
  messages_ignored integer not null default 0 check (messages_ignored >= 0),
  payables_extracted integer not null default 0 check (payables_extracted >= 0),
  error_summary text null,
  parser_version text null,
  code_version text null,
  created_at timestamptz not null default now(),
  constraint maria_email_runs_finished_status_check check (
    (status = 'running' and finished_at is null)
    or (status in ('success','partial','error') and finished_at is not null)
  )
);

create table if not exists public.maria_email_messages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.maria_email_sources(id) on delete restrict,
  processing_run_id uuid null references public.maria_email_processing_runs(id) on delete restrict,
  source_key text not null,
  uidvalidity bigint not null,
  imap_uid text not null,
  message_id_header text null,
  thread_id_header text null,
  from_domain text null,
  from_email_hash text null,
  from_email_masked text null,
  hash_version text not null default 'hmac-sha256-v1',
  from_name text null,
  subject text null,
  received_at timestamptz null,
  snippet text null,
  body_hash text null,
  has_attachments boolean not null default false,
  has_payment_link boolean not null default false,
  relevance_status text not null default 'relevante' check (relevance_status in ('relevante','ignorado','suspeito','erro')),
  processing_status text not null default 'novo' check (processing_status in ('novo','processado','parcial','erro','reprocessar')),
  ignored_reason text null,
  person_data_redaction_status text not null default 'pendente' check (person_data_redaction_status in ('nao_aplicavel','pendente','mascarado','expurgado','retido_por_regra_operacional')),
  last_processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maria_email_messages_uid_uniq unique (source_id, uidvalidity, imap_uid),
  constraint maria_email_messages_hash_version_check check (hash_version ~ '^hmac-sha256-v[0-9]+$'),
  constraint maria_email_messages_from_hash_shape check (from_email_hash is null or from_email_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_messages_body_hash_shape check (body_hash is null or body_hash ~ '^[a-f0-9]{64}$')
);

create table if not exists public.maria_email_extracted_payables (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.maria_email_messages(id) on delete restrict,
  processing_run_id uuid null references public.maria_email_processing_runs(id) on delete restrict,
  financeiro_documento_id uuid null references public.financeiro_documentos(id) on delete restrict,
  document_kind text not null check (document_kind in ('boleto','pix','fatura','link_cobranca','nota','alerta','outro')),
  fornecedor_nome text null,
  fornecedor_documento_hash text null,
  hash_version text not null default 'hmac-sha256-v1',
  payer_name_masked text null,
  payer_name_hash text null,
  document_number text null,
  competencia date null,
  emissao date null,
  vencimento date null,
  valor_centavos integer null check (valor_centavos is null or valor_centavos >= 0),
  moeda text not null default 'BRL',
  centro_custo_id uuid null references public.centros_custo(id) on delete restrict,
  unidade_snapshot text null,
  plano_conta_id uuid null references public.plano_contas(id) on delete restrict,
  plano_snapshot text null,
  empresa_id uuid null references public.financeiro_empresas(id) on delete restrict,
  extraction_method text not null check (extraction_method in ('body','pdf_text','ocr','payment_link','manual')),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status text not null default 'extraido' check (status in ('recebido','extraido','pendente_dado','pendente_conferencia','ignorado','vinculado','lancado','pago','divergente','substituido')),
  review_reason text null,
  barcode_hash text null,
  pix_payload_hash text null,
  payment_link_domain text null,
  payment_link_hash text null,
  dedupe_group_key text not null,
  dedupe_group_quality text not null default 'fraca' check (dedupe_group_quality in ('forte','media','fraca')),
  supersedes_payable_id uuid null references public.maria_email_extracted_payables(id) on delete restrict,
  person_data_redaction_status text not null default 'pendente' check (person_data_redaction_status in ('nao_aplicavel','pendente','mascarado','expurgado','retido_por_regra_operacional')),
  raw_extraction_sanitized jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maria_email_payables_hash_version_check check (hash_version ~ '^hmac-sha256-v[0-9]+$'),
  constraint maria_email_payables_fornecedor_hash_shape check (fornecedor_documento_hash is null or fornecedor_documento_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_payables_payer_hash_shape check (payer_name_hash is null or payer_name_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_payables_barcode_hash_shape check (barcode_hash is null or barcode_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_payables_pix_hash_shape check (pix_payload_hash is null or pix_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_payables_payment_link_hash_shape check (payment_link_hash is null or payment_link_hash ~ '^[a-f0-9]{64}$'),
  constraint maria_email_payables_dedupe_key_clean check (length(trim(dedupe_group_key)) >= 12)
);

create table if not exists public.maria_email_payable_matches (
  id uuid primary key default gen_random_uuid(),
  email_payable_id uuid not null references public.maria_email_extracted_payables(id) on delete restrict,
  conta_pagar_id uuid null references public.contas_pagar(id) on delete set null,
  match_status text not null default 'sugerido' check (match_status in ('sugerido','confirmado_humano','rejeitado')),
  match_score numeric(5,4) not null default 0 check (match_score between 0 and 1),
  match_reason text null,
  superfolha_status_snapshot text null,
  superfolha_valor_centavos_snapshot integer null,
  superfolha_vencimento_snapshot date null,
  confirmed_by text null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maria_email_matches_confirmed_fields_check check (
    (match_status = 'confirmado_humano' and confirmed_by is not null and confirmed_at is not null)
    or (match_status <> 'confirmado_humano')
  )
);

create index if not exists maria_email_messages_received_idx on public.maria_email_messages (received_at desc);
create index if not exists maria_email_messages_source_status_idx on public.maria_email_messages (source_id, processing_status, relevance_status);
create index if not exists maria_email_runs_source_started_idx on public.maria_email_processing_runs (source_id, started_at desc);
create index if not exists maria_email_payables_message_idx on public.maria_email_extracted_payables (message_id);
create index if not exists maria_email_payables_run_idx on public.maria_email_extracted_payables (processing_run_id);
create index if not exists maria_email_payables_due_idx on public.maria_email_extracted_payables (vencimento, status);
create index if not exists maria_email_payable_dedupe_group_idx on public.maria_email_extracted_payables (dedupe_group_key);
create unique index if not exists maria_email_payable_ativo_uniq
  on public.maria_email_extracted_payables (dedupe_group_key)
  where status in ('vinculado', 'lancado', 'pago')
    and dedupe_group_quality in ('forte', 'media');
create index if not exists maria_email_matches_payable_idx on public.maria_email_payable_matches (email_payable_id);
create index if not exists maria_email_matches_conta_idx on public.maria_email_payable_matches (conta_pagar_id);
create unique index if not exists maria_email_match_conta_confirmada_uniq
  on public.maria_email_payable_matches (conta_pagar_id)
  where match_status = 'confirmado_humano'
    and conta_pagar_id is not null;

-- =====================================================
-- 2. RLS + grants fechados nas tabelas
-- =====================================================

alter table public.maria_email_sources enable row level security;
alter table public.maria_email_processing_runs enable row level security;
alter table public.maria_email_messages enable row level security;
alter table public.maria_email_extracted_payables enable row level security;
alter table public.maria_email_payable_matches enable row level security;

revoke all on table public.maria_email_sources from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on table public.maria_email_processing_runs from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on table public.maria_email_messages from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on table public.maria_email_extracted_payables from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on table public.maria_email_payable_matches from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

-- =====================================================
-- 3. Helpers e guards append-only
-- =====================================================

create or replace function public.maria_email_is_rpc()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('app.maria_email_rpc', true), '') = 'on';
$$;

create or replace function public.maria_email_is_redaction()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('app.maria_email_redaction', true), '') = 'on';
$$;

create or replace function public.maria_email_payload_text(p_payload jsonb, p_key text, p_max integer default 500)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := nullif(trim(coalesce(p_payload->>p_key, '')), '');
  if v is null then
    return null;
  end if;
  return left(v, greatest(1, p_max));
end;
$$;

create or replace function public.maria_email_assert_hmac_hex(p_value text, p_label text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_value is not null and p_value !~ '^[a-f0-9]{64}$' then
    raise exception 'MARIA_EMAIL_HASH_INVALIDO: % deve ser HMAC-SHA256 hex gerado no runtime', p_label
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.maria_email_no_plain_secret(p_value text, p_label text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_value is not null and p_value ~* '(password|senha|token|secret|app[_ -]?password|oauth|bearer|apikey|api[_ -]?key)' then
    raise exception 'MARIA_EMAIL_SEGREDO_BLOQUEADO: % nao pode conter segredo ou token', p_label
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.maria_email_sources_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: fonte nunca pode ser apagada' using errcode = '42501';
  end if;

  if not public.maria_email_is_rpc() then
    raise exception 'MARIA_EMAIL_ESCRITA_DIRETA: use as RPCs autorizadas' using errcode = '42501';
  end if;

  if (to_jsonb(new) - array['label','ativo','last_known_uidvalidity','credential_ref','retention_policy_key','updated_at'])
     is distinct from
     (to_jsonb(old) - array['label','ativo','last_known_uidvalidity','credential_ref','retention_policy_key','updated_at']) then
    raise exception 'MARIA_EMAIL_IMUTAVEL: identidade da fonte nao pode mudar' using errcode = '42501';
  end if;

  perform public.maria_email_no_plain_secret(new.credential_ref, 'credential_ref');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.maria_email_run_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: run nunca pode ser apagado' using errcode = '42501';
  end if;

  if old.finished_at is not null then
    raise exception 'MARIA_EMAIL_IMUTAVEL: run finalizado nao pode ser alterado' using errcode = '42501';
  end if;

  if not public.maria_email_is_rpc() then
    raise exception 'MARIA_EMAIL_ESCRITA_DIRETA: use as RPCs autorizadas' using errcode = '42501';
  end if;

  if old.status <> 'running' or new.status not in ('success','partial','error') then
    raise exception 'MARIA_EMAIL_TRANSICAO_INVALIDA: run running so finaliza para success/partial/error' using errcode = '42501';
  end if;

  if new.finished_at is null then
    raise exception 'MARIA_EMAIL_TRANSICAO_INVALIDA: finalizacao exige finished_at' using errcode = '42501';
  end if;

  if (to_jsonb(new) - array[
        'finished_at','status','uidvalidity_after','uidvalidity_changed','uidnext_observed',
        'messages_seen','messages_processed','messages_ignored','payables_extracted','error_summary'
      ])
     is distinct from
     (to_jsonb(old) - array[
        'finished_at','status','uidvalidity_after','uidvalidity_changed','uidnext_observed',
        'messages_seen','messages_processed','messages_ignored','payables_extracted','error_summary'
      ]) then
    raise exception 'MARIA_EMAIL_IMUTAVEL: identidade do run nao pode mudar' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.maria_email_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rpc boolean := public.maria_email_is_rpc();
  v_redaction boolean := public.maria_email_is_redaction();
begin
  if tg_op = 'DELETE' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: mensagem nunca pode ser apagada' using errcode = '42501';
  end if;

  if v_rpc and v_redaction then
    raise exception 'MARIA_EMAIL_FLAG_INVALIDA: operacao e redacao nao podem compartilhar a mesma transacao' using errcode = '42501';
  end if;

  if not (v_rpc or v_redaction) then
    raise exception 'MARIA_EMAIL_ESCRITA_DIRETA: use as RPCs autorizadas' using errcode = '42501';
  end if;

  if v_rpc then
    if new.processing_run_id is distinct from old.processing_run_id
       and not (old.processing_run_id is null and new.processing_run_id is not null) then
      raise exception 'MARIA_EMAIL_IMUTAVEL: processing_run_id e write-once' using errcode = '42501';
    end if;

    if (to_jsonb(new) - array['processing_status','relevance_status','ignored_reason','last_processed_at','processing_run_id','updated_at'])
       is distinct from
       (to_jsonb(old) - array['processing_status','relevance_status','ignored_reason','last_processed_at','processing_run_id','updated_at']) then
      raise exception 'MARIA_EMAIL_IMUTAVEL: envelope nao pode mudar pela trilha operacional' using errcode = '42501';
    end if;
  end if;

  if v_redaction then
    if (to_jsonb(new) - array['subject','snippet','from_name','from_email_masked','person_data_redaction_status','updated_at'])
       is distinct from
       (to_jsonb(old) - array['subject','snippet','from_name','from_email_masked','person_data_redaction_status','updated_at']) then
      raise exception 'MARIA_EMAIL_REDACAO_ESCOPO: expurgo so toca campos pessoais' using errcode = '42501';
    end if;

    if new.person_data_redaction_status not in ('mascarado','expurgado','nao_aplicavel') then
      raise exception 'MARIA_EMAIL_REDACAO_ESCOPO: status de redacao invalido' using errcode = '42501';
    end if;

    if new.person_data_redaction_status = 'expurgado'
       and (new.snippet is not null or new.subject is not null or new.from_name is not null or new.from_email_masked is not null) then
      raise exception 'MARIA_EMAIL_REDACAO_INCOMPLETA: expurgo deve anular campos pessoais' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.maria_email_payable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rpc boolean := public.maria_email_is_rpc();
  v_redaction boolean := public.maria_email_is_redaction();
begin
  if tg_op = 'DELETE' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: payable nunca pode ser apagado' using errcode = '42501';
  end if;

  if v_rpc and v_redaction then
    raise exception 'MARIA_EMAIL_FLAG_INVALIDA: operacao e redacao nao podem compartilhar a mesma transacao' using errcode = '42501';
  end if;

  if not (v_rpc or v_redaction) then
    raise exception 'MARIA_EMAIL_ESCRITA_DIRETA: use as RPCs autorizadas' using errcode = '42501';
  end if;

  if v_rpc then
    if (to_jsonb(new) - array[
          'status','review_reason','plano_conta_id','plano_snapshot','confidence','supersedes_payable_id','updated_at'
        ])
       is distinct from
       (to_jsonb(old) - array[
          'status','review_reason','plano_conta_id','plano_snapshot','confidence','supersedes_payable_id','updated_at'
        ]) then
      raise exception 'MARIA_EMAIL_IMUTAVEL: fato financeiro/dedupe nao pode mudar pela trilha operacional' using errcode = '42501';
    end if;
  end if;

  if v_redaction then
    if (to_jsonb(new) - array['fornecedor_nome','payer_name_masked','payer_name_hash','raw_extraction_sanitized','person_data_redaction_status','updated_at'])
       is distinct from
       (to_jsonb(old) - array['fornecedor_nome','payer_name_masked','payer_name_hash','raw_extraction_sanitized','person_data_redaction_status','updated_at']) then
      raise exception 'MARIA_EMAIL_REDACAO_ESCOPO: expurgo so toca campos pessoais do payable' using errcode = '42501';
    end if;

    if new.person_data_redaction_status not in ('mascarado','expurgado','nao_aplicavel') then
      raise exception 'MARIA_EMAIL_REDACAO_ESCOPO: status de redacao invalido' using errcode = '42501';
    end if;

    if new.person_data_redaction_status = 'expurgado'
       and (new.fornecedor_nome is not null or new.payer_name_masked is not null or new.payer_name_hash is not null or new.raw_extraction_sanitized is not null) then
      raise exception 'MARIA_EMAIL_REDACAO_INCOMPLETA: expurgo deve anular campos pessoais do payable' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.maria_email_match_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rpc boolean := public.maria_email_is_rpc();
begin
  if tg_op = 'DELETE' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: match nunca pode ser apagado' using errcode = '42501';
  end if;

  -- Excecao deliberada para FK on delete set null em contas_pagar.
  -- Permite somente conta_pagar_id nao-nulo -> null, sem outra alteracao alem de updated_at.
  if new.conta_pagar_id is null
     and old.conta_pagar_id is not null
     and (to_jsonb(new) - array['conta_pagar_id','updated_at'])
         is not distinct from
         (to_jsonb(old) - array['conta_pagar_id','updated_at']) then
    new.updated_at := now();
    return new;
  end if;

  if not v_rpc then
    raise exception 'MARIA_EMAIL_ESCRITA_DIRETA: use as RPCs autorizadas' using errcode = '42501';
  end if;

  if old.match_status <> 'sugerido' then
    raise exception 'MARIA_EMAIL_IMUTAVEL: match finalizado nao muda; registre um novo' using errcode = '42501';
  end if;

  if new.match_status not in ('confirmado_humano','rejeitado') then
    raise exception 'MARIA_EMAIL_TRANSICAO_INVALIDA: sugerido so vai para confirmado_humano ou rejeitado' using errcode = '42501';
  end if;

  if (to_jsonb(new) - array['match_status','match_reason','confirmed_by','confirmed_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['match_status','match_reason','confirmed_by','confirmed_at','updated_at']) then
    raise exception 'MARIA_EMAIL_IMUTAVEL: vinculo/score/snapshots do match nao podem mudar' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_maria_email_sources_guard on public.maria_email_sources;
create trigger trg_maria_email_sources_guard
before update or delete on public.maria_email_sources
for each row execute function public.maria_email_sources_guard();

drop trigger if exists trg_maria_email_run_guard on public.maria_email_processing_runs;
create trigger trg_maria_email_run_guard
before update or delete on public.maria_email_processing_runs
for each row execute function public.maria_email_run_guard();

drop trigger if exists trg_maria_email_message_guard on public.maria_email_messages;
create trigger trg_maria_email_message_guard
before update or delete on public.maria_email_messages
for each row execute function public.maria_email_message_guard();

drop trigger if exists trg_maria_email_payable_guard on public.maria_email_extracted_payables;
create trigger trg_maria_email_payable_guard
before update or delete on public.maria_email_extracted_payables
for each row execute function public.maria_email_payable_guard();

drop trigger if exists trg_maria_email_match_guard on public.maria_email_payable_matches;
create trigger trg_maria_email_match_guard
before update or delete on public.maria_email_payable_matches
for each row execute function public.maria_email_match_guard();

-- =====================================================
-- 4. RPCs tecnicas de ingestao
-- =====================================================

create or replace function public.maria_email_source_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_key text := lower(trim(coalesce(p_payload->>'source_key', '')));
  v_id uuid;
  v_credential_ref text := public.maria_email_payload_text(p_payload, 'credential_ref', 240);
begin
  if v_source_key = '' then
    raise exception 'source_key obrigatorio' using errcode = '22023';
  end if;

  perform public.maria_email_no_plain_secret(v_credential_ref, 'credential_ref');
  perform set_config('app.maria_email_rpc', 'on', true);

  insert into public.maria_email_sources (
    source_key, label, provider, email_hint, credential_ref, retention_policy_key, last_known_uidvalidity, ativo
  ) values (
    v_source_key,
    coalesce(public.maria_email_payload_text(p_payload, 'label', 160), v_source_key),
    coalesce(public.maria_email_payload_text(p_payload, 'provider', 20), 'imap'),
    public.maria_email_payload_text(p_payload, 'email_hint', 160),
    v_credential_ref,
    coalesce(public.maria_email_payload_text(p_payload, 'retention_policy_key', 80), 'financeiro_email_v1'),
    nullif(p_payload->>'last_known_uidvalidity', '')::bigint,
    coalesce((p_payload->>'ativo')::boolean, true)
  )
  on conflict (source_key) do update set
    label = excluded.label,
    ativo = excluded.ativo,
    last_known_uidvalidity = coalesce(excluded.last_known_uidvalidity, public.maria_email_sources.last_known_uidvalidity),
    credential_ref = excluded.credential_ref,
    retention_policy_key = excluded.retention_policy_key
  returning id into v_id;

  return jsonb_build_object('success', true, 'source_id', v_id, 'source_key', v_source_key);
end;
$$;

create or replace function public.maria_email_processing_run_start(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_key text := lower(trim(coalesce(p_payload->>'source_key', '')));
  v_source public.maria_email_sources%rowtype;
  v_id uuid;
  v_run_kind text := coalesce(public.maria_email_payload_text(p_payload, 'run_kind', 40), 'autopush');
begin
  if v_source_key = '' then
    raise exception 'source_key obrigatorio' using errcode = '22023';
  end if;

  select * into v_source from public.maria_email_sources where source_key = v_source_key and ativo = true;
  if not found then
    raise exception 'fonte de email nao encontrada ou inativa: %', v_source_key using errcode = '22023';
  end if;

  insert into public.maria_email_processing_runs (
    source_id, run_kind, uidvalidity_before, parser_version, code_version
  ) values (
    v_source.id,
    v_run_kind,
    v_source.last_known_uidvalidity,
    public.maria_email_payload_text(p_payload, 'parser_version', 80),
    public.maria_email_payload_text(p_payload, 'code_version', 80)
  ) returning id into v_id;

  return jsonb_build_object('success', true, 'run_id', v_id, 'source_id', v_source.id, 'source_key', v_source.source_key);
end;
$$;

create or replace function public.maria_email_processing_run_finish(p_run_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.maria_email_processing_runs%rowtype;
  v_status text := coalesce(public.maria_email_payload_text(p_payload, 'status', 20), 'success');
  v_uidvalidity_after bigint := nullif(p_payload->>'uidvalidity_after', '')::bigint;
  v_uidnext bigint := nullif(p_payload->>'uidnext_observed', '')::bigint;
begin
  select * into v_run from public.maria_email_processing_runs where id = p_run_id for update;
  if not found then
    raise exception 'run nao encontrado' using errcode = '22023';
  end if;

  perform set_config('app.maria_email_rpc', 'on', true);

  update public.maria_email_processing_runs
     set status = v_status,
         finished_at = now(),
         uidvalidity_after = v_uidvalidity_after,
         uidvalidity_changed = coalesce(v_uidvalidity_after is distinct from v_run.uidvalidity_before, false),
         uidnext_observed = v_uidnext,
         messages_seen = coalesce(nullif(p_payload->>'messages_seen', '')::integer, messages_seen),
         messages_processed = coalesce(nullif(p_payload->>'messages_processed', '')::integer, messages_processed),
         messages_ignored = coalesce(nullif(p_payload->>'messages_ignored', '')::integer, messages_ignored),
         payables_extracted = coalesce(nullif(p_payload->>'payables_extracted', '')::integer, payables_extracted),
         error_summary = public.maria_email_payload_text(p_payload, 'error_summary', 500)
   where id = p_run_id;

  if v_uidvalidity_after is not null then
    update public.maria_email_sources
       set last_known_uidvalidity = v_uidvalidity_after
     where id = v_run.source_id;
  end if;

  return jsonb_build_object('success', true, 'run_id', p_run_id, 'status', v_status);
end;
$$;

create or replace function public.maria_email_message_registrar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_key text := lower(trim(coalesce(p_payload->>'source_key', '')));
  v_source public.maria_email_sources%rowtype;
  v_id uuid;
  v_existing public.maria_email_messages%rowtype;
  v_run_id uuid := nullif(p_payload->>'processing_run_id', '')::uuid;
  v_uidvalidity bigint := nullif(p_payload->>'uidvalidity', '')::bigint;
  v_imap_uid text := public.maria_email_payload_text(p_payload, 'imap_uid', 80);
  v_from_hash text := public.maria_email_payload_text(p_payload, 'from_email_hash', 80);
  v_body_hash text := public.maria_email_payload_text(p_payload, 'body_hash', 80);
  v_redaction_status text;
begin
  if v_source_key = '' or v_uidvalidity is null or v_imap_uid is null then
    raise exception 'source_key, uidvalidity e imap_uid sao obrigatorios' using errcode = '22023';
  end if;

  perform public.maria_email_assert_hmac_hex(v_from_hash, 'from_email_hash');
  perform public.maria_email_assert_hmac_hex(v_body_hash, 'body_hash');

  select * into v_source from public.maria_email_sources where source_key = v_source_key and ativo = true;
  if not found then
    raise exception 'fonte de email nao encontrada ou inativa: %', v_source_key using errcode = '22023';
  end if;

  if v_run_id is not null and not exists (
    select 1 from public.maria_email_processing_runs where id = v_run_id and source_id = v_source.id
  ) then
    raise exception 'processing_run_id nao pertence a fonte informada' using errcode = '22023';
  end if;

  v_redaction_status := coalesce(public.maria_email_payload_text(p_payload, 'person_data_redaction_status', 40),
    case when public.maria_email_payload_text(p_payload, 'subject', 240) is null
           and public.maria_email_payload_text(p_payload, 'snippet', 500) is null
           and public.maria_email_payload_text(p_payload, 'from_name', 160) is null
           and public.maria_email_payload_text(p_payload, 'from_email_masked', 160) is null
         then 'nao_aplicavel' else 'pendente' end);

  insert into public.maria_email_messages (
    source_id, processing_run_id, source_key, uidvalidity, imap_uid, message_id_header, thread_id_header,
    from_domain, from_email_hash, from_email_masked, hash_version, from_name, subject, received_at, snippet,
    body_hash, has_attachments, has_payment_link, relevance_status, processing_status, ignored_reason,
    person_data_redaction_status, last_processed_at
  ) values (
    v_source.id,
    v_run_id,
    v_source.source_key,
    v_uidvalidity,
    v_imap_uid,
    public.maria_email_payload_text(p_payload, 'message_id_header', 500),
    public.maria_email_payload_text(p_payload, 'thread_id_header', 500),
    lower(public.maria_email_payload_text(p_payload, 'from_domain', 180)),
    v_from_hash,
    public.maria_email_payload_text(p_payload, 'from_email_masked', 160),
    'hmac-sha256-v1',
    public.maria_email_payload_text(p_payload, 'from_name', 160),
    public.maria_email_payload_text(p_payload, 'subject', 240),
    nullif(p_payload->>'received_at', '')::timestamptz,
    public.maria_email_payload_text(p_payload, 'snippet', 500),
    v_body_hash,
    coalesce((p_payload->>'has_attachments')::boolean, false),
    coalesce((p_payload->>'has_payment_link')::boolean, false),
    coalesce(public.maria_email_payload_text(p_payload, 'relevance_status', 20), 'relevante'),
    coalesce(public.maria_email_payload_text(p_payload, 'processing_status', 20), 'processado'),
    public.maria_email_payload_text(p_payload, 'ignored_reason', 240),
    v_redaction_status,
    now()
  ) on conflict (source_id, uidvalidity, imap_uid) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('success', true, 'idempotent', false, 'message_id', v_id);
  end if;

  select * into v_existing
    from public.maria_email_messages
   where source_id = v_source.id
     and uidvalidity = v_uidvalidity
     and imap_uid = v_imap_uid
   for update;

  if v_body_hash is not null and v_existing.body_hash is not null and v_body_hash is distinct from v_existing.body_hash then
    raise exception 'MARIA_EMAIL_UID_CONFLITO: mesmo source/uidvalidity/uid com body_hash diferente' using errcode = '23505';
  end if;

  if v_run_id is not null and v_existing.processing_run_id is null then
    perform set_config('app.maria_email_rpc', 'on', true);
    update public.maria_email_messages set processing_run_id = v_run_id where id = v_existing.id;
  end if;

  return jsonb_build_object('success', true, 'idempotent', true, 'message_id', v_existing.id);
end;
$$;

create or replace function public.maria_email_payable_registrar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message public.maria_email_messages%rowtype;
  v_id uuid;
  v_run_id uuid := nullif(p_payload->>'processing_run_id', '')::uuid;
  v_dedupe_key text := public.maria_email_payload_text(p_payload, 'dedupe_group_key', 240);
  v_payer_hash text := public.maria_email_payload_text(p_payload, 'payer_name_hash', 80);
  v_fornecedor_hash text := public.maria_email_payload_text(p_payload, 'fornecedor_documento_hash', 80);
  v_barcode_hash text := public.maria_email_payload_text(p_payload, 'barcode_hash', 80);
  v_pix_hash text := public.maria_email_payload_text(p_payload, 'pix_payload_hash', 80);
  v_link_hash text := public.maria_email_payload_text(p_payload, 'payment_link_hash', 80);
  v_redaction_status text;
begin
  if nullif(p_payload->>'message_id', '') is null or v_dedupe_key is null then
    raise exception 'message_id e dedupe_group_key sao obrigatorios' using errcode = '22023';
  end if;

  perform public.maria_email_assert_hmac_hex(v_payer_hash, 'payer_name_hash');
  perform public.maria_email_assert_hmac_hex(v_fornecedor_hash, 'fornecedor_documento_hash');
  perform public.maria_email_assert_hmac_hex(v_barcode_hash, 'barcode_hash');
  perform public.maria_email_assert_hmac_hex(v_pix_hash, 'pix_payload_hash');
  perform public.maria_email_assert_hmac_hex(v_link_hash, 'payment_link_hash');

  select * into v_message from public.maria_email_messages where id = (p_payload->>'message_id')::uuid;
  if not found then
    raise exception 'mensagem nao encontrada' using errcode = '22023';
  end if;

  if v_run_id is null then
    v_run_id := v_message.processing_run_id;
  end if;

  if v_run_id is not null and not exists (
    select 1 from public.maria_email_processing_runs where id = v_run_id and source_id = v_message.source_id
  ) then
    raise exception 'processing_run_id nao pertence a fonte da mensagem' using errcode = '22023';
  end if;

  v_redaction_status := coalesce(public.maria_email_payload_text(p_payload, 'person_data_redaction_status', 40),
    case when public.maria_email_payload_text(p_payload, 'payer_name_masked', 180) is null and v_payer_hash is null
         then 'nao_aplicavel' else 'pendente' end);

  insert into public.maria_email_extracted_payables (
    message_id, processing_run_id, financeiro_documento_id, document_kind, fornecedor_nome, fornecedor_documento_hash,
    hash_version, payer_name_masked, payer_name_hash, document_number, competencia, emissao, vencimento,
    valor_centavos, moeda, centro_custo_id, unidade_snapshot, plano_conta_id, plano_snapshot, empresa_id,
    extraction_method, confidence, status, review_reason, barcode_hash, pix_payload_hash, payment_link_domain,
    payment_link_hash, dedupe_group_key, dedupe_group_quality, supersedes_payable_id,
    person_data_redaction_status, raw_extraction_sanitized
  ) values (
    v_message.id,
    v_run_id,
    nullif(p_payload->>'financeiro_documento_id', '')::uuid,
    coalesce(public.maria_email_payload_text(p_payload, 'document_kind', 30), 'outro'),
    public.maria_email_payload_text(p_payload, 'fornecedor_nome', 180),
    v_fornecedor_hash,
    'hmac-sha256-v1',
    public.maria_email_payload_text(p_payload, 'payer_name_masked', 180),
    v_payer_hash,
    public.maria_email_payload_text(p_payload, 'document_number', 120),
    nullif(p_payload->>'competencia', '')::date,
    nullif(p_payload->>'emissao', '')::date,
    nullif(p_payload->>'vencimento', '')::date,
    nullif(p_payload->>'valor_centavos', '')::integer,
    coalesce(public.maria_email_payload_text(p_payload, 'moeda', 3), 'BRL'),
    nullif(p_payload->>'centro_custo_id', '')::uuid,
    public.maria_email_payload_text(p_payload, 'unidade_snapshot', 80),
    nullif(p_payload->>'plano_conta_id', '')::uuid,
    public.maria_email_payload_text(p_payload, 'plano_snapshot', 160),
    nullif(p_payload->>'empresa_id', '')::uuid,
    coalesce(public.maria_email_payload_text(p_payload, 'extraction_method', 30), 'body'),
    coalesce(nullif(p_payload->>'confidence', '')::numeric, 0),
    coalesce(public.maria_email_payload_text(p_payload, 'status', 40), 'extraido'),
    public.maria_email_payload_text(p_payload, 'review_reason', 240),
    v_barcode_hash,
    v_pix_hash,
    lower(public.maria_email_payload_text(p_payload, 'payment_link_domain', 180)),
    v_link_hash,
    v_dedupe_key,
    coalesce(public.maria_email_payload_text(p_payload, 'dedupe_group_quality', 20), 'fraca'),
    nullif(p_payload->>'supersedes_payable_id', '')::uuid,
    v_redaction_status,
    case when p_payload ? 'raw_extraction_sanitized' then p_payload->'raw_extraction_sanitized' else null end
  ) returning id into v_id;

  return jsonb_build_object('success', true, 'payable_id', v_id);
end;
$$;

create or replace function public.maria_email_match_sugerir(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_payable_id uuid := nullif(p_payload->>'email_payable_id', '')::uuid;
  v_conta_id uuid := nullif(p_payload->>'conta_pagar_id', '')::uuid;
begin
  if v_payable_id is null then
    raise exception 'email_payable_id obrigatorio' using errcode = '22023';
  end if;

  if not exists (select 1 from public.maria_email_extracted_payables where id = v_payable_id) then
    raise exception 'payable nao encontrado' using errcode = '22023';
  end if;

  if v_conta_id is not null and not exists (select 1 from public.contas_pagar where id = v_conta_id) then
    raise exception 'conta_pagar_id nao encontrado' using errcode = '22023';
  end if;

  insert into public.maria_email_payable_matches (
    email_payable_id, conta_pagar_id, match_status, match_score, match_reason,
    superfolha_status_snapshot, superfolha_valor_centavos_snapshot, superfolha_vencimento_snapshot
  ) values (
    v_payable_id,
    v_conta_id,
    'sugerido',
    coalesce(nullif(p_payload->>'match_score', '')::numeric, 0),
    public.maria_email_payload_text(p_payload, 'match_reason', 300),
    public.maria_email_payload_text(p_payload, 'superfolha_status_snapshot', 80),
    nullif(p_payload->>'superfolha_valor_centavos_snapshot', '')::integer,
    nullif(p_payload->>'superfolha_vencimento_snapshot', '')::date
  ) returning id into v_id;

  return jsonb_build_object('success', true, 'match_id', v_id);
end;
$$;

-- =====================================================
-- 5. RPCs humanas auditadas
-- =====================================================

create or replace function public.maria_email_match_confirmar(
  p_ator_numero text,
  p_papel text,
  p_match_id uuid,
  p_motivo text default null,
  p_texto_original text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.maria_email_payable_matches%rowtype;
  v_after public.maria_email_payable_matches%rowtype;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  select * into v_before from public.maria_email_payable_matches where id = p_match_id for update;
  if not found then
    raise exception 'match nao encontrado' using errcode = '22023';
  end if;

  perform set_config('app.maria_email_rpc', 'on', true);
  update public.maria_email_payable_matches
     set match_status = 'confirmado_humano',
         match_reason = coalesce(nullif(trim(p_motivo), ''), match_reason),
         confirmed_by = v_actor.nome,
         confirmed_at = now()
   where id = p_match_id
   returning * into v_after;

  perform public.maria_audit_insert(
    v_actor, p_ator_numero, 'whatsapp', 'maria_email_payable_matches', 'maria_email_match',
    p_match_id, 'confirmar_match_email', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'match_id', p_match_id, 'match_status', v_after.match_status);
end;
$$;

create or replace function public.maria_email_match_rejeitar(
  p_ator_numero text,
  p_papel text,
  p_match_id uuid,
  p_motivo text default null,
  p_texto_original text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.maria_email_payable_matches%rowtype;
  v_after public.maria_email_payable_matches%rowtype;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  select * into v_before from public.maria_email_payable_matches where id = p_match_id for update;
  if not found then
    raise exception 'match nao encontrado' using errcode = '22023';
  end if;

  perform set_config('app.maria_email_rpc', 'on', true);
  update public.maria_email_payable_matches
     set match_status = 'rejeitado',
         match_reason = coalesce(nullif(trim(p_motivo), ''), match_reason)
   where id = p_match_id
   returning * into v_after;

  perform public.maria_audit_insert(
    v_actor, p_ator_numero, 'whatsapp', 'maria_email_payable_matches', 'maria_email_match',
    p_match_id, 'rejeitar_match_email', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'match_id', p_match_id, 'match_status', v_after.match_status);
end;
$$;

create or replace function public.maria_email_payable_atualizar_classificacao(
  p_ator_numero text,
  p_papel text,
  p_payable_id uuid,
  p_centro_custo_id uuid default null,
  p_plano_conta_id uuid default null,
  p_empresa_id uuid default null,
  p_unidade_snapshot text default null,
  p_plano_snapshot text default null,
  p_confidence numeric default null,
  p_motivo text default null,
  p_texto_original text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.maria_email_extracted_payables%rowtype;
  v_after public.maria_email_extracted_payables%rowtype;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  select * into v_before from public.maria_email_extracted_payables where id = p_payable_id for update;
  if not found then
    raise exception 'payable nao encontrado' using errcode = '22023';
  end if;

  if (p_centro_custo_id is not null and p_centro_custo_id is distinct from v_before.centro_custo_id)
     or (p_empresa_id is not null and p_empresa_id is distinct from v_before.empresa_id)
     or (nullif(trim(p_unidade_snapshot), '') is not null and nullif(trim(p_unidade_snapshot), '') is distinct from v_before.unidade_snapshot) then
    raise exception 'MARIA_EMAIL_DEDUPE_VERSIONAR: centro_custo, empresa ou unidade podem alterar a base de dedupe; crie novo payable e marque o anterior como substituido'
      using errcode = '42501';
  end if;

  perform set_config('app.maria_email_rpc', 'on', true);
  update public.maria_email_extracted_payables
     set plano_conta_id = coalesce(p_plano_conta_id, plano_conta_id),
         plano_snapshot = coalesce(nullif(trim(p_plano_snapshot), ''), plano_snapshot),
         confidence = coalesce(p_confidence, confidence),
         review_reason = coalesce(nullif(trim(p_motivo), ''), review_reason)
   where id = p_payable_id
   returning * into v_after;

  perform public.maria_audit_insert(
    v_actor, p_ator_numero, 'whatsapp', 'maria_email_extracted_payables', 'maria_email_payable',
    p_payable_id, 'atualizar_classificacao_email', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'payable_id', p_payable_id);
end;
$$;

create or replace function public.maria_email_payable_marcar_status(
  p_ator_numero text,
  p_papel text,
  p_payable_id uuid,
  p_status text,
  p_review_reason text default null,
  p_motivo text default null,
  p_texto_original text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.maria_email_extracted_payables%rowtype;
  v_after public.maria_email_extracted_payables%rowtype;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);

  if p_status not in ('pendente_conferencia','ignorado','vinculado','divergente','substituido') then
    raise exception 'status nao autorizado por esta RPC' using errcode = '22023';
  end if;

  select * into v_before from public.maria_email_extracted_payables where id = p_payable_id for update;
  if not found then
    raise exception 'payable nao encontrado' using errcode = '22023';
  end if;

  perform set_config('app.maria_email_rpc', 'on', true);
  update public.maria_email_extracted_payables
     set status = p_status,
         review_reason = coalesce(nullif(trim(p_review_reason), ''), review_reason)
   where id = p_payable_id
   returning * into v_after;

  perform public.maria_audit_insert(
    v_actor, p_ator_numero, 'whatsapp', 'maria_email_extracted_payables', 'maria_email_payable',
    p_payable_id, 'marcar_status_email', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'payable_id', p_payable_id, 'status', v_after.status);
end;
$$;

-- =====================================================
-- 6. Retencao LGPD via pg_cron
-- =====================================================

create or replace function public.maria_email_retencao_aplicar(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 5000);
  v_source record;
  v_run_id uuid;
  v_messages integer;
  v_payables integer;
  v_total_messages integer := 0;
  v_total_payables integer := 0;
begin
  for v_source in
    select s.id as source_id, s.source_key, s.last_known_uidvalidity
      from public.maria_email_sources s
     where exists (
       select 1
         from public.maria_email_messages m
        where m.source_id = s.id
          and m.person_data_redaction_status = 'pendente'
          and (
            m.created_at < now() - interval '90 days'
            or exists (
              select 1
                from public.maria_email_extracted_payables p
                join public.maria_email_payable_matches mt on mt.email_payable_id = p.id
               where p.message_id = m.id
                 and mt.match_status = 'confirmado_humano'
            )
          )
     )
     or exists (
       select 1
         from public.maria_email_extracted_payables p
         join public.maria_email_messages m on m.id = p.message_id
        where m.source_id = s.id
          and p.person_data_redaction_status = 'pendente'
          and (
            p.created_at < now() - interval '90 days'
            or exists (
              select 1
                from public.maria_email_payable_matches mt
               where mt.email_payable_id = p.id
                 and mt.match_status = 'confirmado_humano'
            )
          )
     )
  loop
    insert into public.maria_email_processing_runs (
      source_id, run_kind, uidvalidity_before, parser_version, code_version
    ) values (
      v_source.source_id, 'retention', v_source.last_known_uidvalidity, 'maria_email_retencao_aplicar', 'sql-migration-20260724_1'
    ) returning id into v_run_id;

    perform set_config('app.maria_email_redaction', 'on', true);

    with alvo as (
      select m.id
        from public.maria_email_messages m
       where m.source_id = v_source.source_id
         and m.person_data_redaction_status = 'pendente'
         and (
           m.created_at < now() - interval '90 days'
           or exists (
             select 1
               from public.maria_email_extracted_payables p
               join public.maria_email_payable_matches mt on mt.email_payable_id = p.id
              where p.message_id = m.id
                and mt.match_status = 'confirmado_humano'
           )
         )
       order by m.created_at
       limit v_limit
    ), upd as (
      update public.maria_email_messages m
         set subject = null,
             snippet = null,
             from_name = null,
             from_email_masked = null,
             person_data_redaction_status = 'expurgado'
        from alvo
       where m.id = alvo.id
       returning m.id
    ) select count(*) into v_messages from upd;

    with alvo as (
      select p.id
        from public.maria_email_extracted_payables p
        join public.maria_email_messages m on m.id = p.message_id
       where m.source_id = v_source.source_id
         and p.person_data_redaction_status = 'pendente'
         and (
           p.created_at < now() - interval '90 days'
           or exists (
             select 1
               from public.maria_email_payable_matches mt
              where mt.email_payable_id = p.id
                and mt.match_status = 'confirmado_humano'
           )
         )
       order by p.created_at
       limit v_limit
    ), upd as (
      update public.maria_email_extracted_payables p
         set fornecedor_nome = null,
             payer_name_masked = null,
             payer_name_hash = null,
             raw_extraction_sanitized = null,
             person_data_redaction_status = 'expurgado'
        from alvo
       where p.id = alvo.id
       returning p.id
    ) select count(*) into v_payables from upd;

    perform set_config('app.maria_email_redaction', '', true);
    perform set_config('app.maria_email_rpc', 'on', true);

    update public.maria_email_processing_runs
       set status = 'success',
           finished_at = now(),
           uidvalidity_after = v_source.last_known_uidvalidity,
           uidvalidity_changed = false,
           messages_seen = v_messages,
           messages_processed = v_messages,
           messages_ignored = 0,
           payables_extracted = v_payables,
           error_summary = null
     where id = v_run_id;

    perform set_config('app.maria_email_rpc', '', true);
    v_total_messages := v_total_messages + v_messages;
    v_total_payables := v_total_payables + v_payables;
  end loop;

  return jsonb_build_object('success', true, 'messages_expurgadas', v_total_messages, 'payables_expurgados', v_total_payables);
end;
$$;

do $do$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'maria-email-retencao-diaria' limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'maria-email-retencao-diaria',
    '17 3 * * *',
    $$select public.maria_email_retencao_aplicar(500);$$
  );
end $do$;

-- =====================================================
-- 7. Views seguras
-- =====================================================

create or replace view public.vw_maria_email_messages as
select
  m.id,
  s.source_key,
  s.label as source_label,
  m.uidvalidity,
  m.imap_uid,
  m.from_domain,
  m.from_email_masked,
  m.from_name,
  m.subject,
  m.received_at,
  m.snippet,
  m.has_attachments,
  m.has_payment_link,
  m.relevance_status,
  m.processing_status,
  m.ignored_reason,
  m.person_data_redaction_status,
  m.processing_run_id,
  m.created_at,
  m.updated_at
from public.maria_email_messages m
join public.maria_email_sources s on s.id = m.source_id;

create or replace view public.vw_maria_email_payables as
select
  p.id,
  p.message_id,
  m.source_key,
  m.received_at,
  p.document_kind,
  p.fornecedor_nome,
  p.document_number,
  p.competencia,
  p.emissao,
  p.vencimento,
  p.valor_centavos,
  p.moeda,
  p.centro_custo_id,
  p.unidade_snapshot,
  p.plano_conta_id,
  p.plano_snapshot,
  p.empresa_id,
  p.extraction_method,
  p.confidence,
  p.status,
  p.review_reason,
  p.payment_link_domain,
  p.dedupe_group_key,
  p.dedupe_group_quality,
  p.supersedes_payable_id,
  p.person_data_redaction_status,
  p.processing_run_id,
  p.created_at,
  p.updated_at
from public.maria_email_extracted_payables p
join public.maria_email_messages m on m.id = p.message_id;

create or replace view public.vw_maria_email_matches as
select
  mt.id,
  mt.email_payable_id,
  mt.conta_pagar_id,
  mt.match_status,
  mt.match_score,
  mt.match_reason,
  mt.superfolha_status_snapshot,
  mt.superfolha_valor_centavos_snapshot,
  mt.superfolha_vencimento_snapshot,
  mt.confirmed_by,
  mt.confirmed_at,
  p.status as payable_status,
  p.dedupe_group_key,
  p.dedupe_group_quality,
  mt.created_at,
  mt.updated_at
from public.maria_email_payable_matches mt
join public.maria_email_extracted_payables p on p.id = mt.email_payable_id;

create or replace view public.vw_maria_email_pendencias as
select
  p.id as email_payable_id,
  m.id as message_id,
  m.source_key,
  m.received_at,
  p.fornecedor_nome,
  p.document_kind,
  p.vencimento,
  p.valor_centavos,
  p.status,
  p.review_reason,
  p.dedupe_group_key,
  p.dedupe_group_quality,
  coalesce(max(mt.match_score), 0)::numeric(5,4) as melhor_match_score,
  case
    when p.review_reason = 'possivel_segunda_via' then 100
    when p.status in ('pendente_conferencia','divergente') then 90
    when coalesce(max(mt.match_score), 0) >= 0.85 then 70
    else 50
  end as prioridade_conferencia
from public.maria_email_extracted_payables p
join public.maria_email_messages m on m.id = p.message_id
left join public.maria_email_payable_matches mt on mt.email_payable_id = p.id and mt.match_status = 'sugerido'
where p.status in ('extraido','pendente_dado','pendente_conferencia','divergente')
group by p.id, m.id, m.source_key, m.received_at;

revoke all on public.vw_maria_email_messages from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on public.vw_maria_email_payables from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on public.vw_maria_email_matches from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on public.vw_maria_email_pendencias from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

grant select on public.vw_maria_email_messages to service_role;
grant select on public.vw_maria_email_payables to service_role;
grant select on public.vw_maria_email_matches to service_role;
grant select on public.vw_maria_email_pendencias to service_role;

-- =====================================================
-- 8. Grants de funcoes: sem tabela direta para service_role
-- =====================================================

revoke all on function public.maria_email_is_rpc() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_is_redaction() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_payload_text(jsonb, text, integer) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_assert_hmac_hex(text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_no_plain_secret(text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_sources_guard() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_run_guard() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_message_guard() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_payable_guard() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_match_guard() from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

revoke all on function public.maria_email_source_upsert(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_processing_run_start(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_processing_run_finish(uuid, jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_message_registrar(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_payable_registrar(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_match_sugerir(jsonb) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_match_confirmar(text, text, uuid, text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_match_rejeitar(text, text, uuid, text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_payable_atualizar_classificacao(text, text, uuid, uuid, uuid, uuid, text, text, numeric, text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_payable_marcar_status(text, text, uuid, text, text, text, text) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;
revoke all on function public.maria_email_retencao_aplicar(integer) from public, anon, authenticated, service_role, maria_operacional, maria_leitura;

grant execute on function public.maria_email_source_upsert(jsonb) to service_role;
grant execute on function public.maria_email_processing_run_start(jsonb) to service_role;
grant execute on function public.maria_email_processing_run_finish(uuid, jsonb) to service_role;
grant execute on function public.maria_email_message_registrar(jsonb) to service_role;
grant execute on function public.maria_email_payable_registrar(jsonb) to service_role;
grant execute on function public.maria_email_match_sugerir(jsonb) to service_role;
grant execute on function public.maria_email_match_confirmar(text, text, uuid, text, text) to service_role;
grant execute on function public.maria_email_match_rejeitar(text, text, uuid, text, text) to service_role;
grant execute on function public.maria_email_payable_atualizar_classificacao(text, text, uuid, uuid, uuid, uuid, text, text, numeric, text, text) to service_role;
grant execute on function public.maria_email_payable_marcar_status(text, text, uuid, text, text, text, text) to service_role;

-- Retencao executa via pg_cron como owner da migration; nao conceder a service_role nesta fase.

comment on table public.maria_email_sources is 'Maria Email Ledger: cadastro tecnico de fontes IMAP sem segredo. Acesso direto revogado; usar RPCs.';
comment on table public.maria_email_processing_runs is 'Maria Email Ledger: runs tecnicos por fonte. Append-only com finalizacao controlada por RPC.';
comment on table public.maria_email_messages is 'Maria Email Ledger: envelopes sanitizados de emails financeiros, chaveados por source_id + UIDVALIDITY + UID.';
comment on table public.maria_email_extracted_payables is 'Maria Email Ledger: itens financeiros extraidos de email/body/anexo/OCR/link permitido. Dedupe congelado.';
comment on table public.maria_email_payable_matches is 'Maria Email Ledger: sugestoes/decisoes humanas de vinculo com contas_pagar.';
comment on function public.maria_email_retencao_aplicar(integer) is 'Expurgo LGPD do Maria Email Ledger via pg_cron. Usa flag app.maria_email_redaction local; nao apaga linhas.';
