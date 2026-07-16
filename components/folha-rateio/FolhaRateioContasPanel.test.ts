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
  const handleSavedStart = source.indexOf('const handleSaved = async () =>');
  const retryStart = source.indexOf('\n  const retryPendingRefresh', handleSavedStart);
  const effectStart = source.indexOf('\n  useEffect(', handleSavedStart);
  const handleSavedEnd = retryStart >= 0 ? retryStart : effectStart;
  const handleSavedSource = source.slice(handleSavedStart, handleSavedEnd);

  assert.match(source, /await onLancamentosChanged\(\)/);
  assert.match(source, /await refreshResources\(\)/);
  assert.equal(handleSavedSource.match(/await refreshResources\(\)/g)?.length, 1);
  assert.doesNotMatch(handleSavedSource, /setReloadKey\(/);
  assert.match(source, /const refreshResources = async \(\) => \{[\s\S]*?setError\(null\)/);
  assert.match(handleSavedSource, /dispatchSelectionLifecycle\(\{ type: 'refresh_succeeded', folhaId \}\)/);
  assert.match(source, /toastSuccess\(/);
  assert.ok(
    source.indexOf('await onLancamentosChanged()')
      < source.indexOf('await refreshResources()'),
  );
  assert.ok(
    handleSavedSource.indexOf('await refreshResources()')
      < handleSavedSource.indexOf("dispatchSelectionLifecycle({ type: 'refresh_succeeded', folhaId })"),
  );
});

test('owns the selected person, always offers adjustment, and renders the modal', () => {
  assert.match(source, /editingPessoa/);
  assert.match(source, /Ajustar divisao/);
  assert.match(source, /<FolhaRateioContasModal/);
  assert.match(source, /Divisao por conta atualizada/);
  assert.doesNotMatch(source, /onAdjustPessoa\?/);
});

test('offers an explicit refresh retry after close without reopening save', () => {
  assert.match(source, /pendingRefreshPessoaId/);
  assert.match(source, /type: 'refresh_failed',[\s\S]*?colaboradorId: editingPessoa\.colaboradorId/);
  assert.match(source, /const retryPendingRefresh = async \(colaboradorId: number\)/);
  assert.match(source, /Tentar atualizar/);
  assert.match(source, /retryPendingRefresh\(pessoa\.colaboradorId\)/);
  assert.doesNotMatch(source, /disabled=\{refreshPending\}/);
});

test('clears editing and pending refresh state whenever the active payroll changes', () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*?dispatchSelectionLifecycle\(\{ type: 'folha_changed', folhaId \}\)[\s\S]*?setPendingRefreshError\(null\)[\s\S]*?\}, \[folhaId\]\)/,
  );
});

test('uses the executable folha-keyed selection lifecycle instead of parallel selection state', () => {
  assert.match(source, /useReducer\(\s*folhaRateioPanelSelectionReducer/);
  assert.match(source, /selectionLifecycle\.folhaId/);
  assert.doesNotMatch(source, /const \[editingPessoa, setEditingPessoa\]/);
  assert.doesNotMatch(source, /const \[pendingRefreshPessoaId, setPendingRefreshPessoaId\]/);
  assert.doesNotMatch(source, /const \[refreshingPessoaId, setRefreshingPessoaId\]/);
});

test('offers guarded close and reopen actions with shared confirmation dialogs', () => {
  assert.match(source, /folhaStatus:\s*FolhaMensal\['status'\]/);
  assert.match(source, /fecharFolha/);
  assert.match(source, /reabrirFolha/);
  assert.match(source, /<ConfirmDialog/);
  assert.match(source, /Fechar folha/);
  assert.match(source, /Reabrir folha/);
  assert.match(source, /disabled=\{[^}]*!canClose/);
  assert.match(source, /Ainda nao esta pronto/);
  assert.doesNotMatch(source, />[^<]*RPC[^<]*</i);
});

test('refreshes the real sheet status and preflight after every lifecycle action', () => {
  assert.match(source, /onFolhaChanged:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(source, /await onFolhaChanged\(\)/);
  assert.match(source, /await refreshResources\(\)/);
  assert.match(source, /onOpenContasPagar:\s*\(\)\s*=>\s*void/);
  assert.match(source, /Abrir Contas a Pagar/);
});
