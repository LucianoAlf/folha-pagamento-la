import { supabase } from './supabase';
import { withSupabaseReadTimeout } from './rhReadResilience';
import {
  fetchCentrosCusto,
  fetchFinanceiroContasBancarias,
  fetchFinanceiroEmpresas,
  fetchPlanoContas,
} from './contasPagarService';
import type {
  FinanceiroCartaoClassificacaoPayload,
  FinanceiroCartaoClassificacaoResponse,
  FinanceiroCartaoFaturaFecharResponse,
  FinanceiroCartaoFaturaReabrirResponse,
  CartaoRpcResponse,
  CartoesDashboardData,
  CartoesFaturasData,
  FinanceiroCartaoCiclo,
  FinanceiroCartao,
  FinanceiroCartaoFatura,
  FinanceiroCartaoFaturaResumo,
  FinanceiroCartaoLancamentoPayload,
  FinanceiroCartaoLancamentoResponse,
  FinanceiroCartaoPayload,
  FinanceiroCartaoTransacaoImportadaPayload,
  FinanceiroCartaoTransacaoImportadaResponse,
  FinanceiroCartaoTransacaoCancelarPayload,
  FinanceiroCartaoTransacaoCancelarResponse,
  FinanceiroCartaoTransacao,
  FinanceiroCartaoRecorrencia,
  FinanceiroCartaoRecorrenciaPrevisao,
  FinanceiroCartaoRecorrenciaCriarPayload,
  FinanceiroCartaoRecorrenciaCriarResponse,
  FinanceiroCartaoRecorrenciaAtualizarPayload,
  FinanceiroCartaoRecorrenciaAtualizarResponse,
  FinanceiroCartaoRecorrenciaAlterarStatusPayload,
  FinanceiroCartaoRecorrenciaAlterarStatusResponse,
  FinanceiroCartaoRecorrenciaPrevisaoDecidirVinculoPayload,
  FinanceiroCartaoRecorrenciaPrevisaoDecidirVinculoResponse,
} from '../types/cartoes';

const CARTAO_SELECT = `
  id,
  created_at,
  updated_at,
  empresa_id,
  conta_pagadora_id,
  centro_custo_id,
  titularidade_tipo,
  titular,
  apelido,
  final,
  bandeira,
  dia_fechamento,
  dia_vencimento,
  limite,
  ativo,
  observacoes,
  empresa:financeiro_empresas(
    id,
    razao_social,
    nome_fantasia,
    cnpj,
    label_operacional,
    unidade_id,
    ativo,
    observacoes,
    unidade:centros_custo(id,codigo,nome,tipo,ativo,ordem)
  ),
  conta_pagadora:financeiro_contas_bancarias(
    id,
    empresa_id,
    banco,
    banco_codigo,
    agencia,
    conta,
    apelido,
    tipo,
    ativo,
    observacoes
  ),
  centro_custo:centros_custo(id,codigo,nome,tipo,ativo,ordem)
`;

const FATURA_SELECT = `
  id,
  created_at,
  updated_at,
  cartao_id,
  competencia,
  data_fechamento,
  data_vencimento,
  valor_total,
  status,
  conta_pagar_id,
  observacoes,
  cartao:financeiro_cartoes(${CARTAO_SELECT})
`;

const TRANSACAO_SELECT = `
  id,
  created_at,
  updated_at,
  fatura_id,
  cartao_id,
  importacao_id,
  data_compra,
  descricao,
  estabelecimento,
  valor,
  tipo_transacao,
  empresa_id,
  plano_conta_id,
  centro_custo_id,
  classificacao_status,
  classificado_por,
  classificado_em,
  compra_parcelada_id,
  parcela_atual,
  total_parcelas,
  valor_total_compra,
  fingerprint,
  possivel_duplicata,
  id_externo,
  fonte_tipo,
  ator_tipo,
  ator_ref,
  created_by,
  observacoes,
  empresa:financeiro_empresas(id,razao_social,nome_fantasia,cnpj,label_operacional,unidade_id,ativo,observacoes,unidade:centros_custo(id,codigo,nome,tipo,ativo,ordem)),
  plano_conta:plano_contas(id,codigo,nome,nome_completo,parent_id,nivel,grupo_plano,natureza,tipo_custo,ativo,ordem),
  centro_custo:centros_custo(id,codigo,nome,tipo,ativo,ordem)
`;

