import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeFolhaRateioFatias } from './folhaRateioService.ts';

test('normalizes money to cents and keeps only the safe rateio contract', () => {
  const result = normalizeFolhaRateioFatias([
    {
      lancamento_id: 10,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'conta-emla',
      salario: 1250.005,
      bonus: 200,
      comissao: 0,
      passagem: 250,
      reembolso: 0,
      inss: 200.68,
      descontos: 0,
      unidade: 'bar',
      detalhamento: { nao_deve: 'vazar' },
    } as never,
  ]);

  assert.deepEqual(result, [
    {
      lancamento_id: 10,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'conta-emla',
      salario: 1250.01,
      bonus: 200,
      comissao: 0,
      passagem: 250,
      reembolso: 0,
      inss: 200.68,
      descontos: 0,
    },
  ]);
});

test('service calls only preflight and save RPCs and sends an empty actor for web', () => {
  const source = readFileSync(new URL('./folhaRateioService.ts', import.meta.url), 'utf8');
  assert.match(source, /\.rpc\('folha_rateio_contas_preflight'/);
  assert.match(source, /\.rpc\('folha_rateio_contas_salvar'/);
  assert.match(source, /p_ator:\s*\{\}/);
  assert.doesNotMatch(source, /\.from\('lancamentos_folha'\)\.(insert|update|delete)/);
});
