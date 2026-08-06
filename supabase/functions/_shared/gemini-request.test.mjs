import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeminiGenerateContentBody } from './gemini-request.mjs';

const schema = { type: 'object', properties: { perguntas: { type: 'array' } } };

test('Gemini 3 uses its current structured-output and thinking contract', () => {
  const body = buildGeminiGenerateContentBody('roteiro', {
    isGemini3: true,
    config: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });

  assert.deepEqual(body.generationConfig, {
    maxOutputTokens: 1800,
    thinkingConfig: { thinkingLevel: 'LOW' },
    responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } },
  });
});

test('Gemini 2.5 fallback keeps its legacy structured-output contract', () => {
  const body = buildGeminiGenerateContentBody('roteiro', {
    isGemini3: false,
    config: {
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });

  assert.equal(body.generationConfig.temperature, 0.2);
  assert.equal(body.generationConfig.topP, 0.9);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseJsonSchema, schema);
  assert.equal(body.generationConfig.responseFormat, undefined);
});
