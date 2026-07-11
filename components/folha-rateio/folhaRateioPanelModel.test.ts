import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Lancamento } from '../../types.ts';
import type { FolhaRateioPreflight } from '../../types/folhaRateio.ts';
import type { FolhaRateioPessoa, FolhaRateioStatus } from './folhaRateioSelectors.ts';
import {
  deriveFolhaRateioProgress,
  filterFolhaRateioPessoas,
  selectFolhaLancamentos,
} from './folhaRateioPanelModel.ts';

function lancamento(id: number, folhaId: number): Lancamento {
  return { id, folha_id: folhaId } as Lancamento;
}

function pessoa(
  colaboradorId: number,
  nome: string,
  funcao: string,
  status: FolhaRateioStatus,
): FolhaRateioPessoa {
  return { colaboradorId, nome, funcao, status } as FolhaRateioPessoa;
}

function preflight(overrides: Partial<FolhaRateioPreflight>): FolhaRateioPreflight {
  return {
    folha_id: 10,
    pronto: false,
    pessoas_total: 0,
    pessoas_pendentes: 0,
    fatias_sem_conta: 0,
    incoerencias_fiscais: 0,
    conflitos_chave: 0,
    total_folha: 0,
    total_lancamentos: 0,
    diferenca: 0,
    totais_por_conta: [],
    problemas: [],
    ...overrides,
  };
}

test('selects only rows from the active payroll in a mixed snapshot', () => {
  const rows = [lancamento(1, 10), lancamento(2, 11), lancamento(3, 10)];

  assert.deepEqual(
    selectFolhaLancamentos(rows, 10).map((row) => row.id),
    [1, 3],
  );
});

test('filters people by accent-insensitive name and function', () => {
  const pessoas = [
    pessoa(1, 'Agata Lima', 'Assistente', 'a_conciliar'),
    pessoa(2, 'Bruno Melo', 'Musico', 'parcial'),
    pessoa(3, 'Caio Reis', 'Professor', 'conciliado'),
  ];
  pessoas[0].nome = '\u00c1gata Lima';
  pessoas[1].funcao = 'M\u00fasico';

  assert.deepEqual(
    filterFolhaRateioPessoas(pessoas, '\u00e1gata', 'todos').map((item) => item.colaboradorId),
    [1],
  );
  assert.deepEqual(
    filterFolhaRateioPessoas(pessoas, 'musico', 'todos').map((item) => item.colaboradorId),
    [2],
  );
});

test('pending filter includes unassigned and partial people but excludes reconciled people', () => {
  const pessoas = [
    pessoa(1, 'Ana', 'Assistente', 'a_conciliar'),
    pessoa(2, 'Bia', 'Musica', 'parcial'),
    pessoa(3, 'Caio', 'Professor', 'conciliado'),
  ];

  assert.deepEqual(
    filterFolhaRateioPessoas(pessoas, '', 'pendentes').map((item) => item.status),
    ['a_conciliar', 'parcial'],
  );
});

test('derives reconciled counts, percentage, and positive diagnostics', () => {
  const progress = deriveFolhaRateioProgress(preflight({
    pessoas_total: 5,
    pessoas_pendentes: 2,
    fatias_sem_conta: 3,
    incoerencias_fiscais: 0,
    conflitos_chave: 1,
  }));

  assert.deepEqual(progress, {
    total: 5,
    pending: 2,
    reconciled: 3,
    percent: 60,
    diagnostics: [
      { key: 'fatias_sem_conta', label: 'Fatias sem conta', value: 3 },
      { key: 'conflitos_chave', label: 'Divisoes duplicadas', value: 1 },
    ],
  });
});

test('derives zero-safe progress when the payroll has no people', () => {
  assert.deepEqual(deriveFolhaRateioProgress(preflight({})), {
    total: 0,
    pending: 0,
    reconciled: 0,
    percent: 0,
    diagnostics: [],
  });
});
