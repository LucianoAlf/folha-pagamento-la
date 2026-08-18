import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('./20260818180544_contas_pagar_ajuste_pago_admin.sql', import.meta.url),
  'utf8'
);

test('ajuste de conta paga e atomico, administrativo e auditavel', () => {
  assert.match(sql, /create or replace function public\.contas_pagar_ajustar_paga\(p_payload jsonb\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /public\.financeiro_cartoes_is_admin\(\)/i);
  assert.match(sql, /where id = v_conta_id\s+for update/i);
  assert.match(sql, /v_before\.status <> 'pago'/i);
  assert.match(sql, /valor deve ser finito para ajustar conta paga/i);
  assert.match(sql, /insert into public\.maria_audit_log/i);
  assert.match(sql, /antes[\s\S]*depois/i);
});

test('ajuste preserva fontes de verdade de cartao e folha e deriva fiscal da conta bancaria', () => {
  assert.match(sql, /tipo_lancamento in \('fatura_cartao', 'folha_pagamento'\)/i);
  assert.match(sql, /financeiro_contas_bancarias/i);
  assert.match(sql, /empresa_id\s*=\s*v_conta_pagadora\.empresa_id/i);
  assert.match(sql, /centro_custo_id\s*=\s*v_empresa\.unidade_id/i);
  assert.match(sql, /unidade\s*=\s*v_centro\.codigo/i);
});

test('somente a porta administrativa recebe execucao explicita', () => {
  assert.match(sql, /revoke all on function public\.contas_pagar_ajustar_paga\(jsonb\)\s+from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.contas_pagar_ajustar_paga\(jsonb\) to authenticated, service_role/i);
});
