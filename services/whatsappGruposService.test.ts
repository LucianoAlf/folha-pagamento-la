import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./whatsappGruposService.ts', import.meta.url), 'utf8');

test('whatsappGruposService only configures WhatsApp group notifications', () => {
  assert.match(source, /\.from\('whatsapp_destinos'\)/);
  assert.match(source, /\.from\('whatsapp_grupo_notificacoes'\)/);
  assert.match(source, /\.eq\('ativo', true\)/);
  assert.match(source, /\.eq\('tipo', 'grupo'\)/);
  assert.match(source, /ativo:\s*input\.ativo\s*\?\?\s*false/);
  assert.doesNotMatch(source, /whatsapp-send|functions\.invoke|sendWhatsappMessage/);
});
