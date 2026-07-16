import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFolhaAlertSummary } from './folhaAlertasModel.ts';

test('explains that a noted alert still awaits review confirmation', () => {
  assert.deepEqual(buildFolhaAlertSummary({ count: 1, notedCount: 1 }), {
    title: '1 alerta aguardando confirmacao',
    subtitle: 'Motivo registrado. Confirme a revisao para concluir.',
  });
});

test('keeps the selected unit context for multiple alerts', () => {
  assert.deepEqual(buildFolhaAlertSummary({ count: 2, notedCount: 0, scopeLabel: 'Barra' }), {
    title: '2 alertas aguardando confirmacao',
    subtitle: 'Alertas da unidade Barra',
  });
});
