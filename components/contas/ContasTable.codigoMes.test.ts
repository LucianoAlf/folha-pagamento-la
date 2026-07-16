import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContasTable.tsx', import.meta.url), 'utf8');

test('urgent missing payment code badge explains the action instead of saying atualizar', () => {
  assert.match(source, /Coletar/);
  assert.match(source, /codigo\/PIX do mes|c[oó]digo\/PIX do m[eê]s/);
  assert.doesNotMatch(source, />Atualizar<\/span>/);
});

test('payment code badge shows a visible Maria stamp without exposing payment codes', () => {
  assert.match(source, /registrado_por_agente/);
  assert.match(source, />\s*Maria\s*</);
  assert.match(source, /Registrado por \$\{agente\}/);
  assert.doesNotMatch(source, /codigo_barras.*<|chave_pix.*<|qr_pix_payload.*</);
});

test('payroll payables have an explicit fixed-type badge', () => {
  assert.match(source, /c\.tipo_lancamento === 'folha_pagamento'/);
  assert.match(source, />\s*Folha de pagamento\s*</);
});
