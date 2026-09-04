import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./_arquivo/20260805_4_rh_agenda_ferias_estabilidade.sql', import.meta.url);
const migration = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';

test('limpeza remove somente espelhos RH sem pai', () => {
  assert.match(migration, /delete from public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_processo'[\s\S]*not exists[\s\S]*public\.rh_processos/i);
  assert.match(migration, /vinculo_tipo\s*=\s*'rh_etapa'[\s\S]*not exists[\s\S]*public\.rh_processo_etapas/i);
  assert.doesNotMatch(migration, /Carlos Silva|Maria Santos|Alan Samico|TMP RH MIGRATION/i);
});

test('triggers removem espelhos quando processo ou etapa e excluido', () => {
  assert.match(migration, /after delete on public\.rh_processos[\s\S]*for each row/i);
  assert.match(migration, /after delete on public\.rh_processo_etapas[\s\S]*for each row/i);
  assert.match(migration, /security definer[\s\S]*set search_path\s*=\s*pg_catalog, public/i);
  assert.match(migration, /revoke all on function public\.rh_agenda_excluir_espelho_removido\(\) from public, anon, authenticated/i);
});

test('view agrega periodos e programacoes antes de juntar ao colaborador', () => {
  assert.match(migration, /periodos_agregados\s+as\s*\([\s\S]*group by pa\.colaborador_id/i);
  assert.match(migration, /programacoes_agregadas\s+as\s*\([\s\S]*group by fp\.colaborador_id/i);
  assert.match(migration, /with\s*\(security_invoker\s*=\s*true\)/i);
});

test('RPC pequena do badge tem ACL explicita', () => {
  assert.match(migration, /function public\.ferias_badge_contadores\(\)[\s\S]*returns table\s*\(\s*vencidos bigint,\s*proximos bigint/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.ferias_badge_contadores\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.ferias_badge_contadores\(\) to authenticated, service_role/i);
});
