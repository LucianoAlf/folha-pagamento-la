import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ContasPagarPage.tsx', import.meta.url), 'utf8');

test('codigo badges wait for codigo-mes load and do not depend on credenciais load', () => {
  assert.match(source, /const \[codigosCarregados, setCodigosCarregados\]/);
  assert.doesNotMatch(source, /Promise\.all\(\[\s*fetchCredenciais\(\),\s*fetchCodigosMes/);
  assert.match(source, /codigosPorConta=\{codigosCarregados \? codigosPorConta : undefined\}/);
});
