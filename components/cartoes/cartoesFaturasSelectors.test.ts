import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachClassificacaoResumo,
  buildFaturasResumo,
  getFaturaAcaoFechamento,
  getFaturaPendenciasClassificacao,
  buildTransacaoImportadaPayload,
  isFaturaImportacaoManualDisponivel,
  isCartaoFiscalCompletoParaFechar,
  validateTransacaoImportadaInput,
  getCentroCustoIdDaEmpresa,
  getTransacaoImportadaClassificacaoState,
  hasAutoriaMaria,
  isFaturaClassificacaoBloqueada,
  filterAndSortFaturas,
} from './cartoesFaturasSelectors.ts';

const faturas = [
  {
    id: 'fatura-set',
    cartao_id: 'cartao-emla',
    competencia: '2026-09-01',
    data_vencimento: '2026-09-10',
    data_fechamento: '2026-08-27',
    valor_total: 550.32,
    status: 'aberta',
    conta_pagar_id: null,
    cartao: {
      id: 'cartao-emla',
      apelido: 'EMLA CG 2270',
      final: '2270',
      empresa_id: 'empresa-emla',
    },
  },
  {
    id: 'fatura-jul',
    cartao_id: 'cartao-emla',
    competencia: '2026-07-01',
    data_vencimento: '2026-07-10',
    data_fechamento: '2026-06-27',
    valor_total: 755.22,
    status: 'aberta',
    conta_pagar_id: 'conta-pagar-fatura',
    cartao: {
      id: 'cartao-emla',
      apelido: 'EMLA CG 2270',
      final: '2270',
      empresa_id: 'empresa-emla',
    },
  },
  {
    id: 'fatura-barra',
    cartao_id: 'cartao-barra',
    competencia: '2026-07-01',
    data_vencimento: '2026-07-25',
    data_fechamento: '2026-07-15',
    valor_total: 120,
    status: 'fechada',
    conta_pagar_id: null,
    cartao: {
      id: 'cartao-barra',
      apelido: 'Barra 8434',
      final: '8434',
      empresa_id: 'empresa-barra',
    },
  },
] as any[];

const transacoes = [
  { id: 't1', fatura_id: 'fatura-jul', classificacao_status: 'pendente' },
  { id: 't2', fatura_id: 'fatura-jul', classificacao_status: 'pendente' },
  { id: 't3', fatura_id: 'fatura-set', classificacao_status: 'confirmada' },
  { id: 't4', fatura_id: 'fatura-barra', classificacao_status: 'sugerida' },
] as any[];

test('attachClassificacaoResumo counts transacoes by fatura without N+1 assumptions', () => {
  const result = attachClassificacaoResumo(faturas, transacoes);
  const julho = result.find((fatura) => fatura.id === 'fatura-jul');
  const setembro = result.find((fatura) => fatura.id === 'fatura-set');

  assert.deepEqual(julho?.classificacao, {
    total: 2,
    confirmadas: 0,
    sugeridas: 0,
    pendentes: 2,
    percentualConfirmado: 0,
  });
  assert.deepEqual(setembro?.classificacao, {
    total: 1,
    confirmadas: 1,
    sugeridas: 0,
    pendentes: 0,
    percentualConfirmado: 100,
  });
});

test('filterAndSortFaturas applies card, empresa, status and competencia filters', () => {
  const enriched = attachClassificacaoResumo(faturas, transacoes);

  assert.deepEqual(
    filterAndSortFaturas(enriched, {
      cartaoId: 'cartao-emla',
      empresaId: 'empresa-emla',
      status: 'aberta',
      competencia: '2026-07',
    }).map((fatura) => fatura.id),
    ['fatura-jul']
  );

  assert.deepEqual(
    filterAndSortFaturas(enriched, {
      cartaoId: 'all',
      empresaId: 'all',
      status: 'all',
      competencia: 'all',
    }).map((fatura) => fatura.id),
    ['fatura-jul', 'fatura-barra', 'fatura-set']
  );
});

