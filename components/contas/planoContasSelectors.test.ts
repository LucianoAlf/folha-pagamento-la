import assert from 'node:assert/strict';
import test from 'node:test';

import {
  centroCustoToUnidade,
  filterSelectablePlanos,
  formatPlanoContaLabel,
  formatContaCentroCustoLabel,
  formatContaPlanoCodigo,
  formatContaPlanoLabel,
  getPlanoContaParentName,
  isPlanoContaSelecionavel,
  matchesContaPlanoCentroSearch,
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

test('matchesPlanoContaSearch treats dotted account codes as segmented codes', () => {
  assert.equal(matchesPlanoContaSearch({ codigo: '5.2.1', nome: 'Telefone e Internet' }, '5.2.1'), true);
  assert.equal(matchesPlanoContaSearch({ codigo: '5.2.10', nome: 'Outras Despesas Administrativas' }, '5.2.1'), false);
  assert.equal(matchesPlanoContaSearch({ codigo: '5.2.11', nome: 'Softwares e Plataformas' }, '5.2.1'), false);
  assert.equal(matchesPlanoContaSearch({ codigo: '5.2.1.1', nome: 'Subconta' }, '5.2.1'), true);
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

test('filterSelectablePlanos searches account codes by segment and names by text', () => {
  const planos = [
    { id: 'telefone', codigo: '5.2.1', nome: 'Telefone e Internet', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 1 },
    { id: 'iptu', codigo: '5.2.6', nome: 'IPTU', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 6 },
    { id: 'outras', codigo: '5.2.10', nome: 'Outras Despesas Administrativas', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 10 },
    { id: 'software', codigo: '5.2.11', nome: 'Softwares e Plataformas', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 11 },
    { id: 'trafego', codigo: '4.7.4', nome: 'Trafego pago', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 4 },
  ];

  assert.deepEqual(filterSelectablePlanos(planos, '5.2.1').map((p) => p.codigo), ['5.2.1']);
  assert.deepEqual(filterSelectablePlanos(planos, '5.2').map((p) => p.codigo), ['5.2.1', '5.2.6', '5.2.10', '5.2.11']);
  assert.deepEqual(filterSelectablePlanos(planos, '5.2.6').map((p) => p.codigo), ['5.2.6']);
  assert.deepEqual(filterSelectablePlanos(planos, 'iptu').map((p) => p.codigo), ['5.2.6']);
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

test('formatContaPlanoLabel renders plano codigo and nome with category fallback', () => {
  assert.equal(
    formatContaPlanoLabel({
      plano_conta: { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', nivel: 3, natureza: 'saida', ativo: true, ordem: 3 },
      categoria: { id: 'cat', nome: 'Energia antiga', icone: '', cor: '', tipo_fluxo: 'despesa', tipo_custo: 'fixo', ativo: true, ordem: 1 },
    }),
    '5.2.3 Energia Eletrica'
  );

  assert.equal(
    formatContaPlanoLabel({
      plano_conta: null,
      categoria: { id: 'cat', nome: 'Energia antiga', icone: '', cor: '', tipo_fluxo: 'despesa', tipo_custo: 'fixo', ativo: true, ordem: 1 },
    }),
    'Energia antiga'
  );
});

test('formatContaPlanoCodigo and formatContaCentroCustoLabel use defensive fallbacks', () => {
  assert.equal(
    formatContaPlanoCodigo({
      plano_conta: { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', nivel: 3, natureza: 'saida', ativo: true, ordem: 3 },
    }),
    '5.2.3'
  );

  assert.equal(
    formatContaPlanoCodigo({
      plano_conta: null,
      categoria: { id: 'cat', nome: 'Energia antiga', icone: '', cor: '', tipo_fluxo: 'despesa', tipo_custo: 'fixo', ativo: true, ordem: 1 },
    }),
    'Energia antiga'
  );

  assert.equal(
    formatContaCentroCustoLabel({
      centro_custo: { id: 'cg', codigo: 'cg', nome: 'Campo Grande', tipo: 'unidade', ativo: true, ordem: 1 },
      unidade: 'rec',
    }),
    'Campo Grande'
  );

  assert.equal(formatContaCentroCustoLabel({ centro_custo: null, unidade: 'rec' }), 'REC');
});

test('matchesContaPlanoCentroSearch finds descricao, plano and centro without accents', () => {
  const conta = {
    descricao: 'Light loja 171',
    plano_conta: { id: 'energia', codigo: '5.2.3', nome: 'Energia Eletrica', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 3 },
    centro_custo: { id: 'cg', codigo: 'cg', nome: 'Campo Grande', tipo: 'unidade', ativo: true, ordem: 1 },
    categoria: { id: 'cat', nome: 'Conta de luz', icone: '', cor: '', tipo_fluxo: 'despesa' as const, tipo_custo: 'fixo' as const, ativo: true, ordem: 1 },
    unidade: 'cg' as const,
  };

  assert.equal(matchesContaPlanoCentroSearch(conta, 'light'), true);
  assert.equal(matchesContaPlanoCentroSearch(conta, '5.2.3'), true);
  assert.equal(matchesContaPlanoCentroSearch(conta, 'energia elétrica'), true);
  assert.equal(matchesContaPlanoCentroSearch(conta, 'campo grande'), true);
  assert.equal(matchesContaPlanoCentroSearch(conta, 'recreio'), false);
});

test('matchesContaPlanoCentroSearch does not match sibling account codes by substring', () => {
  const conta = {
    descricao: 'Emusys - (CG)',
    plano_conta: { id: 'software', codigo: '5.2.11', nome: 'Softwares e Plataformas', nivel: 3 as const, natureza: 'saida' as const, ativo: true, ordem: 11 },
    centro_custo: { id: 'cg', codigo: 'cg', nome: 'Campo Grande', tipo: 'unidade', ativo: true, ordem: 1 },
    unidade: 'cg' as const,
  };

  assert.equal(matchesContaPlanoCentroSearch(conta, '5.2.1'), false);
  assert.equal(matchesContaPlanoCentroSearch(conta, '5.2.11'), true);
});
