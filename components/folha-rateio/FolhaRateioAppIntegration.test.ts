import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('mantem contas pagadoras como visao secundaria de lancamentos', () => {
  assert.match(appSource, /type LancamentosView = 'folha' \| 'contas_pagadoras'/);
  assert.match(appSource, /Folha do mês/);
  assert.match(appSource, /Contas pagadoras/);
  assert.match(appSource, /aria-pressed=\{lancamentosView === value\}/);
  assert.match(appSource, /lancamentosView === 'folha' \? \(/);
});

test('entrega folha e refresh real ao painel de contas pagadoras', () => {
  assert.match(appSource, /<FolhaRateioContasPanel/);
  assert.match(appSource, /folhaId=\{folhaAtual\.id\}/);
  assert.match(appSource, /lancamentos=\{lancamentos\}/);
  assert.match(appSource, /onLancamentosChanged=\{refetchLancamentosForRateio\}/);
  assert.match(appSource, /folhaStatus=\{folhaAtual\.status\}/);
  assert.match(appSource, /onFolhaChanged=\{refetchFolhaForRateio\}/);
  assert.match(appSource, /onOpenContasPagar=\{\(\) => handleNavigate\(\{ module: 'contas' \}\)\}/);
});

test('renders the closed status from the refreshed sheet record', () => {
  assert.match(appSource, /statusFolha === 'fechada'/);
  assert.match(appSource, /<Badge variant="success">Fechada<\/Badge>/);
});

test('isola o refresh estrito sem alterar os chamadores existentes da folha', () => {
  const silentRefreshSource = appSource.slice(
    appSource.indexOf('const refetchLancamentosSilent'),
    appSource.indexOf('const refetchLancamentosForRateio'),
  );
  const rateioRefreshSource = appSource.slice(
    appSource.indexOf('const refetchLancamentosForRateio'),
    appSource.indexOf('const saveLancamentoPatch'),
  );

  assert.doesNotMatch(silentRefreshSource, /throw err;/);
  assert.match(rateioRefreshSource, /throw new Error/);
  assert.match(rateioRefreshSource, /await api\.fetchLancamentos\(folhaAtual\.id\)/);
});
