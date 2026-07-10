import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContaPagadoraOptions,
  countActiveCollaboratorsWithoutPayer,
  filterCollaboratorsByPayerStatus,
  formatContaPagadoraOption,
  normalizeContaPagadoraSelection,
} from './contaPagadoraSelectors.ts';

const contas = [
  {
    id: 'kids-account',
    empresa_id: 'kids',
    banco: 'Santander',
    agencia: '1534',
    conta: '13002360-2',
    ativo: true,
    empresa: { id: 'kids', unidade_id: 'cg', label_operacional: 'Kids CG', ativo: true },
  },
] as any[];

const colaboradores = [
  { id: 1, nome: 'Ana', ativo: true, status: 'active', arquivado_em: null, conta_pagadora_id: null },
  { id: 2, nome: 'Bia', ativo: true, status: 'active', arquivado_em: null, conta_pagadora_id: 'kids-account' },
  { id: 3, nome: 'Caio', ativo: false, status: 'inactive', arquivado_em: null, conta_pagadora_id: null },
  { id: 4, nome: 'Dani', ativo: true, status: 'active', arquivado_em: '2026-07-01T10:00:00Z', conta_pagadora_id: null },
  { id: 5, nome: 'Eva', ativo: true, status: 'on_leave', arquivado_em: null, conta_pagadora_id: null },
] as any[];

test('payer account option identifies company, bank, agency and account ending', () => {
  assert.equal(formatContaPagadoraOption(contas[0]), 'Kids CG · Santander 1534 · final 2360-2');
});

test('payer account options include only active accounts from active companies', () => {
  assert.deepEqual(
    buildContaPagadoraOptions([
      contas[0],
      { ...contas[0], id: 'inactive-account', ativo: false },
      { ...contas[0], id: 'inactive-company', empresa: { ...contas[0].empresa, ativo: false } },
      { ...contas[0], id: 'missing-company', empresa: null },
    ]).map((option) => option.value),
    ['kids-account']
  );
});

test('missing payer count includes only active non-archived collaborators', () => {
  assert.equal(countActiveCollaboratorsWithoutPayer(colaboradores), 1);
});

test('missing payer filter leaves only active non-archived collaborators without account', () => {
  assert.deepEqual(
    filterCollaboratorsByPayerStatus(colaboradores, 'missing').map((item) => item.id),
    [1]
  );

  assert.deepEqual(
    filterCollaboratorsByPayerStatus(colaboradores, 'all').map((item) => item.id),
    [1, 2, 3, 4, 5]
  );
});

test('payer account label falls back to the company business name', () => {
  assert.equal(
    formatContaPagadoraOption({
      ...contas[0],
      empresa: { ...contas[0].empresa, label_operacional: null, nome_fantasia: 'LA Kids' },
    }),
    'LA Kids · Santander 1534 · final 2360-2'
  );
});

test('payer account select converts the empty sentinel to null and preserves ids', () => {
  assert.equal(normalizeContaPagadoraSelection('none'), null);
  assert.equal(normalizeContaPagadoraSelection('kids-account'), 'kids-account');
});
