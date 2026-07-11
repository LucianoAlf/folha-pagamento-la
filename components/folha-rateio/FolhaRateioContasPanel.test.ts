import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const componentUrl = new URL('./FolhaRateioContasPanel.tsx', import.meta.url);
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : '';

test('loads through cancellable service-only reads and supports external and internal refresh', () => {
  assert.match(source, /fetchFolhaContasPagadoras/);
  assert.match(source, /fetchFolhaRateioPreflight/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /let cancelled = false/);
  assert.match(source, /if \(cancelled\) return/);
  assert.match(source, /cancelled = true/);
  assert.match(source, /refreshToken = 0/);
  assert.match(source, /\[folhaId, refreshToken, reloadKey\]/);
  assert.match(source, /onLancamentosChanged: \(\) => Promise<void>/);
  assert.match(source, /await onLancamentosChanged\(\)/);
  assert.match(source, /setReloadKey\(/);
  assert.doesNotMatch(source, /from\(['"]lancamentos_folha['"]\)/);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});

test('owns the selected person and requires the parent refresh contract', () => {
  assert.match(source, /onLancamentosChanged:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(source, /editingPessoa/);
  assert.match(source, /<FolhaRateioContasModal/);
});

test('refreshes parent rows and preflight before closing after save', () => {
  assert.match(source, /await onLancamentosChanged\(\)/);
  assert.match(source, /await refreshResources\(\)/);
  assert.match(source, /setEditingPessoa\(null\)/);
  assert.match(source, /toastSuccess\(/);
  assert.ok(
    source.indexOf('await onLancamentosChanged()')
      < source.indexOf('await refreshResources()'),
  );
  assert.ok(
    source.indexOf('await refreshResources()')
      < source.indexOf('setEditingPessoa(null)'),
  );
});

test('owns the selected person, always offers adjustment, and renders the modal', () => {
  assert.match(source, /editingPessoa/);
  assert.match(source, /Ajustar divisao/);
  assert.match(source, /<FolhaRateioContasModal/);
  assert.match(source, /Divisao por conta atualizada/);
  assert.doesNotMatch(source, /onAdjustPessoa\?/);
});

test('keeps a saved person blocked after close until refresh succeeds', () => {
  assert.match(source, /pendingRefreshPessoaId/);
  assert.match(source, /setPendingRefreshPessoaId\(editingPessoa\?\.colaboradorId/);
  assert.match(source, /Atualizacao pendente/);
  assert.match(source, /disabled=\{refreshPending\}/);
});
