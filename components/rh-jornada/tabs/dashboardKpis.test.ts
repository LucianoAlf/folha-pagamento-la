import assert from 'node:assert/strict';
import test from 'node:test';

import { getDashboardKpiGroups } from './dashboardKpis.ts';

const values = {
  recrutamentos: 1,
  onboardings: 2,
  desligamentos: 3,
  documentosPendentes: 4,
  criticos: 5,
  pdisAtivos: 6,
  checkpointsAtrasados: 7,
  conquistasMes: 8,
  prontosParaPromocao: 9,
  colaboradoresTravados: 10,
};

test('organizes dashboard indicators into two approved groups of five', () => {
  const groups = getDashboardKpiGroups(values);

  assert.deepEqual(groups.map((group) => group.id), ['operacao', 'desenvolvimento']);
  assert.deepEqual(groups.map((group) => group.metrics.length), [5, 5]);
  assert.deepEqual(
    groups.flatMap((group) => group.metrics.map((metric) => metric.id)),
    [
      'recrutamentos',
      'onboardings',
      'desligamentos',
      'documentos',
      'criticos',
      'pdis',
      'checkpoints',
      'conquistas',
      'promocao',
      'travados',
    ],
  );
});

test('keeps KPI values and semantic tones attached to their metrics', () => {
  const groups = getDashboardKpiGroups(values);
  const metrics = groups.flatMap((group) => group.metrics);

  assert.equal(metrics.find((metric) => metric.id === 'documentos')?.value, 4);
  assert.equal(metrics.find((metric) => metric.id === 'documentos')?.tone, 'warning');
  assert.equal(metrics.find((metric) => metric.id === 'travados')?.value, 10);
  assert.equal(metrics.find((metric) => metric.id === 'travados')?.tone, 'danger');
});