test('buildFaturasResumo sums open invoices and identifies the next open due date', () => {
  const resumo = buildFaturasResumo(attachClassificacaoResumo(faturas, transacoes));

  assert.equal(resumo.totalAberto, 1305.54);
  assert.equal(resumo.proximaFatura?.id, 'fatura-jul');
  assert.deepEqual(resumo.porStatus, {
    aberta: 2,
    fechada: 1,
    paga: 0,
    cancelada: 0,
  });
});

test('classification is blocked only for canceled invoices', () => {
  assert.equal(isFaturaClassificacaoBloqueada({ status: 'cancelada' } as any), true);
  assert.equal(isFaturaClassificacaoBloqueada({ status: 'aberta' } as any), false);
  assert.equal(isFaturaClassificacaoBloqueada({ status: 'fechada' } as any), false);
  assert.equal(isFaturaClassificacaoBloqueada({ status: 'paga' } as any), false);
});

test('empresa fixes the fiscal centro de custo by unidade_id', () => {
  const empresas = [
    { id: 'empresa-emla', unidade_id: 'centro-cg' },
    { id: 'empresa-barra', unidade_id: 'centro-barra' },
  ] as any[];

  assert.equal(getCentroCustoIdDaEmpresa(empresas, 'empresa-emla'), 'centro-cg');
  assert.equal(getCentroCustoIdDaEmpresa(empresas, 'empresa-nao-existe'), '');
});

test('Maria stamp is detected from launch and classification authorship fields', () => {
  assert.equal(hasAutoriaMaria({ ator_tipo: 'maria' } as any, 'lancamento'), true);
  assert.equal(hasAutoriaMaria({ fonte_tipo: 'maria' } as any, 'lancamento'), true);
  assert.equal(hasAutoriaMaria({ classificado_por: 'maria' } as any, 'classificacao'), true);
  assert.equal(hasAutoriaMaria({ ator_tipo: 'web', classificado_por: 'web' } as any, 'classificacao'), false);
});

test('invoice closing action follows invoice status only', () => {
  assert.equal(getFaturaAcaoFechamento({ status: 'aberta' } as any), 'fechar');
  assert.equal(getFaturaAcaoFechamento({ status: 'fechada' } as any), 'reabrir');
  assert.equal(getFaturaAcaoFechamento({ status: 'paga' } as any), null);
  assert.equal(getFaturaAcaoFechamento({ status: 'cancelada' } as any), null);
});

test('closing requires fiscal card triad before calling the RPC', () => {
  assert.equal(
    isCartaoFiscalCompletoParaFechar({
      cartao: { empresa_id: 'empresa-emla', conta_pagadora_id: 'conta-santander', centro_custo_id: 'centro-cg' },
    } as any),
    true
  );
  assert.equal(
    isCartaoFiscalCompletoParaFechar({
      cartao: { empresa_id: 'empresa-emla', conta_pagadora_id: null, centro_custo_id: 'centro-cg' },
    } as any),
    false
  );
});

test('closing warning counts pending and suggested classifications', () => {
  assert.equal(
    getFaturaPendenciasClassificacao({
      classificacao: { total: 4, confirmadas: 1, sugeridas: 1, pendentes: 2, percentualConfirmado: 25 },
    } as any),
    3
  );
  assert.equal(getFaturaPendenciasClassificacao({ classificacao: null } as any), 0);
});

test('manual import is available only for open invoices', () => {
  assert.equal(isFaturaImportacaoManualDisponivel({ status: 'aberta' } as any), true);
  assert.equal(isFaturaImportacaoManualDisponivel({ status: 'fechada' } as any), false);
  assert.equal(isFaturaImportacaoManualDisponivel({ status: 'paga' } as any), false);
  assert.equal(isFaturaImportacaoManualDisponivel({ status: 'cancelada' } as any), false);
});

