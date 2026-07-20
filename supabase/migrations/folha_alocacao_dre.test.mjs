import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./20260719_2_folha_alocacao_dre.sql', import.meta.url),
  'utf8'
);

test('creates immutable versioned DRE allocation confirmations and slices', () => {
  assert.match(migration, /create table public\.folha_alocacao_dre_confirmacoes/i);
  assert.match(migration, /create table public\.folha_alocacao_dre_fatias/i);
  assert.match(migration, /origem text not null check \(origem in \('automatica_unidade_fixa', 'confirmada_operador', 'backfill_privilegiado'\)\)/i);
  assert.match(migration, /source_hash text not null/i);
  assert.match(migration, /allocation_hash text not null/i);
  assert.match(migration, /create unique index folha_alocacao_dre_confirmacoes_ativa_uq[\s\S]*where ativa = true/i);
  assert.doesNotMatch(migration, /update public\.folha_alocacao_dre_fatias/i);
});

test('requires one complete base and complete category-component overrides', () => {
  assert.match(migration, /categoria is null and componente is null/i);
  assert.match(migration, /categoria is not null and componente is not null/i);
  assert.match(migration, /componente in \('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos'\)/i);
  assert.match(migration, /create unique index folha_alocacao_dre_fatias_base_uq[\s\S]*where categoria is null and componente is null/i);
  assert.match(migration, /create unique index folha_alocacao_dre_fatias_override_uq[\s\S]*where categoria is not null and componente is not null/i);
  assert.match(migration, /distribuicao-base completa/i);
  assert.match(migration, /percentuais da distribuicao-base devem somar 100/i);
  assert.match(migration, /percentuais de cada override devem somar 100/i);
});

test('hashes source and allocation independently with deterministic ordering', () => {
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_source_hash/i);
  assert.match(migration, /jsonb_agg\([\s\S]*order by[\s\S]*lancamento_folha_id[\s\S]*componente[\s\S]*sequencia/i);
  assert.match(migration, /coalesce\(c\.is_rateado, false\)/i);
  assert.match(migration, /c\.unidade_fixa/i);
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_allocation_hash/i);
  assert.match(migration, /order by[\s\S]*categoria[\s\S]*componente[\s\S]*unidade/i);
});

test('preflight uses the DRE snapshot universe and keeps operational signals separate', () => {
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_preflight/i);
  assert.match(migration, /from public\.folha_classificacao_dre/i);
  assert.match(migration, /coalesce\(c\.is_rateado, false\)/i);
  assert.match(migration, /sem_alocacao/i);
  assert.match(migration, /multiplas_contas_sem_rateio/i);
  assert.match(migration, /pronto_para_dre/i);
  assert.doesNotMatch(migration, /create or replace function public\.folha_fechar/i);
});

test('automatic preparation only creates 100 percent fixed-unit allocations', () => {
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_gerar_automaticas/i);
  assert.match(migration, /coalesce\(c\.is_rateado, false\) = false/i);
  assert.match(migration, /lower\(trim\(c\.unidade_fixa\)\) in \('cg', 'rec', 'bar'\)/i);
  assert.match(migration, /'automatica_unidade_fixa'/i);
  assert.match(migration, /100(?:\.0+)?::numeric/i);
});

test('save is optimistic, atomic, audited and protects closed payroll', () => {
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_salvar/i);
  assert.match(migration, /p_source_hash_esperado text/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /source_hash mudou/i);
  assert.match(migration, /coalesce\(v_colaborador\.is_rateado, false\) = false/i);
  assert.match(migration, /v_status = 'fechada'[\s\S]*service_role[\s\S]*postgres/i);
  assert.match(migration, /p_backfill_motivo/i);
  assert.match(migration, /insert into public\.maria_audit_log/i);
  assert.match(migration, /'ALOCACAO_DRE'/i);
});

test('resolver applies overrides and largest remainders without losing cents', () => {
  assert.match(migration, /create or replace function public\.folha_alocacao_dre_resolver/i);
  assert.match(migration, /row_number\(\) over[\s\S]*resto desc[\s\S]*unidade asc/i);
  assert.match(migration, /c\.valor_centavos - sum\(c\.centavos_base\)/i);
  assert.match(migration, /categoria_usada = f\.categoria/i);
  assert.match(migration, /componente = f\.componente/i);
  assert.match(migration, /unidade_dre/i);
  assert.match(migration, /percentual_aplicado/i);
  assert.match(migration, /valor_assinado_rateado/i);
});

test('uses least privilege and never grants direct DML on allocation tables', () => {
  assert.match(migration, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(migration, /revoke all on function public\.folha_alocacao_dre_salvar/i);
  assert.match(migration, /grant execute on function public\.folha_alocacao_dre_salvar[\s\S]*to authenticated, service_role/i);
  assert.match(migration, /revoke all on public\.folha_alocacao_dre_confirmacoes from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on\s+public\.folha_alocacao_dre_/i);
  assert.doesNotMatch(migration, /folha_id\s*=\s*17|values\s*\(\s*17/i);
});
