import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const bistroSource = readFileSync(new URL('./BistroTab.tsx', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../../services/folhaDreService.ts', import.meta.url), 'utf8');

test('Lancamentos uses the audited DRE snapshot to separate Bistro and other discounts', () => {
  assert.match(appSource, /fetchFolhaDreSnapshot/);
  assert.match(appSource, /buildFolhaBistroBreakdown/);
  assert.match(appSource, /sumBistroLiquidado/);
  assert.match(appSource, /sumOutrosDescontos/);
  assert.match(appSource, /Bistrô liquidado/);
  assert.match(appSource, /outrosDescontos/);
});

test('Bistro explains gross composition and shows payroll reconciliation', () => {
  assert.match(bistroSource, /buildBistroReconciliation/);
  assert.match(bistroSource, /Vendas por canais/);
  assert.match(bistroSource, /Consumo de colaboradores/);
  assert.match(bistroSource, /Liquidado na folha/);
  assert.match(bistroSource, /Pago diretamente ao Bistrô/);
  assert.doesNotMatch(bistroSource, /Pendente de liquidação/);
});

test('Bistro keeps the table on desktop and renders a touch-friendly mobile list', () => {
  assert.match(bistroSource, /lg:hidden/);
  assert.match(bistroSource, /hidden lg:block/);
  assert.match(bistroSource, /bg-surface-2/);
  assert.match(bistroSource, /min-h-10 min-w-10/);
});

test('Bistro keeps reconciliation visible and collapses only the collaborator list by default', () => {
  assert.match(bistroSource, /\[consumosExpanded,\s*setConsumosExpanded\]\s*=\s*useState\(false\)/);
  assert.match(bistroSource, /aria-expanded=\{consumosExpanded\}/);
  assert.match(bistroSource, /aria-controls="bistro-consumos-lista"/);
  assert.match(bistroSource, /id="bistro-consumos-lista"/);
  assert.match(bistroSource, /ChevronDown/);
  assert.match(bistroSource, /consumosExpanded\s*\?\s*\(/);
  assert.ok(
    bistroSource.indexOf('ConciliaÃ§Ã£o com a folha') < bistroSource.indexOf('id="bistro-consumos-lista"'),
    'reconciliation should remain outside the collapsible list',
  );
});

test('DRE snapshot integration is read-only', () => {
  assert.match(serviceSource, /\.from\('vw_folha_dre_analitico'\)/);
  assert.match(serviceSource, /\.select\(/);
  assert.doesNotMatch(serviceSource, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});
