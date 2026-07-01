import { supabase } from './supabase';
import {
  fetchCentrosCusto,
  fetchFinanceiroContasBancarias,
  fetchFinanceiroEmpresas,
} from './contasPagarService';
import type {
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
  FinanceiroCartaoTransacao,
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
  return new Error(message || 'Não foi possível salvar o cartão.');
}

export async function fetchCartoesDashboard(): Promise<CartoesDashboardData> {
  const [cartoesResult, faturasResult, empresas, contasBancarias, centrosCusto] = await Promise.all([
    supabase
      .from('financeiro_cartoes')
      .select(CARTAO_SELECT)
      .order('ativo', { ascending: false })
      .order('apelido', { ascending: true }),
    supabase
      .from('financeiro_cartao_faturas')
      .select('cartao_id,valor_total,status')
      .in('status', ['aberta', 'fechada']),
    fetchFinanceiroEmpresas(),
    fetchFinanceiroContasBancarias(),
    fetchCentrosCusto(),
  ]);

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

  return {
    cartoes,
    empresas,
    contasBancarias,
    centrosCusto,
  };
}

export async function fetchCartoesFaturas(): Promise<CartoesFaturasData> {
  const [cartoesResult, faturasResult, empresas, contasBancarias, centrosCusto] = await Promise.all([
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
  ]);

  if (cartoesResult.error) throw cartoesResult.error;
  if (faturasResult.error) throw faturasResult.error;

  const cartoes = (cartoesResult.data || []) as unknown as FinanceiroCartao[];
  const faturas = (faturasResult.data || []) as unknown as FinanceiroCartaoFatura[];
  const faturaIds = faturas.map((fatura) => fatura.id);

  let transacoes: FinanceiroCartaoTransacao[] = [];
  if (faturaIds.length > 0) {
    const transacoesResult = await supabase
      .from('financeiro_cartao_transacoes')
      .select(TRANSACAO_SELECT)
      .in('fatura_id', faturaIds)
      .order('data_compra', { ascending: true });

    if (transacoesResult.error) throw transacoesResult.error;
    transacoes = (transacoesResult.data || []) as unknown as FinanceiroCartaoTransacao[];
  }

  return {
    cartoes,
    faturas,
    transacoes,
    empresas,
    contasBancarias,
    centrosCusto,
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
