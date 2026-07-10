import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const legacy = readFileSync(
  new URL('./20260710_1_colaboradores_conta_pagadora.sql', import.meta.url),
  'utf8'
);
const model = readFileSync(
  new URL('./20260710_2_folha_rateio_conta_pagadora_model.sql', import.meta.url),
  'utf8'
);

test('keeps the already-applied collaborator migration unchanged in history', () => {
  assert.match(legacy, /alter table public\.colaboradores[\s\S]*add column if not exists conta_pagadora_id uuid/i);
  assert.match(legacy, /references public\.financeiro_contas_bancarias\(id\)/i);
});

test('moves payer account from collaborator master to monthly payroll slices', () => {
  assert.match(model, /recusa remover colaboradores\.conta_pagadora_id/i);
  assert.match(model, /where conta_pagadora_id is not null/i);
  assert.match(model, /drop column if exists conta_pagadora_id/i);
  assert.match(model, /alter table public\.lancamentos_folha[\s\S]*add column if not exists conta_pagadora_id uuid/i);
  assert.match(model, /foreign key \(conta_pagadora_id\)[\s\S]*financeiro_contas_bancarias\(id\)/i);
  assert.doesNotMatch(model, /update\s+public\.lancamentos_folha[\s\S]*set\s+conta_pagadora_id/i);
});

test('creates lookup and canonical partial-unique indexes', () => {
  assert.match(model, /create index if not exists lancamentos_folha_folha_conta_pagadora_idx/i);
  assert.match(model, /create unique index if not exists lancamentos_folha_rateio_canonico_uidx/i);
  assert.match(model, /\(folha_id,\s*colaborador_id,\s*categoria,\s*conta_pagadora_id\)/i);
  assert.match(model, /where conta_pagadora_id is not null/i);
});

test('guards account writes and validates account-company-center-unit coherence', () => {
  assert.match(model, /create or replace function public\.folha_lancamento_valida_conta_pagadora/i);
  assert.match(model, /current_setting\('app\.folha_rateio_rpc', true\)/i);
  assert.match(model, /alteracao de conta pagadora exige a RPC de rateio/i);
  assert.match(model, /from public\.financeiro_contas_bancarias b/i);
  assert.match(model, /join public\.financeiro_empresas e/i);
  assert.match(model, /join public\.centros_custo cc/i);
  assert.match(model, /new\.unidade is distinct from v_unidade/i);
  assert.match(model, /before insert or update of conta_pagadora_id, unidade/i);
});