const RECORRENCIA_SELECT = `
  id,
  cartao_id,
  transacao_origem_id,
  data_inicio,
  dia_base,
  descricao,
  estabelecimento,
  valor,
  empresa_id,
  plano_conta_id,
  centro_custo_id,
  classificacao_status,
  status,
  motivo_status
`;

const PREVISAO_SELECT = `
  id,
  recorrencia_id,
  fatura_id,
  cartao_id,
  competencia,
  data_compra,
  descricao,
  estabelecimento,
  valor,
  status,
  transacao_confirmada_id
`;

function normalizePayload(input: FinanceiroCartaoPayload): FinanceiroCartaoPayload {
  const clean: FinanceiroCartaoPayload = {
    apelido: input.apelido.trim(),
    final: input.final.trim(),
    titularidade_tipo: input.titularidade_tipo,
    titular: input.titular?.trim() || null,
    bandeira: input.bandeira?.trim() || null,
    empresa_id: input.empresa_id || null,
    conta_pagadora_id: input.conta_pagadora_id || null,
    centro_custo_id: input.centro_custo_id || null,
    dia_fechamento: input.dia_fechamento ?? null,
    dia_vencimento: input.dia_vencimento ?? null,
    limite: input.limite ?? null,
    observacoes: input.observacoes?.trim() || null,
  };

  if (input.cartao_id) clean.cartao_id = input.cartao_id;
  return clean;
}

function friendlyRpcError(error: any): Error {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (code === '23505' || /apelido|unique|duplic/i.test(message)) {
    return new Error('Já existe um cartão com esse apelido.');
  }
  if (/final.*4|4 digitos|4 dígitos/i.test(message)) {
    return new Error('O final do cartão precisa ter exatamente 4 dígitos.');
  }
  if (/fatura cancelada nao permite reclassificacao|status = cancelada/i.test(message)) {
    return new Error('Fatura cancelada nao permite classificacao.');
  }
  if (/obrigatorio para classificacao confirmada/i.test(message)) {
    return new Error('Preencha empresa, centro de custo e plano antes de confirmar.');
  }
  if (/centro_custo_id incoerente com a empresa/i.test(message)) {
    return new Error('Centro de custo nao corresponde a empresa escolhida.');
  }
  if (/folha de saida ativa/i.test(message)) {
    return new Error('Escolha uma folha ativa de saida no plano de contas.');
  }
  if (/fechamento fiscal bloqueado/i.test(message)) {
    return new Error('Complete empresa, conta pagadora e centro no cadastro do cartao antes de fechar a fatura.');
  }
  if (/fatura paga nao pode ser reaberta/i.test(message)) {
    return new Error('Fatura paga nao pode ser reaberta.');
  }
  if (/conta_pagar.*ja esta paga.*reabertura bloqueada|reabertura bloqueada/i.test(message)) {
    return new Error('A conta a pagar desta fatura ja esta paga; nao e possivel reabrir.');
  }
  if (/fatura_id obrigatorio/i.test(message)) {
    return new Error('Selecione uma fatura antes de adicionar a transacao.');
  }
  if (/valor obrigatorio e diferente de zero/i.test(message)) {
    return new Error('Informe um valor diferente de zero.');
  }
  if (/nao permite alterar transacoes quando status|transacoes de fatura .* nao podem ser alteradas quando status/i.test(message)) {
    return new Error('Esta fatura nao esta aberta. Reabra a fatura antes de adicionar transacoes.');
  }
  return new Error(message || 'Não foi possível salvar o cartão.');
}

async function callCartaoRpc<T>(nome: string, payload: object): Promise<T> {
  const { data, error } = await supabase.rpc(nome, { payload, ator: {} });

  if (error) throw friendlyRpcError(error);
  return data as T;
}

export type CartoesResumoData = Pick<CartoesDashboardData, 'cartoes'>;
export type CartoesReferenciasData = Omit<CartoesDashboardData, 'cartoes'>;

