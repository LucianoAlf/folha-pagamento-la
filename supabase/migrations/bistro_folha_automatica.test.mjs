import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('./20260716_5_bistro_folha_automatica.sql', import.meta.url),
  'utf8',
);

const directPaymentFixSql = readFileSync(
  new URL('./20260716_6_bistro_pagamento_direto_historico.sql', import.meta.url),
  'utf8',
);

const legacySnapshotFixSql = readFileSync(
  new URL('./20260716_7_bistro_snapshot_legado_reconciliado.sql', import.meta.url),
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

const assertJsonKeys = (body, keys) => {
  for (const key of keys) {
    assert.match(body, new RegExp(`['\"]${key}['\"]`, 'i'));
  }
};

test('adds explicit direct-payment value with the real June anchor', () => {
  assert.match(sql, /add column if not exists valor_pago_direto numeric not null default 0/i);
  assert.match(sql, /valor_pago_direto\s*>=\s*0/i);
  assert.match(sql, /valor_pago_direto\s*<=\s*valor/i);
  assert.match(sql, /59\.30[\s\S]*98\.70[\s\S]*32\.90/i);
  assert.match(sql, /5955\.48[\s\S]*190\.90[\s\S]*5764\.58/i);
});

test('suggestion is read-only, resolves M-1 and returns deterministic previews', () => {
  const body = functionBody('folha_sugerir_desconto_bistro');
  assert.match(body, /make_date\([\s\S]*interval '1 month'/i);
  assert.match(body, /from public\.bistro_competencias/i);
  assert.match(body, /valor\s*-\s*valor_pago_direto/i);
  assert.match(body, /bistro-write-v1/i);
  assert.match(body, /order by[\s\S]*lancamento_id/i);
  assert.match(body, /desconto_sem_origem/i);
  assert.match(body, /metadata mista/i);
  assert.match(body, /sem_lancamento/i);
  assert.match(body, /consumo.*base disponivel|base disponivel.*consumo/i);
  assert.match(body, /\*\s*100|100\s*\*/i);
  assert.match(body, /residuo/i);
  assert.match(body, /jsonb_agg\([\s\S]*order by[\s\S]*lancamento_id/i);
  assert.match(body, /allocation_version[\s\S]*bistro-write-v1/i);
  assert.match(body, /metadata_normalizada|metadata normalizada/i);
  assert.match(body, /descontos_novo_centavos/i);
  assert.match(body, /detalhamento_sem_bistro/i);
  assert.doesNotMatch(body, /insert into public\.lancamentos_folha|update public\.lancamentos_folha|delete from public\.lancamentos_folha/i);

  assertJsonKeys(body, [
    'success', 'folha_id', 'folha_status', 'bistro_competencia_id',
    'ref_ym', 'resumo', 'pessoas', 'total_bruto', 'pago_direto',
    'aplicavel', 'ja_aplicado', 'outros_descontos', 'divergencia',
    'colaborador_id', 'nome', 'valor_consumo', 'valor_pago_direto',
    'valor_aplicavel', 'status', 'desconto_sem_origem', 'source_hash',
    'linhas', 'lancamento_id', 'unidade', 'categoria',
    'conta_pagadora_id', 'descontos_atual', 'bistro_anterior',
    'base_disponivel', 'bistro_novo', 'descontos_novo',
  ]);
});

test('application locks the person, checks stale hash and supports explicit apply or remove', () => {
  const body = functionBody('folha_aplicar_sugestao_bistro');
  const staleCheckAt = body.search(/v_source_hash\s+is distinct from\s+p_source_hash_esperado/i);
  const alreadyAppliedAt = body.search(/'status',\s*'already_applied'/i);
  assert.match(body, /p_acao text/i);
  assert.match(body, /p_acao not in \('aplicar', 'remover'\)/i);
  assert.match(body, /for update/i);
  assert.match(body, /p_source_hash_esperado/i);
  assert.match(body, /Os valores mudaram\. Atualize a sugestao antes de aplicar\./i);
  assert.match(body, /metadata mista/i);
  assert.match(body, /base disponivel/i);
  assert.match(body, /already_applied/i);
  assert.ok(staleCheckAt >= 0, 'application must compare the locked source hash');
  assert.ok(staleCheckAt < alreadyAppliedAt, 'stale hash must fail before idempotent return');
  assert.match(body, /__bistro/i);
  assert.match(body, /source_hash/i);
  assert.match(body, /recalc_folha_totais/i);
  assert.match(body, /insert into public\.maria_audit_log/i);
  assert.match(body, /total_geral_depois[\s\S]*total_geral_antes|total_depois[\s\S]*total_antes/i);
  assert.match(body, /bistro_anterior[\s\S]*bistro_novo/i);
  assertJsonKeys(body, [
    'success', 'status', 'folha_id', 'colaborador_id', 'source_hash',
    'total_antes', 'total_depois', 'audit_id',
  ]);
});

test('direct-payment write is narrow, explicit and audited', () => {
  const body = functionBody('bistro_consumo_pagamento_direto_salvar');
  assert.match(body, /p_valor_pago_direto numeric/i);
  assert.match(body, /p_valor_esperado numeric/i);
  assert.match(body, /for update/i);
  assert.match(body, /valor_pago_direto/i);
  assert.match(body, /folha_classificacao_dre/i);
  assert.match(body, /folhas_mensais/i);
  assert.match(body, /status\s*=\s*'fechada'/i);
  assert.match(body, /is not distinct from|is distinct from/i);
  assert.match(body, /insert into public\.maria_audit_log/i);
  assertJsonKeys(body, [
    'success', 'consumo_id', 'valor_pago_direto', 'audit_id',
  ]);
  assert.match(sql, /create trigger bistro_consumos_valor_pago_direto_guard/i);
  assert.match(sql, /before update of valor_pago_direto on public\.bistro_consumos/i);
  assert.match(body, /set_config\('app\.bistro_pagamento_direto_rpc', 'on', true\)/i);
});

test('historical direct payment remains auditable without mutating a closed DRE snapshot', () => {
  assert.match(
    directPaymentFixSql,
    /create\s+or\s+replace\s+function\s+public\.bistro_consumo_pagamento_direto_salvar/i,
  );
  assert.doesNotMatch(
    directPaymentFixSql,
    /valor_pago_direto protegido: competencia alimentou snapshot de folha fechada/i,
  );
  assert.doesNotMatch(directPaymentFixSql, /update\s+public\.folha_classificacao_dre/i);
  assert.match(directPaymentFixSql, /p_valor_esperado/i);
  assert.match(directPaymentFixSql, /insert into public\.maria_audit_log/i);
  assert.match(directPaymentFixSql, /security definer/i);
  assert.match(directPaymentFixSql, /set search_path = public, pg_temp/i);
  assert.match(directPaymentFixSql, /grant execute on function[\s\S]*authenticated, service_role/i);
});

test('legacy DRE snapshot remains proof only when its liquidation reconciles with current applicable Bistro', () => {
  assert.match(
    legacySnapshotFixSql,
    /create\s+or\s+replace\s+function\s+public\.folha_duplicar_lancamentos_preflight/i,
  );
  assert.match(legacySnapshotFixSql, /v_snapshot_liquidacao/i);
  assert.match(legacySnapshotFixSql, /v_bistro_aplicavel/i);
  assert.match(
    legacySnapshotFixSql,
    /v_snapshot_hash\s*=\s*v_hash_origem_legacy[\s\S]*v_snapshot_liquidacao[\s\S]*v_bistro_aplicavel/i,
  );
  assert.doesNotMatch(legacySnapshotFixSql, /v_legacy_sem_pagamento_direto/);
  assert.doesNotMatch(legacySnapshotFixSql, /update\s+public\.folha_classificacao_dre/i);
  assert.match(legacySnapshotFixSql, /security definer/i);
  assert.match(legacySnapshotFixSql, /set search_path = public, pg_temp/i);
});

test('DRE v4 replacement hashes and liquidates only payroll-applicable Bistro value', () => {
  const body = functionBody('folha_classificar_dre');
  const hashBody = functionBody('folha_dre_hash_origem');
  assert.match(body, /folha fechada.*snapshot.*imutavel/i);
  assert.match(body, /folha_dre_hash_origem\(p_folha_id, true\)/i);
  assert.match(body, /valor_pago_direto/i);
  assert.match(body, /greatest\(\s*(?:bc\.)?valor\s*-\s*(?:bc\.)?valor_pago_direto\s*,\s*0\s*\)/i);
  assert.match(body, /bistro_totais[\s\S]*greatest\(/i);
  assert.match(body, /consumos_bistro_sem_desconto[\s\S]*greatest\(/i);
  assert.match(hashBody, /valor_pago_direto/i);
  assert.match(hashBody, /p_incluir_valor_pago_direto/i);
  assert.match(hashBody, /jsonb_agg\([\s\S]*order by bc\.id/i);
  assert.doesNotMatch(sql, /folha_classificar_dre\(\s*17\s*,|delete from public\.folha_classificacao_dre\s+where folha_id\s*=\s*17/i);
});

test('monthly duplication has read-only preflight and one atomic execution path', () => {
  const preflight = functionBody('folha_duplicar_lancamentos_preflight');
  const execute = functionBody('folha_duplicar_lancamentos');
  assert.match(preflight, /source_hash/i);
  assert.match(preflight, /p_unidades text\[\]/i);
  assert.match(preflight, /conflito|ambigu/i);
  assert.match(preflight, /folha_classificacao_dre/i);
  assert.match(preflight, /hash_origem/i);
  assert.match(preflight, /tipo_efeito\s*=\s*'liquidacao'/i);
  assert.match(preflight, /order by[\s\S]*lancamento_id|order by[\s\S]*colaborador_id/i);
  assert.match(preflight, /observacoes|detalhamento/i);
  assertJsonKeys(preflight, [
    'success', 'origem_folha_id', 'destino_folha_id', 'unidades',
    'source_hash', 'pode_duplicar', 'ambiguos', 'insercoes',
  ]);
  assert.doesNotMatch(preflight, /insert into public\.lancamentos_folha|update public\.lancamentos_folha|delete from public\.lancamentos_folha/i);

  assert.match(execute, /p_source_hash_esperado/i);
  assert.match(execute, /conta_pagadora_id[\s\S]*null/i);
  assert.match(execute, /alert_checked[\s\S]*false/i);
  assert.match(execute, /group by[\s\S]*colaborador_id[\s\S]*unidade[\s\S]*categoria/i);
  assert.match(execute, /for update/i);
  assert.match(execute, /order by[\s\S]*folha_id|order by[\s\S]*id/i);
  assert.match(execute, /destino[\s\S]*rascunho/i);
  assert.match(execute, /unidades[\s\S]*(repet|duplic)/i);
  assert.match(execute, /ambigu/i);
  assert.match(execute, /recalc_folha_totais/i);
  assert.match(execute, /insert into public\.maria_audit_log/i);
  assertJsonKeys(execute, [
    'success', 'source_hash', 'inseridos', 'total_antes',
    'total_depois', 'audit_id',
  ]);
});

test('all writes use the audited web actor contract and least privilege', () => {
  for (const name of [
    'bistro_consumo_pagamento_direto_salvar',
    'folha_aplicar_sugestao_bistro',
    'folha_duplicar_lancamentos',
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = public, pg_temp/i);
    assert.match(body, /auth\.role\(\)/i);
    assert.match(body, /auth\.uid\(\)/i);
    assert.match(body, /service_role[\s\S]*postgres/i);
    assert.match(body, /ator\.tipo nao permitido/i);
  }

  assert.match(sql, /revoke all on function public\.folha_sugerir_desconto_bistro\(integer\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.folha_sugerir_desconto_bistro\(integer\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.bistro_consumo_pagamento_direto_salvar\(uuid, numeric, numeric, jsonb\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.bistro_consumo_pagamento_direto_salvar\(uuid, numeric, numeric, jsonb\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.folha_aplicar_sugestao_bistro\(integer, integer, text, text, jsonb\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.folha_aplicar_sugestao_bistro\(integer, integer, text, text, jsonb\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.folha_duplicar_lancamentos_preflight\(integer, integer, text\[\]\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.folha_duplicar_lancamentos_preflight\(integer, integer, text\[\]\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.folha_duplicar_lancamentos\(integer, integer, text\[\], text, jsonb\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.folha_duplicar_lancamentos\(integer, integer, text\[\], text, jsonb\) to authenticated, service_role/i);
});
