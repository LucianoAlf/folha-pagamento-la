import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBistroReconciliation,
  buildFolhaBistroBreakdown,
} from './folhaBistroModel.ts';

test('separates Bistro liquidation from other payroll discounts without changing totals', () => {
  const breakdown = buildFolhaBistroBreakdown({
    lancamentos: [
      { id: 1, colaborador_id: 10, categoria: 'staff_rateado', descontos: 613.76, detalhamento: null },
      { id: 2, colaborador_id: 20, categoria: 'equipe_operacional', descontos: 3968.88, detalhamento: null },
      { id: 3, colaborador_id: 30, categoria: 'professores', descontos: 4271.32, detalhamento: null },
    ],
    snapshotRows: [
      { lancamento_folha_id: 1, colaborador_id: 10, componente: 'descontos', tipo_efeito: 'liquidacao', valor_original: 377.15, bistro_ref_ym: '2026-06' },
      { lancamento_folha_id: 1, colaborador_id: 10, componente: 'descontos', tipo_efeito: 'deducao', valor_original: 236.61, bistro_ref_ym: '2026-06' },
      { lancamento_folha_id: 2, colaborador_id: 20, componente: 'descontos', tipo_efeito: 'liquidacao', valor_original: 2511.49, bistro_ref_ym: '2026-06' },
      { lancamento_folha_id: 2, colaborador_id: 20, componente: 'descontos', tipo_efeito: 'deducao', valor_original: 1457.39, bistro_ref_ym: '2026-06' },
      { lancamento_folha_id: 3, colaborador_id: 30, componente: 'descontos', tipo_efeito: 'liquidacao', valor_original: 2875.94, bistro_ref_ym: '2026-06' },
      { lancamento_folha_id: 3, colaborador_id: 30, componente: 'descontos', tipo_efeito: 'deducao', valor_original: 1395.38, bistro_ref_ym: '2026-06' },
    ],
  });

  assert.deepEqual(breakdown.byLancamentoId[1], {
    bistroLiquidado: 377.15,
    outrosDescontos: 236.61,
    bistroRefYm: '2026-06',
  });
  assert.deepEqual(breakdown.byCategoria.staff_rateado, {
    bistroLiquidado: 377.15,
    outrosDescontos: 236.61,
  });
  assert.equal(breakdown.totalBistroLiquidado, 5764.58);
  assert.equal(breakdown.totalOutrosDescontos, 3089.38);
  assert.equal(breakdown.totalBistroLiquidado + breakdown.totalOutrosDescontos, 8853.96);
});

test('uses valid legacy metadata only while no DRE snapshot exists', () => {
  const breakdown = buildFolhaBistroBreakdown({
    lancamentos: [
      {
        id: 9,
        colaborador_id: 90,
        categoria: 'professores',
        descontos: 120,
        detalhamento: { __bistro: { valor: 70, ref_ym: '2026-06' } },
      },
    ],
    snapshotRows: [],
  });

  assert.deepEqual(breakdown.byLancamentoId[9], {
    bistroLiquidado: 70,
    outrosDescontos: 50,
    bistroRefYm: '2026-06',
  });
});

test('reports Bistro consumption paid directly outside payroll', () => {
  const reconciliation = buildBistroReconciliation({
    consumos: [
      { colaborador_id: 1, valor: 5764.58, valor_pago_direto: 0 },
      { colaborador_id: 2, valor: 98.7, valor_pago_direto: 98.7 },
      { colaborador_id: 3, valor: 59.3, valor_pago_direto: 59.3 },
      { colaborador_id: 4, valor: 32.9, valor_pago_direto: 32.9 },
    ],
    colaboradores: [
      { id: 1, nome: 'Demais colaboradores' },
      { id: 2, nome: 'Anne Susan' },
      { id: 3, nome: 'Luciano' },
      { id: 4, nome: 'Marcos Delfino Serafim' },
    ],
    snapshotRows: [
      { lancamento_folha_id: 10, colaborador_id: 1, componente: 'descontos', tipo_efeito: 'liquidacao', valor_original: 5764.58, bistro_ref_ym: '2026-06' },
    ],
  });

  assert.equal(reconciliation.consumoBruto, 5955.48);
  assert.equal(reconciliation.liquidadoFolha, 5764.58);
  assert.equal(reconciliation.pagoDireto, 190.9);
  assert.deepEqual(
    reconciliation.pagamentosDiretos.map(({ nome, valor }) => ({ nome, valor })),
    [
      { nome: 'Anne Susan', valor: 98.7 },
      { nome: 'Luciano', valor: 59.3 },
      { nome: 'Marcos Delfino Serafim', valor: 32.9 },
    ],
  );
});

test('never infers a direct payment from a payroll difference', () => {
  const reconciliation = buildBistroReconciliation({
    consumos: [{ colaborador_id: 1, valor: 100, valor_pago_direto: 0 }],
    colaboradores: [{ id: 1, nome: 'Pessoa' }],
    snapshotRows: [],
  });

  assert.equal(reconciliation.consumoBruto, 100);
  assert.equal(reconciliation.liquidadoFolha, 0);
  assert.equal(reconciliation.pagoDireto, 0);
  assert.deepEqual(reconciliation.pagamentosDiretos, []);
});
