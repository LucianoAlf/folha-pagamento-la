import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./whatsappGruposService.ts', import.meta.url), 'utf8');

test('whatsappGruposService configures group notifications and destination links', () => {
  assert.match(source, /\.from\('whatsapp_destinos'\)/);
  assert.match(source, /\.from\('whatsapp_grupo_notificacoes'\)/);
  assert.match(source, /\.eq\('ativo', true\)/);
  assert.match(source, /\.eq\('tipo', 'grupo'\)/);
  assert.match(source, /ativo:\s*input\.ativo\s*\?\?\s*false/);
  assert.match(source, /export async function listGruposDisponiveis/);
  assert.match(source, /export async function testarVinculo/);
  assert.match(source, /export async function createDestino/);
  assert.match(source, /export async function updateDestino/);
  assert.match(source, /export async function deleteDestino/);
  assert.match(source, /functions\.invoke\('whatsapp-grupos-disponiveis'/);
  assert.match(source, /functions\/v1\/whatsapp-send/);
  assert.match(source, /tipo:\s*'grupo'/);
});
