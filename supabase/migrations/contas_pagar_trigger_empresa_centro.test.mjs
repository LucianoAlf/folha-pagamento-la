import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_8_contas_pagar_trigger_empresa_centro.sql', import.meta.url), 'utf8');

test('creates contas_pagar trigger to enforce company and cost-center invariant', () => {
  assert.match(sql, /create trigger trg_contas_pagar_valida_empresa_centro/i);
  assert.match(sql, /before insert or update on public\.contas_pagar/i);
  assert.match(sql, /unidade_id\s+into\s+v_unidade_empresa/i);
});
