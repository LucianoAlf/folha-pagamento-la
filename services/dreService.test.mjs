import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dreService.ts', import.meta.url), 'utf8');

test('DRE reads only through the two dedicated RPC contracts', () => {
  assert.match(source, /supabase\.rpc\('dre_consultar'/);
  assert.match(source, /p_competencia:\s*competencia/);
  assert.match(source, /p_regime:\s*regime/);
  assert.match(source, /supabase\.rpc\('dre_detalhes'/);
  assert.match(source, /p_cursor:\s*cursor/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.(insert|update|delete)\(/);
});
