import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const page = readFileSync(new URL('components/contas-receber/ContasReceberPage.tsx', root), 'utf8');
const service = readFileSync(new URL('services/contasReceberService.ts', root), 'utf8');
const types = readFileSync(new URL('types/contasReceber.ts', root), 'utf8');

test('apply envia apenas a prova persistida do preflight', () => {
  assert.match(service, /preflight_id_esperado:\s*preflightId/i);
  assert.doesNotMatch(service, /manifest_hash_esperado/i);
  assert.match(page, /preflight\.preflight_id/i);
  assert.match(page, /preflight\.apply_allowed/i);
});

test('tela separa revisao financeira e evidencia ausencia na origem', () => {
  assert.match(page, /resumo\.emRevisao/i);
  assert.match(page, /source_missing/i);
  assert.match(page, /source_missing_reason/i);
  assert.match(types, /source_missing:\s*boolean/i);
  assert.match(types, /em_revisao:\s*number/i);
});

test('preflight mostra buckets financeiros sem substituir o manifesto', () => {
  assert.match(page, /preflight\.resumo\.recebido/i);
  assert.match(page, /preflight\.resumo\.em_aberto/i);
  assert.match(page, /preflight\.resumo\.excluido_rateio/i);
  assert.match(types, /refresh_ok:\s*boolean/i);
  assert.match(types, /apply_allowed:\s*boolean/i);
});

test('preflight distingue receita sem matricula de pendencia financeira', () => {
  assert.match(page, /Vendas avulsas/i);
  assert.match(page, /Receitas operacionais/i);
  assert.match(types, /vendas_avulsas:\s*number/i);
  assert.match(types, /receitas_operacionais:\s*number/i);
});
