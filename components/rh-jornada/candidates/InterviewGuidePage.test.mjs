import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./InterviewGuidePage.tsx', import.meta.url), 'utf8');

test('print guide is isolated, light and does not render private anchors', () => {
  assert.match(source, /@media print/);
  assert.match(source, /position:\s*fixed/);
  assert.match(source, /counter\(page\)/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /logo-LA-light\.png/);
  assert.doesNotMatch(source, /\.ancora/);
  assert.doesNotMatch(source, /questionario_respostas/);
});

test('print guide preserves question blocks and supports historical questions without signals', () => {
  assert.match(source, /break-inside:\s*avoid/);
  assert.match(source, /sinalConsistencia\s*\|\|\s*question\.sinalAtencao/);
  assert.match(source, /Imprimir novamente/);
});

test('print action stays synchronous with the user click', () => {
  assert.match(source, /const print = \(\) => \{\s*window\.print\(\);\s*\};/);
  assert.doesNotMatch(source, /await waitForPrintAssets/);
  assert.doesNotMatch(source, /autoPrintStarted/);
});
