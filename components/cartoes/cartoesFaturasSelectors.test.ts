import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as selectors from './cartoesFaturasSelectors.ts';

const faturasPageSource = await readFile(new URL('./FaturasCartaoPage.tsx', import.meta.url), 'utf8');
const cartoesServiceSource = await readFile(new URL('../../services/cartoesService.ts', import.meta.url), 'utf8');

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
  getPrevisaoCandidata,
  normalizeRecorrenciaMatch,
  isTransacaoCancelamentoDisponivel,
  buildTransacaoCancelamentoPayload,
} from './cartoesFaturasSelectors.ts';

const getRecorrenciaAdocaoDisponibilidade = (selectors as any).getRecorrenciaAdocaoDisponibilidade as
  | ((transacao: any, fatura: any, recorrencia: any) => { disponivel: boolean; motivo: string | null })
  | undefined;
const isTransacaoSaving = (selectors as any).isTransacaoSaving as
  | ((savingId: string | null, transacao: any) => boolean)
  | undefined;

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

const transacaoReal = {
  id: 'transacao-real',
  fatura_id: 'fatura-set',
  cartao_id: 'cartao-emla',
  descricao: 'OpenAI, Inc.',
  estabelecimento: null,
  valor: 49.9,
} as any;

const previsaoMesmoCartaoMesmoValor = {
  id: 'previsao-openai',
  recorrencia_id: 'recorrencia-openai',
  fatura_id: 'fatura-set',
  cartao_id: 'cartao-emla',
  competencia: '2026-09-01',
  data_compra: '2026-09-17',
  descricao: 'openai inc',
  estabelecimento: null,
  valor: 49.9,
  status: 'prevista',
  transacao_confirmada_id: null,
} as any;

const previsaoOutroValor = {
  ...previsaoMesmoCartaoMesmoValor,
  id: 'previsao-outro-valor',
  valor: 49.91,
} as any;

const previsaoOutroCartao = {
  ...previsaoMesmoCartaoMesmoValor,
  id: 'previsao-outro-cartao',
  cartao_id: 'cartao-barra',
} as any;

const previsaoOutraFatura = {
  ...previsaoMesmoCartaoMesmoValor,
  id: 'previsao-outra-fatura',
  fatura_id: 'fatura-barra',
} as any;

const previsaoOutraDescricao = {
  ...previsaoMesmoCartaoMesmoValor,
  id: 'previsao-outra-descricao',
  descricao: 'OpenAI Cloud',
} as any;

const previsaoJaConfirmada = {
  ...previsaoMesmoCartaoMesmoValor,
  id: 'previsao-ja-confirmada',
  status: 'confirmada',
} as any;

const importacaoManualFormSource = await readFile(
  new URL('./ImportarTransacaoFaturaForm.tsx', import.meta.url),
  'utf8'
);

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

test('manual import validation rejects parcel recurrence conflicts', () => {
  assert.equal(
    validateTransacaoImportadaInput({
      descricao: 'Assinatura', data_compra: '2026-08-17', valor: 49.9,
      tipo_transacao: 'compra', is_parcela: true, is_recorrente: true,
    }),
    'Uma compra não pode ser parcelada e recorrente ao mesmo tempo.'
  );
});

test('manual import validation limits recurrence to purchases', () => {
  assert.equal(
    validateTransacaoImportadaInput({
      descricao: 'Tarifa', data_compra: '2026-08-17', valor: 49.9,
      tipo_transacao: 'tarifa', is_recorrente: true,
    }),
    'Recorrência está disponível somente para compras.'
  );
});

