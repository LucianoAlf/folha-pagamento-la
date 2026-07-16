import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

const m1 = read('20260629_1_financeiro_cartoes_base.sql');
const m2 = read('20260629_2_financeiro_cartoes_triggers_classificacao.sql');
const m3 = read('20260629_3_contas_pagar_fatura_cartao_tipo.sql');
const m4 = read('20260629_4_cartoes_excluir_fatura_cartao_agregacoes.sql');
const m4Audit = readFileSync(new URL('../functions/ai-contas-auditoria/index.ts', import.meta.url), 'utf8');
const m4Comparativo = readFileSync(new URL('../functions/ai-contas-comparativo/index.ts', import.meta.url), 'utf8');
const m5 = read('20260629_5_financeiro_cartoes_rpcs.sql');
const m6 = read('20260629_6_financeiro_cartoes_triggers_fechamento.sql');
const m7 = read('20260629_7_financeiro_cartoes_seed.sql');
const m8 = read('20260629_8_financeiro_cartoes_classificacao_empresa_centro.sql');
const m9 = read('20260630_9_financeiro_cartao_ciclo.sql');
const m10 = read('20260630_10_financeiro_cartao_t1_reclassificacao.sql');
const m11 = read('20260630_11_financeiro_cartao_faturas_sync_valor.sql');
const m12 = read('20260630_12_financeiro_cartao_fatura_abrir.sql');
const m13 = read('20260630_13_financeiro_cartao_lancamento_registrar.sql');
const m14 = read('20260630_14_financeiro_cartao_transacao_classificar.sql');
const m15 = read('20260630_15_financeiro_cartao_transacao_editar.sql');
const m16 = read('20260630_16_financeiro_cartao_transacao_cancelar.sql');
const m17 = read('20260630_17_financeiro_cartao_fatura_fechar_contadores.sql');

