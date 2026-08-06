import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRhDocumentStatusLabel, formatRhDocumentTypeLabel } from './documentLabels.ts';

test('renders onboarding document codes as human labels', () => {
  assert.equal(formatRhDocumentTypeLabel('la_culture'), 'LA Culture');
  assert.equal(formatRhDocumentTypeLabel('rg'), 'RG');
  assert.equal(formatRhDocumentTypeLabel('cpf'), 'CPF');
  assert.equal(formatRhDocumentTypeLabel('comprovante_residencia'), 'Comprovante de residência');
  assert.equal(formatRhDocumentTypeLabel('exame_admissional'), 'Exame admissional');
  assert.equal(formatRhDocumentTypeLabel('codigo_conduta'), 'Código de conduta');
});

test('humanizes unknown document codes without changing the stored value', () => {
  assert.equal(formatRhDocumentTypeLabel('documento_customizado'), 'Documento customizado');
  assert.equal(formatRhDocumentTypeLabel('  '), 'Documento');
});

test('renders document statuses with normal capitalization and accents', () => {
  assert.equal(formatRhDocumentStatusLabel('pendente'), 'Pendente');
  assert.equal(formatRhDocumentStatusLabel('em_analise'), 'Em análise');
  assert.equal(formatRhDocumentStatusLabel('custom_status'), 'Custom status');
});
