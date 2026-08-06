import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('comparativo consulta notas específicas e inclui no hash', () => {
  assert.match(source, /from\("contas_anomalia_notas"\)/);
  assert.match(source, /recorrente_modelo_id/);
  assert.match(source, /notas_anomalias/);
  assert.match(source, /inputHash = await sha256Hex\(JSON\.stringify\(inputObject\)\)/);
});

test('contrato de saída aceita rascunho nullable e chave estável', () => {
  assert.match(source, /sugestao_justificativa/);
  assert.match(source, /chave_referencia/);
  assert.match(source, /MAX_AI_DRAFT_LENGTH|truncateAiDraft/);
});

test('fallback não inventa justificativa', () => {
  assert.match(source, /sugestao_justificativa:\s*null/);
});