test('M1 creates card, invoice, import and transaction tables with least-privilege grants', () => {
  for (const table of ['financeiro_cartoes', 'financeiro_cartao_faturas', 'financeiro_cartao_importacoes', 'financeiro_cartao_transacoes']) {
    assert.match(m1, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(m1, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(m1, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated, maria_operacional, maria_leitura`, 'i'));
    assert.match(m1, new RegExp(`grant select on public\\.${table} to authenticated, service_role`, 'i'));
  }

  assert.match(m1, /titularidade_tipo text not null default 'pj' check \(titularidade_tipo in \('pj','pf'\)\)/i);
  assert.match(m1, /create unique index if not exists financeiro_cartoes_empresa_final_uidx[\s\S]*where empresa_id is not null/i);
  assert.match(m1, /documento_id uuid null references public\.financeiro_documentos\(id\)/i);
  assert.match(m1, /fingerprint text null/i);
  assert.doesNotMatch(m1, /unique[^\n]*fingerprint|fingerprint[^\n]*unique/i);
  assert.match(m1, /create unique index if not exists financeiro_cartao_transacoes_id_externo_uidx[\s\S]*where id_externo is not null/i);
});

test('M2 enforces payer-account fiscal coherence and confirmed classification invariants', () => {
  assert.match(m2, /create or replace function public\.financeiro_cartoes_valida_coerencia/i);
  assert.match(m2, /from public\.financeiro_contas_bancarias b/i);
  assert.match(m2, /v_empresa_conta\s*<>\s*new\.empresa_id/i);
  assert.match(m2, /v_unidade_conta\s*<>\s*new\.centro_custo_id/i);
  assert.match(m2, /create trigger trg_financeiro_cartoes_valida_coerencia/i);

  assert.match(m2, /create or replace function public\.financeiro_cartao_transacoes_valida_classificacao/i);
  assert.match(m2, /classificacao_status\s*=\s*'confirmada'/i);
  assert.match(m2, /p\.nivel\s*=\s*3/i);
  assert.match(m2, /p\.natureza\s*=\s*'saida'/i);
  assert.match(m2, /centro_custo_id obrigatorio para classificacao confirmada/i);
});

test('M3 adds fatura_cartao to contas_pagar tipo_lancamento check only', () => {
  assert.match(m3, /drop constraint if exists contas_pagar_tipo_lancamento_check/i);
  assert.match(m3, /tipo_lancamento in \('unica','recorrente','parcelada','eventual','fatura_cartao'\)/i);
  assert.match(m3, /drop constraint if exists contas_pagar_fonte_tipo_check/i);
  assert.match(m3, /fonte_tipo[\s\S]*'cartao'/i);
});

test('M4 excludes fatura_cartao from plan-based AI aggregation without removing it from cash flow queries', () => {
  assert.match(m4, /anti-dupla-contagem/i);
  assert.match(m4, /fatura_cartao/i);
  assert.match(m4, /do \$\$/i);

  assert.match(m4Audit, /type ContaRow[\s\S]*\|\s*"fatura_cartao"/i);
  assert.match(m4Audit, /function isPlanoAggregationConta[\s\S]*tipo_lancamento !== "fatura_cartao"/i);
  assert.match(m4Audit, /contas\.filter\(isPlanoAggregationConta\)/i);

  assert.match(m4Comparativo, /type ContaRow[\s\S]*\|\s*"fatura_cartao"/i);
  assert.match(m4Comparativo, /function isPlanoAggregationConta[\s\S]*tipo_lancamento !== "fatura_cartao"/i);
  assert.match(m4Comparativo, /baseRows\.filter\(isPlanoAggregationConta\)/i);
  assert.match(m4Comparativo, /currRows\.filter\(isPlanoAggregationConta\)/i);
});

test('plan-based AI aggregation also excludes payroll payment instruments', () => {
  assert.match(m4Audit, /type ContaRow[\s\S]*\|\s*"folha_pagamento"/i);
  assert.match(m4Audit, /function isPlanoAggregationConta[\s\S]*tipo_lancamento !== "folha_pagamento"/i);
  assert.match(m4Comparativo, /type ContaRow[\s\S]*\|\s*"folha_pagamento"/i);
  assert.match(m4Comparativo, /function isPlanoAggregationConta[\s\S]*tipo_lancamento !== "folha_pagamento"/i);
});

test('M5 creates secure ingestion, close and reopen RPCs with actor derivation and grants', () => {
  assert.match(m5, /create or replace function public\.financeiro_cartao_transacao_registrar\(payload jsonb, ator jsonb/i);
  assert.match(m5, /auth\.role\(\)/i);
  assert.match(m5, /v_role\s*=\s*'authenticated'/i);
  assert.match(m5, /v_ator_tipo := 'web'/i);
  assert.match(m5, /v_role\s*=\s*'service_role'/i);
  assert.match(m5, /possivel_duplicata/i);
  assert.match(m5, /where cartao_id = v_fatura\.cartao_id[\s\S]*and id_externo = v_id_externo/i);
  assert.match(m5, /create or replace function public\.financeiro_cartao_fatura_fechar\(p_fatura_id uuid, ator jsonb/i);
  assert.match(m5, /tipo_lancamento[\s\S]*'fatura_cartao'/i);
  assert.match(m5, /fonte_tipo[\s\S]*'cartao'/i);
  assert.match(m5, /create or replace function public\.financeiro_cartao_fatura_reabrir\(p_fatura_id uuid, ator jsonb/i);
  assert.match(m5, /grant execute on function public\.financeiro_cartao_transacao_registrar\(jsonb, jsonb\) to authenticated, service_role/i);
});

test('M6 blocks transaction edits on closed invoices and syncs paid contas_pagar back to card invoice', () => {
  assert.match(m6, /create or replace function public\.financeiro_cartao_transacoes_bloqueia_fatura_fechada/i);
  assert.match(m6, /status in \('fechada','paga'\)/i);
  assert.match(m6, /if tg_op = 'DELETE' then[\s\S]*return old/i);
  assert.match(m6, /create trigger trg_financeiro_cartao_transacoes_bloqueia_fatura_fechada/i);
  assert.match(m6, /create or replace function public\.financeiro_cartao_faturas_sync_pagamento/i);
  assert.match(m6, /new\.tipo_lancamento\s*=\s*'fatura_cartao'/i);
  assert.match(m6, /new\.status\s*=\s*'pago'/i);
  assert.match(m6, /update public\.financeiro_cartao_faturas/i);
});

test('M7 seeds the six cards including Mercado Pago as PF paid by Barra', () => {
  for (const final of ['1074', '8434', '2270', '8641', '8516', '4425']) {
    assert.match(m7, new RegExp(final));
  }
  assert.match(m7, /'4425'[\s\S]*'pf'[\s\S]*'Luciano Teixeira'/i);
  assert.match(m7, /03b21560-69db-4488-a413-a9e6e56fc71e/i);
  assert.match(m7, /2670b337-3711-4ce7-9ce0-c25b4ae855c8/i);
  assert.match(m7, /on conflict \(apelido\) do update/i);
});

test('M8 requires empresa coherence only for confirmed card-transaction classification', () => {
  assert.match(m8, /create or replace function public\.financeiro_cartao_transacoes_valida_classificacao/i);

  const confirmedBlock = m8.match(/if new\.classificacao_status = 'confirmada' then([\s\S]*?)return new;/i)?.[1] || '';
  assert.match(confirmedBlock, /if new\.empresa_id is null then[\s\S]*empresa_id obrigatorio para classificacao confirmada/i);
  assert.match(confirmedBlock, /select unidade_id into v_unidade_empresa[\s\S]*from public\.financeiro_empresas/i);
  assert.match(confirmedBlock, /if v_unidade_empresa is null or v_unidade_empresa <> new\.centro_custo_id then[\s\S]*centro_custo_id incoerente com a empresa para classificacao confirmada/i);
  assert.match(confirmedBlock, /p\.nivel\s*=\s*3/i);
  assert.match(confirmedBlock, /p\.natureza\s*=\s*'saida'/i);
  assert.match(confirmedBlock, /new\.centro_custo_id is null/i);

  assert.doesNotMatch(m8, /classificacao_status\s+in\s+\('pendente','sugerida'\)[\s\S]*empresa_id obrigatorio/i);
});

test('M9 adds the Sao Paulo card-cycle helper with inclusive closing, due-month competence and month-end clamp', () => {
  assert.match(m9, /create or replace function public\.financeiro_cartao_ciclo\(p_cartao_id uuid, p_data date\)/i);
  assert.match(m9, /returns table\s*\(\s*competencia date,\s*data_fechamento date,\s*data_vencimento date/i);
  assert.match(m9, /v_dia_fechamento is null or v_dia_vencimento is null/i);
  assert.match(m9, /sem dia de fechamento\/vencimento configurado/i);
  assert.match(m9, /if p_data <= v_fechamento_atual then/i);
  assert.match(m9, /date_trunc\('month', v_data_vencimento\)::date/i);
  assert.match(m9, /least\(p_dia,\s*extract\(day from/i);
  assert.match(m9, /Kids 1074[\s\S]*12\/25[\s\S]*dia 12/i);
  assert.match(m9, /Barra 8516[\s\S]*28\/dez\/2025/i);
  assert.match(m9, /Recreio 8641[\s\S]*01\/15/i);
});

test('M10 evolves T1 to block non-open invoices except classification-only updates on closed or paid invoices', () => {
  assert.match(m10, /create or replace function public\.financeiro_cartao_transacoes_bloqueia_fatura_fechada/i);
  assert.match(m10, /v_status\s*=\s*'cancelada'/i);
  assert.match(m10, /tg_op\s*=\s*'UPDATE'[\s\S]*v_status in \('fechada','paga'\)/i);
  assert.match(m10, /new\.valor is not distinct from old\.valor/i);
  assert.match(m10, /new\.data_compra is not distinct from old\.data_compra/i);
  assert.doesNotMatch(m10, /new\.plano_conta_id is not distinct from old\.plano_conta_id/i);
  assert.doesNotMatch(m10, /new\.classificacao_status is not distinct from old\.classificacao_status/i);
  assert.match(m10, /fatura .* permite apenas reclassificacao/i);
  assert.match(m10, /fatura .* nao permite alterar transacoes/i);
});

test('M11 keeps invoice total synchronized from card transactions including fatura moves', () => {
  assert.match(m11, /create or replace function public\.financeiro_cartao_faturas_recalcula_valor/i);
  assert.match(m11, /coalesce\(sum\(valor\),\s*0\)/i);
  assert.match(m11, /where fatura_id = p_fatura_id/i);
  assert.match(m11, /tg_op = 'UPDATE'[\s\S]*old\.fatura_id is distinct from new\.fatura_id/i);
  assert.match(m11, /after insert or delete or update of valor, fatura_id/i);
  assert.match(m11, /trg_financeiro_cartao_faturas_sync_valor_total/i);
});

test('M12 creates idempotent invoice-open RPC using cycle rules and inverse competence resolution', () => {
  assert.match(m12, /create or replace function public\.financeiro_cartao_fatura_abrir\(payload jsonb, ator jsonb/i);
  assert.match(m12, /financeiro_cartoes_resolve_ator\(ator\)/i);
  assert.match(m12, /from public\.financeiro_cartao_ciclo\(v_cartao_id, v_data_compra\) c/i);
  assert.match(m12, /v_competencia := date_trunc\('month', v_competencia\)::date/i);
  assert.match(m12, /v_data_fechamento := public\.financeiro_cartao_data_fechamento_por_competencia/i);
  assert.match(m12, /insert into public\.financeiro_cartao_faturas/i);
  assert.match(m12, /on conflict \(cartao_id, competencia\) do nothing/i);
  assert.match(m12, /financeiro_cartoes_audit_insert[\s\S]*abrir_fatura_cartao/i);
  assert.match(m12, /grant execute on function public\.financeiro_cartao_fatura_abrir\(jsonb, jsonb\) to authenticated, service_role/i);
});

test('M13 registers idempotent one-off and installment card purchases through the low-level transaction RPC', () => {
  assert.match(m13, /create or replace function public\.financeiro_cartao_lancamento_registrar\(payload jsonb, ator jsonb/i);
  assert.match(m13, /client_token obrigatorio/i);
  assert.match(m13, /v_total_parcelas > 1 and v_tipo_transacao <> 'compra'/i);
  assert.match(m13, /v_compra_parcelada_id := gen_random_uuid\(\)/i);
  assert.match(m13, /v_valor_parcela_base := round\(v_valor_total \/ v_total_parcelas, 2\)/i);
  assert.match(m13, /v_valor_parcela := round\(v_valor_total - v_soma_parcial, 2\)/i);
  assert.match(m13, /v_data_parcela := \(v_data_compra \+ make_interval\(months => v_idx - 1\)\)::date/i);
  assert.match(m13, /public\.financeiro_cartao_fatura_abrir/i);
  assert.match(m13, /if v_fatura\.status <> 'aberta' then/i);
  assert.match(m13, /public\.financeiro_cartao_transacao_registrar/i);
  assert.match(m13, /concat\(v_client_token, '-', v_idx, '\/', v_total_parcelas\)/i);
  assert.match(m13, /grant execute on function public\.financeiro_cartao_lancamento_registrar\(jsonb, jsonb\) to authenticated, service_role/i);
});

test('M14 classifies card transactions, allows closed or paid invoices, blocks cancelled invoices and audits before/after', () => {
  assert.match(m14, /create or replace function public\.financeiro_cartao_transacao_classificar\(payload jsonb, ator jsonb/i);
  assert.match(m14, /v_fatura\.status = 'cancelada'/i);
  assert.match(m14, /classificacao_status invalido/i);
  assert.match(m14, /update public\.financeiro_cartao_transacoes/i);
  assert.match(m14, /classificado_por = v_actor->>'ator_tipo'/i);
  assert.match(m14, /financeiro_cartoes_audit_insert[\s\S]*classificar_transacao_cartao/i);
  assert.match(m14, /grant execute on function public\.financeiro_cartao_transacao_classificar\(jsonb, jsonb\) to authenticated, service_role/i);
});

test('M15 edits factual fields only on open one-off transactions and refuses competence moves', () => {
  assert.match(m15, /create or replace function public\.financeiro_cartao_transacao_editar\(payload jsonb, ator jsonb/i);
  assert.match(m15, /v_fatura\.status <> 'aberta'/i);
  assert.match(m15, /v_before\.compra_parcelada_id is not null/i);
  assert.match(m15, /transacao parcelada deve ser cancelada e relancada/i);
  assert.match(m15, /financeiro_cartao_ciclo\(v_before\.cartao_id, v_nova_data\)/i);
  assert.match(m15, /v_nova_competencia <> v_fatura\.competencia/i);
  assert.match(m15, /mudar data_compra para outra competencia exige cancelar e relancar/i);
  assert.match(m15, /financeiro_cartoes_audit_insert[\s\S]*editar_transacao_cartao/i);
});

test('M16 cancels open card transactions atomically and blocks installment groups with non-open invoices', () => {
  assert.match(m16, /create or replace function public\.financeiro_cartao_transacao_cancelar\(payload jsonb, ator jsonb/i);
  assert.match(m16, /transacao_id ou compra_parcelada_id obrigatorio/i);
  assert.match(m16, /for update/i);
  assert.match(m16, /exists[\s\S]*f\.status <> 'aberta'/i);
  assert.match(m16, /parcelas em fatura nao-aberta impedem cancelamento/i);
  assert.match(m16, /delete from public\.financeiro_cartao_transacoes/i);
  assert.match(m16, /financeiro_cartoes_audit_insert[\s\S]*cancelar_transacao_cartao/i);
});

test('M17 adds non-blocking classification counters to fatura close return', () => {
  assert.match(m17, /create or replace function public\.financeiro_cartao_fatura_fechar\(p_fatura_id uuid, ator jsonb/i);
  assert.match(m17, /count\(\*\)::int as total/i);
  assert.match(m17, /filter \(where classificacao_status = 'confirmada'\)\)::int as confirmadas/i);
  assert.match(m17, /filter \(where classificacao_status = 'sugerida'\)\)::int as sugeridas/i);
  assert.match(m17, /filter \(where classificacao_status = 'pendente'\)\)::int as pendentes/i);
  assert.match(m17, /dre_incompleto/i);
  assert.doesNotMatch(m17, /raise exception 'fatura possui transacoes nao classificadas/i);
});
