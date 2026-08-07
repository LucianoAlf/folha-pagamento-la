import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('./ContasPagarPage.tsx', import.meta.url), 'utf8');

test('financial UI addresses Rose and does not label finance notes as Ana', () => {
  assert.match(pageSource, /Sugestão da \{CONTAS_FINANCE_OWNER\.name\}/);
  assert.match(pageSource, /Observações da \{CONTAS_FINANCE_OWNER\.name\}/);
  assert.match(pageSource, /Nota da \{CONTAS_FINANCE_OWNER\.name\}/);
  assert.doesNotMatch(pageSource, /Sugestão da Ana|Observações da Ana|Nota da Ana|Ana, registre/);
});
