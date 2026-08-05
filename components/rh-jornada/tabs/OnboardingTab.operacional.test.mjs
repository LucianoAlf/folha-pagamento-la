import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./OnboardingTab.tsx', import.meta.url), 'utf8');

test('onboarding nao concluido oferece exclusao definitiva com titulo digitado', () => {
  assert.match(source, /Excluir onboarding/);
  assert.match(source, /deleteConfirmation/);
  assert.match(source, /deleteConfirmation\s*!==\s*deleteTarget\.titulo/);
  assert.match(source, /rhJornadaService\.deleteOnboarding\(deleteTarget\.id,\s*deleteConfirmation\)/);
  assert.match(source, /selectedProcess\.status\s*!==\s*'concluido'/);
  assert.match(source, /Esta ação é definitiva/);
});

test('exclusao mantem modal aberto no erro e seleciona processo remanescente no sucesso', () => {
  assert.match(source, /setDeleteError\(/);
  assert.match(source, /setSelectedProcessId\(remaining\[0\]\?\.id\s*\|\|\s*null\)/);
  assert.match(source, /await loadData\(remaining\[0\]\?\.id\s*\|\|\s*null\)/);
});

test('novo onboarding carrega somente templates com etapas', () => {
  assert.match(source, /fetchEligibleOnboardingTemplates\(\)/);
  assert.match(source, /Nenhum modelo com etapas está pronto para uso/);
});
