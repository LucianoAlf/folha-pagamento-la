import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('./20260626_maria_contas_dar_baixa.sql', import.meta.url), 'utf8');

test('Maria baixa RPC records paid status with payment date/method and sanitized payload', () => {
  assert.match(sql, /create or replace function public\.maria_contas_dar_baixa/i);
  assert.match(sql, /status\s*=\s*'pago'/i);
  assert.match(sql, /data_pagamento\s*=\s*p_data_pagamento::timestamptz/i);
  assert.match(sql, /metodo_pagamento\s*=\s*v_metodo/i);
  assert.match(sql, /pagamento_executado_pela_maria'\s*,\s*false/i);
  assert.match(sql, /'status'\s*,\s*'pago'/i);
  assert.doesNotMatch(sql.match(/return jsonb_build_object\([\s\S]*?\);/i)?.[0] || '', /codigo_barras|chave_pix|qr_pix_payload|pix_chave_fixa/i);
});

test('Maria baixa RPC requires human confirmation and blocks unsafe roles', () => {
  assert.match(sql, /p_confirmado_por_nome/i);
  assert.match(sql, /maria_assert_actor\([\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /revoke all on function public\.maria_contas_dar_baixa[\s\S]*maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_contas_dar_baixa[\s\S]*to maria_operacional, service_role/i);
});

test('Maria baixa RPC does not re-mark already paid accounts', () => {
  assert.match(sql, /if v_before\.status = 'pago' then/i);
  assert.match(sql, /conta ja esta paga/i);
});
