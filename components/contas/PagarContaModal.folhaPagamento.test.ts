import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./PagarContaModal.tsx', import.meta.url), 'utf8');

test('payment modal treats payroll as a generated payment instrument', () => {
  assert.match(source, /const isFolhaPagamento = conta\.tipo_lancamento === 'folha_pagamento'/);
  assert.match(source, /const isContaGeradaSemPlano = isFaturaCartao \|\| isFolhaPagamento/);
  assert.match(source, /Detalhamento por colaborador e conta pagadora/);
  assert.match(source, /sem duplicar o DRE/);
});
