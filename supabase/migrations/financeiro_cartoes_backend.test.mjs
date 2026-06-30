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