test('manual import validation blocks missing essentials and invalid installment metadata', () => {
  assert.equal(validateTransacaoImportadaInput({ descricao: '', data_compra: '2026-07-01', valor: 10 }), 'Informe a descricao da transacao.');
  assert.equal(validateTransacaoImportadaInput({ descricao: 'OpenAI', data_compra: '01/07/2026', valor: 10 }), 'Informe uma data valida.');
  assert.equal(validateTransacaoImportadaInput({ descricao: 'OpenAI', data_compra: '2026-07-01', valor: 0 }), 'Informe um valor diferente de zero.');
  assert.equal(
    validateTransacaoImportadaInput({
      descricao: 'Sul America',
      data_compra: '2026-07-01',
      valor: 425.92,
      is_parcela: true,
      parcela_atual: 7,
      total_parcelas: 6,
    }),
    'Informe parcelas no formato correto.'
  );
  assert.equal(validateTransacaoImportadaInput({ descricao: 'OpenAI', data_compra: '2026-07-01', valor: 54.48 }), null);
});

test('manual import payload uses the fatura RPC shape without classification fields', () => {
  const payload = buildTransacaoImportadaPayload(
    {
      fatura_id: 'fat-1',
      descricao: '  OpenAI  ',
      data_compra: '2026-07-01',
      valor: 54.48,
      tipo_transacao: 'compra',
      estabelecimento: '  OpenAI ',
      observacoes: '  extrato santander ',
      is_parcela: false,
    } as any,
    'token-123'
  );

  assert.deepEqual(payload, {
    fatura_id: 'fat-1',
    descricao: 'OpenAI',
    data_compra: '2026-07-01',
    valor: 54.48,
    tipo_transacao: 'compra',
    estabelecimento: 'OpenAI',
    id_externo: 'token-123',
    observacoes: 'extrato santander',
    motivo: 'Importacao manual pelo app web.',
  });
  assert.equal('plano_conta_id' in payload, false);
  assert.equal('classificacao_status' in payload, false);

  const estorno = buildTransacaoImportadaPayload(
    {
      fatura_id: 'fat-1',
      descricao: 'Estorno OpenAI',
      data_compra: '2026-07-02',
      valor: 54.48,
      tipo_transacao: 'estorno',
      is_parcela: true,
      parcela_atual: 2,
      total_parcelas: 6,
    } as any,
    'token-456'
  );

  assert.equal(estorno.valor, -54.48);
  assert.equal(estorno.parcela_atual, 2);
  assert.equal(estorno.total_parcelas, 6);
});

test('manual import validation blocks partial fiscal classification', () => {
  const base = {
    fatura_id: 'fat-1',
    descricao: 'OpenAI',
    data_compra: '2026-07-01',
    valor: 54.48,
    tipo_transacao: 'compra' as const,
  };

  assert.equal(
    validateTransacaoImportadaInput({
      ...base,
      empresa_id: 'empresa-emla',
      centro_custo_id: 'centro-cg',
    } as any),
    'Complete empresa e plano para classificar agora, ou deixe ambos em branco para adicionar como pendente.'
  );
  assert.equal(
    validateTransacaoImportadaInput({
      ...base,
      plano_conta_id: 'plano-software',
      plano_conta: { id: 'plano-software', codigo: '5.2.11', nome: 'Software', nivel: 3, natureza: 'saida', ativo: true },
    } as any),
    'Complete empresa e plano para classificar agora, ou deixe ambos em branco para adicionar como pendente.'
  );
});

test('manual import payload can include confirmed fiscal classification', () => {
  const input = {
    fatura_id: 'fat-1',
    descricao: 'OpenAI',
    data_compra: '2026-07-01',
    valor: 54.48,
    tipo_transacao: 'compra' as const,
    empresa_id: 'empresa-emla',
    centro_custo_id: 'centro-cg',
    plano_conta_id: 'plano-software',
    plano_conta: { id: 'plano-software', codigo: '5.2.11', nome: 'Software', nivel: 3, natureza: 'saida', ativo: true },
  };

  assert.equal(getTransacaoImportadaClassificacaoState(input as any), 'confirmada');

  const payload = buildTransacaoImportadaPayload(input as any, 'token-789');

  assert.equal(payload.classificacao_status, 'confirmada');
  assert.equal(payload.empresa_id, 'empresa-emla');
  assert.equal(payload.centro_custo_id, 'centro-cg');
  assert.equal(payload.plano_conta_id, 'plano-software');
});