export async function fetchCartoesResumo(): Promise<CartoesResumoData> {
  const [cartoesResult, faturasResult] = await withSupabaseReadTimeout((signal) => Promise.all([
    supabase
      .from('financeiro_cartoes')
      .select(CARTAO_SELECT)
      .order('ativo', { ascending: false })
      .order('apelido', { ascending: true })
      .abortSignal(signal),
    supabase
      .from('financeiro_cartao_faturas')
      .select('cartao_id,valor_total,status')
      .in('status', ['aberta', 'fechada'])
      .abortSignal(signal),
  ]), { label: 'Os dados dos cartoes', timeoutMs: 10_000 });

  if (cartoesResult.error) throw cartoesResult.error;
  if (faturasResult.error) throw faturasResult.error;

  const usadoPorCartao = new Map<string, number>();
  ((faturasResult.data || []) as FinanceiroCartaoFaturaResumo[]).forEach((fatura) => {
    usadoPorCartao.set(
      fatura.cartao_id,
      (usadoPorCartao.get(fatura.cartao_id) || 0) + Number(fatura.valor_total || 0)
    );
  });

  const cartoes = ((cartoesResult.data || []) as unknown as FinanceiroCartao[]).map((cartao) => ({
    ...cartao,
    valor_usado: usadoPorCartao.get(cartao.id) || 0,
  }));

  return { cartoes };
}

export async function fetchCartoesReferencias(): Promise<CartoesReferenciasData> {
  const [empresas, contasBancarias, centrosCusto] = await Promise.all([
    fetchFinanceiroEmpresas(),
    fetchFinanceiroContasBancarias(),
    fetchCentrosCusto(),
  ]);

  return { empresas, contasBancarias, centrosCusto };
}

export async function fetchCartoesDashboard(): Promise<CartoesDashboardData> {
  const [resumo, referencias] = await Promise.all([
    fetchCartoesResumo(),
    fetchCartoesReferencias(),
  ]);

  return { ...resumo, ...referencias };
}

export async function fetchCartoesFaturas(): Promise<CartoesFaturasData> {
  const [cartoesResult, faturasResult, empresas, contasBancarias, centrosCusto, planos] = await Promise.all([
    supabase
      .from('financeiro_cartoes')
      .select(CARTAO_SELECT)
      .order('ativo', { ascending: false })
      .order('apelido', { ascending: true }),
    supabase
      .from('financeiro_cartao_faturas')
      .select(FATURA_SELECT)
      .order('data_vencimento', { ascending: true }),
    fetchFinanceiroEmpresas(),
    fetchFinanceiroContasBancarias(),
    fetchCentrosCusto(),
    fetchPlanoContas(),
  ]);

  if (cartoesResult.error) throw cartoesResult.error;
  if (faturasResult.error) throw faturasResult.error;

  const cartoes = (cartoesResult.data || []) as unknown as FinanceiroCartao[];
  const faturas = (faturasResult.data || []) as unknown as FinanceiroCartaoFatura[];
  const faturaIds = Array.from(new Set(faturas.map((fatura) => fatura.id)));
  const cartaoIds = Array.from(new Set(cartoes.map((cartao) => cartao.id)));

  const [transacoesResult, recorrenciasResult, previsoesResult] = await Promise.all([
    faturaIds.length > 0
      ? supabase
        .from('financeiro_cartao_transacoes')
        .select(TRANSACAO_SELECT)
        .in('fatura_id', faturaIds)
        .order('data_compra', { ascending: true })
      : Promise.resolve(null),
    cartaoIds.length > 0
      ? supabase
        .from('financeiro_cartao_recorrencias')
        .select(RECORRENCIA_SELECT)
        .in('cartao_id', cartaoIds)
        .order('data_inicio', { ascending: true })
      : Promise.resolve(null),
    faturaIds.length > 0
      ? supabase
        .from('financeiro_cartao_recorrencia_previsoes')
        .select(PREVISAO_SELECT)
        .in('fatura_id', faturaIds)
        .order('data_compra', { ascending: true })
      : Promise.resolve(null),
  ]);

  if (transacoesResult?.error) throw transacoesResult.error;
  if (recorrenciasResult?.error) throw recorrenciasResult.error;
  if (previsoesResult?.error) throw previsoesResult.error;

  const transacoes = (transacoesResult?.data || []) as unknown as FinanceiroCartaoTransacao[];
  const recorrencias = (recorrenciasResult?.data || []) as unknown as FinanceiroCartaoRecorrencia[];
  const previsoes = (previsoesResult?.data || []) as unknown as FinanceiroCartaoRecorrenciaPrevisao[];

  return {
    cartoes,
    faturas,
    transacoes,
    recorrencias,
    previsoes,
    empresas,
    contasBancarias,
    centrosCusto,
    planos,
  };
}

