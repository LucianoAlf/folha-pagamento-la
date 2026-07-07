import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260707_1_maria_conferencia_preflight_duplicidade_forte.sql', import.meta.url), 'utf8');

test('Maria conference preflight uses strong duplicate criteria instead of value-only matches', () => {
  assert.match(sql, /create or replace function public\.maria_conferencia_lancamento_preflight/i);
  assert.match(sql, /v_item_descricao_norm/i);
  assert.match(sql, /v_cp_descricao_norm/i);
  assert.match(sql, /v_descricao_match/i);
  assert.match(sql, /v_unidade_match/i);
  assert.match(sql, /v_data_match/i);
  assert.match(sql, /v_tipo_match/i);
  assert.match(sql, /(?:where|and)\s+(?:matched\.)?v_descricao_match/i);
  assert.match(sql, /(?:where|and)\s+(?:matched\.)?v_unidade_match/i);
  assert.match(sql, /(?:where|and)\s+(?:matched\.)?v_data_match/i);
  assert.match(sql, /(?:where|and)\s+(?:matched\.)?v_tipo_match/i);
});

test('Maria conference preflight explicitly avoids blocking eventuals against unrelated recurring accounts', () => {
  assert.match(sql, /tipo_lancamento compativel/i);
  assert.match(sql, /coalesce\(cp\.tipo_lancamento,\s*''\)\s*=\s*'recorrente'[\s\S]*norm\.v_cp_unidade_codigo\s*=\s*i\.unidade_codigo/i);
  assert.match(sql, /Krissya Barra eventual/i);
  assert.match(sql, /iFood Kids CG recorrente/i);
  assert.match(sql, /Valor\/plano isolados nao sao duplicidade forte/i);
});

test('Maria conference preflight keeps Maria access grants', () => {
  assert.match(sql, /revoke all on function public\.maria_conferencia_lancamento_preflight/i);
  assert.match(sql, /grant execute on function public\.maria_conferencia_lancamento_preflight[\s\S]*to maria_leitura, maria_operacional, service_role/i);
});
