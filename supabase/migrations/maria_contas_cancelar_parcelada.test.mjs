import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./20260716_1_maria_contas_cancelar_parcelada.sql', import.meta.url);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const separatorFixUrl = new URL('./20260716_2_maria_contas_parcelada_separador.sql', import.meta.url);
const separatorFixSql = existsSync(separatorFixUrl) ? readFileSync(separatorFixUrl, 'utf8') : '';
const separatorSpacingUrl = new URL('./20260716_3_maria_contas_parcelada_separador_espaco.sql', import.meta.url);
const separatorSpacingSql = existsSync(separatorSpacingUrl) ? readFileSync(separatorSpacingUrl, 'utf8') : '';

test('closes the legacy generic cancellation path', () => {
  assert.match(sql, /create or replace function public\.maria_contas_atualizar_status/i);
  assert.match(sql, /(?:p_status|v_status)\s+not\s+in\s*\(\s*'pendente'\s*,\s*'pago'\s*,\s*'finalizado'\s*\)/i);
  const statusBody = sql.match(/create or replace function public\.maria_contas_atualizar_status[\s\S]*?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(statusBody, /'cancelado'/i);
});

test('creates an audited cancellation RPC without deleting evidence', () => {
  assert.match(sql, /create or replace function public\.maria_contas_cancelar/i);
  assert.match(sql, /security definer[\s\S]*set search_path = public/i);
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /motivo obrigatorio/i);
  assert.match(sql, /conta ja paga nao pode ser cancelada/i);
  assert.match(sql, /conta ja estava cancelada/i);
  assert.match(sql, /set status = 'cancelado'[\s\S]*updated_at = now\(\)/i);
  assert.match(sql, /maria_audit_insert[\s\S]*cancelar_conta_pagar/i);
  const cancelBody = sql.match(/create or replace function public\.maria_contas_cancelar[\s\S]*?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(cancelBody, /\bdelete\b/i);
  assert.doesNotMatch(cancelBody, /credencial_id\s*=|codigo_barras\s*=|chave_pix\s*=|qr_pix_payload\s*=/i);
});

test('cancellation returns a human payload without raw UUID fields', () => {
  const cancelBody = sql.match(/create or replace function public\.maria_contas_cancelar[\s\S]*?\$\$;/i)?.[0] || '';
  const returned = cancelBody.match(/return jsonb_build_object\([\s\S]*?\);/i)?.[0] || '';
  assert.match(returned, /'success'/i);
  assert.match(returned, /'descricao'/i);
  assert.match(returned, /'status_anterior'/i);
  assert.match(returned, /'status_novo'/i);
  assert.match(returned, /'cancelado_por'/i);
  assert.doesNotMatch(returned, /'[^']*_id'/i);
  assert.doesNotMatch(returned, /audit_id|parcelamento_id|credencial_id/i);
});

test('creates real monthly installments atomically with exact cent totals', () => {
  assert.match(sql, /create or replace function public\.maria_contas_parcelada_criar/i);
  assert.match(sql, /p_confirmar_duplicidade\s+boolean\s+default\s+false/i);
  assert.match(sql, /quantidade_parcelas[\s\S]*maior que 1/i);
  assert.match(sql, /exatamente um modo de valor/i);
  assert.match(sql, /periodicidade[\s\S]*mensal/i);
  assert.match(sql, /gen_random_uuid\(\)/i);
  assert.match(sql, /tipo_lancamento[\s\S]*'parcelada'/i);
  assert.match(sql, /parcela_atual[\s\S]*total_parcelas[\s\S]*parcelamento_id/i);
  assert.match(sql, /v_total_centavos\s*-\s*\(\(p_quantidade_parcelas\s*-\s*1\)\s*\*\s*v_parcela_centavos\)/i);
  assert.match(sql, /make_date[\s\S]*least[\s\S]*date_trunc\('month'/i);
  assert.match(sql, /maria_audit_insert[\s\S]*criar_conta_pagar_parcelada/i);
});

test('installment creation mirrors fiscal validation and strong duplicate preflight', () => {
  assert.match(sql, /plano_conta_id nao e uma folha de saida ativa/i);
  assert.match(sql, /centro_custo_id nao e uma unidade ativa/i);
  assert.match(sql, /conta_pagadora_id nao encontrada ou inativa/i);
  assert.match(sql, /v_empresa\.unidade_id\s*<>\s*p_centro_custo_id/i);
  assert.match(sql, /maria_cartoes_normalizar_texto\(c\.descricao\)/i);
  assert.match(sql, /c\.plano_conta_id\s*=\s*p_plano_conta_id/i);
  assert.match(sql, /c\.centro_custo_id\s*=\s*p_centro_custo_id/i);
  assert.match(sql, /c\.parcelamento_id\s+is not null/i);
  assert.match(sql, /p_confirmar_duplicidade/i);
  assert.match(sql, /possivel parcelamento duplicado/i);
});

test('installment return is human, pending and honest about payment', () => {
  const installmentBody = sql.match(/create or replace function public\.maria_contas_parcelada_criar[\s\S]*?\$\$;/i)?.[0] || '';
  const returned = installmentBody.match(/return jsonb_build_object\([\s\S]*?\);/i)?.[0] || '';
  assert.match(returned, /'success'/i);
  assert.match(returned, /'quantidade_parcelas'/i);
  assert.match(returned, /'primeiro_vencimento'/i);
  assert.match(returned, /'ultimo_vencimento'/i);
  assert.match(returned, /'pagamento_executado_pela_maria'\s*,\s*false/i);
  assert.doesNotMatch(returned, /'[^']*_id'/i);
  assert.doesNotMatch(returned, /audit_id|parcelamento_id|credencial_id/i);
});

test('both new RPCs are restricted to the operational role and service role', () => {
  assert.match(sql, /revoke all on function public\.maria_contas_cancelar[\s\S]*from public, anon, authenticated, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_contas_cancelar[\s\S]*to maria_operacional, service_role/i);
  assert.match(sql, /revoke all on function public\.maria_contas_parcelada_criar[\s\S]*from public, anon, authenticated, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_contas_parcelada_criar[\s\S]*to maria_operacional, service_role/i);
});

test('normalizes the payer account separator without mojibake', () => {
  assert.match(separatorFixSql, /pg_get_functiondef/i);
  assert.match(separatorFixSql, /chr\(194\)\s*\|\|\s*chr\(183\)/i);
  assert.match(separatorFixSql, /replace\(v_definition,\s*chr\(183\),\s*' - '\)/i);
  assert.match(separatorFixSql, /execute v_definition/i);
});

test('keeps a single space around the ASCII separator', () => {
  assert.match(separatorSpacingSql, /pg_get_functiondef/i);
  assert.match(separatorSpacingSql, /replace\(v_definition,\s*'  -  ',\s*' - '\)/i);
  assert.match(separatorSpacingSql, /execute v_definition/i);
});
