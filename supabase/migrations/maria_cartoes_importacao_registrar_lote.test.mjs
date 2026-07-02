import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

const sql = read('20260702_1_maria_cartoes_importacao_registrar_lote.sql');

test('Maria card batch RPC is the only operational entrypoint and keeps low-level card RPCs private', () => {
  assert.match(sql, /create or replace function public\.maria_cartoes_importacao_registrar_lote\(/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public,\s*pg_temp/i);
  assert.match(sql, /maria_assert_actor[\s\S]*owner_full[\s\S]*finance_ops_write_safe[\s\S]*finance_assistant_write_safe/i);
  assert.match(sql, /grant execute on function public\.maria_cartoes_importacao_registrar_lote\([\s\S]*\) to maria_operacional/i);
  assert.match(sql, /revoke all on function public\.maria_cartoes_importacao_registrar_lote\([\s\S]*\) from public, anon, authenticated, maria_leitura/i);
  assert.match(sql, /v_role = 'maria_operacional'/i);
  assert.doesNotMatch(sql, /grant execute on function public\.financeiro_cartao_transacao_registrar\(jsonb,\s*jsonb\) to[\s\S]*maria_operacional/i);
});

test('Maria card batch reuses the card transaction pipeline without loose transaction inserts', () => {
  assert.match(sql, /public\.financeiro_cartao_fatura_abrir/i);
  assert.match(sql, /public\.financeiro_cartao_transacao_registrar/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.financeiro_cartao_transacoes/i);
  assert.match(sql, /where t\.fatura_id = v_fatura\.id[\s\S]*and t\.fingerprint = v_fingerprint/i);
  assert.match(sql, /where t\.fatura_id = v_fatura\.id[\s\S]*and t\.id_externo = v_id_externo/i);
  assert.match(sql, /coalesce\(nullif\(trim\(p_mensagem_origem_id\), ''\), v_documento_hash, v_fatura\.id::text\)/i);
});

test('Maria card batch creates/reuses document and import batch with safe dedupe', () => {
  assert.match(sql, /alter table public\.financeiro_cartao_importacoes[\s\S]*check \(origem in \('upload','whatsapp','openfinance','manual','maria'\)\)/i);
  assert.match(sql, /add column if not exists linhas_duplicadas int not null default 0/i);
  assert.match(sql, /from public\.financeiro_documentos d[\s\S]*where d\.hash = v_documento_hash/i);
  assert.match(sql, /ja_importado[\s\S]*true/i);
  assert.match(sql, /insert into public\.financeiro_cartao_importacoes[\s\S]*'maria'[\s\S]*'processando'/i);
  assert.match(sql, /status = 'concluida'/i);
});

test('Maria card batch only suggests valid high-confidence fiscal triads and never confirms', () => {
  assert.match(sql, /p_limiar_confianca numeric default 0\.80/i);
  assert.match(sql, /v_confianca >= p_limiar_confianca/i);
  assert.match(sql, /p\.nivel = 3/i);
  assert.match(sql, /p\.natureza = 'saida'/i);
  assert.match(sql, /p\.ativo = true/i);
  assert.match(sql, /e\.unidade_id = v_linha_centro_custo_id/i);
  assert.match(sql, /v_linha_classificacao_status := 'sugerida'/i);
  assert.match(sql, /v_linha_classificacao_status := 'pendente'/i);
  assert.doesNotMatch(sql, /classificacao_status',\s*'confirmada'/i);
});

test('Maria card batch normalizes signs, isolates line errors and audits a sanitized result', () => {
  assert.match(sql, /if v_linha_tipo_transacao = 'estorno' then[\s\S]*-abs\(v_linha_valor\)/i);
  assert.match(sql, /elsif v_linha_tipo_transacao in \('compra','tarifa','anuidade','ajuste'\) then[\s\S]*abs\(v_linha_valor\)/i);
  assert.match(sql, /exception when others then/i);
  assert.match(sql, /linhas_erro := v_linhas_erro/i);
  assert.match(sql, /public\.maria_audit_insert[\s\S]*'financeiro_cartao_importacoes'[\s\S]*'registrar_lote'/i);
  assert.match(sql, /jsonb_build_object\([\s\S]*'success'[\s\S]*'importacao_id'[\s\S]*'linhas'/i);
  assert.doesNotMatch(sql, /codigo_barras|qr_pix|pix_payload|pan/i);
});
