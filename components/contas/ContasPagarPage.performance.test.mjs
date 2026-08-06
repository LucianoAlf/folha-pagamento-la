import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./ContasPagarPage.tsx', import.meta.url), 'utf8');

test('prioriza as contas e deixa referencias em segundo plano', () => {
  assert.match(source, /withSupabaseReadTimeout\(/);
  assert.match(source, /fetchContasPagar\(\{ competenciaGarantir: competenciaFiltro \}, signal\)/);
  assert.match(source, /void loadReferences\(\);/);
  assert.doesNotMatch(source, /const \[planos, gruposPlano, usosPlano, centros, empresas, contasBanco, rows\] = await Promise\.all/);
});
