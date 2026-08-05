import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./rhJornadaService.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../types/rh.ts', import.meta.url), 'utf8');

function methodSource(name) {
  const start = source.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `Metodo ${name} precisa existir.`);
  const next = source.indexOf('\n  async ', start + 8);
  return source.slice(start, next === -1 ? source.length : next);
}

test('aprovacao de candidato usa uma unica RPC transacional', () => {
  const method = methodSource('approveCandidate');
  assert.match(method, /supabase\s*\.rpc\('rh_candidato_aprovar'/);
  assert.match(method, /p_reutilizar_colaborador_id/);
  assert.doesNotMatch(method, /api\.createColaborador/);
  assert.doesNotMatch(method, /updateCandidate\(/);
});

test('onboarding manual usa RPC e exclusao definitiva possui metodo dedicado', () => {
  const create = methodSource('createProcessFromTemplate');
  const remove = methodSource('deleteOnboarding');
  assert.match(create, /input\.tipo\s*===\s*'onboarding'/);
  assert.match(create, /supabase\s*\.rpc\('rh_onboarding_criar'/);
  assert.match(remove, /supabase\s*\.rpc\('rh_onboarding_excluir_definitivo'/);
  assert.match(remove, /p_confirmacao_titulo/);
});

test('templates elegiveis exigem ativo e pelo menos uma etapa', () => {
  const method = methodSource('fetchEligibleOnboardingTemplates');
  assert.match(method, /fetchTemplates\('onboarding'\)/);
  assert.match(method, /template\.ativo/);
  assert.match(method, /fetchTemplateStages\(template\.id\)/);
  assert.match(method, /stages\.length\s*>\s*0/);
});

test('tipos discriminam conflito de CPF, aprovacao e exclusao', () => {
  assert.match(types, /interface RhExistingCollaboratorConflict[\s\S]*status:\s*'cpf_existente'/);
  assert.match(types, /interface RhCandidateApprovedResult[\s\S]*status:\s*'aprovado'/);
  assert.match(types, /type RhCandidateApprovalResult\s*=\s*RhExistingCollaboratorConflict\s*\|\s*RhCandidateApprovedResult/);
  assert.match(types, /interface RhOnboardingDeletionResult/);
  assert.match(types, /reuseExistingCollaboratorId\?:\s*number\s*\|\s*null/);
});
