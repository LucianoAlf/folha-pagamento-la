import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260710_1_colaboradores_conta_pagadora.sql', import.meta.url), 'utf8');

test('adds nullable payer account to collaborators with FK and index', () => {
  assert.match(sql, /add column if not exists conta_pagadora_id uuid/i);
  assert.match(sql, /foreign key \(conta_pagadora_id\) references public\.financeiro_contas_bancarias\(id\)/i);
  assert.match(sql, /create index if not exists colaboradores_conta_pagadora_id_idx/i);
});

test('does not auto-assign or backfill collaborator payer accounts', () => {
  assert.doesNotMatch(sql, /update\s+(?:public\.)?colaboradores/i);
  assert.doesNotMatch(sql, /insert\s+into\s+(?:public\.)?colaboradores/i);
});
