import assert from 'node:assert/strict';
import test from 'node:test';
import { Bell } from 'lucide-react';

import {
  BOTTOM_NAVIGATION_IDS,
  NAVIGATION_GROUPS,
  getDefaultPage,
  getNavigationItem,
  isModuleId,
  isMoreNavigationActive,
  isNavigationItemActive,
} from './navigation.ts';
import type { NavigationItem } from './navigation.ts';

// @ts-expect-error active navigation items must declare a destination
const activeItemWithoutDestination: NavigationItem = {
  id: 'notificacoes',
  label: 'Notificações',
  icon: Bell,
  status: 'active',
};

const futureItemWithDestination: NavigationItem = {
  id: 'dashboard-financeiro',
  label: 'Dashboard financeiro',
  icon: Bell,
  status: 'future',
  // @ts-expect-error future navigation items cannot declare a destination
  destination: { module: 'folha' },
};

const futureItemWithActiveMode: NavigationItem = {
  id: 'dashboard-financeiro',
  label: 'Dashboard financeiro',
  icon: Bell,
  status: 'future',
  // @ts-expect-error future navigation items cannot configure active matching
  activeMode: 'exact',
};

// @ts-expect-error future navigation items cannot exclude active pages
const futureItemWithExcludedPages: NavigationItem = {
  id: 'dashboard-financeiro',
  label: 'Dashboard financeiro',
  icon: Bell,
  status: 'future',
  excludedPages: ['bistro'],
};

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

test('mantem ids, status e destinos aprovados no mapa central', () => {
  assert.deepEqual(
    NAVIGATION_GROUPS.flatMap((group) =>
      group.items.map(({ id, status, destination }) => ({ id, status, destination })),
    ),
    [
      { id: 'dashboard-financeiro', status: 'future', destination: undefined },
      { id: 'contas', status: 'active', destination: { module: 'contas' } },
      { id: 'contas-receber', status: 'future', destination: undefined },
      { id: 'fluxo-caixa', status: 'future', destination: undefined },
      { id: 'dre', status: 'future', destination: undefined },
      { id: 'conciliacao', status: 'future', destination: undefined },
      { id: 'cartoes', status: 'active', destination: { module: 'cartoes' } },
      {
        id: 'bistro',
        status: 'active',
        destination: { module: 'folha', page: 'bistro' },
      },
      { id: 'folha', status: 'active', destination: { module: 'folha' } },
      { id: 'rh', status: 'active', destination: { module: 'rh' } },
      { id: 'ferias', status: 'active', destination: { module: 'ferias' } },
      { id: 'agenda', status: 'active', destination: { module: 'agenda' } },
      {
        id: 'notificacoes',
        status: 'active',
        destination: { module: 'notificacoes' },
      },
      { id: 'gerenciar-plano-contas', status: 'future', destination: undefined },
      { id: 'gerenciar-centros-custo', status: 'future', destination: undefined },
      { id: 'gerenciar-empresas-contas', status: 'future', destination: undefined },
    ],
  );
});

test('ids de navegacao sao unicos', () => {
  const ids = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.id));

  assert.equal(new Set(ids).size, ids.length);
});

test('todo item ativo possui destino', () => {
  const activeItems = NAVIGATION_GROUPS
    .flatMap((group) => group.items)
    .filter((item) => item.status === 'active');

  assert.ok(activeItems.every((item) => item.destination !== undefined));
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
  assert.ok(BOTTOM_NAVIGATION_IDS.every((id) => getNavigationItem(id).status === 'active'));
  assert.equal(getDefaultPage('cartoes'), 'cartoes');
  assert.equal(getDefaultPage('rh'), 'dashboard');
  assert.equal(isModuleId('notificacoes'), true);
  assert.equal(isModuleId('dashboard-financeiro'), false);
});
