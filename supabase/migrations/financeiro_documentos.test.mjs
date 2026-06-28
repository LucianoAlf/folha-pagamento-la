import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_4_financeiro_documentos.sql', import.meta.url), 'utf8');

test('creates sanitized financial documents table', () => {
  assert.match(sql, /create table if not exists public\.financeiro_documentos/i);
  assert.match(sql, /tipo text not null check \(tipo in \('comprovante','fatura','nota','boleto','outro'\)\)/i);
  assert.match(sql, /storage_ref text null/i);
  assert.match(sql, /vinculo_tipo text null check \(vinculo_tipo is null or vinculo_tipo in \('conta_pagar','cartao_fatura','cartao_transacao'\)\)/i);
  assert.match(sql, /hash text null/i);
  assert.doesNotMatch(sql, /bytea|binario|binary/i);
});

test('does not grant Maria direct access to document base table', () => {
  assert.match(sql, /alter table public\.financeiro_documentos enable row level security/i);
  assert.match(sql, /grant select on public\.financeiro_documentos to authenticated, service_role/i);
  assert.match(sql, /revoke all on public\.financeiro_documentos from public, anon, maria_operacional, maria_leitura/i);
  assert.doesNotMatch(sql, /grant\s+\w+[\s\S]*public\.financeiro_documentos[\s\S]*to maria_operacional/i);
});
