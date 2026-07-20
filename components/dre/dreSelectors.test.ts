import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDreCoverageMessage,
  buildDreReconciliationTotals,
  getDreErrorMessage,
  getDreDisplayRows,
  getDreSemUnidadeReasonRows,
  getDreUnidadeLabel,
} from './dreSelectors.ts';
import type { DreResumoSemUnidadeOperacional } from '../../types/dre.ts';

const drePageSource = readFileSync(new URL('./DrePage.tsx', import.meta.url), 'utf8');

test('unit selector forces compact single-line options on narrow screens', () => {
  assert.match(
    drePageSource,
    /ariaLabel="Unidade operacional do DRE"[\s\S]*?optionClassName="!px-0\.5 !text-\[9px\] whitespace-nowrap sm:!px-2 sm:!text-xs"/,
  );
});

const dre = {
  grupos: [
    { codigo: '3', nome: 'Receitas', valor_resultado: 1000, linhas_classificadas: 4 },
    { codigo: '4', nome: 'Despesas variaveis', valor_resultado: -200, linhas_classificadas: 2 },
    { codigo: '5', nome: 'Despesas fixas', valor_resultado: -300, linhas_classificadas: 3 },
  ],
  planos: [
    { grupo_codigo: '3', plano_codigo: '3.1.1', plano_nome: 'Mensalidades', natureza: 'entrada', valor_resultado: 1000, por_fonte: { contas_receber: 1000 } },
    { grupo_codigo: '4', plano_codigo: '4.2.1', plano_nome: 'Material', natureza: 'saida', valor_resultado: -200, por_fonte: { cartao: -200 } },
  ],
  cobertura: [
    { fonte: 'contas_receber', label: 'Contas a Receber', estado: 'sem_dados', linhas: 0, classificadas: 0, total_origem: 0 },
    { fonte: 'folha', label: 'Folha de Pagamento', estado: 'ok', linhas: 10, classificadas: 9, total_origem: 800 },
  ],
  reconciliacao: [
    { fonte: 'contas_receber', label: 'Contas a Receber', classificado_dre: 0, em_revisao: 0, sem_plano: 0, cancelado: 0, excluido: 0, total_origem: 0 },
    { fonte: 'folha', label: 'Folha de Pagamento', classificado_dre: 700, em_revisao: 50, sem_plano: 20, cancelado: 0, excluido: 30, total_origem: 800 },
  ],
} as any;

test('simple mode shows consolidated groups and sophisticated mode shows account leaves', () => {
  assert.deepEqual(getDreDisplayRows(dre, 'simples').map((row) => row.codigo), ['3', '4', '5']);
  assert.deepEqual(getDreDisplayRows(dre, 'sofisticado').map((row) => row.codigo), ['3.1.1', '4.2.1']);
  assert.equal(getDreDisplayRows(dre, 'sofisticado')[1]?.valorExibido, 200);
});

test('coverage never disguises an absent source as zero revenue', () => {
  assert.equal(
    buildDreCoverageMessage(dre.cobertura),
    'Sem dados aplicados: Contas a Receber.',
  );
});

test('reconciliation preserves all five buckets and the source total', () => {
  assert.deepEqual(buildDreReconciliationTotals(dre.reconciliacao), {
    classificadoDre: 700,
    emRevisao: 50,
    semPlano: 20,
    cancelado: 0,
    excluido: 30,
    totalOrigem: 800,
  });
});

test('technical RPC failures become an operational message', () => {
  assert.equal(
    getDreErrorMessage({ message: 'Could not find the function public.dre_consultar in the schema cache' }),
    'A leitura da DRE ainda não está disponível neste ambiente.',
  );
  assert.equal(
    getDreErrorMessage(new Error('network request failed')),
    'Não foi possível carregar a DRE. Tente novamente.',
  );
});

test('unit labels cover the consolidated and operational scopes', () => {
  assert.equal(getDreUnidadeLabel('consolidado'), 'Consolidado');
  assert.equal(getDreUnidadeLabel('cg'), 'CG');
  assert.equal(getDreUnidadeLabel('rec'), 'Recreio');
  assert.equal(getDreUnidadeLabel('bar'), 'Barra');
});

test('missing-unit reasons keep a stable order and preserve zero-valued metrics', () => {
  const resumo = {
    valor_origem: 1500,
    valor_resultado: -1500,
    linhas: 6,
    colaboradores_folha: 3,
    por_motivo: {
      folha_sem_alocacao: {
        valor_origem: 1000,
        valor_resultado: -1000,
        linhas: 3,
        colaboradores_folha: 2,
      },
      folha_desatualizada: {
        valor_origem: 500,
        valor_resultado: -500,
        linhas: 2,
        colaboradores_folha: 1,
      },
      cartao_nao_confirmado: {
        valor_origem: 0,
        valor_resultado: 0,
        linhas: 0,
        colaboradores_folha: 0,
      },
      fonte_sem_unidade: {
        valor_origem: 0,
        valor_resultado: 0,
        linhas: 1,
        colaboradores_folha: 0,
      },
    },
  } satisfies DreResumoSemUnidadeOperacional;

  assert.deepEqual(getDreSemUnidadeReasonRows(resumo), [
    {
      motivo: 'folha_sem_alocacao',
      label: 'Folha sem alocação',
      valor_origem: 1000,
      valor_resultado: -1000,
      linhas: 3,
      colaboradores_folha: 2,
    },
    {
      motivo: 'folha_desatualizada',
      label: 'Folha desatualizada',
      valor_origem: 500,
      valor_resultado: -500,
      linhas: 2,
      colaboradores_folha: 1,
    },
    {
      motivo: 'cartao_nao_confirmado',
      label: 'Cartão não confirmado',
      valor_origem: 0,
      valor_resultado: 0,
      linhas: 0,
      colaboradores_folha: 0,
    },
    {
      motivo: 'fonte_sem_unidade',
      label: 'Fonte sem unidade',
      valor_origem: 0,
      valor_resultado: 0,
      linhas: 1,
      colaboradores_folha: 0,
    },
  ]);
});
