import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const preflight = readFileSync(
  new URL('./20260710_3_folha_rateio_preflight.sql', import.meta.url),
  'utf8'
);

test('preflight is read-only and returns reconciliation diagnostics', () => {
  assert.match(preflight, /create or replace function public\.folha_rateio_contas_preflight\(p_folha_id integer\)/i);
  assert.match(preflight, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(preflight, /fatias_sem_conta/i);
  assert.match(preflight, /incoerencias_fiscais/i);
  assert.match(preflight, /conflitos_chave/i);
  assert.match(preflight, /pessoas_pendentes/i);
  assert.match(preflight, /totais_por_conta/i);
  assert.match(preflight, /total_folha/i);
  assert.doesNotMatch(preflight, /\b(insert|update|delete)\s+(into|public\.|from)/i);
});

test('preflight grants execute only to authenticated and service role', () => {
  assert.match(preflight, /revoke all on function public\.folha_rateio_contas_preflight\(integer\) from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(preflight, /grant execute on function public\.folha_rateio_contas_preflight\(integer\) to authenticated, service_role/i);
});