test('manual import form keeps recurring purchases exclusive from installments and saves through the atomic RPC', () => {
  assert.match(importacaoManualFormSource, /registrarTransacaoRecorrente/);
  assert.match(importacaoManualFormSource, /is_recorrente:\s*false/);
  assert.match(importacaoManualFormSource, /is_parcela:\s*next\s*\?\s*false\s*:\s*current\.is_parcela/);
  assert.match(importacaoManualFormSource, /is_recorrente:\s*next\s*\?\s*false\s*:\s*current\.is_recorrente/);
  assert.match(importacaoManualFormSource, /Repetir todo mês/);
  assert.match(
    importacaoManualFormSource,
    /Registra esta compra normalmente e cria uma previsão para a próxima fatura\. A previsão não altera o total até o extrato ser confirmado\./
  );
  assert.match(importacaoManualFormSource, /registrarTransacaoRecorrente\(/);
  assert.match(importacaoManualFormSource, /Compra adicionada e recorrência prevista para a próxima fatura\./);
});

test('manual recurring import reports an idempotent retry instead of a new recurrence', () => {
  const toastHandler = importacaoManualFormSource.slice(
    importacaoManualFormSource.indexOf('onSuccess: async (result) =>'),
    importacaoManualFormSource.indexOf('await onSuccess(result', importacaoManualFormSource.indexOf('onSuccess: async (result) =>'))
  );

  const idempotentRecorrenciaIndex = toastHandler.indexOf('form.is_recorrente && transacaoResult.idempotent');
  const recorrenciaCriadaIndex = toastHandler.indexOf('if (form.is_recorrente)');

  assert.ok(
    idempotentRecorrenciaIndex >= 0 && recorrenciaCriadaIndex >= 0
      && idempotentRecorrenciaIndex < recorrenciaCriadaIndex,
    'a recorrência idempotente deve ser tratada antes do toast de criação'
  );
  assert.match(toastHandler, /Transacao ja registrada anteriormente\./);
});

test('recurring forecast matching is exact by invoice, card, cents and normalized description', () => {
  assert.deepEqual(
    getPrevisaoCandidata(transacaoReal, [previsaoMesmoCartaoMesmoValor, previsaoOutroValor]),
    previsaoMesmoCartaoMesmoValor
  );
  assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoOutroValor]), null);
  assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoOutroCartao]), null);
  assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoOutraFatura]), null);
  assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoOutraDescricao]), null);
  assert.equal(getPrevisaoCandidata(transacaoReal, [previsaoJaConfirmada]), null);
});

test('recurring forecast matches a negative real transaction to its positive forecast by cents', () => {
  const transacaoEstornada = {
    ...transacaoReal,
    valor: -10.99,
  };
  const previsaoEstornada = {
    ...previsaoMesmoCartaoMesmoValor,
    id: 'previsao-estornada',
    valor: 10.99,
  };

  assert.deepEqual(getPrevisaoCandidata(transacaoEstornada, [previsaoEstornada]), previsaoEstornada);
});

