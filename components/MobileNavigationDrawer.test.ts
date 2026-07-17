import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createServer } from 'vite';
import type { NavigationDestination } from './navigation.ts';

const componentUrl = new URL('./MobileNavigationDrawer.tsx', import.meta.url);
const source = existsSync(fileURLToPath(componentUrl))
  ? readFileSync(componentUrl, 'utf8')
  : '';

interface MobileNavigationDrawerProps {
  open: boolean;
  current: NavigationDestination;
  onNavigate: (next: NavigationDestination) => void;
  onClose: () => void;
}

interface FocusCycleInput {
  focusableCount: number;
  activeIndex: number;
  shiftKey: boolean;
  focusInsidePanel: boolean;
}

type FocusCycleTarget = 'first' | 'last' | 'panel' | null;

test('helper puro cobre o ciclo completo de Tab e Shift+Tab', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const loaded = await vite.ssrLoadModule('/components/MobileNavigationDrawer.tsx');
  const getFocusCycleTarget = loaded.getFocusCycleTarget as (
    input: FocusCycleInput,
  ) => FocusCycleTarget;

  assert.equal(
    getFocusCycleTarget({
      focusableCount: 0,
      activeIndex: -1,
      shiftKey: false,
      focusInsidePanel: true,
    }),
    'panel',
  );
  assert.equal(
    getFocusCycleTarget({
      focusableCount: 3,
      activeIndex: 0,
      shiftKey: true,
      focusInsidePanel: true,
    }),
    'last',
  );
  assert.equal(
    getFocusCycleTarget({
      focusableCount: 3,
      activeIndex: 2,
      shiftKey: false,
      focusInsidePanel: true,
    }),
    'first',
  );
  assert.equal(
    getFocusCycleTarget({
      focusableCount: 3,
      activeIndex: 1,
      shiftKey: false,
      focusInsidePanel: true,
    }),
    null,
  );
  assert.equal(
    getFocusCycleTarget({
      focusableCount: 3,
      activeIndex: -1,
      shiftKey: false,
      focusInsidePanel: false,
    }),
    'first',
  );
  assert.equal(
    getFocusCycleTarget({
      focusableCount: 3,
      activeIndex: -1,
      shiftKey: true,
      focusInsidePanel: false,
    }),
    'last',
  );
});

test('drawer renderiza dialogo nomeado e nao renderiza quando fechado', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const loaded = await vite.ssrLoadModule('/components/MobileNavigationDrawer.tsx');
  const MobileNavigationDrawer = loaded.MobileNavigationDrawer as ComponentType<
    MobileNavigationDrawerProps
  >;
  const render = (open: boolean) =>
    renderToStaticMarkup(
      React.createElement(MobileNavigationDrawer, {
        open,
        current: { module: 'folha', page: 'dashboard' },
        onNavigate: () => undefined,
        onClose: () => undefined,
      }),
    );

  assert.equal(render(false), '');
  const markup = render(true);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="mobile-navigation-title"/);
  assert.match(markup, /id="mobile-navigation-title"[^>]*>SUPER FOLHA SYSTEM</);
  assert.match(markup, /padding-top:env\(safe-area-inset-top\)/);
  assert.match(markup, /padding-bottom:env\(safe-area-inset-bottom\)/);
  assert.match(markup, /w-\[min\(88vw,360px\)\]/);
  assert.match(markup, /z-\[10600\]/);
});

test('drawer oferece quatro caminhos de fechamento e protege cliques do painel', () => {
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-label="Fechar menu"/);
  assert.match(source, /onClick=\{onClose\}/);
  assert.match(source, /onItemSelected=\{onClose\}/);
  assert.match(source, /event\.target !== event\.currentTarget/);
});

test('drawer instala e remove listener, preserva scroll e restaura foco', () => {
  assert.match(source, /document\.addEventListener\('keydown', handleKeyDown\)/);
  assert.match(source, /document\.removeEventListener\('keydown', handleKeyDown\)/);
  assert.match(source, /const previousOverflow = document\.body\.style\.overflow/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /previousActive\?\.focus\(\{ preventScroll: true \}\)/);
});

test('estado fechado evita hooks e drawer nao herda recolhimento desktop', () => {
  const outerComponent = source.slice(source.indexOf('export const MobileNavigationDrawer'));

  assert.match(outerComponent, /if \(!open\) return null/);
  assert.match(outerComponent, /<OpenMobileNavigationDrawer/);
  assert.doesNotMatch(outerComponent, /useEffect\(|useFeriasNavigationBadge\(/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /collapsed/);
});

test('drawer reutiliza grupos e preserva o badge dinamico de Ferias', () => {
  assert.match(source, /<NavigationGroups/);
  assert.match(source, /useFeriasNavigationBadge/);
  assert.match(source, /badges=\{\{ ferias: feriasBadge \}\}/);
});
