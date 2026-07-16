import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('./20260716_2_folha_dre_analitico_v4.sql', import.meta.url),
  'utf8'
);
const normalizationFixSql = readFileSync(
  new URL('./20260716_3_folha_dre_normaliza_texto_ascii.sql', import.meta.url),
  'utf8'
);
const repairSql = readFileSync(
  new URL('./20260716_4_folha_dre_repair_backfill_17.sql', import.meta.url),
  'utf8'
);

const functionBody = (name) => {
  const match = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    'i'
  ));
  assert.ok(match, `function ${name} must exist`);
  return match[0];
};

test('creates a versioned rules table with complete explicit payroll seeds', () => {
  assert.match(sql, /create table public\.folha_regra_plano_conta/i);
  assert.match(sql, /ruleset_version integer not null/i);
  assert.match(sql, /operador text not null[\s\S]*'exato'[\s\S]*'ilike'/i);
  assert.match(sql, /prioridade integer not null/i);
  assert.match(sql, /escopo_dre text not null/i);
  assert.match(sql, /atendente bistro[\s\S]*4\.6\.3/i);
  assert.match(sql, /professores[\s\S]*clt[\s\S]*5\.3\.14/i);
  assert.match(sql, /professores[\s\S]*pj[\s\S]*5\.3\.15/i);
  assert.match(sql, /assistente pedagogico[\s\S]*5\.3\.15/i);
  assert.match(sql, /lider marketing[\s\S]*5\.3\.16/i);
  assert.match(sql, /reembolso[\s\S]*7\.2\.8[\s\S]*fora_operacional/i);
  assert.match(sql, /inss[\s\S]*excluido[\s\S]*nenhum/i);
  assert.doesNotMatch(sql, /\.\.\.|\b(?:TODO|TBD)\b/i);
});

test('creates a source-complete snapshot that supports discount slices', () => {
  assert.match(sql, /create table public\.folha_classificacao_dre/i);
  assert.match(sql, /primary key \(folha_id, lancamento_folha_id, componente, sequencia\)/i);
  assert.match(sql, /conta_pagadora_id_usada uuid/i);
  assert.match(sql, /bistro_competencia_id uuid/i);
  assert.match(sql, /bistro_ref_ym text/i);
  assert.match(sql, /tipo_efeito text not null/i);
  assert.match(sql, /valor_assinado numeric not null/i);
  assert.match(sql, /hash_origem text not null/i);
  assert.match(sql, /ruleset_version integer not null/i);
});

test('classifier is content-idempotent, audited and protects closed payroll', () => {
  const body = functionBody('folha_classificar_dre');
  assert.match(body, /security definer[\s\S]*set search_path = public/i);
  assert.match(body, /extensions\.digest/i);
  assert.match(body, /hash_origem/i);
  assert.match(body, /ruleset_version/i);
  assert.match(body, /idempotente/i);
  assert.match(body, /folha fechada.*snapshot.*imutavel/i);
  assert.match(body, /p_permitir_backfill_fechada/i);
  assert.match(body, /v_role not in \('service_role', 'postgres'\)/i);
  assert.match(body, /insert into public\.maria_audit_log/i);
  assert.match(body, /CLASSIFICAR_DRE|BACKFILL_DRE/i);
});

