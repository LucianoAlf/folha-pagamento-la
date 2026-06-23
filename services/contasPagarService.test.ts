import assert from 'node:assert/strict';
import test from 'node:test';

import { buildParcelasContaPagar } from './contasPagarParcelas.ts';

test('buildParcelasContaPagar assigns competencia from each parcela vencimento', () => {
  const parcelas = buildParcelasContaPagar(
    {
      descricao: 'IPTU Loja 172 - (Recreio)',
      valor: 100,
      data_vencimento: '2026-07-07',
      competencia: '2026-07-01',
      tipo_lancamento: 'parcelada',
      parcela_atual: 1,
      total_parcelas: 5,
      status: 'pendente',
      unidade: 'rec',
    },
    [100, 100, 100, 100, 100],
    'user-1'
  );

  assert.deepEqual(
    parcelas.map((p) => p.data_vencimento),
    ['2026-07-07', '2026-08-07', '2026-09-07', '2026-10-07', '2026-11-07']
  );
  assert.deepEqual(
    parcelas.map((p) => p.competencia),
    ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']
  );
});
