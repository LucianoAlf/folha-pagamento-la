import assert from 'node:assert/strict';
import test from 'node:test';

import {
  centroCustoToUnidade,
  filterSelectablePlanos,
  formatPlanoContaLabel,
  getPlanoContaParentName,
  isPlanoContaSelecionavel,
  matchesPlanoContaSearch,
  resolvePlanosMaisUsados,
} from './planoContasSelectors.ts';

test('isPlanoContaSelecionavel accepts only active outgoing leaves', () => {
  assert.equal(
    isPlanoContaSelecionavel({
      id: 'leaf-out',
      codigo: '5.2.3',
      nome: 'Energia Eletrica',
      nivel: 3,
      natureza: 'saida',
      ativo: true,
    }),
    true
  );

  assert.equal(
    isPlanoContaSelecionavel({
      id: 'group-out',
      codigo: '5.2',
      nome: 'Custos Fixos',
      nivel: 2,
      natureza: 'saida',
      ativo: true,
    }),
    false
  );

  assert.equal(
    isPlanoContaSelecionavel({
      id: 'income-leaf',
      codigo: '3.1.1',
      nome: 'Receitas',
      nivel: 3,
      natureza: 'entrada',
      ativo: true,
    }),
    false
  );

  assert.equal(
    isPlanoContaSelecionavel({
      id: 'inactive-leaf',
      codigo: '7.2.1',
      nome: 'Emprestimos',
      nivel: 3,
      natureza: 'saida',
      ativo: false,
    }),
    false
  );
});

test('formatPlanoContaLabel renders codigo and nome', () => {
  assert.equal(
    formatPlanoContaLabel({
      id: 'energia',
      codigo: '5.2.3',
      nome: 'Energia Eletrica',
      nivel: 3,
      natureza: 'saida',
      ativo: true,
    }),
    '5.2.3 Energia Eletrica'
  );
});

test('matchesPlanoContaSearch finds codigo and nome without accents', () => {
  const conta = {
    id: 'energia',
    codigo: '5.2.3',
    nome: 'Energia Eletrica',
    nome_completo: '5.2.3 Energia Eletrica',
    nivel: 3 as const,
    natureza: 'saida' as const,
    ativo: true,
  };

  assert.equal(matchesPlanoContaSearch(conta, '5.2.3'), true);
  assert.equal(matchesPlanoContaSearch(conta, 'energia eletrica'), true);
  assert.equal(matchesPlanoContaSearch(conta, 'energia elétrica'), true);
  assert.equal(matchesPlanoContaSearch(conta, 'marketing'), false);
});

test('centroCustoToUnidade returns the legacy unidade code for supported cost centers', () => {
  assert.equal(
    centroCustoToUnidade({
      id: 'rec',
      codigo: 'rec',
      nome: 'Recreio',
      tipo: 'unidade',
      ativo: true,
      ordem: 2,
    }),
    'rec'
  );

  assert.equal(
    centroCustoToUnidade({
      id: 'admin',
      codigo: 'admin',
      nome: 'Administrativo',
      tipo: 'area',
      ativo: true,
      ordem: 9,
    }),
    null
  );
});

test('filterSelectablePlanos returns only active outgoing leaves ordered by codigo', () => {
  const planos = [
    { id: 'grupo', codigo: '5.2', nome: 'Despesas Administrativas', nivel: 2 as const, natureza: 'saida' as const, ativo: true, ordem: 1 },
    { id: 'software', codigo: '5.2.11', nome: 'Softwares e plataformas', parent_id: 'grupo', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 11 },
    { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', parent_id: 'grupo', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 3 },
    { id: 'receita', codigo: '3.1.1', nome: 'Mensalidades', nivel: 3 as const, natureza: 'entrada' as const, ativo: true, ordem: 1 },
    { id: 'inativa', codigo: '5.2.4', nome: 'Aluguel', nivel: 3 as const, natureza: 'saida' as const, ativo: false, ordem: 4 },
  ];

  assert.deepEqual(
    filterSelectablePlanos(planos, '').map((p) => p.codigo),
    ['5.2.3', '5.2.11']
  );
});

test('filterSelectablePlanos matches codigo or nome ignoring case and accents', () => {
  const planos = [
    { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 3 },
    { id: 'trafego', codigo: '4.7.4', nome: 'Trafego pago', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 4 },
  ];

  assert.deepEqual(
    filterSelectablePlanos(planos, 'ENERGIA EL\u00c9TRICA').map((p) => p.id),
    ['energia']
  );
  assert.deepEqual(
    filterSelectablePlanos(planos, '4.7').map((p) => p.id),
    ['trafego']
  );
});

test('getPlanoContaParentName returns the level 2 parent label for a leaf', () => {
  const byId = new Map([
    ['bloco', { id: 'bloco', codigo: '5', nome: 'Despesas', nivel: 1 as const, natureza: 'saida' as const, ativo: true, ordem: 1 }],
    ['grupo', { id: 'grupo', codigo: '5.2', nome: 'Despesas Administrativas', parent_id: 'bloco', nivel: 2 as const, natureza: 'saida' as const, ativo: true, ordem: 2 }],
  ]);

  assert.equal(
    getPlanoContaParentName(
      { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', parent_id: 'grupo', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 3 },
      byId
    ),
    'Despesas Administrativas'
  );
});

test('resolvePlanosMaisUsados preserves usage order and ignores non-selectable ids', () => {
  const planos = [
    { id: 'grupo', codigo: '5.2', nome: 'Despesas Administrativas', nivel: 2 as const, natureza: 'saida' as const, ativo: true, ordem: 1 },
    { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', parent_id: 'grupo', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 3 },
    { id: 'software', codigo: '5.2.11', nome: 'Softwares e plataformas', parent_id: 'grupo', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 11 },
    { id: 'receita', codigo: '3.1.1', nome: 'Mensalidades', nivel: 3 as const, natureza: 'entrada' as const, ativo: true, ordem: 1 },
  ];

  assert.deepEqual(
    resolvePlanosMaisUsados(planos, [
      { plano_conta_id: 'software', total: 5 },
      { plano_conta_id: 'receita', total: 4 },
      { plano_conta_id: 'energia', total: 3 },
      { plano_conta_id: null, total: 99 },
    ]).map((item) => [item.plano.id, item.total]),
    [
      ['software', 5],
      ['energia', 3],
    ]
  );
});
