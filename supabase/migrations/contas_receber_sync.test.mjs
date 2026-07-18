import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = new URL('./20260717_1_contas_receber_sync.sql', import.meta.url);
const freshnessMigrationPath = new URL('./20260718_1_contas_receber_frescor.sql', import.meta.url);

function sql() {
  assert.equal(existsSync(migrationPath), true, 'migration de contas a receber deve existir');
  return readFileSync(migrationPath, 'utf8');
}

function freshnessSql() {
  assert.equal(existsSync(freshnessMigrationPath), true, 'migration de frescor deve existir');
  return readFileSync(freshnessMigrationPath, 'utf8');
}

test('schema preserva identidade natural, fatos da origem e julgamento manual', () => {
  const source = sql();
  assert.match(source, /create table if not exists public\.contas_receber/i);
  assert.match(source, /la_report_unidade_id\s+uuid\s+not null/i);
  assert.match(source, /emusys_fatura_id\s+bigint\s+not null/i);
  assert.match(source, /unique\s*\(\s*la_report_unidade_id\s*,\s*emusys_fatura_id\s*\)/i);
  assert.match(source, /row_source_hash\s+text\s+not null/i);
  assert.match(source, /cadastro_match_status/i);
  assert.match(source, /curso_candidatos\s+jsonb/i);
  assert.match(source, /classificacao_origem/i);
});

test('authenticated le, mas sincronizacao escreve apenas via RPC service role', () => {
  const source = sql();
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on public\.contas_receber from public, anon, authenticated/i);
  assert.match(source, /grant select on public\.contas_receber to authenticated, service_role/i);
  assert.match(source, /contas_receber_sync_aplicar/i);
  const syncGrant = source.match(/grant execute on function public\.contas_receber_sync_aplicar\([^;]+;/i)?.[0] ?? '';
  assert.match(syncGrant, /to service_role/i);
  assert.doesNotMatch(syncGrant, /authenticated/i);
});

test('sync atualiza fatos da fonte sem apagar classificacao manual', () => {
  const source = sql();
  assert.match(source, /on conflict\s*\(\s*la_report_unidade_id\s*,\s*emusys_fatura_id\s*\)/i);
  assert.match(source, /status_origem\s*=\s*excluded\.status_origem/i);
  assert.match(source, /valor_pago\s*=\s*excluded\.valor_pago/i);
  assert.match(source, /data_recebimento\s*=\s*excluded\.data_recebimento/i);
  assert.match(source, /classificacao_origem\s*=\s*'manual'/i);
  assert.match(source, /case[\s\S]*classificacao_origem[\s\S]*manual/i);
});

test('classificacao manual exige folha de entrada e deriva o centro pela unidade', () => {
  const source = sql();
  assert.match(source, /create or replace function public\.contas_receber_classificar/i);
  assert.match(source, /nivel\s*=\s*3/i);
  assert.match(source, /natureza\s*=\s*'entrada'/i);
  assert.match(source, /ativo\s*=\s*true/i);
  assert.match(source, /from public\.centros_custo/i);
  assert.match(source, /insert into public\.maria_audit_log/i);
  assert.match(source, /auth\.uid\(\)/i);
});

test('portas de escrita exigem autorizacao financeira explicita', () => {
  const source = sql();
  assert.match(source, /create table if not exists public\.contas_receber_operadores/i);
  assert.match(source, /create or replace function public\.contas_receber_pode_operar/i);
  assert.match(source, /from public\.contas_receber_operadores/i);
  assert.match(source, /if not public\.contas_receber_pode_operar\(\)/i);
  assert.match(source, /acesso financeiro nao autorizado/i);
  assert.doesNotMatch(source, /grant select on public\.contas_receber_operadores to authenticated/i);
});

test('preflight nao e persistido e log registra apenas apply', () => {
  const source = sql();
  assert.match(source, /create table if not exists public\.contas_receber_sync_execucoes/i);
  assert.match(source, /manifest_hash/i);
  assert.match(source, /modo[\s\S]*check[\s\S]*apply/i);
  assert.doesNotMatch(source, /modo[\s\S]*preflight/i);
});

test('frescor preserva a mesma fatura em competencias diferentes', () => {
  const source = freshnessSql();
  assert.match(source, /unique\s*\(\s*la_report_unidade_id\s*,\s*emusys_fatura_id\s*,\s*competencia\s*\)/i);
  assert.match(source, /on conflict\s*\(\s*la_report_unidade_id\s*,\s*emusys_fatura_id\s*,\s*competencia\s*\)/i);
  assert.doesNotMatch(source, /competencia\s*=\s*excluded\.competencia/i);
});

test('frescor espelha ausencia da origem e preserva o motivo sem hashear timestamps', () => {
  const source = freshnessSql();
  assert.match(source, /source_missing\s+boolean/i);
  assert.match(source, /source_missing_reason\s+text/i);
  assert.match(source, /source_last_seen_at\s+timestamptz/i);
  assert.match(source, /source_missing_detected_at\s+timestamptz/i);
  assert.match(source, /source_missing[\s\S]*status[\s\S]*revisar/i);
});

test('preflight server-side expira, vincula usuario e run e e consumido atomicamente', () => {
  const source = freshnessSql();
  assert.match(source, /create table public\.contas_receber_preflight_provas/i);
  assert.match(source, /user_id\s+uuid\s+not null/i);
  assert.match(source, /sync_run_id\s+uuid\s+not null/i);
  assert.match(source, /expires_at\s+timestamptz\s+not null/i);
  assert.match(source, /consumed_at\s+timestamptz/i);
  assert.match(source, /for update/i);
  assert.match(source, /expires_at\s*<=\s*now\(\)/i);
  assert.match(source, /consumed_result/i);
  assert.match(
    source,
    /consumed_at\s+is\s+not\s+null\s+and\s+consumed_result\s+is\s+not\s+null/i,
  );
});

test('apply aceita somente service role e exige a prova persistida', () => {
  const source = freshnessSql();
  assert.match(source, /contas_receber_preflight_registrar/i);
  assert.match(source, /contas_receber_preflight_obter/i);
  assert.match(source, /contas_receber_sync_aplicar/i);
  assert.match(source, /p_preflight_id\s+uuid/i);
  assert.match(source, /sincronizacao de contas a receber exige service_role/i);
  const grant = source.match(/grant execute on function public\.contas_receber_sync_aplicar\([^;]+;/i)?.[0] ?? '';
  assert.match(grant, /to service_role/i);
  assert.doesNotMatch(grant, /authenticated/i);
});
