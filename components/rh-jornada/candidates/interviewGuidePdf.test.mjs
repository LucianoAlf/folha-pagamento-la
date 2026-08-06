import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./interviewGuidePdf.ts', import.meta.url), 'utf8');

test('PDF keeps each pillar heading with its first question', () => {
  assert.match(source, /ensureSpace\(9 \+ measureQuestionHeight\(group\.questions\[0\]\)\)/);
});

test('PDF keeps questions and evaluator blocks on a single page', () => {
  assert.match(source, /ensureSpace\(questionHeight\)/);
  assert.match(source, /addPage\(\);\s*doc\.setFont\('helvetica', 'bold'\)/);
});
