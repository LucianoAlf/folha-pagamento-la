import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260724_5_maria_email_consulta_operacional.sql', import.meta.url), 'utf8');

function functionBody(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i');
  return sql.match(re)?.[0] ?? '';
}

test('consulta operacional e security definer read-only', () => {
  const body = functionBody('maria_email_consultar_operacional');
  assert.match(body, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(body, /from public\.maria_email_extracted_payables/i);
  assert.match(body, /join public\.maria_email_messages/i);
  assert.match(body, /left join public\.contas_pagar/i);
  assert.doesNotMatch(body, /insert\s+into/i);
  assert.doesNotMatch(body, /update\s+public\./i);
  assert.doesNotMatch(body, /delete\s+from/i);
  assert.doesNotMatch(body, /maria_audit_insert/i);
  assert.doesNotMatch(body, /maria_email_match_sugerir_auto/i);
});

test('retorno nao expoe codigo bruto, hashes ou campos tecnicos sensiveis', () => {
  const body = functionBody('maria_email_consultar_operacional');
  assert.doesNotMatch(body, /barcode_hash|pix_payload_hash|payment_link_hash|from_email_hash|body_hash|raw_extraction_sanitized/i);
  assert.doesNotMatch(body, /linha_digitavel|codigo_barras|qr_pix_payload|chave_pix/i);
  assert.match(body, /valor_centavos/i);
  assert.match(body, /vencimento/i);
  assert.match(body, /fornecedor_nome/i);
  assert.match(body, /superfolha_status_snapshot/i);
});

test('grants apenas execute para service_role na RPC', () => {
  assert.match(sql, /revoke all on function public\.maria_email_consultar_operacional\(jsonb\)[\s\S]*from public, anon, authenticated, service_role, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_email_consultar_operacional\(jsonb\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.maria_email_/i);
});
