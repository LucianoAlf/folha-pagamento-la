import type { CentroCusto, FinanceiroContaBancaria, FinanceiroEmpresa, PlanoConta } from './contasPagar';

export type CartaoTitularidadeTipo = 'pf' | 'pj';
export type CartaoTipoTransacao = 'compra' | 'estorno' | 'tarifa' | 'anuidade' | 'ajuste';
export type CartaoFaturaStatus = 'aberta' | 'fechada' | 'paga' | 'cancelada';
export type CartaoClassificacaoStatus = 'pendente' | 'sugerida' | 'confirmada';

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
  status: CartaoFaturaStatus | string;
}

export interface FinanceiroCartaoClassificacaoResumo {
  total: number;
  confirmadas: number;
  sugeridas: number;
  pendentes: number;
  percentualConfirmado: number;
}

export interface FinanceiroCartaoFatura {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  cartao_id: string;
  cartao?: FinanceiroCartao | null;
  competencia: string;
  data_fechamento: string | null;
  data_vencimento: string;
  valor_total: number;
  status: CartaoFaturaStatus | string;
  conta_pagar_id: string | null;
  observacoes?: string | null;
  classificacao?: FinanceiroCartaoClassificacaoResumo;
}

export interface FinanceiroCartaoTransacao {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  fatura_id: string;
  cartao_id: string;
  importacao_id?: string | null;
  data_compra: string;
  descricao: string;
  estabelecimento?: string | null;
  valor: number;
  tipo_transacao: CartaoTipoTransacao | string;
  empresa_id?: string | null;
  empresa?: FinanceiroEmpresa | null;
  plano_conta_id?: string | null;
  plano_conta?: PlanoConta | null;
  centro_custo_id?: string | null;
  centro_custo?: CentroCusto | null;
  classificacao_status: CartaoClassificacaoStatus | string;
  classificado_por?: string | null;
  classificado_em?: string | null;
  compra_parcelada_id?: string | null;
  parcela_atual?: number | null;
  total_parcelas?: number | null;
  valor_total_compra?: number | null;
  fingerprint?: string | null;
  possivel_duplicata?: boolean;
  id_externo?: string | null;
  fonte_tipo?: string | null;
  ator_tipo?: string | null;
  ator_ref?: string | null;
  created_by?: string | null;
  observacoes?: string | null;
}

export interface CartoesFaturasData extends CartoesLookups {
  cartoes: FinanceiroCartao[];
  faturas: FinanceiroCartaoFatura[];
  transacoes: FinanceiroCartaoTransacao[];
  planos: PlanoConta[];
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

export interface FinanceiroCartaoTransacaoImportadaPayload {
  fatura_id: string;
  descricao: string;
  data_compra: string;
  valor: number;
  tipo_transacao: CartaoTipoTransacao;
  estabelecimento?: string | null;
  parcela_atual?: number | null;
  total_parcelas?: number | null;
  id_externo: string;
  observacoes?: string | null;
  motivo?: string | null;
}

export interface FinanceiroCartaoTransacaoImportadaResponse {
  success: boolean;
  transacao_id: string;
  classificacao_status: CartaoClassificacaoStatus | string;
  possivel_duplicata?: boolean;
  idempotent?: boolean;
  ator_tipo?: string | null;
}

export interface FinanceiroCartaoClassificacaoPayload {
  transacao_id: string;
  classificacao_status: 'confirmada' | 'pendente';
  plano_conta_id?: string | null;
  centro_custo_id?: string | null;
  empresa_id?: string | null;
  motivo?: string | null;
}

export interface FinanceiroCartaoClassificacaoResponse {
  success: boolean;
  transacao_id: string;
  classificacao_status: CartaoClassificacaoStatus | string;
}

export interface FinanceiroCartaoFaturaFecharResponse {
  success: boolean;
  fatura_id: string;
  conta_pagar_id: string | null;
  valor_total: number;
  status: CartaoFaturaStatus | string;
  classificacao?: {
    total: number;
    confirmadas: number;
    sugeridas: number;
    pendentes: number;
    dre_incompleto: boolean;
  };
}

export interface FinanceiroCartaoFaturaReabrirResponse {
  success: boolean;
  fatura_id: string;
  status: CartaoFaturaStatus | string;
}
