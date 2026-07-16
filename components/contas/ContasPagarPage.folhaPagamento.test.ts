import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContasPagarPage.tsx', import.meta.url), 'utf8');

test('plan aggregation excludes card invoices and payroll payment instruments', () => {
  assert.match(
    source,
    /function isPlanoAggregationConta[\s\S]*tipo_lancamento !== 'fatura_cartao'[\s\S]*tipo_lancamento !== 'folha_pagamento'/
  );
});
