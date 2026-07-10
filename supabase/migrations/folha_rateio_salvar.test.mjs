import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const save = readFileSync(
  new URL('./20260710_4_folha_rateio_salvar.sql', import.meta.url),
  'utf8'
);

test('save RPC is secure, atomic and anti-spoof', () => {
  assert.match(save, /create or replace function public\.folha_rateio_contas_salvar/i);
  assert.match(save, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(save, /p_fatias is null\s+or\s+jsonb_typeof\(p_fatias\) <> 'array'/i);
  assert.match(save, /if v_role = 'authenticated' then[\s\S]*v_ator_tipo := 'web'/i);
  assert.match(save, /v_ator_ref := auth\.uid\(\)::text/i);
  assert.match(save, /v_role in \('service_role', 'postgres'\)/i);
  assert.match(save, /set_config\('app\.folha_rateio_rpc', 'on', true\)/i);
  assert.match(save, /for update/i);
  assert.match(save, /totais por categoria e componente nao conferem/i);
  assert.match(save, /total geral da folha mudou durante o rateio/i);
});

test('save RPC preserves structured metadata and uses a single audit trail', () => {
  assert.match(save, /detalhamento estruturado exige preservacao/i);
  assert.match(save, /insert into public\.maria_audit_log/i);
  assert.match(save, /'folha'/i);
  assert.match(save, /'RATEIO_CONTAS'/i);
});

test('save RPC exposes no direct table DML grant', () => {
  assert.match(save, /grant execute on function public\.folha_rateio_contas_salvar\(integer, integer, jsonb, jsonb\) to authenticated, service_role/i);
  assert.doesNotMatch(save, /grant\s+(insert|update|delete|all)\s+on\s+public\.lancamentos_folha/i);
});
