import assert from 'node:assert/strict';
import test from 'node:test';

import type { Lancamento } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';
import { buildFolhaRateioDraft } from './folhaRateioSelectors.ts';
import {
  applyFolhaRateioSuggestion,
  formatBrlCents,
  getFolhaRateioSuggestion,
  getFolhaRateioTotals,
  parseBrlCents,
  updateFolhaRateioCell,
} from './folhaRateioModalModel.ts';

function conta(id: string, unidade: 'cg' | 'rec' | 'bar'): FolhaContaPagadora {
  return {
    id,
    empresa_id: `empresa-${id}`,
    banco: 'Santander',
    agencia: '0001',
    conta: id,
    apelido: id.toUpperCase(),
    ativo: true,
    empresa: {
      id: `empresa-${id}`,
      label_operacional: id.toUpperCase(),
      unidade_id: `unidade-${unidade}`,
      ativo: true,
      unidade: {
        id: `unidade-${unidade}`,
        codigo: unidade,
        nome: unidade.toUpperCase(),
        tipo: 'unidade',
        ativo: true,
        ordem: 1,
      },
    },
  };
}

function lancamento(
  id: number,
  unidade: 'cg' | 'rec' | 'bar',
  contaPagadoraId: string | null = null,
): Lancamento {
  return {
    id,
    folha_id: 17,
    colaborador_id: 2,
    categoria: 'staff_rateado',
    unidade,
    conta_pagadora_id: contaPagadoraId,
    salario: 100,
    bonus: 20,
    comissao: 0,
    reembolso: 0,
    passagem: 10,
    inss: 5,
    descontos: 2,
    total: 123,
    colaboradores: { id: 2, nome: 'Ana', funcao: 'RH' } as Lancamento['colaboradores'],
  };
}

const contas = [conta('emla', 'cg'), conta('kids', 'cg'), conta('rec', 'rec'), conta('bar', 'bar')];

test('parses and formats currency inputs exclusively as integer cents', () => {
  assert.equal(parseBrlCents('0,01'), 1);
  assert.equal(parseBrlCents('1.234,56'), 123456);
  assert.equal(parseBrlCents('R$ 98,70'), 9870);
  assert.equal(parseBrlCents(''), null);
  assert.equal(formatBrlCents(1), 'R$ 0,01');
  assert.equal(formatBrlCents(123456), 'R$ 1.234,56');
});

test('updates one cell immutably and keeps every value in integer cents', () => {
  const draft = buildFolhaRateioDraft([lancamento(1, 'cg', 'emla')], contas);
  const updated = updateFolhaRateioCell(draft, 'staff_rateado', 'kids', 'salario', 3333);

  assert.notStrictEqual(updated, draft);
  assert.equal(updated.categorias[0].porConta.kids.salario, 3333);
  assert.equal(draft.categorias[0].porConta.kids.salario, 0);
  assert.equal(updated.categorias[0].porConta.emla.salario, 10000);
  assert.throws(
    () => updateFolhaRateioCell(draft, 'staff_rateado', 'kids', 'salario', 1.5),
    /centavos inteiros/i,
  );
});

test('suggests Rec only for a fully unassigned category whose legacy units are all Rec', () => {
  const recDraft = buildFolhaRateioDraft([
    lancamento(1, 'rec'),
    lancamento(2, 'rec'),
  ], contas);
  const assignedDraft = buildFolhaRateioDraft([lancamento(1, 'rec', 'rec')], contas);
  const mixedDraft = buildFolhaRateioDraft([lancamento(1, 'rec'), lancamento(2, 'bar')], contas);
  const cgDraft = buildFolhaRateioDraft([lancamento(1, 'cg')], contas);

  assert.deepEqual(getFolhaRateioSuggestion(recDraft, 'staff_rateado'), {
    contaId: 'rec',
    unidade: 'rec',
  });
  assert.equal(getFolhaRateioSuggestion(assignedDraft, 'staff_rateado'), null);
  assert.equal(getFolhaRateioSuggestion(mixedDraft, 'staff_rateado'), null);
  assert.equal(getFolhaRateioSuggestion(cgDraft, 'staff_rateado'), null);
});

test('applies a confirmed suggestion without mutating the draft or choosing protected anchors', () => {
  const protectedRow = { ...lancamento(1, 'bar'), observacao: 'Manter origem' };
  const draft = buildFolhaRateioDraft([protectedRow], contas);
  const suggestion = getFolhaRateioSuggestion(draft, 'staff_rateado');
  assert.ok(suggestion);

  const updated = applyFolhaRateioSuggestion(draft, 'staff_rateado', suggestion.contaId);

  assert.equal(updated.categorias[0].porConta.bar.salario, 10000);
  assert.equal(updated.categorias[0].porConta.bar.inss, 500);
  assert.equal(updated.categorias[0].porConta.emla.salario, 0);
  assert.equal(draft.categorias[0].porConta.bar.salario, 0);
  assert.equal(updated.ancoras[1], '');
});

test('calculates footer totals with INSS and discounts as deductions', () => {
  const draft = buildFolhaRateioDraft([lancamento(1, 'cg', 'emla')], contas);
  assert.deepEqual(getFolhaRateioTotals(draft), {
    sourceNetCentavos: 12300,
    distributedNetCentavos: 12300,
    differenceCentavos: 0,
  });

  const changed = updateFolhaRateioCell(draft, 'staff_rateado', 'emla', 'salario', 9999);
  assert.deepEqual(getFolhaRateioTotals(changed), {
    sourceNetCentavos: 12300,
    distributedNetCentavos: 12299,
    differenceCentavos: 1,
  });
});
