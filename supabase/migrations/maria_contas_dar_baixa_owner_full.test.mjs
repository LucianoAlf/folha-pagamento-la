import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_6_maria_contas_dar_baixa_owner_full.sql', import.meta.url), 'utf8');

test('replaces Maria baixa RPC with owner_full allowlisted', () => {
  assert.match(sql, /create or replace function public\.maria_contas_dar_baixa/i);
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /grant execute on function public\.maria_contas_dar_baixa[\s\S]*to maria_operacional, service_role/i);
});

test('keeps baixa behavior as payment registration only', () => {
  assert.match(sql, /status\s*=\s*'pago'/i);
  assert.match(sql, /data_pagamento\s*=\s*p_data_pagamento::timestamptz/i);
  assert.match(sql, /metodo_pagamento\s*=\s*v_metodo/i);
  assert.match(sql, /pagamento_executado_pela_maria'\s*,\s*false/i);
  assert.doesNotMatch(sql.match(/return jsonb_build_object\([\s\S]*?\);/i)?.[0] || '', /codigo_barras|chave_pix|qr_pix_payload|pix_chave_fixa/i);
});
