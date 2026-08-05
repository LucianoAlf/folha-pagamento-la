import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modal = readFileSync(new URL('./CandidateApprovalModal.tsx', import.meta.url), 'utf8');
const tab = readFileSync(new URL('../tabs/CandidatosTab.tsx', import.meta.url), 'utf8');

test('conflito de CPF permanece no modal e exige reutilizacao explicita', () => {
  assert.match(modal, /existingConflict/);
  assert.match(modal, /CPF já pertence a um colaborador/);
  assert.match(modal, /Usar cadastro existente e aprovar/);
  assert.match(modal, /reuseExistingCollaboratorId:\s*existingConflict\.id/);
  assert.match(modal, /result\.status\s*===\s*'cpf_existente'/);
  assert.match(modal, /setExistingConflict\(result\.colaborador_existente\)/);
});

test('modal informa quando nenhum template com etapas esta pronto', () => {
  assert.match(modal, /Nenhum modelo com etapas está pronto para uso/);
  assert.match(modal, /onboardingTemplates\.length\s*>\s*0/);
});

test('aba de candidatos carrega somente templates elegiveis', () => {
  assert.match(tab, /fetchEligibleOnboardingTemplates\(\)/);
  assert.doesNotMatch(tab, /fetchTemplates\('onboarding'\)/);
});
