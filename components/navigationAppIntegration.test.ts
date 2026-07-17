import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8');
const locationSource = readFileSync(new URL('./navigationLocation.ts', import.meta.url), 'utf8');

test('App importa e usa um unico contrato tipado de destino', () => {
  assert.match(appSource, /import \{ BottomNavigation \} from '.\/components\/BottomNavigation'/);
  assert.match(
    appSource,
    /import \{ MobileNavigationDrawer \} from '.\/components\/MobileNavigationDrawer'/,
  );
  assert.match(appSource, /getDefaultPage/);
  assert.match(appSource, /type ModuleId/);
  assert.match(appSource, /type NavigationDestination/);
  assert.match(appSource, /useState<ModuleId>/);
  assert.match(appSource, /const applyNavigationState = useCallback/);
  assert.match(appSource, /const handleNavigate = useCallback/);
  assert.match(appSource, /normalizeNavigationDestination\(next\)/);
  assert.doesNotMatch(appSource, /useState<'folha'\s*\|/);
  assert.doesNotMatch(appSource, /as 'folha'\s*\|/);
  assert.doesNotMatch(appSource, /handleNavigate\(\s*['"]/);
});

test('App monta Sidebar, drawer e barra sem casts nem barra inline antiga', () => {
  assert.match(
    appSource,
    /<Sidebar\s+current=\{\{ module: currentModule, page: activeTab \}\}\s+onNavigate=\{handleNavigate\}/s,
  );
  assert.match(appSource, /const \[mobileNavigationOpen, setMobileNavigationOpen\] = useState\(false\)/);
  assert.match(
    appSource,
    /const openMobileNavigation = useCallback\(\(\) => setMobileNavigationOpen\(true\), \[\]\)/,
  );
  assert.match(
    appSource,
    /const closeMobileNavigation = useCallback\(\(\) => setMobileNavigationOpen\(false\), \[\]\)/,
  );
  assert.match(appSource, /<MobileNavigationDrawer[\s\S]*?onClose=\{closeMobileNavigation\}/);
  assert.match(appSource, /<BottomNavigation[\s\S]*?onOpenMore=\{openMobileNavigation\}/);
  assert.doesNotMatch(appSource, /current=\{\{ module: currentModule as any/);
  assert.doesNotMatch(appSource, /grid-cols-6/);
  assert.doesNotMatch(appSource, /\{ id: 'notificacoes', label: 'Notif\.'/);
});

test('eventos, callsites e URLs usam NavigationDestination sem adaptador legado', () => {
  assert.match(appSource, /isModuleId\(requestedModule\)/);
  assert.match(
    appSource,
    /handleNavigate\(\{ module: requestedModule, page: detail\.page \}\)/,
  );
  assert.match(appSource, /onOpenContasPagar=\{\(\) => handleNavigate\(\{ module: 'contas' \}\)\}/);
  assert.match(appSource, /buildNavigationUrl\(/);
  assert.match(appSource, /window\.history\.pushState\(/);
  assert.match(appSource, /withNavigationHistoryState\(\{\}, normalized\)/);
});

test('deep links de cartoes, faturas e query tabs permanecem explicitos', () => {
  assert.match(locationSource, /pathname === '\/cartoes'/);
  assert.match(locationSource, /pathname === '\/faturas'/);
  assert.match(locationSource, /moduleParam === 'faturas'/);
  assert.match(locationSource, /params\.set\('tab', 'faturas'\)/);
  assert.match(locationSource, /params\.delete\('module'\)/);
  assert.match(locationSource, /params\.delete\('page'\)/);
});

test('App sincroniza carga inicial e popstate sem empilhar historico', () => {
  assert.match(appSource, /const synchronizeNavigationFromLocation = useCallback/);
  assert.match(appSource, /resolveNavigationLocation\(/);
  assert.match(appSource, /window\.history\.replaceState\(/);
  assert.match(appSource, /synchronizeNavigationFromLocation\(\)/);
  assert.match(
    appSource,
    /window\.addEventListener\('popstate', synchronizeNavigationFromLocation\)/,
  );
  assert.match(
    appSource,
    /window\.removeEventListener\('popstate', synchronizeNavigationFromLocation\)/,
  );
});

test('mudancas de aba tambem passam pela aplicacao centralizada', () => {
  assert.match(
    appSource,
    /startTabTransition\(\(\) => applyNavigationState\(\{ module: currentModule, page: tabId \}\)\)/,
  );
  assert.doesNotMatch(appSource, /startTabTransition\(\(\) => setActiveTab/);
  assert.doesNotMatch(appSource, /setActiveTab\('lancamentos'\)/);
});

test('Bistro permanece destino exato da Folha e nao reativa o atalho Folha', () => {
  assert.match(
    navigationSource,
    /id: 'bistro',[\s\S]*?destination: \{ module: 'folha', page: 'bistro' \},[\s\S]*?activeMode: 'exact'/,
  );
  assert.match(
    navigationSource,
    /id: 'folha',[\s\S]*?destination: \{ module: 'folha' \},[\s\S]*?excludedPages: \['bistro'\]/,
  );
});
