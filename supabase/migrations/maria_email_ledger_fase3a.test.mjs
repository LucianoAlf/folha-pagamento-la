import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260724_2_maria_email_ledger_fase3a.sql', import.meta.url), 'utf8');

function functionBody(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i');
  return sql.match(re)?.[0] ?? '';
}

test('corrige source_upsert para nao religar fonte inativa sem ativo explicito', () => {
  const body = functionBody('maria_email_source_upsert');
  assert.match(body, /on conflict \(source_key\) do update set/i);
  assert.match(body, /ativo = case\s+when p_payload \? 'ativo' then excluded\.ativo\s+else public\.maria_email_sources\.ativo\s+end/i);
  assert.doesNotMatch(body, /ativo = excluded\.ativo/i);
});

test('source_upsert continua sem segredo e com flag rpc local', () => {
  const body = functionBody('maria_email_source_upsert');
  assert.match(body, /maria_email_no_plain_secret\(v_credential_ref, 'credential_ref'\)/i);
  assert.match(body, /set_config\('app\.maria_email_rpc', 'on', true\)/i);
  assert.doesNotMatch(body, /p_pepper|pepper\s+text|app_password|senha\s*:=|token\s*:=|oauth\s*:=|bearer\s*:=/i);
});

test('cria RPC atomica de versionamento auditada e security definer', () => {
  const body = functionBody('maria_email_payable_versionar');
  assert.match(body, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(body, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(body, /for update/i);
  assert.match(body, /pg_advisory_xact_lock/i);
  assert.match(body, /maria_email_payable_registrar\(v_new_payload\)/i);
  assert.match(body, /maria_audit_insert/i);
});

test('versionamento marca antigo substituido e forca novo pendente_conferencia com supersedes', () => {
  const body = functionBody('maria_email_payable_versionar');
  assert.match(body, /update public\.maria_email_extracted_payables[\s\S]*set status = 'substituido'/i);
  assert.match(body, /'supersedes_payable_id', v_old\.id/i);
  assert.match(body, /\|\| p_payload_novo \|\| jsonb_build_object\([\s\S]*'status', 'pendente_conferencia'[\s\S]*'supersedes_payable_id', v_old\.id/i);
  assert.match(body, /versionamento exige dedupe_group_key recalculada no runtime/i);
});

test('quality fix exige dedupe_group_quality recalculada junto da chave', () => {
  const fixSql = readFileSync(new URL('./20260724_3_maria_email_ledger_fase3a_quality_fix.sql', import.meta.url), 'utf8');
  assert.match(fixSql, /versionamento exige dedupe_group_quality recalculada no runtime/i);
  assert.match(fixSql, /p_payload_novo \? 'dedupe_group_quality'/i);
  assert.match(fixSql, /dedupe_group_quality invalida no versionamento/i);
  assert.match(fixSql, /not in \('forte', 'media', 'fraca'\)/i);
});

test('versionamento nao faz DELETE nem altera dedupe do antigo no lugar', () => {
  const body = functionBody('maria_email_payable_versionar');
  assert.doesNotMatch(body, /delete\s+from\s+public\.maria_email/i);
  assert.doesNotMatch(body, /update public\.maria_email_extracted_payables[\s\S]*set[\s\S]*dedupe_group_key\s*=/i);
  assert.doesNotMatch(body, /update public\.maria_email_extracted_payables[\s\S]*set[\s\S]*centro_custo_id\s*=/i);
  assert.doesNotMatch(body, /update public\.maria_email_extracted_payables[\s\S]*set[\s\S]*empresa_id\s*=/i);
});

test('grants liberam apenas execute para service_role na nova RPC', () => {
  assert.match(sql, /revoke all on function public\.maria_email_payable_versionar\(text, text, uuid, jsonb, text, text\)[\s\S]*from public, anon, authenticated, service_role, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_email_payable_versionar\(text, text, uuid, jsonb, text, text\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.maria_email_/i);
});
