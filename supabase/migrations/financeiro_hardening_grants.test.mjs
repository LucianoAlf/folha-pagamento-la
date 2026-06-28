import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_7_financeiro_hardening_grants.sql', import.meta.url), 'utf8');

test('hardens authenticated grants on Fase 1 finance base tables', () => {
  assert.match(sql, /revoke all on public\.financeiro_empresas from authenticated/i);
  assert.match(sql, /revoke all on public\.financeiro_contas_bancarias from authenticated/i);
  assert.match(sql, /revoke all on public\.financeiro_documentos from authenticated/i);
});

test('keeps authenticated select-only and does not touch contas_pagar', () => {
  assert.match(sql, /grant select on public\.financeiro_empresas to authenticated/i);
  assert.match(sql, /grant select on public\.financeiro_contas_bancarias to authenticated/i);
  assert.match(sql, /grant select on public\.financeiro_documentos to authenticated/i);
  assert.doesNotMatch(sql, /contas_pagar/i);
});
