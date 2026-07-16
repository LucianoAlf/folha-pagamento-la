import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./EditarContaModal.tsx', import.meta.url), 'utf8');

test('edit modal shows Maria audit stamp for agent-registered payment codes', () => {
  assert.match(source, /registrado_por_agente/);
  assert.match(source, /agente_nome/);
  assert.match(source, /confirmado_por_nome/);
  assert.match(source, />\s*Maria\s*</);
  assert.match(source, /Registro auditado/);
  assert.doesNotMatch(source, /codigo_barras.*Registro auditado|chave_pix.*Registro auditado|qr_pix_payload.*Registro auditado/);
});

test('edit modal does not require plano de conta for card invoice payables', () => {
  assert.match(source, /const isFaturaCartao = conta\.tipo_lancamento === 'fatura_cartao'/);
  assert.match(source, /!isContaGeradaSemPlano && !planoContaId/);
  assert.match(source, /Detalhamento no cartão/);
  assert.match(source, /evitando duplicidade/);
  assert.doesNotMatch(source, /disabled=\{saving \|\| !descricao\.trim\(\) \|\| !vencimento \|\| !\(valorNum > 0\) \|\| !planoContaId \|\| !centroCustoId\}/);
});

test('edit modal keeps payroll payables fixed and only allows operational adjustments', () => {
  assert.match(source, /const isFolhaPagamento = conta\.tipo_lancamento === 'folha_pagamento'/);
  assert.match(source, /const isContaGeradaSemPlano = isFaturaCartao \|\| isFolhaPagamento/);
  assert.match(source, /isFolhaPagamento[\s\S]*data_vencimento[\s\S]*observacoes/);
  assert.match(source, /Folha de pagamento/);
  assert.match(source, /Gerada no fechamento da folha/);
  assert.match(source, /Detalhamento na folha/);
  assert.match(source, /Valor definido pelo fechamento/);
  assert.match(source, /Competência definida pela folha/);
  assert.match(source, /!isContaGeradaSemPlano && !planoContaId/);
  assert.doesNotMatch(source, /tipo_lancamento:\s*isFolhaPagamento\s*\?\s*launchType/);
});
