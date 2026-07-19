import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('./20260719_1_dre_visual_consolidado.sql', import.meta.url),
  'utf8',
);

const functionBody = (name) => {
  const match = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    'i',
  ));
  assert.ok(match, `function ${name} must exist`);
  return match[0];
};

test('exposes one consolidated contract without an operational-unit parameter', () => {
  const consultar = functionBody('dre_consultar');
  const detalhes = functionBody('dre_detalhes');

  assert.match(consultar, /p_competencia\s+date[\s\S]*p_regime\s+text/i);
  assert.match(detalhes, /p_competencia\s+date[\s\S]*p_regime\s+text[\s\S]*p_plano_codigo\s+text[\s\S]*p_fonte\s+text[\s\S]*p_cursor\s+jsonb/i);
  assert.doesNotMatch(consultar, /p_unidade/i);
  assert.doesNotMatch(detalhes, /p_unidade/i);
});

test('normalizes four sources and keeps origin reconciliation separate from DRE result', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.match(body, /'folha'::text\s+as fonte/i);
  assert.match(body, /'contas_pagar'::text\s+as fonte/i);
  assert.match(body, /'cartao'::text\s+as fonte/i);
  assert.match(body, /'contas_receber'::text\s+as fonte/i);
  assert.match(body, /valor_origem/i);
  assert.match(body, /valor_resultado/i);
  assert.match(body, /when\s+.*natureza.*=\s*'entrada'.*valor_origem[\s\S]*else\s+-.*valor_origem/i);
});

test('derives economic nature from the account code and keeps all group 7 outside operations', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.equal((body.match(/pc\.codigo\s*=\s*'7\.1'[\s\S]{0,100}'entrada'/gi) ?? []).length, 3);
  assert.equal((body.match(/pc\.codigo\s*=\s*'7'[\s\S]{0,80}pc\.codigo\s+like\s+'7\.%'[\s\S]{0,80}'fora_operacional'/gi) ?? []).length, 3);
});

test('cash uses real settlement dates and never treats a closed period as paid', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.match(body, /data_pagamento::date/i);
  assert.match(body, /data_recebimento/i);
  assert.match(body, /cp\.status\s*=\s*'pago'/i);
  assert.match(body, /cr\.status\s*=\s*'recebido'/i);
  assert.doesNotMatch(body, /status\s*=\s*'fechada'.*data_caixa/i);
  assert.doesNotMatch(body, /at time zone\s+'America\/Sao_Paulo'/i);
});

test('cash links payroll and card detail to the exact generated payable', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.match(body, /cp_folha\.fonte_tipo\s*=\s*'folha_pagamento'/i);
  assert.match(body, /cp_folha\.fonte_identificador\s*=\s*d\.folha_id::text/i);
  assert.match(body, /cp_folha\.conta_pagadora_id\s*=\s*d\.conta_pagadora_id_usada/i);
  assert.match(body, /f\.conta_pagar_id\s*=\s*cp_cartao\.id/i);
});

test('generated payroll and card payables stay visible but outside plan KPIs', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.match(body, /cp\.fonte_tipo\s+in\s*\(\s*'folha_pagamento'\s*,\s*'cartao'\s*\)/i);
  assert.match(body, /'excluido'::text/i);
  assert.match(body, /excluido_da_receita/i);
  assert.match(body, /source_missing/i);
});

test('only explicitly confirmed card and receivable classifications enter the DRE', () => {
  const body = functionBody('dre_linhas_normalizadas');

  assert.match(body, /t\.classificacao_status\s+is\s+distinct\s+from\s+'confirmada'/i);
  assert.match(body, /cr\.classificacao_status\s+is\s+distinct\s+from\s+'confirmada'/i);
  assert.match(body, /cr\.cadastro_match_status\s+is\s+distinct\s+from\s+'unico'/i);
});

test('consultation returns KPIs, groups, plans, source coverage and five reconciliation buckets', () => {
  const body = functionBody('dre_consultar');

  assert.match(body, /'receita'/i);
  assert.match(body, /'despesa'/i);
  assert.match(body, /'lucro_operacional'/i);
  assert.match(body, /'investimentos'/i);
  assert.match(body, /'entradas_nao_operacionais'/i);
  assert.match(body, /'saidas_nao_operacionais'/i);
  assert.match(body, /'lucro_liquido'/i);
  assert.match(body, /'grupos'/i);
  assert.match(body, /'planos'/i);
  assert.match(body, /'cobertura'/i);
  assert.match(body, /'reconciliacao'/i);
  assert.match(body, /classificado_dre/i);
  assert.match(body, /em_revisao/i);
  assert.match(body, /sem_plano/i);
  assert.match(body, /cancelado/i);
  assert.match(body, /excluido/i);
  assert.match(body, /total_origem/i);
  assert.match(body, /sum\(l\.valor_fonte\)\s+as valor_resultado/i);
  assert.doesNotMatch(body, /sum\(l\.valor_resultado\)\s+as valor_resultado[\s\S]*jsonb_object_agg\(l\.fonte, l\.valor_fonte/i);
});

test('details use a deterministic keyset cursor and never offset pagination', () => {
  const body = functionBody('dre_detalhes');

  assert.match(body, /p_cursor->>'plano_codigo'/i);
  assert.match(body, /p_cursor->>'fonte'/i);
  assert.match(body, /p_cursor->>'origem_id'/i);
  assert.match(body, /order by[\s\S]*plano_codigo[\s\S]*fonte[\s\S]*origem_id[\s\S]*origem_sequencia/i);
  assert.match(body, /'next_cursor'/i);
  assert.doesNotMatch(body, /\boffset\b/i);
});

test('public RPCs are stable, read-only and least-privilege', () => {
  for (const name of ['dre_consultar', 'dre_detalhes']) {
    const body = functionBody(name);
    assert.match(body, /language\s+plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path\s*=\s*public,\s*pg_temp/i);
    assert.doesNotMatch(body, /\b(insert|update|delete|merge|truncate)\b\s+(?:into|public\.|from)/i);
  }

  assert.match(sql, /revoke all on function public\.dre_consultar\(date, text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.dre_consultar\(date, text\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.dre_detalhes\(date, text, text, text, jsonb, integer\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.dre_detalhes\(date, text, text, text, jsonb, integer\) to authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.dre_linhas_normalizadas\(date, text\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.dre_linhas_normalizadas\(date, text\)\s+to authenticated/i);
});
