import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachClassificacaoResumo,
  buildFaturasResumo,
  filterAndSortFaturas,
} from './cartoesFaturasSelectors.ts';

const faturas = [
  {
    id: 'fatura-set',
    cartao_id: 'cartao-emla',
    competencia: '2026-09-01',
    data_vencimento: '2026-09-10',
    data_fechamento: '2026-08-27',
    valor_total: 550.32,
    status: 'aberta',
    conta_pagar_id: null,
    cartao: {
      id: 'cartao-emla',
      apelido: 'EMLA CG 2270',
      final: '2270',
      empresa_id: 'empresa-emla',
    },
  },
  {
    id: 'fatura-jul',
    cartao_id: 'cartao-emla',
    competencia: '2026-07-01',
    data_vencimento: '2026-07-10',
    data_fechamento: '2026-06-27',
    valor_total: 755.22,
    status: 'aberta',
    conta_pagar_id: 'conta-pagar-fatura',
    cartao: {
      id: 'cartao-emla',
      apelido: 'EMLA CG 2270',
      final: '2270',
      empresa_id: 'empresa-emla',
    },
  },
  {
    id: 'fatura-barra',
    cartao_id: 'cartao-barra',
    competencia: '2026-07-01',
    data_vencimento: '2026-07-25',
    data_fechamento: '2026-07-15',
    valor_total: 120,
    status: 'fechada',
    conta_pagar_id: null,
    cartao: {
      id: 'cartao-barra',
      apelido: 'Barra 8434',
      final: '8434',
      empresa_id: 'empresa-barra',
    },
  },
] as any[];

const transacoes = [
  { id: 't1', fatura_id: 'fatura-jul', classificacao_status: 'pendente' },
  { id: 't2', fatura_id: 'fatura-jul', classificacao_status: 'pendente' },
  { id: 't3', fatura_id: 'fatura-set', classificacao_status: 'confirmada' },
  { id: 't4', fatura_id: 'fatura-barra', classificacao_status: 'sugerida' },
] as any[];

test('attachClassificacaoResumo counts transacoes by fatura without N+1 assumptions', () => {
  const result = attachClassificacaoResumo(faturas, transacoes);
  const julho = result.find((fatura) => fatura.id === 'fatura-jul');
  const setembro = result.find((fatura) => fatura.id === 'fatura-set');

  assert.deepEqual(julho?.classificacao, {
    total: 2,
    confirmadas: 0,
    sugeridas: 0,
    pendentes: 2,
    percentualConfirmado: 0,
  });
  assert.deepEqual(setembro?.classificacao, {
    total: 1,
    confirmadas: 1,
    sugeridas: 0,
    pendentes: 0,
    percentualConfirmado: 100,
  });
});

test('filterAndSortFaturas applies card, empresa, status and competencia filters', () => {
  const enriched = attachClassificacaoResumo(faturas, transacoes);

  assert.deepEqual(
    filterAndSortFaturas(enriched, {
      cartaoId: 'cartao-emla',
      empresaId: 'empresa-emla',
      status: 'aberta',
      competencia: '2026-07',
    }).map((fatura) => fatura.id),
    ['fatura-jul']
  );

  assert.deepEqual(
    filterAndSortFaturas(enriched, {
      cartaoId: 'all',
      empresaId: 'all',
      status: 'all',
      competencia: 'all',
    }).map((fatura) => fatura.id),
    ['fatura-jul', 'fatura-barra', 'fatura-set']
  );
});

test('buildFaturasResumo sums open invoices and identifies the next open due date', () => {
  const resumo = buildFaturasResumo(attachClassificacaoResumo(faturas, transacoes));

  assert.equal(resumo.totalAberto, 1305.54);
  assert.equal(resumo.proximaFatura?.id, 'fatura-jul');
  assert.deepEqual(resumo.porStatus, {
    aberta: 2,
    fechada: 1,
    paga: 0,
    cancelada: 0,
  });
});
