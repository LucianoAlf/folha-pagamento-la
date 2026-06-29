import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const triggerSql = readFileSync(new URL('./20260628_8_contas_pagar_trigger_empresa_centro.sql', import.meta.url), 'utf8');
const triadeSql = readFileSync(new URL('./20260628_9_contas_pagar_trigger_conta_pagadora.sql', import.meta.url), 'utf8');

test('creates contas_pagar trigger to enforce company and cost-center invariant', () => {
  assert.match(triggerSql, /create trigger trg_contas_pagar_valida_empresa_centro/i);
  assert.match(triggerSql, /before insert or update on public\.contas_pagar/i);
  assert.match(triggerSql, /unidade_id\s+into\s+v_unidade_empresa/i);
});

test('updates contas_pagar validator to enforce payer account company and cost center', () => {
  assert.match(triadeSql, /from public\.financeiro_contas_bancarias b/i);
  assert.match(triadeSql, /v_empresa_conta\s*<>\s*new\.empresa_id/i);
  assert.match(triadeSql, /v_unidade_conta\s*<>\s*new\.centro_custo_id/i);
  assert.match(triadeSql, /conta_pagadora_id .* pertence a empresa/i);
  assert.match(triadeSql, /unidade_id\s+into\s+v_unidade_empresa/i);
  assert.match(triadeSql, /v_unidade_empresa\s*<>\s*new\.centro_custo_id/i);
});
