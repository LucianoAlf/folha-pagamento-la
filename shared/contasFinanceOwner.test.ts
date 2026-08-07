import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTAS_FINANCE_OWNER } from './contasFinanceOwner.ts';

test('contas a pagar identifies Rose as the finance owner', () => {
  assert.equal(CONTAS_FINANCE_OWNER.name, 'Rose');
  assert.equal(CONTAS_FINANCE_OWNER.initial, 'R');
  assert.equal(CONTAS_FINANCE_OWNER.area, 'Financeiro');
});
