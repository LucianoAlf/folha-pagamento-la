import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bistroService = readFileSync(new URL('./bistroService.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const bistroUi = readFileSync(new URL('../components/bistro/BistroTab.tsx', import.meta.url), 'utf8');

test('Bistro payroll writes go only through narrow RPC wrappers', () => {
  assert.match(bistroService, /folha_sugerir_desconto_bistro/);
  assert.match(bistroService, /folha_aplicar_sugestao_bistro/);
  assert.match(bistroService, /bistro_consumo_pagamento_direto_salvar/);
  assert.doesNotMatch(bistroService, /applyBistroDiscountsToFolha[\s\S]*?\.from\('lancamentos_folha'\)[\s\S]*?\.update\(/);
  assert.doesNotMatch(bistroService, /revertBistroDiscountsFromFolha[\s\S]*?\.from\('lancamentos_folha'\)[\s\S]*?\.update\(/);
});

test('duplication uses one atomic RPC and never three browser-side calls', () => {
  assert.match(apiSource, /folha_duplicar_lancamentos_preflight/);
  assert.match(apiSource, /folha_duplicar_lancamentos/);
  assert.doesNotMatch(appSource, /Promise\.all\([\s\S]*duplicateLancamentos/);
  assert.match(appSource, /source_hash/);
});

test('Bistro UI reviews one person at a time and makes direct payments explicit', () => {
  assert.match(bistroUi, /Revisar sugest/i);
  assert.match(bistroUi, /valor_pago_direto/);
  assert.match(bistroUi, /desconto_sem_origem/);
  assert.match(bistroUi, /pessoa por pessoa/i);
  assert.doesNotMatch(bistroUi, /Aplicar descontos na Folha/i);
});

test('Bistro review disables apply for every blocked or non-actionable backend status', () => {
  assert.match(bistroUi, /'sem_lancamento'/);
  assert.match(bistroUi, /'metadata mista'/);
  assert.match(bistroUi, /'consumo maior que a base disponivel'/);
  assert.match(bistroUi, /'sem_competencia'/);
  assert.match(bistroUi, /reviewPessoaPodeAplicar/);
  assert.match(bistroUi, /reviewPessoa\?\.status === 'pronto_aplicar'/);
  assert.match(bistroUi, /reviewPessoa\?\.status === 'desconto_sem_origem'/);
});
