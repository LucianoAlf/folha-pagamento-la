import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('audit function addresses finance owner as Rose and keeps legacy cache compatibility', () => {
  assert.match(source, /replaceAll\("Ana", "Rose"\)/);
  assert.match(source, /pergunta_para_rose/);
  assert.match(source, /anomalia\.pergunta_para_ana/);
  assert.match(source, /ANALYSIS_VERSION = 3/);
});
