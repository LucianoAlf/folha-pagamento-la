import assert from 'node:assert/strict';
import test from 'node:test';
import { describeGeminiResponse, extractGeminiText } from './gemini-response.mjs';

test('extrai texto de todas as partes da resposta, ignorando thinking sem texto', () => {
  assert.equal(
    extractGeminiText({ candidates: [{ content: { parts: [{ thought: true }, { text: '{"perguntas":[]}' }] } }] }),
    '{"perguntas":[]}',
  );
});

test('descreve somente a estrutura quando a resposta nao contem texto', () => {
  const description = describeGeminiResponse({
    candidates: [{
      finishReason: 'MAX_TOKENS',
      content: { parts: [{ thought: true, thoughtSignature: 'opaque' }] },
    }],
  });

  assert.deepEqual(description, {
    candidateCount: 1,
    finishReason: 'MAX_TOKENS',
    partCount: 1,
    parts: [{ fields: ['thought', 'thoughtSignature'], textLength: null, thought: true }],
  });
});
