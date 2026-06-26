import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContasTable.tsx', import.meta.url), 'utf8');

test('urgent missing payment code badge explains the action instead of saying atualizar', () => {
  assert.match(source, /Coletar/);
  assert.match(source, /c[oó]digo\/PIX do m[eê]s/);
  assert.doesNotMatch(source, />Atualizar<\/span>/);
});
