import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const componentUrl = new URL('./FolhaRateioContasPanel.tsx', import.meta.url);
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : '';

test('uses the shared UI and service-only read contracts', () => {
  assert.match(source, /import \{(?=[^}]*Card)(?=[^}]*Badge)(?=[^}]*Button)(?=[^}]*LoadingSpinner)(?=[^}]*ErrorState)[^}]*\} from '\.\.\/UI';/s);
  assert.match(source, /fetchFolhaContasPagadoras/);
  assert.match(source, /fetchFolhaRateioPreflight/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /buildFolhaRateioPessoas\(lancamentos, contas\)/);
  assert.doesNotMatch(source, /from\(['"]lancamentos_folha['"]\)/);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});

test('keeps the approved status labels, filter, and adjustment seam', () => {
  assert.match(source, /Todos/);
  assert.match(source, /Pendentes/);
  assert.match(source, /A conciliar/);
  assert.match(source, /Parcial/);
  assert.match(source, /Conciliado/);
  assert.match(source, /Ajustar divisao/);
  assert.match(source, /onAdjustPessoa\?\./);
  assert.match(source, /disabled=\{!onAdjustPessoa\}/);
  assert.match(source, /normalize\(['"]NFD['"]\)/);
});

test('uses semantic theme tokens without fixed payer columns or names', () => {
  assert.match(source, /bg-surface/);
  assert.match(source, /border-line/);
  assert.match(source, /text-primary/);
  assert.match(source, /text-secondary/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(source, /\bbg-white\b|\b(?:text|bg|border)-gray-/);
  assert.doesNotMatch(source, /gradient/i);
  assert.doesNotMatch(source, /grid-cols-4|EMLA|Kids|Matriz|Filial/i);
  assert.match(source, /pessoa\.contas\.map\(/);
});
