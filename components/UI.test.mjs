import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./UI.tsx', import.meta.url), 'utf8');

test('TimeSelect supports optional empty values without changing required callers', () => {
  assert.match(source, /allowEmpty\?: boolean/);
  assert.match(source, /allowEmpty \? '' : '08:00'/);
  assert.match(source, /placeholder\?: string/);
});
