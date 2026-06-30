import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260630_18_financeiro_cartao_crud.sql', import.meta.url), 'utf8');
const m19 = readFileSync(new URL('./20260630_19_financeiro_cartao_salvar_ativo_guard.sql', import.meta.url), 'utf8');

test('M18 creates card save and archive RPCs as secure definer functions', () => {
  assert.match(sql, /create or replace function public\.financeiro_cartao_salvar\(p_payload jsonb, p_ator jsonb/i);
  assert.match(sql, /create or replace function public\.financeiro_cartao_arquivar\(p_payload jsonb, p_ator jsonb/i);
  assert.match(sql, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(sql, /returns jsonb/i);
});

test('M18 resolves web actors from auth context and ignores forged payload actor', () => {
  assert.match(sql, /v_role\s*:=\s*coalesce\(nullif\(auth\.role\(\), ''\)/i);
  assert.match(sql, /if v_role = 'authenticated' then[\s\S]*v_ator_tipo := 'web'/i);
  assert.match(sql, /v_created_by := auth\.uid\(\)/i);
  assert.match(sql, /current_setting\('request\.jwt\.claim\.email', true\)/i);
  assert.match(sql, /elsif v_role = 'service_role' then/i);
  assert.match(sql, /not in \('web','maria','openfinance','sistema'\)/i);
});

test('M18 validates required fields and four-digit card final', () => {
  assert.match(sql, /apelido obrigatorio/i);
  assert.match(sql, /final obrigatorio/i);
  assert.match(sql, /titularidade_tipo obrigatorio/i);
  assert.match(sql, /v_final !~ '\^\[0-9\]\{4\}\$'/i);
  assert.match(sql, /final deve conter exatamente 4 digitos/i);
  assert.doesNotMatch(sql, /regexp_replace\([^)]*final[^)]*\\D/i);
});

test('M18 saves card rows without altering card-table schema', () => {
  assert.match(sql, /insert into public\.financeiro_cartoes/i);
  assert.match(sql, /update public\.financeiro_cartoes/i);
  assert.match(sql, /returning \* into v_after/i);
  assert.match(sql, /unique_violation[\s\S]*Ja existe um cartao com esse apelido/i);
  assert.doesNotMatch(sql, /alter table public\.financeiro_cartoes/i);
  assert.doesNotMatch(sql, /create table/i);
});

test('M18 audits insert, update, archive and unarchive through maria_audit_log helper', () => {
  assert.match(sql, /financeiro_cartoes_audit_insert[\s\S]*'financeiro_cartoes'[\s\S]*'cartao'[\s\S]*'INSERT'/i);
  assert.match(sql, /financeiro_cartoes_audit_insert[\s\S]*'financeiro_cartoes'[\s\S]*'cartao'[\s\S]*'UPDATE'/i);
  assert.match(sql, /financeiro_cartoes_audit_insert[\s\S]*'financeiro_cartoes'[\s\S]*'cartao'[\s\S]*'ARCHIVE'/i);
  assert.match(sql, /financeiro_cartoes_audit_insert[\s\S]*'financeiro_cartoes'[\s\S]*'cartao'[\s\S]*'UNARCHIVE'/i);
  assert.match(sql, /to_jsonb\(v_before\)/i);
  assert.match(sql, /to_jsonb\(v_after\)/i);
});

test('M18 archives cards by toggling ativo and never deletes them', () => {
  assert.match(sql, /v_ativo := coalesce/i);
  assert.match(sql, /set ativo = v_ativo/i);
  assert.match(sql, /case when v_ativo then 'UNARCHIVE' else 'ARCHIVE' end/i);
  assert.doesNotMatch(sql, /delete from public\.financeiro_cartoes/i);
});

test('M18 grants only RPC execute to authenticated and service_role', () => {
  assert.match(sql, /revoke all on function public\.financeiro_cartao_salvar\(jsonb, jsonb\) from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.financeiro_cartao_salvar\(jsonb, jsonb\) to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.financeiro_cartao_arquivar\(jsonb, jsonb\) from public, anon, authenticated, maria_operacional, maria_leitura/i);
  assert.match(sql, /grant execute on function public\.financeiro_cartao_arquivar\(jsonb, jsonb\) to authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+public\.financeiro_cartoes\s+to\s+authenticated/i);
});

test('M19 makes salvar ignore ativo and keeps archive as the only active-state writer', () => {
  assert.match(m19, /create or replace function public\.financeiro_cartao_salvar\(p_payload jsonb, p_ator jsonb/i);
  assert.match(m19, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(m19, /insert into public\.financeiro_cartoes[\s\S]*ativo[\s\S]*values[\s\S]*true/i);
  assert.match(m19, /set apelido = v_apelido[\s\S]*ativo = v_before\.ativo/i);
  assert.doesNotMatch(m19, /p_payload\s*\?\s*'ativo'/i);
  assert.doesNotMatch(m19, /p_payload->>'ativo'/i);
  assert.doesNotMatch(m19, /v_ativo boolean/i);
  assert.doesNotMatch(m19, /create or replace function public\.financeiro_cartao_arquivar/i);
});
