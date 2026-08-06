import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./20260805_5_rh_dashboard_bootstrap_performance.sql', import.meta.url);

function migrationSql() {
  return readFileSync(migrationUrl, 'utf8');
}

test('bootstrap do Dashboard e invocador, limitado e protegido por grants explicitos', () => {
  const sql = migrationSql();

  assert.match(sql, /create or replace function public\.rh_dashboard_bootstrap\(\)/i);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /limit 8/i);
  assert.match(sql, /limit 6/i);
  assert.match(sql, /revoke all on function public\.rh_dashboard_bootstrap\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.rh_dashboard_bootstrap\(\) to authenticated/i);
});

test('bootstrap recebe os indices que sustentam a fila e o historico', () => {
  const sql = migrationSql();

  assert.match(sql, /create index if not exists idx_rh_processo_participantes_user_processo[\s\S]*\(user_id, processo_id\)/i);
  assert.match(sql, /create index if not exists idx_rh_etapa_responsaveis_user_etapa[\s\S]*\(user_id, etapa_id\)/i);
  assert.match(sql, /create index if not exists idx_rh_historico_eventos_created_at_desc[\s\S]*\(created_at desc\)/i);
});
