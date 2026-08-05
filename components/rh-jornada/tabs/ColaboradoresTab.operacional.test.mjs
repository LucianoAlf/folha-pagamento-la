import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ColaboradoresTab.tsx', import.meta.url), 'utf8');

test('inicio de jornada exige confirmacao explicita antes da escrita', () => {
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /setStartJourneyConfirmationOpen\(true\)/);
  assert.match(source, /title="Iniciar jornada"/);
  assert.match(source, /confirmLabel="Iniciar jornada"/);
  assert.match(source, /await rhJornadaService\.ensureCollaboratorJourney/);
});

test('cancelar a confirmacao nao inicia a jornada', () => {
  assert.match(source, /onClose=\{\(\) => setStartJourneyConfirmationOpen\(false\)\}/);
});
