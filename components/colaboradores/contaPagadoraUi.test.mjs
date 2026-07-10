import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../../types.ts', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../CollaboratorComponents.tsx', import.meta.url), 'utf8');

test('collaborator type and screen use the payer account reference', () => {
  assert.match(types, /conta_pagadora_id\?: string \| null/i);
  assert.match(app, /fetchFinanceiroContasBancarias/);
  assert.match(app, /countActiveCollaboratorsWithoutPayer/);
  assert.match(app, /filterCollaboratorsByPayerStatus/);
  assert.match(app, /Sem conta pagadora/i);
  assert.match(app, /contasPagadoras=\{contasPagadoras\}/);
});

test('mobile and desktop collaborator forms expose the same payer account field', () => {
  const labels = modal.match(/Empresa \/ conta pagadora/g) || [];
  assert.equal(labels.length, 2);
  assert.match(modal, /buildContaPagadoraOptions/);
  assert.match(modal, /value=\{form\.conta_pagadora_id \|\| 'none'\}/);
  assert.match(modal, /conta_pagadora_id:\s*normalizeContaPagadoraSelection\(v\)/);
  assert.match(modal, /await onSave\(form\)/);
});
