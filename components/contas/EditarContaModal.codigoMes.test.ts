import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./EditarContaModal.tsx', import.meta.url), 'utf8');

test('edit modal shows Maria audit stamp for agent-registered payment codes', () => {
  assert.match(source, /registrado_por_agente/);
  assert.match(source, /agente_nome/);
  assert.match(source, /confirmado_por_nome/);
  assert.match(source, />\s*Maria\s*</);
  assert.match(source, /Registro auditado/);
  assert.doesNotMatch(source, /codigo_barras.*Registro auditado|chave_pix.*Registro auditado|qr_pix_payload.*Registro auditado/);
});
