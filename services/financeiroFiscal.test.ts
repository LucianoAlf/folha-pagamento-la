import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveContaPagadoraFiscal } from './financeiroFiscal.ts';

test('deriveContaPagadoraFiscal returns empresa, centro and legacy unidade from payer account', () => {
  const result = deriveContaPagadoraFiscal({
    id: 'conta-kids',
    empresa_id: 'empresa-kids',
    empresa: {
      id: 'empresa-kids',
      label_operacional: 'Kids CG',
      unidade_id: 'centro-cg',
      unidade: {
        id: 'centro-cg',
        codigo: 'cg',
        nome: 'Campo Grande',
        tipo: 'unidade',
        ativo: true,
        ordem: 1,
      },
    },
  });

  assert.deepEqual(result, {
    empresa_id: 'empresa-kids',
    centro_custo_id: 'centro-cg',
    unidade: 'cg',
    label_operacional: 'Kids CG',
  });
});

test('deriveContaPagadoraFiscal throws when payer account has no company unit', () => {
  assert.throws(
    () =>
      deriveContaPagadoraFiscal({
        id: 'conta-sem-centro',
        empresa_id: 'empresa-sem-centro',
        empresa: {
          id: 'empresa-sem-centro',
          label_operacional: 'Sem centro',
          unidade_id: '',
          unidade: null,
        },
      }),
    /unidade operacional/
  );
});
