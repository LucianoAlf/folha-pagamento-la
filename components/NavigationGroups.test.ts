import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createServer } from 'vite';
import type {
  NavigationBadge,
  NavigationDestination,
  NavigationItemId,
} from './navigation.ts';

const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

interface NavigationGroupsProps {
  current: NavigationDestination;
  collapsed?: boolean;
  badges?: Partial<Record<NavigationItemId, NavigationBadge>>;
  onNavigate: (next: NavigationDestination) => void;
}

test('NavigationGroups renderiza disabled e nomes acessiveis de status e badge', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const loaded = await vite.ssrLoadModule('/components/NavigationGroups.tsx');
  const NavigationGroups = loaded.NavigationGroups as ComponentType<NavigationGroupsProps>;
  const render = (badges: Partial<Record<NavigationItemId, NavigationBadge>>) =>
    renderToStaticMarkup(
      React.createElement(NavigationGroups, {
        current: { module: 'folha', page: 'dashboard' },
        badges,
        onNavigate: () => undefined,
      }),
    );

  const dangerMarkup = render({
    ferias: {
      count: 1,
      variant: 'danger',
      pulse: true,
      accessibleLabel: '1 colaborador com férias vencidas',
    },
  });
  assert.match(
    dangerMarkup,
    /<button[^>]*disabled=""[^>]*aria-label="Dashboard financeiro, Em breve"/,
  );
  assert.equal((dangerMarkup.match(/<button[^>]*disabled=""/g) ?? []).length, 8);
  assert.match(
    dangerMarkup,
    /aria-label="Férias CLT, 1 colaborador com férias vencidas"/,
  );

  const genericMarkup = render({
    notificacoes: {
      count: 4,
      variant: 'danger',
      accessibleLabel: '4 notificações não lidas',
    },
  });
  assert.match(genericMarkup, /aria-label="Notificações, 4 notificações não lidas"/);
});

test('Sidebar usa o renderer compartilhado e nao conserva modo drawer legado', () => {
  assert.match(sidebarSource, /<NavigationGroups/);
  assert.match(sidebarSource, /useFeriasNavigationBadge/);
  assert.doesNotMatch(sidebarSource, /isMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /onCloseMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /const modules = useMemo/);
  assert.match(sidebarSource, /la-music-sidebar-collapsed/);
});
