import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./DashboardTab.tsx', import.meta.url), 'utf8');

test('primeira carga do Dashboard depende de uma unica leitura de bootstrap', () => {
  assert.match(source, /rhJornadaService\.fetchDashboardBootstrap\(\)/);
  assert.doesNotMatch(source, /Promise\.all\(\[\s*rhJornadaService\.fetchDashboardKpis\(\)/s);
});

test('Dashboard mostra estrutura imediata em vez de retornar somente spinner global', () => {
  assert.match(source, /DashboardLoadingSkeleton/);
  assert.doesNotMatch(source, /if \(loading\) return <LoadingSpinner\s*\/>/);
});
