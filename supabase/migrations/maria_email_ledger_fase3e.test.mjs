import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260724_4_maria_email_match_sugerir_auto.sql', import.meta.url), 'utf8');

function functionBody(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i');
  return sql.match(re)?.[0] ?? '';
}

test('cria RPC automatica de sugestao sem confirmar nem alterar contas_pagar', () => {
  const body = functionBody('maria_email_match_sugerir_auto');
  assert.match(body, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(body, /insert into public\.maria_email_payable_matches/i);
  assert.match(body, /match_status[\s\S]*match_score[\s\S]*match_reason/i);
  assert.match(body, /select[\s\S]*v_payable\.id,[\s\S]*conta_pagar_id,[\s\S]*'sugerido'/i);
  assert.doesNotMatch(body, /set\s+match_status\s*=\s*'confirmado_humano'/i);
  assert.doesNotMatch(body, /maria_audit_insert/i);
  assert.doesNotMatch(body, /update\s+public\.contas_pagar/i);
  assert.doesNotMatch(body, /insert\s+into\s+public\.contas_pagar/i);
  assert.doesNotMatch(body, /delete\s+from\s+public\./i);
});

test('sugestao usa criterios essenciais: valor, vencimento, unidade e dimensoes financeiras', () => {
  const body = functionBody('maria_email_match_sugerir_auto');
  assert.match(body, /valor_centavos/i);
  assert.match(body, /data_vencimento|vencimento/i);
  assert.match(body, /unidade_snapshot/i);
  assert.match(body, /plano_conta_id/i);
  assert.match(body, /centro_custo_id/i);
  assert.match(body, /empresa_id/i);
  assert.match(body, /fornecedor_nome/i);
});

test('sugestao e idempotente por payable e nao duplica sugerido confirmado', () => {
  const body = functionBody('maria_email_match_sugerir_auto');
  assert.match(body, /pg_advisory_xact_lock/i);
  assert.match(body, /not exists[\s\S]*public\.maria_email_payable_matches/i);
  assert.match(body, /match_status in \('sugerido', 'confirmado_humano'\)/i);
});

test('grants mantem tabelas fechadas e libera apenas execute da RPC ao service_role', () => {
  assert.match(sql, /revoke all on function public\.maria_email_match_sugerir_auto\(uuid, integer, numeric\)[\s\S]*from public, anon, authenticated, service_role, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.maria_email_match_sugerir_auto\(uuid, integer, numeric\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.maria_email_/i);
});
