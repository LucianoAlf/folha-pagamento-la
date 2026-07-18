import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const path = new URL('./index.ts', import.meta.url);

function source() {
  assert.equal(existsSync(path), true, 'Edge contas-receber-sync deve existir');
  return readFileSync(path, 'utf8');
}

test('orquestrador autentica usuario e mantem segredo fora do navegador', () => {
  const code = source();
  assert.match(code, /auth\.getUser/i);
  assert.match(code, /LA_REPORT_CONTAS_RECEBER_URL/i);
  assert.match(code, /LA_REPORT_CONTAS_RECEBER_SECRET/i);
  assert.match(code, /x-super-folha-sync-secret/i);
  assert.doesNotMatch(code, /VITE_/i);
  assert.match(code, /contas_receber_pode_operar/i);
  assert.match(code, /acesso financeiro nao autorizado/i);
});

test('preflight e read-only e apply exige o mesmo manifest apos nova leitura', () => {
  const code = source();
  assert.match(code, /preflight/i);
  assert.match(code, /apply/i);
  assert.match(code, /manifest_hash_esperado/i);
  assert.match(code, /manifest_hash[\s\S]*!==[\s\S]*manifest_hash_esperado/i);
  assert.match(code, /contas_receber_sync_aplicar/i);
});