test('Bistro uses M-1 and either fully valid metadata or proportional allocation', () => {
  const body = functionBody('folha_classificar_dre');
  assert.match(body, /make_date\(v_ano, v_mes, 1\) - interval '1 month'/i);
  assert.match(body, /from public\.bistro_competencias/i);
  assert.match(body, /from public\.bistro_consumos/i);
  assert.match(body, /__bistro/i);
  assert.match(body, /ref_ym/i);
  assert.match(body, /meta_total[\s\S]*bistro_aplicavel/i);
  assert.match(body, /row_number\(\) over \(partition by[\s\S]*colaborador_id/i);
  assert.match(body, /ultima linha absorve o residuo/i);
  assert.match(body, /liquidacao_linha[\s\S]*residual_linha/i);
  assert.match(body, /consumos_bistro_sem_desconto/i);
});

test('signed values come only from components and scopes match the final rules', () => {
  const body = functionBody('folha_classificar_dre');
  assert.match(body, /when .*componente.* in \('inss', 'descontos'\) then -/i);
  assert.match(body, /tipo_efeito.*liquidacao/i);
  assert.match(body, /escopo_dre[\s\S]*nenhum/i);
  assert.match(body, /5\.3\.13/i);
  assert.match(body, /operacional/i);
  assert.match(body, /soma assinada .* nao confere com o total geral/i);
  assert.match(body, /conflito de regras/i);
  assert.match(body, /tratamento.*pendente/i);
});

test('read model is security-invoker and only reads the snapshot', () => {
  assert.match(sql, /create or replace view public\.vw_folha_dre_analitico[\s\S]*security_invoker\s*=\s*true/i);
  assert.match(sql, /from public\.folha_classificacao_dre/i);
  assert.match(sql, /valor_dre_operacional/i);
  assert.match(sql, /grant select on public\.vw_folha_dre_analitico to authenticated, service_role/i);
});

test('least privilege blocks direct writes and exposes only audited RPC execution', () => {
  assert.match(sql, /revoke all on public\.folha_regra_plano_conta from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant select on public\.folha_regra_plano_conta to authenticated, service_role/i);
  assert.match(sql, /revoke all on public\.folha_classificacao_dre from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant select on public\.folha_classificacao_dre to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.folha_classificar_dre\(integer, boolean\)/i);
  assert.match(sql, /grant execute on function public\.folha_classificar_dre\(integer, boolean\)\s+to authenticated, service_role/i);
});

test('folha_fechar classifies before closing and never rolls back financial close on analytics failure', () => {
  const body = functionBody('folha_fechar');
  const classifyAt = body.search(/folha_classificar_dre\(p_folha_id/i);
  const closeAt = body.search(/set status = 'fechada'/i);
  assert.ok(classifyAt >= 0, 'folha_fechar must call classifier');
  assert.ok(closeAt > classifyAt, 'classifier must run before status becomes fechada');
  assert.match(body, /exception\s+when others\s+then[\s\S]*raise warning/i);
  assert.match(body, /make_date\(v_ano,\s*v_mes,\s*10\)/i);
});

test('normalization accent map is ASCII transport-safe', () => {
  assert.match(normalizationFixSql, /create or replace function public\.folha_normaliza_texto/i);
  assert.match(normalizationFixSql, /U&'\\00E1\\00E0\\00E2\\00E3\\00E4/i);
  assert.match(normalizationFixSql, /\\00E7\\00F1'/i);
  assert.doesNotMatch(normalizationFixSql, /[áàâãäéèêëíìîïóòôõöúùûüçñ]/i);
});

test('live normalization repair is narrow, reconciled and audited', () => {
  assert.match(repairSql, /v_before_rows\s*<>\s*358/i);
  assert.match(repairSql, /v_before_pending\s*<>\s*19/i);
  assert.match(repairSql, /8e1b8527182be9a29e4e4fd777cf12f7847e9fd5ab9ba9cf5ef38c0bbf9439fe/i);
  assert.match(repairSql, /status\s*=\s*'fechada'/i);
  assert.match(repairSql, /folha_classificar_dre\(17, true\)/i);
  assert.match(repairSql, /v_after_pending\s*<>\s*0/i);
  assert.match(repairSql, /v_after_sum\s*<>\s*v_total_geral/i);
  assert.match(repairSql, /migration:folha_dre_repair_backfill_17/i);
  assert.match(repairSql, /extensions\.digest/i);
  assert.match(repairSql, /REPARAR_BACKFILL_DRE_NORMALIZACAO/i);
});
