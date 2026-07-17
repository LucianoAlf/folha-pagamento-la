import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import test from 'node:test';
import { createServer, type Plugin } from 'vite';
import {
  buildNavigationUrl,
  normalizeNavigationDestination,
  resolveNavigationLocation,
  withNavigationHistoryState,
} from './navigationLocation.ts';

test('resolve paths canonicos e aliases sem perder query ou hash', () => {
  assert.deepEqual(
    resolveNavigationLocation({
      pathname: '/cartoes',
      search: '?tab=faturas',
      hash: '#limites',
    }),
    { destination: { module: 'cartoes' } },
  );

  assert.deepEqual(
    resolveNavigationLocation({
      pathname: '/faturas',
      search: '?origem=atalho',
      hash: '#lista',
    }),
    {
      destination: { module: 'cartoes' },
      canonicalUrl: '/cartoes?origem=atalho&tab=faturas#lista',
    },
  );
});

test('resolve e limpa module/page legados com precedencia sobre history state', () => {
  const staleState = withNavigationHistoryState({}, {
    module: 'notificacoes',
    page: 'notificacoes',
  });

  assert.deepEqual(
    resolveNavigationLocation({
      pathname: '/',
      search: '?module=agenda&page=agenda&tab=semana',
      hash: '#hoje',
      state: staleState,
    }),
    {
      destination: { module: 'agenda', page: 'agenda' },
      canonicalUrl: '/?tab=semana#hoje',
    },
  );

  assert.deepEqual(
    resolveNavigationLocation({
      pathname: '/',
      search: '?module=faturas&page=ignorada&origem=pwa',
      hash: '',
    }),
    {
      destination: { module: 'cartoes' },
      canonicalUrl: '/cartoes?origem=pwa&tab=faturas',
    },
  );
});

test('history state distingue destinos que compartilham a raiz', () => {
  const state = withNavigationHistoryState({ preserved: 7 }, {
    module: 'folha',
    page: 'bistro',
  });

  assert.deepEqual(state, {
    preserved: 7,
    navigation: { module: 'folha', page: 'bistro' },
  });
  assert.deepEqual(
    resolveNavigationLocation({ pathname: '/', search: '', hash: '', state }),
    { destination: { module: 'folha', page: 'bistro' } },
  );
  assert.deepEqual(normalizeNavigationDestination({ module: 'contas' }), {
    module: 'contas',
    page: 'dashboard',
  });
});

test('URL de navegacao preserva tabs e remove apenas module/page legados', () => {
  assert.equal(
    buildNavigationUrl(
      { module: 'cartoes' },
      '?module=agenda&page=agenda&tab=faturas&origem=menu',
      '#limites',
    ),
    '/cartoes?tab=faturas&origem=menu#limites',
  );
  assert.equal(
    buildNavigationUrl({ module: 'agenda' }, '?tab=semana', '#hoje'),
    '/?tab=semana#hoje',
  );
});

test('URL de navegacao remove filtros exclusivos de faturas ao sair de Cartoes', () => {
  assert.equal(
    buildNavigationUrl(
      { module: 'folha', page: 'bistro' },
      '?tab=faturas&cartaoId=cartao-2270&origem=menu',
      '#consumos',
    ),
    '/?origem=menu#consumos',
  );
});

const browserPagePlugin: Plugin = {
  name: 'navigation-location-browser-page',
  configureServer(server) {
    server.middlewares.use('/__navigation-location__', (_request, response) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html><body>navigation history harness</body></html>');
    });
  },
};

