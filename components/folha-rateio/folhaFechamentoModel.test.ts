import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFolhaCloseConfirmation,
  canCloseFolha,
} from './folhaFechamentoModel.ts';
import type { FolhaRateioPreflight } from '../../types/folhaRateio.ts';

const readyPreflight: FolhaRateioPreflight = {
  folha_id: 17,
  pronto: true,
  pessoas_total: 67,
  pessoas_pendentes: 0,
  fatias_sem_conta: 0,
  incoerencias_fiscais: 0,
  conflitos_chave: 0,
  total_folha: 171219.96,
  total_lancamentos: 171219.96,
  diferenca: 0,
  totais_por_conta: [
    { conta_pagadora_id: '1', conta_apelido: 'Kids', empresa: 'Kids CG', unidade: 'cg', valor: 29049.85 },
    { conta_pagadora_id: '2', conta_apelido: 'EMLA', empresa: 'EMLA CG', unidade: 'cg', valor: 35272.2 },
    { conta_pagadora_id: '3', conta_apelido: 'Recreio', empresa: 'Recreio', unidade: 'rec', valor: 59042.17 },
    { conta_pagadora_id: '4', conta_apelido: 'Barra', empresa: 'Barra', unidade: 'bar', valor: 47855.74 },
  ],
  problemas: [],
};

test('close is enabled only for an approved sheet with a server-ready preflight', () => {
  assert.equal(canCloseFolha('aprovada', readyPreflight), true);
  assert.equal(canCloseFolha('fechada', readyPreflight), false);
  assert.equal(canCloseFolha('rascunho', readyPreflight), false);
  assert.equal(canCloseFolha('aprovada', { ...readyPreflight, pronto: false }), false);
  assert.equal(canCloseFolha('aprovada', { ...readyPreflight, pessoas_pendentes: 1 }), false);
});

test('confirmation reports the actual positive accounts and reconciled total', () => {
  const message = buildFolhaCloseConfirmation(readyPreflight);
  assert.match(message, /4 contas a pagar/);
  assert.match(message, /R\$\s*171\.219,96/);
  assert.doesNotMatch(message, /RPC/i);
});
