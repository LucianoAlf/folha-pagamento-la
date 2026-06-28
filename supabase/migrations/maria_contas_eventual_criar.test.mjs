import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_5_maria_contas_eventual_criar.sql', import.meta.url), 'utf8');

test('creates Maria eventual-account RPC and sanitized view', () => {
  assert.match(sql, /create or replace function public\.maria_contas_eventual_criar/i);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /create or replace view public\.vw_maria_contas_eventuais/i);
});

test('eventual RPC enforces actor, confirmation and required classification', () => {
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /p_confirmado_por_nome/i);
  assert.match(sql, /p_plano_conta_id/i);
  assert.match(sql, /p_centro_custo_id/i);
  assert.match(sql, /p_valor/i);
  assert.match(sql, /folha de saida ativa/i);
  assert.match(sql, /centro_custo_id nao e uma unidade ativa/i);
});

test('eventual RPC inserts an eventual conta_pagar from WhatsApp with fiscal inference', () => {
  assert.match(sql, /tipo_lancamento[\s\S]*'eventual'/i);
  assert.match(sql, /fonte_tipo[\s\S]*'whatsapp'/i);
  assert.match(sql, /empresa_id[\s\S]*v_conta_pagadora\.empresa_id/i);
  assert.match(sql, /conta_pagadora_id[\s\S]*p_conta_pagadora_id/i);
  assert.match(sql, /data_pagamento[\s\S]*p_data_pagamento/i);
  assert.match(sql, /metodo_pagamento[\s\S]*v_metodo/i);
});

test('eventual RPC audits and returns sanitized public payload', () => {
  assert.match(sql, /maria_audit_insert[\s\S]*criar_conta_pagar_eventual/i);
  assert.match(sql, /maria_conta_pagar_public_json/i);
  assert.match(sql, /pagamento_executado_pela_maria'\s*,\s*false/i);
  assert.doesNotMatch(sql.match(/return jsonb_build_object\([\s\S]*?\);/i)?.[0] || '', /codigo_barras|chave_pix|qr_pix_payload|pix_chave_fixa/i);
  assert.match(sql, /grant execute on function public\.maria_contas_eventual_criar[\s\S]*to maria_operacional, service_role/i);
});
