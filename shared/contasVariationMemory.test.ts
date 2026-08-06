import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_HUMAN_NOTE_LENGTH,
  MAX_AI_DRAFT_LENGTH,
  buildVariationKey,
  normalizeMemoryStatus,
  truncateAiDraft,
  chooseMatchingNote,
} from './contasVariationMemory.ts';

test('usa o modelo recorrente como identidade estável', () => {
  assert.equal(
    buildVariationKey({ unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: 'modelo-1', descricao: 'Energia janeiro' }),
    'cg|plano-1|modelo:modelo-1',
  );
  assert.equal(
    buildVariationKey({ unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: null, descricao: ' Conta de Luz  ÁGUA ' }),
    'cg|plano-1|desc:conta de luz agua',
  );
});

test('não herda nota por descrição quando identidade recorrente não bate', () => {
  const note = { anomaly_key: 'cg|plano-1|modelo:modelo-antigo', unidade: 'cg', plano_conta_id: 'plano-1', recorrente_modelo_id: 'modelo-antigo', conta_id: null, nota: 'reajuste', status: 'justificada' as const };
  assert.equal(chooseMatchingNote([note], { anomalyKey: 'cg|plano-1|desc:energia', unidade: 'cg', planoContaId: 'plano-1', recorrenteModeloId: 'modelo-novo', descricao: 'energia', contaId: null }), null);
});

test('status legado vira justificada sem invalidar o valor armazenado', () => {
  assert.equal(normalizeMemoryStatus('verificado'), 'justificada');
  assert.equal(normalizeMemoryStatus('corrigir_lancamento'), 'corrigir_lancamento');
  assert.equal(normalizeMemoryStatus(null), null);
});

test('limites protegem nota humana e rascunho da IA', () => {
  assert.equal('x'.repeat(MAX_HUMAN_NOTE_LENGTH + 1).length, 2001);
  assert.equal(truncateAiDraft('x'.repeat(MAX_AI_DRAFT_LENGTH + 20)).length, MAX_AI_DRAFT_LENGTH);
  assert.equal(truncateAiDraft('   '), null);
});

test('chave sem modelo permanece exata para item novo ou removido', () => {
  const janeiro = buildVariationKey({ unidade: 'rec', planoContaId: 'plano-2', recorrenteModeloId: null, descricao: 'Internet Fibra' });
  const fevereiro = buildVariationKey({ unidade: 'rec', planoContaId: 'plano-2', recorrenteModeloId: null, descricao: 'Internet Fibra Empresas' });
  assert.notEqual(janeiro, fevereiro);
});

test('modelo recorrente ignora apenas a mudança de descrição', () => {
  const anterior = buildVariationKey({ unidade: 'bar', planoContaId: 'plano-3', recorrenteModeloId: 'modelo-3', descricao: 'Energia julho' });
  const atual = buildVariationKey({ unidade: 'bar', planoContaId: 'plano-3', recorrenteModeloId: 'modelo-3', descricao: 'Energia agosto' });
  assert.equal(anterior, atual);
});
