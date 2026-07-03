import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
const readOptional = (file) => {
  const url = new URL(`./${file}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const functionBody = (source, name) => {
  const marker = new RegExp(`create or replace function public\\.${name}\\(`, 'i');
  const start = source.search(marker);
  if (start < 0) return '';
  const rest = source.slice(start);
  const end = rest.search(/\n\$\$;\s*\n/i);
  return end < 0 ? rest : rest.slice(0, end);
};

const sql = read('20260703_1_maria_cartoes_sugerir_classificacao.sql');
const sqlV2 = readOptional('20260703_2_maria_cartoes_sugestao_v2.sql');
const sqlV2AliasFix = readOptional('20260703_3_maria_cartoes_sugestao_v2_alias_fix.sql');

test('Fatia C versions the editable Maria classification rules table with least-privilege grants and seed', () => {
  assert.match(sql, /create table if not exists public\.maria_classificacao_regras/i);
  assert.match(sql, /palavra_chave text not null/i);
  assert.match(sql, /plano_conta_id uuid null references public\.plano_contas\(id\)/i);
  assert.match(sql, /escopo text not null default 'cartao'/i);
  assert.match(sql, /escopo in \('cartao','geral','contas_pagar'\)/i);
  assert.match(sql, /confianca_base numeric not null default 0\.90/i);
  assert.match(sql, /confianca_base >= 0 and confianca_base <= 1/i);
  assert.match(sql, /alter table public\.maria_classificacao_regras enable row level security/i);
  assert.match(sql, /grant select on public\.maria_classificacao_regras to maria_operacional, maria_leitura/i);
  assert.match(sql, /revoke all on public\.maria_classificacao_regras from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /where codigo = '4\.1\.6'[\s\S]*'IOF DESPESA NO EXTERIOR'[\s\S]*0\.95/i);
  assert.match(sql, /where codigo = '5\.2\.11'[\s\S]*'OPENAI'[\s\S]*0\.90/i);
  assert.match(sql, /'QUATRO CANTOS'[\s\S]*null::uuid/i);
});

test('Maria suggestion RPC is operational-only, audited, sanitized and uses the existing classification gate', () => {
  assert.match(sql, /create or replace function public\.maria_cartoes_sugerir_classificacao\(/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public,\s*pg_temp/i);
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /public\.maria_audit_insert[\s\S]*'financeiro_cartao_faturas'[\s\S]*'sugerir_classificacao_cartao'/i);
  assert.match(sql, /grant execute on function public\.maria_cartoes_sugerir_classificacao\([\s\S]*\) to maria_operacional/i);
  assert.match(sql, /revoke all on function public\.maria_cartoes_sugerir_classificacao\([\s\S]*\) from public, anon, authenticated, maria_leitura/i);
  assert.match(sql, /public\.financeiro_cartao_transacao_classificar\(/i);
  assert.doesNotMatch(sql, /update\s+public\.financeiro_cartao_transacoes/i);
  assert.doesNotMatch(sql, /codigo_barras|qr_pix|pix_payload|pan/i);
});

test('Maria suggestion only processes pending transactions for the resolved card invoice', () => {
  assert.match(sql, /where f\.cartao_id = p_cartao_id[\s\S]*f\.competencia = date_trunc\('month', p_competencia\)::date/i);
  assert.match(sql, /from public\.financeiro_cartao_transacoes t[\s\S]*where t\.fatura_id = v_fatura\.id[\s\S]*t\.classificacao_status = 'pendente'/i);
  assert.doesNotMatch(sql, /classificacao_status\s*=\s*'confirmada'[\s\S]*financeiro_cartao_transacoes/i);
});

test('Rules use normalized CONTAINS matching, priority and explicit no-suggestion blocks history fallback', () => {
  assert.match(sql, /public\.maria_cartoes_normalizar_texto/i);
  assert.match(sql, /position\(r\.palavra_chave in v_texto_norm\) > 0/i);
  assert.match(sql, /r\.escopo in \('cartao','geral'\)/i);
  assert.match(sql, /order by r\.prioridade desc,\s*r\.confianca_base desc/i);
  assert.match(sql, /v_regra_sem_sugestao := true/i);
  assert.match(sql, /if v_regra_sem_sugestao then[\s\S]*v_acao := 'pendente'/i);
  assert.match(sql, /not v_regra_sem_sugestao[\s\S]*historico_plano/i);
});

test('History fallback can suggest only dominant high-confidence plans and leaves conflicts or low confidence pending', () => {
  assert.match(sql, /historico_plano as/i);
  assert.match(sql, /from public\.financeiro_cartao_transacoes ht/i);
  assert.match(sql, /from public\.contas_pagar cp/i);
  assert.match(sql, /ht\.classificacao_status = 'confirmada'/i);
  assert.match(sql, /v_historico_conflito := true/i);
  assert.match(sql, /if v_confianca < p_limiar_confianca then[\s\S]*v_acao := 'pendente'/i);
  assert.match(sql, /v_acao := 'conflito'/i);
});

test('Suggested classification never confirms and validates the M8 triad before applying', () => {
  assert.match(sql, /p\.nivel = 3/i);
  assert.match(sql, /p\.natureza = 'saida'/i);
  assert.match(sql, /p\.ativo = true/i);
  assert.match(sql, /e\.unidade_id = v_centro_custo_id/i);
  assert.match(sql, /'classificacao_status',\s*'sugerida'/i);
  assert.doesNotMatch(sql, /'classificacao_status',\s*'confirmada'/i);
  assert.match(sql, /if p_aplicar and v_acao = 'sugerida' then/i);
});

test('Fatia C v2 removes the p_aplicar flag and exposes separate read-only and apply RPCs', () => {
  assert.match(sqlV2, /drop function if exists public\.maria_cartoes_sugerir_classificacao\(\s*text,\s*text,\s*text,\s*uuid,\s*date,\s*boolean,\s*numeric,\s*text,\s*text\s*\)/i);
  assert.match(sqlV2, /create or replace function public\.maria_cartoes_classificacao_sugestoes_calcular\(/i);
  assert.match(sqlV2, /create or replace function public\.maria_cartoes_sugerir_classificacao\(\s*p_ator_numero text,\s*p_papel text,\s*p_canal text,\s*p_cartao_id uuid,\s*p_competencia date,\s*p_limiar_confianca numeric default 0\.80/i);
  assert.match(sqlV2, /create or replace function public\.maria_cartoes_aplicar_sugestao\(\s*p_ator_numero text,\s*p_papel text,\s*p_canal text,\s*p_cartao_id uuid,\s*p_competencia date,\s*p_limiar_confianca numeric default 0\.80/i);
  assert.doesNotMatch(functionBody(sqlV2, 'maria_cartoes_sugerir_classificacao'), /p_aplicar|financeiro_cartao_transacao_classificar|maria_audit_insert/i);
  assert.match(functionBody(sqlV2, 'maria_cartoes_sugerir_classificacao'), /'aplicado',\s*false/i);
  assert.match(functionBody(sqlV2, 'maria_cartoes_aplicar_sugestao'), /financeiro_cartao_transacao_classificar/i);
  assert.match(functionBody(sqlV2, 'maria_cartoes_aplicar_sugestao'), /maria_audit_insert/i);
  assert.match(functionBody(sqlV2, 'maria_cartoes_aplicar_sugestao'), /'aplicado',\s*true/i);
});

test('Fatia C v2 keeps regra precedence over history and leaves rule-null or history conflict pending', () => {
  const helper = functionBody(sqlV2, 'maria_cartoes_classificacao_sugestoes_calcular');
  assert.match(helper, /Regra ativa tem precedencia sobre historico/i);
  assert.match(helper, /position\(r\.palavra_chave in v_texto_norm\) > 0/i);
  assert.match(helper, /if v_regra_sem_sugestao then[\s\S]*v_acao := 'pendente'[\s\S]*v_origem := 'regra_sem_sugestao'/i);
  assert.match(helper, /if v_plano_id is null and not v_regra_sem_sugestao then[\s\S]*historico_plano as/i);
  assert.match(helper, /v_historico_conflito := true[\s\S]*v_acao := 'conflito'[\s\S]*v_origem := 'historico_conflito'/i);
  assert.match(helper, /if v_confianca < p_limiar_confianca then[\s\S]*v_acao := 'pendente'/i);
});

test('Fatia C v2 apply path can only touch pending rows and never confirms classifications', () => {
  const helper = functionBody(sqlV2, 'maria_cartoes_classificacao_sugestoes_calcular');
  const apply = functionBody(sqlV2, 'maria_cartoes_aplicar_sugestao');
  assert.match(helper, /where t\.fatura_id = v_fatura_id[\s\S]*t\.classificacao_status = 'pendente'/i);
  assert.match(apply, /from jsonb_to_recordset\(v_calc->'linhas'\)[\s\S]*where linha\.acao = 'sugerida'/i);
  assert.match(apply, /'classificacao_status',\s*'sugerida'/i);
  assert.doesNotMatch(apply, /'classificacao_status',\s*'confirmada'/i);
  assert.doesNotMatch(sqlV2, /update\s+public\.financeiro_cartao_transacoes/i);
  assert.match(sqlV2, /confirmadas permanecem fora do conjunto calculado/i);
});

test('Fatia C v2 grants only maria_operacional direct execution on public RPCs', () => {
  assert.match(sqlV2, /revoke all on function public\.maria_cartoes_classificacao_sugestoes_calcular\([\s\S]*\) from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sqlV2, /revoke all on function public\.maria_cartoes_sugerir_classificacao\([\s\S]*\) from public, anon, authenticated, maria_leitura/i);
  assert.match(sqlV2, /grant execute on function public\.maria_cartoes_sugerir_classificacao\([\s\S]*\) to maria_operacional/i);
  assert.match(sqlV2, /revoke all on function public\.maria_cartoes_aplicar_sugestao\([\s\S]*\) from public, anon, authenticated, maria_leitura/i);
  assert.match(sqlV2, /grant execute on function public\.maria_cartoes_aplicar_sugestao\([\s\S]*\) to maria_operacional/i);
});

test('Fatia C v2 alias fix avoids PL/pgSQL record variable shadowing jsonb_to_recordset aliases', () => {
  const apply = functionBody(sqlV2AliasFix, 'maria_cartoes_aplicar_sugestao');
  assert.match(sqlV2AliasFix, /create or replace function public\.maria_cartoes_aplicar_sugestao/i);
  assert.match(apply, /v_linha record/i);
  assert.match(apply, /from jsonb_to_recordset\(v_calc->'linhas'\) as item/i);
  assert.match(apply, /where item\.acao = 'sugerida'/i);
  assert.match(apply, /for v_linha in/i);
  assert.doesNotMatch(apply, /for linha in/i);
  assert.doesNotMatch(apply, /as linha\(/i);
  assert.doesNotMatch(apply, /where linha\.acao/i);
});
