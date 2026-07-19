import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const ui = readFileSync(new URL('components/UI.tsx', root), 'utf8');
const dre = readFileSync(new URL('components/dre/DrePage.tsx', root), 'utf8');
const contasReceber = readFileSync(
  new URL('components/contas-receber/ContasReceberPage.tsx', root),
  'utf8',
);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

test('design system exporta os controles financeiros compartilhados', () => {
  assert.match(ui, /export const CompetenciaPicker/);
  assert.match(ui, /export const SegmentedControl/);
  assert.match(ui, /export const StatCard/);
});

test('DRE e Contas a Receber consomem os controles compartilhados', () => {
  assert.match(dre, /<CompetenciaPicker/);
  assert.match(dre, /<SegmentedControl[\s\S]*ariaLabel="Regime do DRE"/);
  assert.match(dre, /<SegmentedControl[\s\S]*ariaLabel="Nível de detalhe"/);
  assert.match(dre, /<StatCard/);
  assert.doesNotMatch(dre, /const KpiCard/);

  assert.match(contasReceber, /<CompetenciaPicker/);
  assert.match(contasReceber, /<StatCard/);
  assert.doesNotMatch(contasReceber, /const KpiCard/);
});

test('telas financeiras nao usam seletor nativo de competencia', () => {
  const directories = ['dre', 'contas-receber', 'contas', 'cartoes'];
  const offenders = directories.flatMap((directory) =>
    sourceFiles(fileURLToPath(new URL(`components/${directory}/`, root))).filter((path) =>
      /type\s*=\s*["']month["']/i.test(readFileSync(path, 'utf8')),
    ),
  );

  assert.deepEqual(offenders, []);
});

test('calendario usa tokens semanticos para destaque e estados', () => {
  assert.doesNotMatch(ui, /#7c3aed|#8b5cf6|#64748b|#f43f5e/i);
  assert.match(ui, /rgb\(var\(--accent\)/);
  assert.match(ui, /rgb\(var\(--text-3\)/);
  assert.match(ui, /rgb\(var\(--danger\)/);
  assert.match(ui, /color:\s*var\(--rdp-accent-color-foreground\)/);
});

test('KPIs longos da DRE usam seis colunas apenas em telas realmente largas', () => {
  assert.match(dre, /grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6/);
});
