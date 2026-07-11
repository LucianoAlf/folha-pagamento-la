import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const componentUrl = new URL('./FolhaRateioContasPanel.tsx', import.meta.url);
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : '';

test('loads through cancellable service-only reads and supports external refresh', () => {
  assert.match(source, /fetchFolhaContasPagadoras/);
  assert.match(source, /fetchFolhaRateioPreflight/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /let cancelled = false/);
  assert.match(source, /if \(cancelled\) return/);
  assert.match(source, /cancelled = true/);
  assert.match(source, /refreshToken = 0/);
  assert.match(source, /\[folhaId, refreshToken, reloadKey\]/);
  assert.doesNotMatch(source, /from\(['"]lancamentos_folha['"]\)/);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});
