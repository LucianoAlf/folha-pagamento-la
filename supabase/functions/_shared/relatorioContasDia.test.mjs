import assert from 'node:assert/strict';
import { test } from 'node:test';

import { montarRelatorioMensagem } from './relatorioContasDia.ts';

test('montarRelatorioMensagem preserves the WhatsApp daily report format', () => {
  const mensagem = montarRelatorioMensagem(
    [
      {
        id: 'conta-1',
        descricao: '1 - PG Light Loja 170 - (Recreio)',
        unidade: 'rec',
        valor: 304.46,
        data_vencimento: '2026-07-02',
        competencia: '2026-07-01',
        status: 'pendente',
        tipo_lancamento: 'unica',
        recorrente_modelo_id: null,
        plano_conta: { codigo: '5.2.3', nome: 'Energia Elétrica' },
        centro_custo: { nome: 'Recreio' },
        pix_chave_fixa: null,
      },
    ],
    '2026-07-02',
    {
      codigosPorConta: {
        'conta-1': {
          conta_pagar_id: 'conta-1',
          competencia: '2026-07-01',
          codigo_barras: '83650000003044960048100000000000000000000000',
          chave_pix: null,
          qr_pix_payload: null,
        },
      },
      unidadeFiltro: 'todas',
    }
  );

  assert.equal(
    mensagem,
    [
      '*CONTAS A PAGAR HOJE 02/07* 🧾',
      '',
      '*PG Light Loja 170 - (Recreio) 07/2026 R$304,46*',
      '5.2.3 Energia Elétrica · Recreio',
      '83650000003044960048100000000000000000000000',
      '',
      '*SALDO EM CONTAS*',
      'Recreio: R$ ',
      'Barra: R$ ',
      'Kids CG: R$ ',
      'EMLA CG: R$',
    ].join('\n')
  );
});
