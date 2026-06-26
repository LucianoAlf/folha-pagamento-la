import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const collaboratorComponentsSource = readFileSync(new URL('../CollaboratorComponents.tsx', import.meta.url), 'utf8');
const mobileListSource = readFileSync(new URL('./MobileCollaboratorList.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('collaborator UI resolves active state from ativo before legacy status text', () => {
  assert.match(collaboratorComponentsSource, /export const getEffectiveCollaboratorStatus/);
  assert.match(collaboratorComponentsSource, /collaborator\.ativo === false/);
  assert.match(appSource, /getEffectiveCollaboratorStatus\(c\) === collabStatusFilter/);
  assert.match(appSource, /getEffectiveCollaboratorStatus\(c\) === 'active'/);
  assert.match(mobileListSource, /getEffectiveCollaboratorStatus\(c\)/);
});
