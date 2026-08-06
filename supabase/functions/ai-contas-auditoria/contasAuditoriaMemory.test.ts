import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('auditoria preserva identidade e rascunho nullable', () => {
  assert.match(source, /recorrente_modelo_id/);
  assert.match(source, /plano_conta_id/);
  assert.match(source, /notas_anomalias/);
  assert.match(source, /sugestao_justificativa/);
  assert.match(source, /sugestao_justificativa:\s*null/);
});
