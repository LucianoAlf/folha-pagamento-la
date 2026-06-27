import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20260627_maria_fluxo_caixa_eventos.sql', import.meta.url), 'utf8');

test('migration creates Maria cash-flow ledger and RPCs', () => {
  assert.match(sql, /create table if not exists public\.maria_fluxo_caixa_eventos/i);
  assert.match(sql, /create or replace function public\.maria_fluxo_evento_registrar/i);
  assert.match(sql, /create or replace function public\.maria_fluxo_eventos_dia/i);
  assert.match(sql, /create or replace function public\.maria_fluxo_resumo_periodo/i);
});

test('ledger has idempotency and WhatsApp evidence fields', () => {
  assert.match(sql, /unique \(chat_id, message_id, tipo_evento/i);
  assert.match(sql, /message_id text not null/i);
  assert.match(sql, /quoted_id text null/i);
  assert.match(sql, /evidencia_texto text null/i);
  assert.match(sql, /raw_payload_sanitizado jsonb null/i);
});

test('register RPC is operational-only and audited', () => {
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /maria_audit_insert[\s\S]*registrar_evento_fluxo_caixa_observado/i);
  assert.match(sql, /revoke all on function public\.maria_fluxo_evento_registrar[\s\S]*maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_fluxo_evento_registrar[\s\S]*to maria_operacional, service_role/i);
});

test('RPC explicitly marks no payment/baixa executed by Maria', () => {
  assert.match(sql, /pagamento_executado_pela_maria'\s*,\s*false/i);
  assert.match(sql, /baixa_executada_pela_maria'\s*,\s*false/i);
});
