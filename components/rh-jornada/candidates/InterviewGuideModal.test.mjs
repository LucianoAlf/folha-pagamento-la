import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./InterviewGuideModal.tsx', import.meta.url), 'utf8');

test('guide modal uses one-time session storage and requires stale confirmation', () => {
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /sessionStorage\.removeItem/);
  assert.match(source, /window\.open/);
  assert.match(source, /perguntasDesatualizadas/);
  assert.match(source, /Gerar PDF mesmo assim/);
  assert.doesNotMatch(source, /URLSearchParams/);
});

test('guide modal reuses the global semantic date and time controls', () => {
  assert.match(source, /import \{ DatePicker, Modal, TimeSelect \} from ['"]\.\.\/\.\.\/UI['"]/);
  assert.match(source, /<DatePicker[\s\S]*value=\{data\}/);
  assert.match(source, /<TimeSelect[\s\S]*value=\{horario\s*\|\|\s*null\}/);
  assert.match(source, /<TimeSelect[\s\S]*allowEmpty/);
  assert.doesNotMatch(source, /type="date"/);
  assert.doesNotMatch(source, /type="time"/);
});
