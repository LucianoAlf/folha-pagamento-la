import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createServer, type Plugin } from 'vite';
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

const browserHarnessHtml = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body, #root { height: 100%; margin: 0; }
      button { min-height: 32px; }
      #external-fab { position: fixed; right: 2px; top: 100px; z-index: 12000; width: 40px; height: 40px; overflow: hidden; }
      .fixed { position: fixed; }
      .absolute { position: absolute; }
      .inset-0 { inset: 0; }
      .inset-y-0 { bottom: 0; top: 0; }
      .left-0 { left: 0; }
      [class*="z-[10600]"] { z-index: 10600; }
      [class*="z-[13000]"] { z-index: 13000; }
      [class*="bg-black/55"] { background: rgba(0, 0, 0, 0.55); }
      [role="dialog"] { background: white; display: flex; flex-direction: column; width: min(88vw, 360px); }
      [role="dialog"] nav { overflow: auto; }
      @media (min-width: 1024px) {
        .mobile-only, [class~="lg:hidden"] { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/components/MobileNavigationDrawer.browser.tsx"></script>
  </body>
</html>`;

const badgeStubPlugin: Plugin = {
  name: 'mobile-navigation-drawer-badge-stub',
  enforce: 'pre',
  resolveId(id, importer) {
    if (
      id === './useFeriasNavigationBadge' &&
      importer?.endsWith('/components/MobileNavigationDrawer.tsx')
    ) {
      return '\0mobile-navigation-drawer-badge-stub';
    }
    return null;
  },
  load(id) {
    if (id === '\0mobile-navigation-drawer-badge-stub') {
      return 'export function useFeriasNavigationBadge() { return undefined; }';
    }
    return null;
  },
  configureServer(server) {
    server.middlewares.use(
      '/__mobile-navigation-drawer__',
      async (_request, response, next) => {
        try {
          const html = await server.transformIndexHtml(
            '/__mobile-navigation-drawer__',
            browserHarnessHtml,
          );
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(html);
        } catch (error) {
          next(error);
        }
      },
    );
  },
};

async function createBrowserHarness(t: test.TestContext) {
  const vite = await createServer({
    logLevel: 'silent',
    plugins: [badgeStubPlugin],
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer?.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });

  const reset = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/__mobile-navigation-drawer__`);
    await page.waitForFunction(() => Boolean(window.drawerHarness));
  };

  t.after(async () => {
    await browser.close();
    await vite.close();
  });
  await reset();
  return { baseUrl, externalRequests, page, reset };
}

const snapshot = (page: Page) => page.evaluate(() => window.drawerHarness.getSnapshot());

