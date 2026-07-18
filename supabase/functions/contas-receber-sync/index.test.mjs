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

test('preflight e read-only e apply exige a mesma prova e o mesmo manifest apos nova leitura', () => {
  const code = source();
  assert.match(code, /preflight/i);
  assert.match(code, /apply/i);
  assert.match(code, /preflight_id_esperado/i);
  assert.match(code, /manifesto\.manifest_hash[\s\S]*!==[\s\S]*proof\.manifest_hash/i);
  assert.match(code, /contas_receber_sync_aplicar/i);
});

test('preflight atualiza a origem, exporta o run exato e persiste prova curta no servidor', () => {
  const code = source();
  assert.match(code, /LA_REPORT_CONTAS_RECEBER_REFRESH_URL/i);
  assert.match(code, /refreshLaReport/i);
  assert.match(code, /sync_run_id/i);
  assert.match(code, /snapshot_complete/i);
  assert.match(code, /contas_receber_preflight_registrar/i);
  assert.match(code, /preflight_id/i);
});

test('apply usa a prova persistida e nao confia no manifest enviado pelo navegador', () => {
  const code = source();
  assert.match(code, /preflight_id_esperado/i);
  assert.match(code, /contas_receber_preflight_obter/i);
  assert.match(code, /require_latest/i);
  assert.match(code, /latest_complete_sync_run_id obrigatorio/i);
  assert.match(code, /quantidade de itens diverge do manifesto/i);
  assert.match(code, /proof\?\.consumed_result/i);
  assert.match(code, /idempotent_retry:\s*true/i);
  assert.match(code, /proof\.competencia\s*!==\s*competencia/i);
  assert.doesNotMatch(code, /payload\?\.manifest_hash_esperado/i);
});

test('preflight delega os buckets ao helper sem alterar o manifesto', () => {
  const code = source();
  assert.match(code, /buildContasReceberPreflightBuckets/i);
  assert.match(code, /const\s+\{\s*classificacao,\s*resumo\s*\}/i);
  assert.match(code, /manifesto:\s*source\.manifesto/i);
});
