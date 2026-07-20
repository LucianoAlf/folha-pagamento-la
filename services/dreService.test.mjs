import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dreService.ts', import.meta.url), 'utf8');

test('DRE reads only through the two dedicated RPC contracts', () => {
  assert.match(source, /supabase\.rpc\('dre_consultar'/);
  assert.match(source, /p_competencia:\s*competencia/);
  assert.match(source, /p_regime:\s*regime/);
  assert.match(source, /p_unidade:\s*unidade/);
  assert.match(source, /supabase\.rpc\('dre_detalhes'/);
  assert.match(source, /p_unidade:\s*args\.unidade/);
  assert.match(source, /p_cursor:\s*cursor/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.(insert|update|delete)\(/);
});

test('DRE service requires the selected operational unit in both public APIs', () => {
  assert.match(source, /DreUnidade/);
  assert.match(source, /regime:\s*DreRegime,\s*\n\s*unidade:\s*DreUnidade/);
  assert.match(source, /regime:\s*DreRegime;\s*\n\s*unidade:\s*DreUnidade;/);
});
