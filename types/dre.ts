export type DreRegime = 'competencia' | 'caixa';
export type DreModoVisual = 'simples' | 'sofisticado';
export type DreFonte = 'contas_receber' | 'contas_pagar' | 'cartao' | 'folha';
export type DreNatureza = 'entrada' | 'saida';
export type DreCoberturaEstado = 'ok' | 'sem_dados';
export type DreUnidade = 'consolidado' | 'cg' | 'rec' | 'bar';
export type DreUnidadeOperacional = Exclude<DreUnidade, 'consolidado'>;
export type DreQualidadeUnidade = 'exata' | 'aproximada_fiscal_pagadora';
export type DreSemUnidadeMotivo =
  | 'folha_sem_alocacao'
  | 'folha_desatualizada'
  | 'cartao_nao_confirmado'
  | 'fonte_sem_unidade';

export interface DreKpis {
  receita: number;
  despesa: number;
  lucro_operacional: number;
  investimentos: number;
  entradas_nao_operacionais: number;
  saidas_nao_operacionais: number;
  lucro_liquido: number;
}

export interface DreGrupo {
  codigo: string;
  nome: string;
  valor_resultado: number;
  linhas_classificadas: number;
}

export interface DrePlano {
  grupo_codigo: string;
  plano_codigo: string;
  plano_nome: string;
  natureza: DreNatureza;
  valor_resultado: number;
  por_fonte: Partial<Record<DreFonte, number>>;
}

export interface DreCoberturaFonte {
  fonte: DreFonte;
  label: string;
  estado: DreCoberturaEstado;
  linhas: number;
  classificadas: number;
  total_origem: number;
}

export interface DreReconciliacaoFonte {
  fonte: DreFonte;
  label: string;
  classificado_dre: number;
  em_revisao: number;
  sem_plano: number;
  cancelado: number;
  excluido: number;
  total_origem: number;
}

export interface DreMetricasUnidade {
  valor_origem: number;
  valor_resultado: number;
  linhas: number;
  colaboradores_folha: number;
}

export interface DreResumoSemUnidadeOperacional extends DreMetricasUnidade {
  por_motivo: Record<DreSemUnidadeMotivo, DreMetricasUnidade>;
}

export interface DreConsulta {
  success: boolean;
  competencia: string;
  regime: DreRegime;
  unidade: DreUnidade;
  kpis: DreKpis;
  grupos: DreGrupo[];
  planos: DrePlano[];
  cobertura: DreCoberturaFonte[];
  reconciliacao: DreReconciliacaoFonte[];
  sem_unidade_operacional: DreResumoSemUnidadeOperacional;
}

export interface DreCursor {
  plano_codigo: string | null;
  fonte: DreFonte;
  origem_id: string;
  origem_sequencia: string;
  unidade_operacional: DreUnidadeOperacional | null;
}

export interface DreDetalhe {
  fonte: DreFonte;
  origem_id: string;
  origem_sequencia: string;
  competencia_origem: string;
  data_caixa: string | null;
  data_referencia: string;
  conta_pagadora_id: string | null;
  conta_pagadora_label: string | null;
  descricao: string;
  contraparte: string;
  plano_codigo: string | null;
  plano_nome: string | null;
  natureza: DreNatureza | null;
  grupo_codigo: string;
  valor_origem: number;
  valor_resultado: number;
  escopo_dre: 'operacional' | 'fora_operacional' | 'nenhum';
  status_financeiro: string | null;
  status_classificacao: 'classificado_dre' | 'em_revisao' | 'sem_plano' | 'cancelado' | 'excluido';
  colaborador_id: number | null;
  unidade_operacional: DreUnidadeOperacional | null;
  qualidade_unidade: DreQualidadeUnidade | null;
  motivo_sem_unidade: DreSemUnidadeMotivo | null;
}

export interface DreDetalhesPagina {
  success: boolean;
  itens: DreDetalhe[];
  next_cursor: DreCursor | null;
}
