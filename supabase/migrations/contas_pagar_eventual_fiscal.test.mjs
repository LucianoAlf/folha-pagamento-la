import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_3_contas_pagar_eventual_fiscal.sql', import.meta.url), 'utf8');

test('adds nullable fiscal references to contas_pagar', () => {
  assert.match(sql, /add column if not exists empresa_id\s+uuid null/i);
  assert.match(sql, /add column if not exists conta_pagadora_id\s+uuid null/i);
  assert.match(sql, /foreign key \(empresa_id\) references public\.financeiro_empresas\(id\)/i);
  assert.match(sql, /foreign key \(conta_pagadora_id\) references public\.financeiro_contas_bancarias\(id\)/i);
});

test('replaces the existing tipo_lancamento check with eventual included', () => {
  assert.match(sql, /drop constraint if exists contas_pagar_tipo_lancamento_check/i);
  assert.match(sql, /add constraint contas_pagar_tipo_lancamento_check/i);
  assert.match(sql, /tipo_lancamento in \('unica','recorrente','parcelada','eventual'\)/i);
});

test('does not create redundant origem_operacional column', () => {
  assert.doesNotMatch(sql, /origem_operacional/i);
});
