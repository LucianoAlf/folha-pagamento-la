import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createServer } from 'vite';
import type { NavigationDestination } from './navigation.ts';

const componentUrl = new URL('./BottomNavigation.tsx', import.meta.url);
const source = existsSync(fileURLToPath(componentUrl))
  ? readFileSync(componentUrl, 'utf8')
  : '';

interface BottomNavigationProps {
  current: NavigationDestination;
  moreOpen: boolean;
  onNavigate: (next: NavigationDestination) => void;
  onOpenMore: () => void;
}

function getButton(markup: string, accessibleName: string): string {
  const button = markup.match(
    new RegExp(
      `<button(?=[^>]*aria-label="${accessibleName}")[^>]*>[\\s\\S]*?<\\/button>`,
    ),
  )?.[0];
  assert.ok(button, `botao ${accessibleName} deve existir`);
  return button;
}

test('barra usa o modelo, cinco colunas estaveis, area segura e rotulos responsivos', () => {
  assert.match(source, /BOTTOM_NAVIGATION_IDS\.map/);
  assert.match(source, /getNavigationItem\(id\)/);
  assert.match(source, /grid-cols-5/);
  assert.match(source, /min-h-\[64px\]/);
  assert.match(source, /sm:text-\[11px\]/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /border-line/);
  assert.match(source, /bg-surface/);
  assert.match(source, /aria-hidden="true"/);
});

test('SSR renderiza exatamente Folha, Contas, Cartoes, Agenda e Mais', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const loaded = await vite.ssrLoadModule('/components/BottomNavigation.tsx');
  const BottomNavigation = loaded.BottomNavigation as ComponentType<BottomNavigationProps>;
  const render = (current: NavigationDestination, moreOpen = false) =>
    renderToStaticMarkup(
      React.createElement(BottomNavigation, {
        current,
        moreOpen,
        onNavigate: () => undefined,
        onOpenMore: () => undefined,
      }),
    );

  const markup = render({ module: 'folha', page: 'dashboard' });
  const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 5);
  assert.deepEqual(
    buttons.map((button) => button.match(/aria-label="([^"]+)"/)?.[1]),
    ['Folha', 'Contas', 'Cartões', 'Agenda', 'Mais'],
  );
  assert.equal((markup.match(/<svg\b[^>]*aria-hidden="true"/g) ?? []).length, 5);
  assert.match(getButton(markup, 'Folha'), /aria-current="page"/);
  assert.doesNotMatch(getButton(markup, 'Mais'), /aria-current=/);
  assert.match(getButton(markup, 'Mais'), /aria-expanded="false"/);
});

test('Mais separa destaque visual, aria-expanded e destino atual', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const loaded = await vite.ssrLoadModule('/components/BottomNavigation.tsx');
  const BottomNavigation = loaded.BottomNavigation as ComponentType<BottomNavigationProps>;
  const render = (current: NavigationDestination, moreOpen = false) =>
    renderToStaticMarkup(
      React.createElement(BottomNavigation, {
        current,
        moreOpen,
        onNavigate: () => undefined,
        onOpenMore: () => undefined,
      }),
    );

  for (const current of [
    { module: 'folha', page: 'bistro' },
    { module: 'rh', page: 'dashboard' },
    { module: 'ferias', page: 'ferias' },
    { module: 'notificacoes', page: 'notificacoes' },
  ] satisfies NavigationDestination[]) {
    const markup = render(current);
    assert.match(getButton(markup, 'Mais'), /aria-current="page"/);
  }

  const bistroMarkup = render({ module: 'folha', page: 'bistro' });
  assert.doesNotMatch(getButton(bistroMarkup, 'Folha'), /aria-current=/);

  const drawerOpenMarkup = render({ module: 'folha', page: 'dashboard' }, true);
  assert.match(getButton(drawerOpenMarkup, 'Mais'), /aria-expanded="true"/);
  assert.doesNotMatch(getButton(drawerOpenMarkup, 'Mais'), /aria-current=/);
  assert.match(getButton(drawerOpenMarkup, 'Mais'), /text-accent/);
  assert.equal((drawerOpenMarkup.match(/aria-current="page"/g) ?? []).length, 1);
});