test('recurring forecast normalization removes accents and punctuation', () => {
  assert.equal(normalizeRecorrenciaMatch('  Assinatura: Açúcar & Café  '), 'assinatura acucar cafe');
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

test('card transaction cancellation is explicit, open-invoice only, and recurrence-safe', () => {
  assert.match(faturasPageSource, /Cancelar lancamento/);
  assert.match(faturasPageSource, /cancelarTransacaoCartao/);
  assert.match(faturasPageSource, /compra_parcelada_id/);
  assert.match(faturasPageSource, /motivo/);
  assert.match(faturasPageSource, /status === 'aberta'/);
  assert.match(faturasPageSource, /Compra de origem de recorrencia/);
});

test('card transaction cancellation service calls the privileged RPC with audit actor', () => {
  assert.match(cartoesServiceSource, /cancelarTransacaoCartao/);
  assert.match(cartoesServiceSource, /financeiro_cartao_transacao_cancelar/);
  assert.match(cartoesServiceSource, /ator:\s*\{\}/);
});

test('card transaction cancellation payload requires a reason and prefers the parcel group', () => {
  assert.equal(isTransacaoCancelamentoDisponivel({ status: 'aberta' }), true);
  assert.equal(isTransacaoCancelamentoDisponivel({ status: 'fechada' }), false);
  assert.equal(buildTransacaoCancelamentoPayload({ transacao_id: 'tx-1', motivo: '  erro  ' })?.motivo, 'erro');
  assert.deepEqual(
    buildTransacaoCancelamentoPayload({ transacao_id: 'tx-1', compra_parcelada_id: 'parcel-1', motivo: 'duplicado' }),
    { compra_parcelada_id: 'parcel-1', motivo: 'duplicado' }
  );
  assert.equal(buildTransacaoCancelamentoPayload({ transacao_id: 'tx-1', motivo: '   ' }), null);
});

test('card invoice refresh and classification RPCs cannot leave the UI pending forever', () => {
  assert.match(
    cartoesServiceSource,
    /export async function fetchCartoesFaturas[\s\S]*withSupabaseReadTimeout\(/,
  );
  assert.match(
    cartoesServiceSource,
    /export async function classificarTransacaoCartao[\s\S]*withSupabaseReadTimeout\([\s\S]*abortSignal\(/,
  );
  assert.match(
    faturasPageSource,
    /const handleClassificar[\s\S]*try[\s\S]*await run[\s\S]*finally[\s\S]*setSavingTransacaoId\(null\)/,
  );
});

test('classification actions explain their intent and only the active action shows a spinner', () => {
  assert.match(faturasPageSource, /savingAction/);
  assert.match(faturasPageSource, /savingReabrir/);
  assert.match(faturasPageSource, /savingConfirmar/);
  assert.match(faturasPageSource, /savingCancelamento/);
  assert.match(faturasPageSource, /Reabrir para revisao/);
  assert.match(faturasPageSource, /O lancamento sai da fatura, mas nao e apagado sem registro/);
  assert.match(
    faturasPageSource,
    /const handleDecidirVinculo[\s\S]*try[\s\S]*await run[\s\S]*finally[\s\S]*setSavingPrevisaoId\(null\)/,
  );
});

test('existing card purchases expose recurring adoption only when operationally eligible', () => {
  assert.equal(typeof getRecorrenciaAdocaoDisponibilidade, 'function');
  const compra = {
    id: 'tx-compra',
    tipo_transacao: 'compra',
    compra_parcelada_id: null,
    parcela_atual: null,
    total_parcelas: null,
  } as any;
  const parcela = { ...compra, compra_parcelada_id: 'parcelamento-1', parcela_atual: 2, total_parcelas: 6 } as any;
  const tarifa = { ...compra, tipo_transacao: 'tarifa' } as any;
  const faturaAberta = { id: 'fat-aberta', status: 'aberta' } as any;
  const faturaFechada = { id: 'fat-fechada', status: 'fechada' } as any;
  const recorrencia = { id: 'rec-1', transacao_origem_id: compra.id } as any;

  assert.deepEqual(getRecorrenciaAdocaoDisponibilidade(compra, faturaAberta, null), {
    disponivel: true,
    motivo: null,
  });
  assert.equal(
    getRecorrenciaAdocaoDisponibilidade(parcela, faturaAberta, null).motivo,
    'Compras parceladas não podem ser transformadas em recorrentes.',
  );
  assert.equal(
    getRecorrenciaAdocaoDisponibilidade(tarifa, faturaAberta, null).motivo,
    'Somente compras podem ser transformadas em recorrentes.',
  );
  assert.equal(
    getRecorrenciaAdocaoDisponibilidade(compra, faturaFechada, null).motivo,
    'A fatura precisa estar aberta para criar a recorrência.',
  );
  assert.equal(
    getRecorrenciaAdocaoDisponibilidade(compra, faturaAberta, recorrencia).motivo,
    'Esta compra já possui uma recorrência.',
  );
});

test('a pending forecast decision does not disable unrelated transaction actions', () => {
  assert.doesNotMatch(
    faturasPageSource,
    /saving=\{[^}]*savingPrevisaoId\s*!==\s*null[^}]*\}/,
  );
});

test('an idle non-installment transaction is never treated as saving by null equality', () => {
  assert.equal(typeof isTransacaoSaving, 'function');
  assert.equal(isTransacaoSaving?.(null, { id: 'tx-1', compra_parcelada_id: null }), false);
  assert.equal(isTransacaoSaving?.('tx-1', { id: 'tx-1', compra_parcelada_id: null }), true);
  assert.equal(isTransacaoSaving?.('grupo-1', { id: 'tx-2', compra_parcelada_id: 'grupo-1' }), true);
});

test('existing purchases use the atomic adoption RPC and keep row loading isolated', () => {
  assert.match(cartoesServiceSource, /export async function adotarTransacaoComoRecorrente/);
  assert.match(cartoesServiceSource, /financeiro_cartao_recorrencia_adotar/);
  assert.match(faturasPageSource, /Tornar recorrente/);
  assert.match(faturasPageSource, /savingAdocaoId/);
  assert.match(
    faturasPageSource,
    /const handleAdotarRecorrencia[\s\S]*try[\s\S]*await run[\s\S]*finally[\s\S]*setSavingAdocaoId\(null\)/,
  );
});
