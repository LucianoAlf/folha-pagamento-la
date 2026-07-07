import assert from 'node:assert/strict';
import test from 'node:test';

import { filterContasForTable, getMariaContaActionInfo } from './contasTableFilters.ts';

const baseConta = {
  descricao: 'Conta teste',
  plano_conta: { codigo: '5.2.3', nome: 'Energia Eletrica' },
  centro_custo: { nome: 'Recreio' },
  unidade: 'rec',
  status: 'pendente',
  data_vencimento: '2026-07-07',
} as any;

test('detects Maria operational stamps from account observations', () => {
  assert.deepEqual(
    getMariaContaActionInfo({
      ...baseConta,
      observacoes:
        'Baixa registrada pela Maria apos confirmacao de Rose em 03/07/2026 18:05. Sem pagamento real executado pela Maria.',
    }),
    { tooltip: 'Baixa registrada pela Maria via WhatsApp, confirmada por Rose.' }
  );

  assert.deepEqual(
    getMariaContaActionInfo({
      ...baseConta,
      observacoes:
        'Conta eventual registrada pela Maria apos confirmacao de Alf em 07/07/2026 14:36. Sem pagamento real executado pela Maria.',
    }),
    { tooltip: 'Lançamento registrado pela Maria via WhatsApp, confirmado por Alf.' }
  );

  assert.equal(getMariaContaActionInfo({ ...baseConta, observacoes: 'Baixa manual pelo app.' }), null);
});

test('date filter can find paid accounts on an exact past due date', () => {
  const contas = [
    { ...baseConta, id: 'dia-06-paga', status: 'pago', data_vencimento: '2026-07-06' },
    { ...baseConta, id: 'dia-07-pendente', status: 'pendente', data_vencimento: '2026-07-07' },
  ];

  assert.deepEqual(
    filterContasForTable(contas, {
      filtro: 'data',
      busca: '',
      dataInicio: '2026-07-06',
      hojeISO: '2026-07-07',
    }).map((c) => c.id),
    ['dia-06-paga']
  );
});

test('date filter supports inclusive custom periods', () => {
  const contas = [
    { ...baseConta, id: 'dia-05', data_vencimento: '2026-07-05' },
    { ...baseConta, id: 'dia-06', data_vencimento: '2026-07-06' },
    { ...baseConta, id: 'dia-08', data_vencimento: '2026-07-08' },
  ];

  assert.deepEqual(
    filterContasForTable(contas, {
      filtro: 'data',
      busca: '',
      dataInicio: '2026-07-05',
      dataFim: '2026-07-06',
      hojeISO: '2026-07-07',
    }).map((c) => c.id),
    ['dia-05', 'dia-06']
  );
});
