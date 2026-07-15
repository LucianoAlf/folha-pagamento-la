import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const correction = readFileSync(
  new URL('./20260711_1_folha_corrigir_componente.sql', import.meta.url),
  'utf8'
);

test('correction RPC is narrow, optimistic and status guarded', () => {
  assert.match(correction, /create or replace function public\.folha_corrigir_componente/i);
  assert.match(correction, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(correction, /p_componente not in \([\s\S]*'salario'[\s\S]*'descontos'[\s\S]*\)/i);
  assert.match(correction, /motivo obrigatorio/i);
  assert.match(correction, /v_status not in \('rascunho', 'aprovada'\)/i);
  assert.match(correction, /valor atual .* diverge do valor esperado/i);
  assert.match(correction, /for update/i);
});

test('correction RPC recalculates totals and records a complete audit trail', () => {
  assert.match(correction, /perform public\.recalc_folha_totais\(p_folha_id\)/i);
  assert.match(correction, /insert into public\.maria_audit_log/i);
  assert.match(correction, /'CORRECAO_COMPONENTE_FOLHA'/i);
  assert.match(correction, /'componente', p_componente/i);
  assert.match(correction, /'total_linha', v_total_linha_antes/i);
  assert.match(correction, /'total_geral', v_total_geral_antes/i);
  assert.match(correction, /p_motivo/i);
});

test('correction RPC cannot change payer account and exposes only execute grants', () => {
  assert.doesNotMatch(correction, /set[\s\S]{0,120}conta_pagadora_id\s*=/i);
  assert.match(
    correction,
    /revoke all on function public\.folha_corrigir_componente\(integer, integer, text, text, text, numeric, numeric, text, jsonb\) from public, anon, authenticated, maria_operacional, maria_leitura/i
  );
  assert.match(
    correction,
    /grant execute on function public\.folha_corrigir_componente\(integer, integer, text, text, text, numeric, numeric, text, jsonb\) to authenticated, service_role/i
  );
  assert.doesNotMatch(correction, /grant\s+(insert|update|delete|all)\s+on\s+public\.lancamentos_folha/i);
});
