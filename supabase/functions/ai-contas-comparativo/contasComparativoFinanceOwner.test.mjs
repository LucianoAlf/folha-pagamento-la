import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('comparative function invalidates old owner wording', () => {
  assert.match(source, /ANALYSIS_VERSION = 3/);
  assert.match(source, /replaceAll\("Ana", "Rose"\)/);
});
