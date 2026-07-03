import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

const sql = read('20260703_1_maria_cartoes_sugerir_classificacao.sql');

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
