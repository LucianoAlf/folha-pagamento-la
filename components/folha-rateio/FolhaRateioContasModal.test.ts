import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const modalUrl = new URL('./FolhaRateioContasModal.tsx', import.meta.url);
const source = existsSync(modalUrl) ? readFileSync(modalUrl, 'utf8') : '';

test('creates a fresh draft per open and uses the shared responsive UI', () => {
  assert.match(source, /buildFolhaRateioDraft\(pessoa\.lancamentos, contas\)/);
  assert.match(source, /\[isOpen, pessoa, contas\]/);
  assert.match(source, /<Modal/);
  assert.match(source, /<Badge/);
  assert.match(source, /<Button/);
  assert.match(source, /<CustomSelect/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden lg:block/);
  assert.doesNotMatch(source, /<Card\b/);
});

test('writes only through saveFolhaRateio and cannot repeat a completed remote save', () => {
  assert.match(source, /saveFolhaRateio\(/);
  assert.match(source, /savedRemotely/);
  assert.match(source, /Tentar atualizar/);
  assert.doesNotMatch(source, /\.from\(['"]lancamentos_folha['"]\)/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch(source, /supabase|\bRPC\b|backend|folha_rateio_contas_salvar/i);
});

test('shows exact component differences and keeps the save action disabled until valid', () => {
  assert.match(source, /validateFolhaRateioDraft\(draft\)/);
  assert.match(source, /restanteCentavos/);
  assert.match(source, /disabled=\{[^}]*!validation\.valid/s);
  assert.match(source, /Total da pessoa/);
  assert.match(source, /Total distribuido/);
  assert.match(source, /Diferenca/);
});

test('derives payer columns dynamically without fixed payer names or a four-column layout', () => {
  assert.match(source, /draft\.contas\.map\(/);
  assert.doesNotMatch(source, /EMLA|Kids/i);
  assert.doesNotMatch(source, /grid-cols-4|repeat\(4|conta[1-4]/);
});

test('uses semantic design tokens without fixed light surfaces or decorative gradients', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}|bg-white|bg-gray|text-gray|gradient/i);
  assert.match(source, /bg-(?:bg|surface|surface-2)/);
  assert.match(source, /text-(?:primary|secondary|muted|success|danger)/);
});