export async function salvarCartao(payload: FinanceiroCartaoPayload): Promise<CartaoRpcResponse> {
  const { data, error } = await supabase.rpc('financeiro_cartao_salvar', {
    p_payload: normalizePayload(payload),
    p_ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as CartaoRpcResponse;
}

export async function arquivarCartao(input: {
  cartao_id: string;
  ativo: boolean;
  motivo?: string | null;
}): Promise<CartaoRpcResponse> {
  const { data, error } = await supabase.rpc('financeiro_cartao_arquivar', {
    p_payload: {
      cartao_id: input.cartao_id,
      ativo: input.ativo,
      motivo: input.motivo || (input.ativo ? 'Desarquivado pelo app web.' : 'Arquivado pelo app web.'),
    },
    p_ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as CartaoRpcResponse;
}

export async function previewCicloCartao(cartaoId: string, dataCompra: string): Promise<FinanceiroCartaoCiclo> {
  const { data, error } = await supabase.rpc('financeiro_cartao_ciclo', {
    p_cartao_id: cartaoId,
    p_data: dataCompra,
  });

  if (error) throw friendlyRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return row as FinanceiroCartaoCiclo;
}

export async function registrarLancamentoCartao(
  payload: FinanceiroCartaoLancamentoPayload
): Promise<FinanceiroCartaoLancamentoResponse> {
  const cleanPayload: FinanceiroCartaoLancamentoPayload = {
    cartao_id: payload.cartao_id,
    data_compra: payload.data_compra,
    descricao: payload.descricao.trim(),
    estabelecimento: payload.estabelecimento?.trim() || null,
    tipo_transacao: payload.tipo_transacao,
    total_parcelas: payload.total_parcelas,
    client_token: payload.client_token,
    observacoes: payload.observacoes?.trim() || null,
  };

  if (payload.valor_total != null) cleanPayload.valor_total = payload.valor_total;
  if (payload.valor_parcela != null) cleanPayload.valor_parcela = payload.valor_parcela;

  const { data, error } = await supabase.rpc('financeiro_cartao_lancamento_registrar', {
    payload: cleanPayload,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoLancamentoResponse;
}

export async function registrarTransacaoImportada(
  payload: FinanceiroCartaoTransacaoImportadaPayload
): Promise<FinanceiroCartaoTransacaoImportadaResponse> {
  const cleanPayload: FinanceiroCartaoTransacaoImportadaPayload = {
    fatura_id: payload.fatura_id,
    data_compra: payload.data_compra,
    descricao: payload.descricao.trim(),
    valor: payload.valor,
    tipo_transacao: payload.tipo_transacao,
    estabelecimento: payload.estabelecimento?.trim() || null,
    id_externo: payload.id_externo,
    observacoes: payload.observacoes?.trim() || null,
    motivo: payload.motivo?.trim() || 'Importacao manual pelo app web.',
  };

  if (payload.parcela_atual != null) cleanPayload.parcela_atual = payload.parcela_atual;
  if (payload.total_parcelas != null) cleanPayload.total_parcelas = payload.total_parcelas;
  if (payload.classificacao_status === 'confirmada') {
    cleanPayload.classificacao_status = 'confirmada';
    cleanPayload.plano_conta_id = payload.plano_conta_id || null;
    cleanPayload.centro_custo_id = payload.centro_custo_id || null;
    cleanPayload.empresa_id = payload.empresa_id || null;
  }

  const { data, error } = await supabase.rpc('financeiro_cartao_transacao_registrar', {
    payload: cleanPayload,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoTransacaoImportadaResponse;
}

export async function cancelarTransacaoCartao(
  payload: FinanceiroCartaoTransacaoCancelarPayload
): Promise<FinanceiroCartaoTransacaoCancelarResponse> {
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw new Error('Informe o motivo do cancelamento.');

  const cleanPayload: FinanceiroCartaoTransacaoCancelarPayload = {
    motivo,
  };
  if (payload.compra_parcelada_id) {
    cleanPayload.compra_parcelada_id = payload.compra_parcelada_id;
  } else if (payload.transacao_id) {
    cleanPayload.transacao_id = payload.transacao_id;
  } else {
    throw new Error('Selecione um lancamento para cancelar.');
  }

  const { data, error } = await supabase.rpc('financeiro_cartao_transacao_cancelar', {
    payload: cleanPayload,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoTransacaoCancelarResponse;
}

export async function registrarTransacaoRecorrente(
  payload: FinanceiroCartaoRecorrenciaCriarPayload
): Promise<FinanceiroCartaoRecorrenciaCriarResponse> {
  return callCartaoRpc<FinanceiroCartaoRecorrenciaCriarResponse>(
    'financeiro_cartao_recorrencia_criar',
    payload
  );
}

export async function atualizarRecorrenciaCartao(
  payload: FinanceiroCartaoRecorrenciaAtualizarPayload
): Promise<FinanceiroCartaoRecorrenciaAtualizarResponse> {
  return callCartaoRpc<FinanceiroCartaoRecorrenciaAtualizarResponse>(
    'financeiro_cartao_recorrencia_atualizar',
    payload
  );
}

export async function alterarStatusRecorrenciaCartao(
  payload: FinanceiroCartaoRecorrenciaAlterarStatusPayload
): Promise<FinanceiroCartaoRecorrenciaAlterarStatusResponse> {
  return callCartaoRpc<FinanceiroCartaoRecorrenciaAlterarStatusResponse>(
    'financeiro_cartao_recorrencia_alterar_status',
    payload
  );
}

export async function decidirVinculoPrevisaoCartao(
  payload: FinanceiroCartaoRecorrenciaPrevisaoDecidirVinculoPayload
): Promise<FinanceiroCartaoRecorrenciaPrevisaoDecidirVinculoResponse> {
  return callCartaoRpc<FinanceiroCartaoRecorrenciaPrevisaoDecidirVinculoResponse>(
    'financeiro_cartao_recorrencia_previsao_decidir_vinculo',
    payload
  );
}

export async function classificarTransacaoCartao(
  payload: FinanceiroCartaoClassificacaoPayload
): Promise<FinanceiroCartaoClassificacaoResponse> {
  const cleanPayload: FinanceiroCartaoClassificacaoPayload = {
    transacao_id: payload.transacao_id,
    classificacao_status: payload.classificacao_status,
    motivo: payload.motivo?.trim() || null,
  };

  if (payload.classificacao_status === 'confirmada') {
    cleanPayload.plano_conta_id = payload.plano_conta_id || null;
    cleanPayload.centro_custo_id = payload.centro_custo_id || null;
    cleanPayload.empresa_id = payload.empresa_id || null;
  }

  const { data, error } = await supabase.rpc('financeiro_cartao_transacao_classificar', {
    payload: cleanPayload,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoClassificacaoResponse;
}

export async function fecharFaturaCartao(faturaId: string): Promise<FinanceiroCartaoFaturaFecharResponse> {
  const { data, error } = await supabase.rpc('financeiro_cartao_fatura_fechar', {
    p_fatura_id: faturaId,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoFaturaFecharResponse;
}

export async function reabrirFaturaCartao(faturaId: string): Promise<FinanceiroCartaoFaturaReabrirResponse> {
  const { data, error } = await supabase.rpc('financeiro_cartao_fatura_reabrir', {
    p_fatura_id: faturaId,
    ator: {},
  });

  if (error) throw friendlyRpcError(error);
  return data as FinanceiroCartaoFaturaReabrirResponse;
}
