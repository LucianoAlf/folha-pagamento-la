import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function readMaybe(url) {
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const operations = readMaybe(new URL('./_arquivo/20260805_2_rh_onboarding_operacoes.sql', import.meta.url));
const uniqueness = readMaybe(new URL('./_arquivo/20260805_3_colaboradores_cpf_unico.sql', import.meta.url));
const reconcile = readMaybe(new URL('../../scripts/sql/20260805_rh_reconciliar_colaboradores_duplicados.sql', import.meta.url));

test('exclusao definitiva e atomica e remove espelhos da agenda', () => {
  assert.match(
    operations,
    /function public\.rh_onboarding_excluir_definitivo\s*\(\s*p_processo_id uuid\s*,\s*p_confirmacao_titulo text/i,
  );
  assert.match(operations, /from public\.rh_processos[\s\S]*for update/i);
  assert.match(operations, /v_processo\.tipo\s*<>\s*'onboarding'/i);
  assert.match(operations, /v_processo\.status\s*=\s*'concluido'/i);
  assert.match(operations, /delete from public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_etapa'/i);
  assert.match(operations, /delete from public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_processo'/i);
  assert.match(operations, /delete from public\.rh_processos/i);
});

test('aprovacao valida template e CPF antes de escrever', () => {
  assert.match(operations, /function public\.rh_candidato_aprovar/i);
  assert.match(operations, /pg_advisory_xact_lock/i);
  assert.match(operations, /jsonb_build_object\s*\(\s*'status'\s*,\s*'cpf_existente'/i);
  assert.match(operations, /rh_onboarding_materializar/i);
  assert.match(operations, /template de onboarding deve possuir pelo menos uma etapa/i);
  assert.doesNotMatch(
    operations,
    /grant execute on function public\.rh_onboarding_materializar\([^;]*authenticated/i,
  );
});

test('aprovacao conclui espelhos da Agenda do recrutamento encerrado', () => {
  assert.match(
    operations,
    /update public\.tarefas[\s\S]*status\s*=\s*'concluida'[\s\S]*vinculo_tipo\s*=\s*'rh_processo'[\s\S]*v_recrutamento\.id/i,
  );
  assert.match(
    operations,
    /update public\.tarefas[\s\S]*vinculo_tipo\s*=\s*'rh_etapa'[\s\S]*public\.rh_processo_etapas/i,
  );
});

test('ACLs fecham funcoes publicas para public e anon', () => {
  assert.match(
    operations,
    /revoke all on function public\.rh_onboarding_excluir_definitivo\(uuid, text\) from public, anon/i,
  );
  assert.match(
    operations,
    /revoke all on function public\.rh_candidato_aprovar\(jsonb, integer\) from public, anon/i,
  );
  assert.match(
    operations,
    /revoke all on function public\.rh_onboarding_criar\(jsonb\) from public, anon/i,
  );
  assert.match(
    operations,
    /grant execute on function public\.rh_onboarding_excluir_definitivo\(uuid, text\) to authenticated, service_role/i,
  );
});

test('migrations nao carregam IDs de colaboradores produtivos', () => {
  assert.doesNotMatch(operations, /\b(106|107|108|109)\b/);
  assert.doesNotMatch(uniqueness, /\b(106|107|108|109)\b/);
});

test('CPF unico e criado somente depois da reconciliacao operacional', () => {
  assert.doesNotMatch(operations, /create unique index/i);
  assert.match(
    uniqueness,
    /create unique index[\s\S]*colaboradores_cpf_normalizado_uidx[\s\S]*rh_cpf_normalizar\s*\(\s*cpf\s*\)/i,
  );
  assert.match(reconcile, /REFUSED: vinculo novo/i);
  assert.match(reconcile, /REFUSED: reconciliacao terminou com CPF duplicado/i);
  assert.match(reconcile, /create temporary table pg_temp\.rh_tarefas_orfas_antes/i);
  assert.match(reconcile, /REFUSED: reconciliacao alterou o conjunto de tarefas RH orfas/i);
});
