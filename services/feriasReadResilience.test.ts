import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./feriasService.ts', import.meta.url), 'utf8');
const badgeSource = readFileSync(new URL('../components/useFeriasNavigationBadge.ts', import.meta.url), 'utf8');

test('status de ferias repete a leitura quando o Supabase sofre timeout transitorio', () => {
  assert.match(source, /import \{ fetchRhRead \} from '\.\/rhReadResilience';/);

  const method = source.match(
    /async fetchColaboradoresStatus[\s\S]*?return colaboradores;\s*\n\s*},/,
  )?.[0];

  assert.ok(method, 'fetchColaboradoresStatus precisa continuar existindo');
  assert.match(method, /const statusColumns = \[/);
  assert.match(method, /select=\$\{statusColumns\.join\(','\)\}/);
  assert.doesNotMatch(method, /select=\*/);
  assert.doesNotMatch(method, /['"]foto_url['"]/);
  assert.match(method, /await fetchRhRead\(url, \{ headers \}, \{/);
  assert.match(method, /label: 'A lista de colaboradores de ferias'/);
  assert.doesNotMatch(method, /await fetch\(url, \{ headers \}\)/);
});

test('badge usa RPC dedicada em vez da listagem completa de colaboradores', () => {
  const badgeMethod = source.match(
    /async fetchBadgeCounts[\s\S]*?\n\s*},/,
  )?.[0];

  assert.ok(badgeMethod, 'fetchBadgeCounts precisa existir no service de ferias');
  assert.match(badgeMethod, /rpc\/ferias_badge_contadores/);
  assert.match(badgeMethod, /await fetchRhRead/);

  const loader = badgeSource.match(/async loadCounts\(\)[\s\S]*?\n\s*},/)?.[0];
  assert.ok(loader, 'loadCounts do badge precisa continuar existindo');
  assert.match(loader, /feriasService\.fetchBadgeCounts\(\)/);
  assert.doesNotMatch(loader, /fetchColaboradoresStatus/);
});

test('assinatura de auth usa ponte adiada para evitar deadlock do cliente Supabase', () => {
  assert.match(badgeSource, /createDeferredAuthStateListener\(listener\)/);
  assert.match(badgeSource, /deferredAuth\.notify\(event, session\?\.user\.id \?\? null\)/);
  assert.match(badgeSource, /deferredAuth\.dispose\(\)/);
});
