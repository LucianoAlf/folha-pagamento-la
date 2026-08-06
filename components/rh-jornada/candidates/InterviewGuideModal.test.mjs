import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./InterviewGuideModal.tsx', import.meta.url), 'utf8');

test('guide modal uses one-time session storage and requires stale confirmation', () => {
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /sessionStorage\.removeItem/);
  assert.match(source, /window\.open/);
  assert.match(source, /perguntasDesatualizadas/);
  assert.match(source, /Imprimir mesmo assim/);
  assert.doesNotMatch(source, /URLSearchParams/);
});
