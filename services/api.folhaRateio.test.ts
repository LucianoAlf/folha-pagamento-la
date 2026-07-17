import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const duplicateStart = source.indexOf('async preflightDuplicateLancamentos');
const duplicateEnd = source.indexOf('async updateFolhaStatus', duplicateStart);
const duplicateBody =
  duplicateStart >= 0 && duplicateEnd > duplicateStart
    ? source.slice(duplicateStart, duplicateEnd)
    : '';
const appDuplicateStart = appSource.indexOf('const handleDuplicateAction');
const appDuplicateEnd = appSource.indexOf('const openCreateLancamento', appDuplicateStart);
const appDuplicateBody =
  appDuplicateStart >= 0 && appDuplicateEnd > appDuplicateStart
    ? appSource.slice(appDuplicateStart, appDuplicateEnd)
    : '';

test('duplicating a competence never copies payer-account reconciliation', () => {
  assert.ok(duplicateBody, 'payroll duplication API body not found');
  assert.doesNotMatch(duplicateBody, /conta_pagadora_id/);
});

test('duplicates a competence through preflight and one atomic RPC execution', () => {
  assert.match(duplicateBody, /supabase\.rpc\(['"]folha_duplicar_lancamentos_preflight['"]/);
  assert.match(duplicateBody, /supabase\.rpc\(['"]folha_duplicar_lancamentos['"]/);
  assert.match(duplicateBody, /p_unidades:\s*input\.unidades/);
  assert.match(duplicateBody, /p_source_hash_esperado:\s*input\.sourceHash/);
  assert.match(duplicateBody, /p_ator:\s*\{\}/);
  assert.doesNotMatch(duplicateBody, /Promise\.all/);
  assert.doesNotMatch(duplicateBody, /\/rest\/v1\/lancamentos_folha|method:\s*['"]POST['"]/);
});

test('the app preflights all selected units and executes duplication only once', () => {
  assert.ok(appDuplicateBody, 'handleDuplicateAction body not found');
  assert.match(
    appDuplicateBody,
    /duplicateConfig\.unidade\s*===\s*['"]todos['"][\s\S]*\[['"]cg['"],\s*['"]rec['"],\s*['"]bar['"]\]/,
  );
  assert.match(appDuplicateBody, /api\.preflightDuplicateLancamentos\(/);
  assert.match(appDuplicateBody, /pode_duplicar/);
  assert.match(appDuplicateBody, /source_hash/);
  assert.match(appDuplicateBody, /ambiguos\.map/);
  assert.match(appDuplicateBody, /conflitos\.map/);
  assert.match(appDuplicateBody, /JSON\.stringify\(value\)/);
  assert.match(appDuplicateBody, /Nada foi gravado/);
  assert.equal((appDuplicateBody.match(/api\.duplicateLancamentos\(/g) || []).length, 1);
  assert.doesNotMatch(appDuplicateBody, /Promise\.all/);
});
