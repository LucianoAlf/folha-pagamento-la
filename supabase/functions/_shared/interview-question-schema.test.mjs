import assert from 'node:assert/strict';
import test from 'node:test';
import { INTERVIEW_QUESTION_RESPONSE_SCHEMA } from './interview-question-schema.mjs';

test('contrato de roteiro exige de seis a nove perguntas com pilares permitidos', () => {
  const perguntas = INTERVIEW_QUESTION_RESPONSE_SCHEMA.properties.perguntas;

  assert.equal(perguntas.minItems, 6);
  assert.equal(perguntas.maxItems, 9);
  assert.deepEqual(perguntas.items.properties.pilar.enum, ['comportamental', 'cultura', 'tecnica']);
  assert.deepEqual(perguntas.items.required, [
    'pilar',
    'pergunta',
    'ancora',
    'titulo_curto',
    'sinal_consistencia',
    'sinal_atencao',
  ]);
});