async function openDrawer(page: Page) {
  await page.locator('#mobile-trigger').click();
  await page.locator('[role="dialog"]').waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Fechar menu',
  );
}

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
  assert.match(markup, /z-\[13000\]/);
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
  assert.match(source, /isFocusRestorable\(previousActive\)/);
  assert.match(source, /window\.matchMedia\('\(min-width: 1024px\)'\)/);
  assert.match(source, /desktopMedia\.addEventListener\('change'/);
  assert.match(source, /desktopMedia\.removeEventListener\('change'/);
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

test('drawer cumpre interacoes e lifecycle em DOM real', async (t) => {
  const { externalRequests, page, reset } = await createBrowserHarness(t);

  await t.test('painel nao fecha no clique, backdrop fecha e camada cobre FAB externo', async () => {
    await openDrawer(page);
    await page.getByRole('heading', { name: 'SUPER FOLHA SYSTEM' }).click();
    assert.equal((await snapshot(page)).closeVersions.length, 0);

    const layer = await page.evaluate(() => {
      const external = document.getElementById('external-fab') as HTMLElement;
      const overlay = document.querySelector('[role="dialog"]')?.parentElement as HTMLElement;
      const rect = external.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        externalZ: getComputedStyle(external).zIndex,
        overlayCoversPoint: top === overlay || overlay.contains(top),
        overlayZ: getComputedStyle(overlay).zIndex,
      };
    });
    assert.deepEqual(layer, {
      externalZ: '12000',
      overlayCoversPoint: true,
      overlayZ: '13000',
    });

    await page.mouse.click(380, 400);
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    const afterBackdrop = await snapshot(page);
    assert.equal(afterBackdrop.closeVersions.length, 1);
    assert.equal(afterBackdrop.externalClicks, 0);
  });

  await t.test('X, Escape e selecao fecham e listener nao sobrevive ao close', async () => {
    await reset();
    await openDrawer(page);
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    assert.equal((await snapshot(page)).closeVersions.length, 1);

    await openDrawer(page);
    await page.keyboard.press('Escape');
    assert.equal((await snapshot(page)).closeVersions.length, 2);
    await page.keyboard.press('Escape');
    assert.equal((await snapshot(page)).closeVersions.length, 2);

    await openDrawer(page);
    await page.getByRole('button', { name: 'Contas a Pagar' }).click();
    const afterSelection = await snapshot(page);
    assert.equal(afterSelection.closeVersions.length, 3);
    assert.deepEqual(afterSelection.navigations.at(-1), { module: 'contas' });
  });

  await t.test('trap ignora future disabled e scroll/foco sao restaurados', async () => {
    await reset();
    await page.evaluate(() => {
      document.body.style.overflow = 'clip';
    });
    await openDrawer(page);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(
      await page.getByRole('button', { name: 'Dashboard financeiro, Em breve' }).isDisabled(),
      true,
    );

    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Notifica\u00e7\u00f5es',
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Fechar menu',
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Contas a Pagar',
    );

    await page.getByRole('button', { name: 'Fechar menu' }).click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'clip');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'mobile-trigger');
  });

  await t.test('callback atualizado e unmount/remount limpam efeitos', async () => {
    await reset();
    await openDrawer(page);
    await page.evaluate(() => window.drawerHarness.setCallbackVersion(2));
    await page.waitForFunction(() => window.drawerHarness.getSnapshot().callbackVersion === 2);
    await page.keyboard.press('Escape');
    assert.deepEqual((await snapshot(page)).closeVersions, [2]);

    await page.evaluate(() => {
      document.body.style.overflow = 'auto';
      window.drawerHarness.setOpen(true);
    });
    await page.locator('[role="dialog"]').waitFor();
    await page.evaluate(() => window.drawerHarness.setMounted(false));
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
    await page.keyboard.press('Escape');
    assert.deepEqual((await snapshot(page)).closeVersions, [2]);

    await page.evaluate(() => {
      window.drawerHarness.setOpen(false);
      window.drawerHarness.setMounted(true);
    });
    await page.locator('#mobile-trigger').click();
    await page.locator('[role="dialog"]').waitFor();
    assert.equal((await snapshot(page)).open, true);
  });

  await t.test('resize desktop fecha, limpa efeitos e nao foca trigger oculto', async () => {
    await reset();
    await page.evaluate(() => {
      document.body.style.overflow = 'scroll';
      window.focusRestoreAttempts = 0;
      const trigger = document.getElementById('mobile-trigger') as HTMLButtonElement;
      const originalFocus = trigger.focus.bind(trigger);
      trigger.focus = (...args) => {
        window.focusRestoreAttempts = (window.focusRestoreAttempts ?? 0) + 1;
        originalFocus(...args);
      };
    });
    await openDrawer(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => window.drawerHarness.getSnapshot().open === false, null, {
      timeout: 2000,
    });

    assert.equal(await page.evaluate(() => document.body.style.overflow), 'scroll');
    assert.equal(await page.evaluate(() => window.focusRestoreAttempts), 0);
    assert.equal((await snapshot(page)).closeVersions.length, 1);
  });

  await t.test('cleanup nao tenta focar elemento desconectado', async () => {
    await reset();
    await page.evaluate(() => {
      window.focusRestoreAttempts = 0;
      const trigger = document.getElementById('mobile-trigger') as HTMLButtonElement;
      const originalFocus = trigger.focus.bind(trigger);
      trigger.focus = (...args) => {
        window.focusRestoreAttempts = (window.focusRestoreAttempts ?? 0) + 1;
        originalFocus(...args);
      };
    });
    await openDrawer(page);
    await page.evaluate(() => window.drawerHarness.setShowTrigger(false));
    await page.locator('#mobile-trigger').waitFor({ state: 'detached' });
    await page.evaluate(() => window.drawerHarness.setMounted(false));
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.focusRestoreAttempts), 0);
  });

  assert.deepEqual(externalRequests, []);
});
