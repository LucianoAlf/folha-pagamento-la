import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContasPagarPage.tsx', import.meta.url), 'utf8');

test('date filter uses active accounts, including paid historical entries', () => {
  assert.match(source, /const contasDataOperacional = useMemo/);
  assert.match(source, /if \(filtroTab === 'data'\) return contasDataOperacional;/);
  assert.match(source, /setDataFiltroInicio\(relatorioDataRef\);/);
  assert.match(source, /dataRef=\{relatorioDataRef\}/);

  const dataFilterBlock = source.match(/const contasDataOperacional = useMemo\(\(\) => \{[\s\S]+?\}, \[contas, matchesCommonFilters\]\);/)?.[0] || '';
  assert.ok(dataFilterBlock, 'contasDataOperacional block should be present');
  assert.doesNotMatch(dataFilterBlock, /status !== 'pago'/);
});
