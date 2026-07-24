import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260724_1_maria_email_ledger.sql', import.meta.url), 'utf8');

function functionBody(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i');
  return sql.match(re)?.[0] ?? '';
}

test('cria as cinco tabelas maria_email com UIDVALIDITY e sem dedupe_basis_hash', () => {
  for (const table of [
    'maria_email_sources',
    'maria_email_processing_runs',
    'maria_email_messages',
    'maria_email_extracted_payables',
    'maria_email_payable_matches',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  }

  assert.match(sql, /uidvalidity bigint not null/i);
  assert.match(sql, /constraint maria_email_messages_uid_uniq unique \(source_id, uidvalidity, imap_uid\)/i);
  assert.doesNotMatch(sql, /dedupe_basis_hash/i);
});

test('fecha acesso direto nas tabelas, incluindo service_role, e expoe apenas RPCs/views', () => {
  for (const table of [
    'maria_email_sources',
    'maria_email_processing_runs',
    'maria_email_messages',
    'maria_email_extracted_payables',
    'maria_email_payable_matches',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role, maria_operacional, maria_leitura`, 'i'));
  }

  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.maria_email_/i);
  assert.match(sql, /grant execute on function public\.maria_email_message_registrar\(jsonb\) to service_role/i);
  assert.match(sql, /grant select on public\.vw_maria_email_pendencias to service_role/i);
});

test('mantem HMAC no runtime: nao calcula pepper no banco apesar do pgcrypto', () => {
  assert.match(sql, /Credenciais, pepper e HMAC sensivel ficam no runtime privado da Maria/i);
  assert.match(sql, /create extension if not exists pgcrypto/i);
  assert.doesNotMatch(sql, /extensions\.hmac|\bhmac\s*\(/i);
  assert.doesNotMatch(sql, /p_pepper|pepper\s+text/i);
  assert.match(sql, /maria_email_assert_hmac_hex/i);
});

test('usa flags separadas, locais, e guarda trilhas de operacao e redacao', () => {
  assert.match(sql, /set_config\('app\.maria_email_rpc', 'on', true\)/i);
  assert.match(sql, /set_config\('app\.maria_email_redaction', 'on', true\)/i);
  assert.match(sql, /v_rpc and v_redaction/i);
  assert.match(sql, /MARIA_EMAIL_FLAG_INVALIDA/i);
  assert.match(sql, /maria_email_message_guard[\s\S]*to_jsonb\(new\) - array\['processing_status','relevance_status','ignored_reason','last_processed_at','processing_run_id','updated_at'\]/i);
  assert.match(sql, /maria_email_message_guard[\s\S]*to_jsonb\(new\) - array\['subject','snippet','from_name','from_email_masked','person_data_redaction_status','updated_at'\]/i);
  assert.match(sql, /maria_email_payable_guard[\s\S]*to_jsonb\(new\) - array\['payer_name_masked','payer_name_hash','person_data_redaction_status','updated_at'\]/i);
});

test('guards bloqueiam delete e falham fechados com to_jsonb menos campos permitidos', () => {
  for (const guard of [
    'maria_email_sources_guard',
    'maria_email_run_guard',
    'maria_email_message_guard',
    'maria_email_payable_guard',
    'maria_email_match_guard',
  ]) {
    const body = functionBody(guard);
    assert.match(body, /security definer\s+set search_path = public, pg_temp/i);
    assert.match(body, /if tg_op = 'DELETE'/i);
    assert.match(body, /raise exception/i);
  }

  assert.match(sql, /to_jsonb\(new\) - array/i);
  assert.match(sql, /to_jsonb\(old\) - array/i);
});

test('processing_run_id e write-once na mensagem e run finalizado e imutavel', () => {
  const messageGuard = functionBody('maria_email_message_guard');
  const runGuard = functionBody('maria_email_run_guard');
  assert.match(messageGuard, /old\.processing_run_id is null and new\.processing_run_id is not null/i);
  assert.match(messageGuard, /processing_run_id e write-once/i);
  assert.match(runGuard, /old\.finished_at is not null/i);
  assert.match(runGuard, /run finalizado nao pode ser alterado/i);
  assert.match(runGuard, /old\.status <> 'running' or new\.status not in \('success','partial','error'\)/i);
});

test('dedupe e segunda via ficam congelados/versionados', () => {
  assert.match(sql, /dedupe_group_key text not null/i);
  assert.match(sql, /dedupe_group_quality text not null default 'fraca' check \(dedupe_group_quality in \('forte','media','fraca'\)\)/i);
  assert.match(sql, /create index if not exists maria_email_payable_dedupe_group_idx/i);
  assert.match(sql, /create unique index if not exists maria_email_payable_ativo_uniq[\s\S]*where status in \('vinculado', 'lancado', 'pago'\)[\s\S]*dedupe_group_quality in \('forte', 'media'\)/i);
  const payableGuard = functionBody('maria_email_payable_guard');
  assert.doesNotMatch(payableGuard, /dedupe_group_key'[,\]]/i, 'dedupe_group_key nao pode estar entre campos permitidos de update');
  assert.match(sql, /supersedes_payable_id uuid null references public\.maria_email_extracted_payables\(id\) on delete restrict/i);
});

test('resolve explicitamente a interacao do guard com on delete set null de contas_pagar', () => {
  assert.match(sql, /conta_pagar_id uuid null references public\.contas_pagar\(id\) on delete set null/i);
  assert.match(sql, /Excecao deliberada para FK on delete set null em contas_pagar/i);
  assert.match(sql, /new\.conta_pagar_id is null[\s\S]*old\.conta_pagar_id is not null[\s\S]*array\['conta_pagar_id','updated_at'\]/i);

  const otherSetNull = sql.match(/references public\.(?!contas_pagar\(id\) on delete set null)[^\n]+on delete set null/gi) ?? [];
  assert.deepEqual(otherSetNull, [], 'SET NULL so deve existir no match com contas_pagar');
});

test('retencao usa pg_cron, redaction flag, e nao processa nao_aplicavel', () => {
  assert.match(sql, /create or replace function public\.maria_email_retencao_aplicar\(p_limit integer default 500\)/i);
  assert.match(sql, /perform set_config\('app\.maria_email_redaction', 'on', true\)/i);
  assert.match(sql, /person_data_redaction_status in \('pendente','retido_por_regra_operacional'\)/i);
  assert.doesNotMatch(functionBody('maria_email_retencao_aplicar'), /person_data_redaction_status in \([^)]*'nao_aplicavel'/i);
  assert.match(sql, /cron\.schedule\([\s\S]*'maria-email-retencao-diaria'[\s\S]*select public\.maria_email_retencao_aplicar\(500\)/i);
});

test('RPCs tecnicas nao exigem ator humano; RPCs humanas auditam via Maria', () => {
  for (const fn of [
    'maria_email_source_upsert',
    'maria_email_processing_run_start',
    'maria_email_processing_run_finish',
    'maria_email_message_registrar',
    'maria_email_payable_registrar',
    'maria_email_match_sugerir',
  ]) {
    assert.doesNotMatch(functionBody(fn), /maria_assert_actor|maria_audit_insert/i, `${fn} deve ser trilha tecnica`);
  }

  for (const fn of [
    'maria_email_match_confirmar',
    'maria_email_match_rejeitar',
    'maria_email_payable_atualizar_classificacao',
    'maria_email_payable_marcar_status',
  ]) {
    const body = functionBody(fn);
    assert.match(body, /maria_assert_actor/i, `${fn} deve validar ator`);
    assert.match(body, /maria_audit_insert/i, `${fn} deve auditar`);
  }
});

test('views seguras nao expoem hashes/codigos sensiveis e status confiavel nao existe', () => {
  assert.doesNotMatch(sql, /match_status text[^\n]+confiavel/i);
  assert.doesNotMatch(sql, /create or replace view public\.vw_maria_email_[\s\S]*(barcode_hash|pix_payload_hash|from_email_hash|payer_name_hash)/i);
  assert.match(sql, /prioridade_conferencia/i);
  assert.match(sql, /match_score numeric\(5,4\) not null default 0 check \(match_score between 0 and 1\)/i);
  assert.match(sql, /confidence numeric\(5,4\) not null default 0 check \(confidence between 0 and 1\)/i);
});
