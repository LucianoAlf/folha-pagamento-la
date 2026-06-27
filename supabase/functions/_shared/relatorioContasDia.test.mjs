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
      '💸 *Total Geral:* R$ 304,46',
      '',
      '*Resumo por unidade*',
      '• Recreio: R$ 304,46',
      '',
      '_______________',
      '*RECREIO*',
      '',
      '*PG Light Loja 170 - (Recreio) 07/2026 R$ 304,46*',
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

test('montarRelatorioMensagem adds resumo by unit, approved order and short rateio alert', () => {
  const mensagem = montarRelatorioMensagem(
    [
      {
        id: 'rec-1',
        descricao: 'PG Sistema Emusys - (Recreio)',
        unidade: 'rec',
        valor: 538.3,
        data_vencimento: '2026-06-27',
        competencia: '2026-06-01',
        status: 'pendente',
        tipo_lancamento: 'unica',
        recorrente_modelo_id: null,
        plano_conta: null,
        centro_custo: null,
        pix_chave_fixa: null,
      },
      {
        id: 'bar-1',
        descricao: 'PG Sistema Emusys - (Barra)',
        unidade: 'bar',
        valor: 491.9,
        data_vencimento: '2026-06-27',
        competencia: '2026-06-01',
        status: 'pendente',
        tipo_lancamento: 'unica',
        recorrente_modelo_id: null,
        plano_conta: null,
        centro_custo: null,
        pix_chave_fixa: null,
      },
      {
        id: 'cg-1',
        descricao: 'PG Sistema Emusys - (CG)',
        unidade: 'cg',
        valor: 562.9,
        data_vencimento: '2026-06-27',
        competencia: '2026-06-01',
        status: 'pendente',
        tipo_lancamento: 'unica',
        recorrente_modelo_id: null,
        plano_conta: null,
        centro_custo: null,
        pix_chave_fixa: null,
      },
    ],
    '2026-06-27',
    {
      saldos: {
        rec: 8662.07,
        bar: 3837.49,
        kids_cg: 8347.48,
        emla_cg: 100,
      },
    }
  );

  assert.equal(
    mensagem,
    [
      '*CONTAS A PAGAR HOJE 27/06* 🧾',
      '',
      '💸 *Total Geral:* R$ 1.593,10',
      '',
      '*Resumo por unidade*',
      '• Recreio: R$ 538,30',
      '• Barra: R$ 491,90',
      '• Campo Grande: R$ 562,90',
      '',
      '_______________',
      '*RECREIO*',
      '',
      '*PG Sistema Emusys - (Recreio) 06/2026 R$ 538,30*',
      '',
      '_______________',
      '*BARRA*',
      '',
      '*PG Sistema Emusys - (Barra) 06/2026 R$ 491,90*',
      '',
      '_______________',
      '*CAMPO GRANDE*',
      '',
      '*PG Sistema Emusys - (CG) 06/2026 R$ 562,90*',
      '',
      '*SALDO EM CONTAS*',
      'Recreio: R$ 8.662,07',
      'Barra: R$ 3.837,49',
      'Kids CG: R$ 8.347,48',
      'EMLA CG: R$ 100,00',
      '',
      '⚠️ Há possível necessidade de rateio hoje.',
      'Se quiserem, peçam: “Maria, calcular rateio.”',
    ].join('\n')
  );
});
