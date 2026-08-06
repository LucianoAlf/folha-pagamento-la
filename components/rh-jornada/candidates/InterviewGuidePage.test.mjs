import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./InterviewGuidePage.tsx', import.meta.url), 'utf8');

test('print guide is isolated, light and does not render private anchors', () => {
  assert.match(source, /@media print/);
  assert.match(source, /position:\s*fixed/);
  assert.match(source, /counter\(page\)/);
  assert.match(source, /generateInterviewGuidePdf/);
  assert.match(source, /logo-LA-light\.png/);
  assert.doesNotMatch(source, /\.ancora/);
  assert.doesNotMatch(source, /questionario_respostas/);
});

test('print guide preserves question blocks and supports historical questions without signals', () => {
  assert.match(source, /break-inside:\s*avoid/);
  assert.match(source, /sinalConsistencia\s*\|\|\s*question\.sinalAtencao/);
  assert.match(source, /Baixar PDF/);
});

test('guide downloads a PDF without depending on the native print dialog', () => {
  assert.match(source, /generateInterviewGuidePdf/);
  assert.match(source, /Baixar PDF/);
  assert.doesNotMatch(source, /window\.print\(\)/);
});
