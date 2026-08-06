import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../_shared/interview-question-schema.mjs', import.meta.url), 'utf8');
const functionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('the AI contract requires neutral print fields with server-side signal limits', () => {
  assert.match(schema, /titulo_curto/);
  assert.match(schema, /sinal_consistencia/);
  assert.match(schema, /sinal_atencao/);
  assert.match(functionSource, /MAX_SIGNAL_LENGTH\s*=\s*90/);
  assert.match(functionSource, /sinal_consistencia/);
  assert.match(functionSource, /sinal_atencao/);
  assert.match(functionSource, /sinal_consistencia:\s*normalizarTexto\(pergunta\?\.sinal_consistencia,\s*MAX_SIGNAL_LENGTH\)/);
  assert.match(functionSource, /sinal_atencao:\s*normalizarTexto\(pergunta\?\.sinal_atencao,\s*MAX_SIGNAL_LENGTH\)/);
});

test('the generator prompt forbids behavioral labels in printed signals', () => {
  assert.match(functionSource, /sinais.*observaveis/i);
  assert.match(functionSource, /codinome/i);
  assert.match(functionSource, /perfil/i);
});
