import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./_arquivo/20260805_1_rh_jornada_operacional.sql', import.meta.url);

function migrationSql() {
  return readFileSync(migrationUrl, 'utf8');
}

test('provisiona perfis faltantes e concede RH somente a conta confirmada da Ana', () => {
  const sql = migrationSql();
  assert.match(sql, /create or replace function public\.user_profile_on_auth_insert\(\)/i);
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /insert into public\.user_profiles[\s\S]*from auth\.users/i);
  assert.match(sql, /lower\(u\.email\)\s*=\s*'rh@lamusicschool\.com\.br'/i);
  assert.match(sql, /role\s*=\s*'rh'/i);
});

test('fecha DML direto e mantem role fora do RPC de autoedicao', () => {
  const sql = migrationSql();
  assert.match(sql, /revoke all on (table )?public\.user_profiles from anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)[^;]*user_profiles[^;]*authenticated/i);
  assert.match(sql, /create or replace function public\.user_profile_self_update\(\s*p_nome text,\s*p_avatar_url text default null\s*\)/i);
  assert.doesNotMatch(sql, /user_profile_self_update\([^)]*role/i);
  assert.match(sql, /on conflict \(id\)[\s\S]*do update set[\s\S]*nome\s*=[\s\S]*avatar_url\s*=/i);
  assert.match(sql, /revoke all on function public\.user_profile_self_update\(text, text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.user_profile_self_update\(text, text\) to authenticated/i);
});

test('RH pode identificar perfis operacionais sem abrir dados para usuarios comuns', () => {
  const sql = migrationSql();
  assert.match(sql, /create policy "RH can view operational profiles"[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.rh_is_admin_or_rh\(\)\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/i);
});
