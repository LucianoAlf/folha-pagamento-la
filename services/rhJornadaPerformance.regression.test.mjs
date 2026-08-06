import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const rhPageSource = readFileSync(new URL('../components/rh-jornada/RhJornadaPage.tsx', import.meta.url), 'utf8');

function methodSource(source, name) {
  const start = source.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `Metodo ${name} precisa existir.`);
  const next = source.indexOf('\n  async ', start + 8);
  return source.slice(start, next === -1 ? source.length : next);
}

test('lista operacional de colaboradores nunca transfere fotos embutidas', () => {
  const method = methodSource(apiSource, 'fetchColaboradores');

  assert.match(method, /const listColumns = \[/);
  assert.match(method, /select=\$\{listColumns\.join\(','\)\}/);
  assert.doesNotMatch(method, /select=\*/);
  assert.doesNotMatch(method, /['\"]foto_url['\"]/);
});

test('bootstrap global nao baixa colaboradores ao abrir outro modulo', () => {
  assert.match(appSource, /if \(userEmail && currentModule === 'folha' && folhas\.length === 0\) \{\s*fetchMetadata\(\);\s*\}/);
  assert.doesNotMatch(appSource, /fetchMetadata\(\{ deferColaboradores: true \}\)/);
  assert.match(appSource, /currentModule === 'folha'[\s\S]{0,280}loadColaboradores\(\)/);
});

test('troca de aba da Jornada desmonta a aba anterior e cancela seus efeitos', () => {
  assert.doesNotMatch(rhPageSource, /visitedTabs/);
  assert.match(rhPageSource, /\{tabContent\[mode\]\}/);
});
