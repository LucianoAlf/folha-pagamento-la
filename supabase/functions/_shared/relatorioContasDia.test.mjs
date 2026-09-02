import assert from 'node:assert/strict';
import { test } from 'node:test';

import { montarRelatorioMensagem, dedupeRecorrentesVisao, buscarSaldosDoDia, gerarRelatorioContasDia } from './relatorioContasDia.ts';

test('dedupeRecorrentesVisao: modelo semanal (1a ocorrencia) nao e escondido pelas instancias do mes', () => {
  const modelo = { id: 'm1', tipo_lancamento: 'recorrente', recorrente_modelo_id: null,
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const inst = { id: 'i1', tipo_lancamento: 'recorrente', recorrente_modelo_id: 'm1',
    competencia: '2026-08-01', data_vencimento: '2026-08-14' };
  const out = dedupeRecorrentesVisao([modelo, inst]);
  assert.equal(out.length, 2); // ambos aparecem (datas diferentes)
});

test('dedupeRecorrentesVisao: esconde o modelo quando ha instancia na MESMA data', () => {
  const modelo = { id: 'm1', tipo_lancamento: 'recorrente', recorrente_modelo_id: null,
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const dup = { id: 'i0', tipo_lancamento: 'recorrente', recorrente_modelo_id: 'm1',
    competencia: '2026-08-01', data_vencimento: '2026-08-07' };
  const out = dedupeRecorrentesVisao([modelo, dup]);
  assert.deepEqual(out.map((c) => c.id), ['i0']);
});

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

test('montarRelatorioMensagem: conta em debito automatico vai por ultimo, sem codigo, com marcador e subtotal', () => {
  const mensagem = montarRelatorioMensagem(
    [
      {
        id: 'conta-da',
        descricao: 'Aluguel Loja 171 - (Recreio)',
        unidade: 'rec',
        valor: 200,
        data_vencimento: '2026-09-03',
        competencia: '2026-09-01',
        status: 'pendente',
        tipo_lancamento: 'recorrente',
        recorrente_modelo_id: 'm1',
        plano_conta: null,
        centro_custo: { nome: 'Recreio' },
        pix_chave_fixa: null,
        debito_automatico: true,
      },
      {
        id: 'conta-1',
        descricao: 'Light Loja 170 - (Recreio)',
        unidade: 'rec',
        valor: 300,
        data_vencimento: '2026-09-03',
        competencia: '2026-09-01',
        status: 'pendente',
        tipo_lancamento: 'unica',
        recorrente_modelo_id: null,
        plano_conta: null,
        centro_custo: { nome: 'Recreio' },
        pix_chave_fixa: null,
        debito_automatico: false,
      },
    ],
    '2026-09-03',
    {
      codigosPorConta: {
        'conta-1': { conta_pagar_id: 'conta-1', competencia: '2026-09-01', codigo_barras: '83650000003044960048100000000000000000000000', chave_pix: null, qr_pix_payload: null },
        'conta-da': { conta_pagar_id: 'conta-da', competencia: '2026-09-01', codigo_barras: '83650000002000000000000000000000000000000000', chave_pix: null, qr_pix_payload: null },
      },
      unidadeFiltro: 'todas',
    }
  );

  assert.equal(
    mensagem,
    [
      '*CONTAS A PAGAR HOJE 03/09* 🧾',
      '',
      '💸 *Total Geral:* R$ 500,00',
      '🔁 *Em débito automático:* R$ 200,00',
      '',
      '*Resumo por unidade*',
      '• Recreio: R$ 500,00',
      '',
      '_______________',
      '*RECREIO*',
      '',
      '*PG Light Loja 170 - (Recreio) 09/2026 R$ 300,00*',
      '83650000003044960048100000000000000000000000',
      '',
      '*PG Aluguel Loja 171 - (Recreio) 09/2026 R$ 200,00*',
      '🔁 DÉBITO AUTOMÁTICO — não pagar manualmente',
      '',
      '*SALDO EM CONTAS*',
      'Recreio: R$ ',
      'Barra: R$ ',
      'Kids CG: R$ ',
      'EMLA CG: R$',
    ].join('\n')
  );
});

// ---------------------------------------------------------------------------
// SALDO EM CONTAS (Open Finance / Pluggy). Estes testes voltaram do branch
// feat/openfinance-pluggy, que nunca foi mergeado no main: entre 30/08 e 02/09 a
// mensagem das 08:00 saiu com o rodape vazio porque o deploy passou a vir do main,
// e nao havia teste tocando esse caminho. O ultimo aqui e a trava que faltava —
// ele exercita gerarRelatorioContasDia, que e o que as duas Edge Functions chamam.
function fakeSupabaseAdmin({ data = null, error = null } = {}) {
  return {
    from(table) {
      return {
        table,
        select() {
          return {
            eq(_col, _val) {
              return Promise.resolve({ data, error });
            },
          };
        },
      };
    },
  };
}

test('buscarSaldosDoDia mapeia label_operacional para as chaves de RelatorioSaldos', async () => {
  const supabaseAdmin = fakeSupabaseAdmin({
    data: [
      { saldo: 38303.61, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Recreio' } } },
      { saldo: 18806.86, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Barra' } } },
      { saldo: 5106.69, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Kids CG' } } },
      { saldo: 3608.1, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'EMLA CG' } } },
    ],
  });
  assert.deepEqual(await buscarSaldosDoDia(supabaseAdmin, '2026-09-02'), {
    rec: 38303.61, bar: 18806.86, kids_cg: 5106.69, emla_cg: 3608.1,
  });
});

test('buscarSaldosDoDia ignora linha com label_operacional desconhecido', async () => {
  const supabaseAdmin = fakeSupabaseAdmin({
    data: [
      { saldo: 100, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Bistrô' } } },
      { saldo: 200, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Recreio' } } },
    ],
  });
  assert.deepEqual(await buscarSaldosDoDia(supabaseAdmin, '2026-09-02'), { rec: 200 });
});

test('buscarSaldosDoDia retorna {} sem lançar quando a sincronização ainda não rodou', async () => {
  assert.deepEqual(await buscarSaldosDoDia(fakeSupabaseAdmin({ data: [] }), '2026-09-02'), {});
});

test('buscarSaldosDoDia retorna {} sem lançar quando a query falha (nunca derruba o relatório)', async () => {
  assert.deepEqual(await buscarSaldosDoDia(fakeSupabaseAdmin({ error: new Error('conexao falhou') }), '2026-09-02'), {});
});

// Fake por TABELA: reproduz o encadeamento real do gerador (contas_pagar termina em .order(),
// as outras duas em .eq()), para o teste morder o caminho que as Edge Functions executam.
function fakeAdminPorTabela(porTabela) {
  const resposta = (table) => Promise.resolve({ data: porTabela[table] ?? [], error: null });
  return {
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => resposta(table),
        then: (resolve, reject) => resposta(table).then(resolve, reject),
      };
      return chain;
    },
  };
}

test('gerarRelatorioContasDia preenche SALDO EM CONTAS (regressão de 30/08 a 02/09: rodapé em branco)', async () => {
  const admin = fakeAdminPorTabela({
    contas_pagar: [
      { id: 'c1', descricao: 'PG Light Loja 170 - (Recreio)', unidade: 'rec', valor: 258.33,
        data_vencimento: '2026-09-02', competencia: '2026-09-01', status: 'pendente', tipo_lancamento: 'unica' },
    ],
    contas_pagar_codigo_mes: [],
    financeiro_conta_saldos_diarios: [
      { saldo: 6481.53, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Recreio' } } },
      { saldo: 8345.3, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Barra' } } },
      { saldo: 2184.6, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'Kids CG' } } },
      { saldo: 7113.91, financeiro_contas_bancarias: { financeiro_empresas: { label_operacional: 'EMLA CG' } } },
    ],
  });

  const { mensagem, count } = await gerarRelatorioContasDia(admin, { dataRef: '2026-09-02' });

  assert.equal(count, 1);
  assert.match(mensagem, /\*SALDO EM CONTAS\*\nRecreio: R\$ 6\.481,53\nBarra: R\$ 8\.345,30\nKids CG: R\$ 2\.184,60\nEMLA CG: R\$ 7\.113,91/);
  assert.doesNotMatch(mensagem, /Recreio: R\$ *\n/); // rodapé vazio nunca mais passa calado
});

test('gerarRelatorioContasDia sem sincronização de saldo ainda gera a mensagem (rodapé em branco, sem quebrar)', async () => {
  const admin = fakeAdminPorTabela({
    contas_pagar: [
      { id: 'c1', descricao: 'PG Light Loja 170 - (Recreio)', unidade: 'rec', valor: 258.33,
        data_vencimento: '2026-09-02', competencia: '2026-09-01', status: 'pendente', tipo_lancamento: 'unica' },
    ],
    contas_pagar_codigo_mes: [],
    financeiro_conta_saldos_diarios: [],
  });

  const { mensagem } = await gerarRelatorioContasDia(admin, { dataRef: '2026-09-02' });
  assert.match(mensagem, /\*SALDO EM CONTAS\*\nRecreio: R\$ \nBarra: R\$ /);
});
