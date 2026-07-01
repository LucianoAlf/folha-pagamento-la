import type { CentroCusto, FinanceiroContaBancaria, FinanceiroEmpresa } from './contasPagar';

export type CartaoTitularidadeTipo = 'pf' | 'pj';
export type CartaoTipoTransacao = 'compra' | 'estorno' | 'tarifa' | 'anuidade' | 'ajuste';

export interface FinanceiroCartao {
  id: string;
  created_at: string;
  updated_at: string;
  empresa_id: string | null;
  empresa?: FinanceiroEmpresa | null;
  conta_pagadora_id: string | null;
  conta_pagadora?: FinanceiroContaBancaria | null;
  centro_custo_id: string | null;
  centro_custo?: CentroCusto | null;
  titularidade_tipo: CartaoTitularidadeTipo;
  titular: string | null;
  apelido: string;
  final: string;
  bandeira: string | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  limite: number | null;
  ativo: boolean;
  observacoes: string | null;
  valor_usado?: number;
}

export interface FinanceiroCartaoFaturaResumo {
  cartao_id: string;
  valor_total: number;
  status: 'aberta' | 'fechada' | 'paga' | 'cancelada' | string;
}

export interface CartoesLookups {
  empresas: FinanceiroEmpresa[];
  contasBancarias: FinanceiroContaBancaria[];
  centrosCusto: CentroCusto[];
}

export interface CartoesDashboardData extends CartoesLookups {
  cartoes: FinanceiroCartao[];
}

export interface FinanceiroCartaoPayload {
  cartao_id?: string;
  apelido: string;
  final: string;
  titularidade_tipo: CartaoTitularidadeTipo;
  titular?: string | null;
  bandeira?: string | null;
  empresa_id?: string | null;
  conta_pagadora_id?: string | null;
  centro_custo_id?: string | null;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
  limite?: number | null;
  observacoes?: string | null;
}

export interface CartaoRpcResponse {
  success: boolean;
  cartao_id: string;
  operacao?: 'INSERT' | 'UPDATE' | string;
  ativo?: boolean;
}

export interface FinanceiroCartaoCiclo {
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
}

export interface FinanceiroCartaoLancamentoPayload {
  cartao_id: string;
  data_compra: string;
  descricao: string;
  estabelecimento?: string | null;
  tipo_transacao: CartaoTipoTransacao;
  total_parcelas: number;
  valor_total?: number | null;
  valor_parcela?: number | null;
  client_token: string;
  observacoes?: string | null;
}

export interface FinanceiroCartaoLancamentoParcela {
  parcela: number;
  fatura_id: string;
  competencia: string;
  valor: number;
  transacao_id: string;
  idempotent: boolean;
}

export interface FinanceiroCartaoLancamentoResponse {
  success: boolean;
  compra_parcelada_id: string | null;
  total_parcelas: number;
  valor_total: number;
  parcelas: FinanceiroCartaoLancamentoParcela[];
}
