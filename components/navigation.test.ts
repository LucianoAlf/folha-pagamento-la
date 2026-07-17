import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOTTOM_NAVIGATION_IDS,
  NAVIGATION_GROUPS,
  getDefaultPage,
  getNavigationItem,
  isModuleId,
  isMoreNavigationActive,
  isNavigationItemActive,
} from './navigation.ts';

test('mantem o inventario aprovado e Contas a Pagar aparece uma unica vez', () => {
  assert.deepEqual(
    NAVIGATION_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    [
      ['Financeiro', [
        'Dashboard financeiro',
        'Contas a Pagar',
        'Contas a Receber',
        'Fluxo de Caixa',
        'DRE',
        'Conciliação',
        'Cartões',
        'Bistrô',
      ]],
      ['RH / DP', ['Folha de Pagamento', 'Jornada RH', 'Férias CLT', 'Agenda']],
      ['Configurações', [
        'Notificações',
        'Gerenciar plano de contas',
        'Gerenciar centros de custo',
        'Gerenciar empresas e contas bancárias',
      ]],
    ],
  );

  assert.equal(
    NAVIGATION_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.label === 'Contas a Pagar').length,
    1,
  );
});

test('itens futuros nao possuem destino', () => {
  const futureItems = NAVIGATION_GROUPS
    .flatMap((group) => group.items)
    .filter((item) => item.status === 'future');

  assert.equal(futureItems.length, 8);
  assert.ok(futureItems.every((item) => item.destination === undefined));
});

test('Bistro ativa apenas Bistro e move o mobile para Mais', () => {
  const current = { module: 'folha' as const, page: 'bistro' };

  assert.equal(isNavigationItemActive(getNavigationItem('bistro'), current), true);
  assert.equal(isNavigationItemActive(getNavigationItem('folha'), current), false);
  assert.equal(isMoreNavigationActive(current), true);
});

test('Folha continua ativa nas demais abas internas', () => {
  const current = { module: 'folha' as const, page: 'lancamentos' };

  assert.equal(isNavigationItemActive(getNavigationItem('folha'), current), true);
  assert.equal(isNavigationItemActive(getNavigationItem('bistro'), current), false);
  assert.equal(isMoreNavigationActive(current), false);
});

test('barra inferior possui quatro destinos fixos e defaults validos', () => {
  assert.deepEqual(BOTTOM_NAVIGATION_IDS, ['folha', 'contas', 'cartoes', 'agenda']);
  assert.equal(getDefaultPage('cartoes'), 'cartoes');
  assert.equal(getDefaultPage('rh'), 'dashboard');
  assert.equal(isModuleId('notificacoes'), true);
  assert.equal(isModuleId('dashboard-financeiro'), false);
});