test('Back e Forward reaplicam destinos reais sem criar entradas no popstate', async (t) => {
  const vite = await createServer({
    logLevel: 'silent',
    plugins: [browserPagePlugin],
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer?.address() as AddressInfo;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  t.after(async () => {
    await browser.close();
    await vite.close();
  });

  await page.goto(`http://127.0.0.1:${address.port}/__navigation-location__`);
  const result = await page.evaluate(async () => {
    const modulePath = '/components/navigationLocation.ts';
    const navigation = await import(/* @vite-ignore */ modulePath);
    let current = navigation.normalizeNavigationDestination({ module: 'folha' });

    const currentUrl = () =>
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const applyNavigationState = (next: { module: string; page?: string }) => {
      current = navigation.normalizeNavigationDestination(next);
    };
    const synchronizeNavigationFromLocation = () => {
      const resolution = navigation.resolveNavigationLocation({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        state: window.history.state,
      });
      const normalized = navigation.normalizeNavigationDestination(resolution.destination);
      window.history.replaceState(
        navigation.withNavigationHistoryState(window.history.state, normalized),
        '',
        resolution.canonicalUrl ?? currentUrl(),
      );
      applyNavigationState(normalized);
    };
    const handleNavigate = (next: { module: string; page?: string }) => {
      const normalized = navigation.normalizeNavigationDestination(next);
      const targetUrl = navigation.buildNavigationUrl(
        normalized,
        window.location.search,
        window.location.hash,
      );
      const destinationChanged = !navigation.isSameNavigationDestination(
        current,
        normalized,
      );
      applyNavigationState(normalized);
      if (destinationChanged || targetUrl !== currentUrl()) {
        window.history.pushState(
          navigation.withNavigationHistoryState({}, normalized),
          '',
          targetUrl,
        );
      }
    };
    const traverse = (direction: 'back' | 'forward') =>
      new Promise<{ destination: typeof current; url: string }>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('popstate timeout')), 2000);
        window.addEventListener(
          'popstate',
          () => {
            window.clearTimeout(timeout);
            window.setTimeout(
              () => resolve({ destination: current, url: currentUrl() }),
              0,
            );
          },
          { once: true },
        );
        window.history[direction]();
      });

    window.addEventListener('popstate', synchronizeNavigationFromLocation);
    synchronizeNavigationFromLocation();
    handleNavigate({ module: 'contas' });
    handleNavigate({ module: 'folha', page: 'bistro' });
    window.history.pushState({}, '', '/?module=agenda&page=agenda&tab=semana');
    handleNavigate({ module: 'cartoes' });
    const historyLengthBeforeTraversal = window.history.length;

    const backToAgenda = await traverse('back');
    const backToBistro = await traverse('back');
    const backToContas = await traverse('back');
    const backToFolha = await traverse('back');
    const forwardToContas = await traverse('forward');
    const forwardToBistro = await traverse('forward');
    const forwardToAgenda = await traverse('forward');
    const forwardToCartoes = await traverse('forward');

    return {
      backToAgenda,
      backToBistro,
      backToContas,
      backToFolha,
      forwardToContas,
      forwardToBistro,
      forwardToAgenda,
      forwardToCartoes,
      historyLengthAfterTraversal: window.history.length,
      historyLengthBeforeTraversal,
    };
  });

  assert.deepEqual(result.backToAgenda, {
    destination: { module: 'agenda', page: 'agenda' },
    url: '/?tab=semana',
  });
  assert.deepEqual(result.backToBistro.destination, { module: 'folha', page: 'bistro' });
  assert.deepEqual(result.backToContas.destination, { module: 'contas', page: 'dashboard' });
  assert.deepEqual(result.backToFolha.destination, { module: 'folha', page: 'dashboard' });
  assert.deepEqual(result.forwardToContas.destination, { module: 'contas', page: 'dashboard' });
  assert.deepEqual(result.forwardToBistro.destination, { module: 'folha', page: 'bistro' });
  assert.deepEqual(result.forwardToAgenda, {
    destination: { module: 'agenda', page: 'agenda' },
    url: '/?tab=semana',
  });
  assert.deepEqual(result.forwardToCartoes.destination, {
    module: 'cartoes',
    page: 'cartoes',
  });
  assert.equal(result.historyLengthAfterTraversal, result.historyLengthBeforeTraversal);
});
