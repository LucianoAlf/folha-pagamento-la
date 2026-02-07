// =====================================================
// TYPES - SISTEMA DE FÉRIAS CLT
// Data: 2026-02-07
// Descrição: Definições TypeScript para o sistema de férias
// =====================================================

// =====================================================
// 1. ENUMS E TIPOS BÁSICOS
// =====================================================

export type FeriasPeriodoStatus = 'ativo' | 'em_gozo' | 'concluido' | 'vencido';
export type FeriasProgramacaoStatus = 'programado' | 'aprovado' | 'em_gozo' | 'concluido' | 'cancelado';
export type FeriasStatusGeral = 'ok' | 'atencao' | 'alerta' | 'critico';
export type FeriasPeriodoIdeal = 'ferias_fim_ano' | 'carnaval' | 'julho' | 'outro';

// =====================================================
// 2. INTERFACES PRINCIPAIS
// =====================================================

/**
 * Período Aquisitivo de Férias
 * Representa um período de 12 meses trabalhados que gera direito a férias
 */
export interface FeriasPeriodoAquisitivo {
  id: string;
  colaborador_id: number;

  // Período aquisitivo (12 meses trabalhados)
  data_inicio: string; // ISO date
  data_fim: string; // ISO date

  // Período concessivo (12 meses para gozar)
  concessivo_inicio: string; // ISO date
  concessivo_fim: string; // ISO date

  // Saldos
  dias_direito: number; // Padrão 30, pode ser reduzido por faltas
  dias_gozados: number;
  dias_vendidos: number;
  dias_saldo: number; // Computed

  // Status
  status: FeriasPeriodoStatus;
  faltas_periodo?: number;
  observacoes?: string;

  // Alertas
  alerta_concessivo_enviado: boolean;
  esta_vencido: boolean; // Computed

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Programação de Férias
 * Representa um período programado de gozo de férias
 */
export interface FeriasProgramacao {
  id: string;
  periodo_aquisitivo_id: string;
  colaborador_id: number;

  // Datas de gozo
  data_inicio: string; // ISO date
  data_fim: string; // ISO date
  dias_corridos: number;
  dias_uteis: number;

  // Abono pecuniário (venda de 1/3)
  vendeu_abono: boolean;
  dias_abono: number; // Máximo 10 dias

  // Status
  status: FeriasProgramacaoStatus;

  // Pagamento
  data_limite_pagamento: string; // Computed: data_inicio - 2 dias
  pagamento_efetuado: boolean;
  data_pagamento?: string; // ISO date
  valor_pagamento?: number;

  // Aprovação
  aprovado_por?: string; // UUID do usuário
  aprovado_em?: string; // ISO timestamp
  observacoes?: string;

  // Alertas
  alerta_pagamento_enviado: boolean;
  alerta_inicio_enviado: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Status Consolidado de Férias por Colaborador
 * View que agrega informações de férias de um colaborador
 */
export interface FeriasColaboradorStatus {
  colaborador_id: number;
  nome: string;
  nome_completo?: string;
  foto_url?: string;
  funcao: string;
  departamento: string;
  data_admissao: string;
  colaborador_status: string;
  salario_base: number;

  // Agregados de períodos
  periodos_ativos: number;
  periodos_vencidos: number;
  total_dias_saldo: number;

  // Situações críticas
  tem_ferias_vencidas: boolean;
  proxima_expiracao?: string; // ISO date

  // Férias programadas
  ferias_programadas: number;
  proximas_ferias_inicio?: string; // ISO date

  // Status geral
  status_ferias: FeriasStatusGeral;
}

/**
 * Histórico de Ações
 * Auditoria de ações no sistema de férias
 */
export interface FeriasHistoricoAcao {
  id: string;
  created_at: string;
  user_id: string;
  colaborador_id?: number;
  acao: string; // 'periodo_criado', 'ferias_programadas', 'ferias_aprovadas', etc
  entidade_tipo: string; // 'periodo_aquisitivo', 'programacao'
  entidade_id: string;
  detalhes?: Record<string, any>;
  observacao?: string;
}

// =====================================================
// 3. INTERFACES DE IA (PREMIUM)
// =====================================================

/**
 * Situação Crítica identificada pela IA
 */
export interface FeriasAiSituacaoCritica {
  colaborador_id: number;
  colaborador_nome: string;
  tipo: 'ferias_vencidas' | 'concessivo_proximo';
  severidade: 'critica' | 'alta' | 'media';
  descricao: string;
  dias_saldo: number;
  prazo_limite: string; // ISO date
  acao_imediata: string;
}

/**
 * Sugestão de Distribuição de Férias pela IA
 */
export interface FeriasAiSugestaoDistribuicao {
  colaborador_id: number;
  colaborador_nome: string;
  periodo_sugerido_inicio: string; // ISO date
  periodo_sugerido_fim: string; // ISO date
  dias_sugeridos: number;
  justificativa: string;
  prioridade: 'alta' | 'media' | 'baixa';
  periodo_ideal: FeriasPeriodoIdeal;
}

/**
 * Impacto Financeiro calculado pela IA
 */
export interface FeriasAiImpactoFinanceiro {
  custo_ferias_programadas_estimado: number;
  custo_multas_potenciais: number;
  economia_planejamento: number;
  observacoes: string;
}

/**
 * Distribuição por Departamento
 */
export interface FeriasAiDistribuicaoDepartamento {
  total: number;
  com_ferias_pendentes: number;
  sugestao: string;
}

/**
 * JSON de Resposta Completo da IA
 */
export interface FeriasAiInsightsJson {
  analise_executiva: string;
  situacoes_criticas: FeriasAiSituacaoCritica[];
  sugestoes_distribuicao: FeriasAiSugestaoDistribuicao[];
  impacto_financeiro: FeriasAiImpactoFinanceiro;
  distribuicao_departamentos: Record<string, FeriasAiDistribuicaoDepartamento>;
  recomendacoes_operacionais: string[];
}

/**
 * Insight de IA armazenado no banco
 */
export interface FeriasAiInsight {
  id: string;
  created_at: string;
  periodo_referencia: string; // Ex: "2025-Q1", "2025-07"
  departamento?: string;
  unidade?: string;
  model: string;
  input_hash: string;
  summary?: string;
  response_json: FeriasAiInsightsJson;
  generated_by?: string;
}

// =====================================================
// 4. INTERFACES DE FORMULÁRIOS E UI
// =====================================================

/**
 * Dados de Input para Programação de Férias
 */
export interface FeriasProgramacaoInput {
  periodo_aquisitivo_id: string;
  colaborador_id: number;
  data_inicio: string; // ISO date
  data_fim: string; // ISO date
  dias_corridos: number;
  dias_uteis: number;
  vendeu_abono: boolean;
  dias_abono: number;
  observacoes?: string;
}

/**
 * Dados de Cálculo de Valor de Férias
 */
export interface FeriasValorCalculado {
  salario_base: number;
  valor_ferias: number;
  valor_terco: number; // 1/3 constitucional
  valor_abono: number; // Venda de dias
  valor_total: number;
}

/**
 * Filtros para Listagem de Colaboradores
 */
export interface FeriasColaboradorFiltros {
  busca?: string; // Nome, função, email
  departamento?: string;
  status_ferias?: FeriasStatusGeral;
  ordenacao?: 'proxima_expiracao' | 'nome' | 'admissao';
}

/**
 * Filtros para Programações
 */
export interface FeriasProgramacaoFiltros {
  colaborador_id?: number;
  status?: FeriasProgramacaoStatus | FeriasProgramacaoStatus[];
  data_inicio_de?: string;
  data_inicio_ate?: string;
  pagamento_pendente?: boolean;
}

// =====================================================
// 5. INTERFACES DE RESPOSTA DA API
// =====================================================

/**
 * Resposta da API de Cálculo de Períodos
 */
export interface FeriasCalcularPeriodosResponse {
  success: boolean;
  colaboradorId?: number;
  colaboradoresProcessados?: number;
  periodosGerados: number;
  resultados?: Array<{
    colaboradorId: number;
    nome: string;
    periodos: number;
    erro?: string;
  }>;
  message: string;
  error?: string;
}

/**
 * Resposta da API de WhatsApp Alertas
 */
export interface FeriasWhatsAppAlertasResponse {
  success: boolean;
  enviados: number;
  ignorados: number;
  erros: number;
  detalhes?: Array<{
    tipo: string;
    colaborador: string;
    status: 'enviado' | 'ignorado' | 'erro';
    erro?: string;
  }>;
}

// =====================================================
// 6. CONFIGURAÇÃO DE ALERTAS
// =====================================================

/**
 * Configuração de Alertas de Férias
 * (Extensão da tabela notificacao_config)
 */
export interface FeriasAlertasConfig {
  ferias_alerta_aquisitivo_prox: boolean;
  ferias_alerta_aquisitivo_dias: number;
  ferias_alerta_concessivo_critico: boolean;
  ferias_alerta_concessivo_dias: number;
  ferias_alerta_vencimento_multa: boolean;
  ferias_alerta_pagamento_pendente: boolean;
  ferias_alerta_inicio_ferias: boolean;
  ferias_alerta_inicio_dias: number;
  ferias_resumo_mensal_ativo: boolean;
  ferias_resumo_mensal_dia: number;
  ferias_resumo_mensal_hora: string; // HH:MM
}

// =====================================================
// 7. CONSTANTES E UTILITÁRIOS
// =====================================================

/**
 * Labels para Status de Período
 */
export const FERIAS_PERIODO_STATUS_LABELS: Record<FeriasPeriodoStatus, string> = {
  ativo: 'Ativo',
  em_gozo: 'Em Gozo',
  concluido: 'Concluído',
  vencido: 'Vencido',
};

/**
 * Labels para Status de Programação
 */
export const FERIAS_PROGRAMACAO_STATUS_LABELS: Record<FeriasProgramacaoStatus, string> = {
  programado: 'Programado',
  aprovado: 'Aprovado',
  em_gozo: 'Em Gozo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/**
 * Cores para Status de Programação (Badge variants do design system)
 */
export const FERIAS_PROGRAMACAO_STATUS_COLORS: Record<
  FeriasProgramacaoStatus,
  'success' | 'warning' | 'info' | 'danger'
> = {
  programado: 'info',
  aprovado: 'success',
  em_gozo: 'warning',
  concluido: 'success',
  cancelado: 'danger',
};

/**
 * Labels para Status Geral
 */
export const FERIAS_STATUS_GERAL_LABELS: Record<FeriasStatusGeral, string> = {
  ok: 'OK',
  atencao: 'Atenção',
  alerta: 'Alerta',
  critico: 'Crítico',
};

/**
 * Cores para Status Geral (Tailwind classes)
 */
export const FERIAS_STATUS_GERAL_COLORS: Record<FeriasStatusGeral, string> = {
  ok: 'emerald',
  atencao: 'cyan',
  alerta: 'amber',
  critico: 'rose',
};

/**
 * Labels para Períodos Ideais
 */
export const FERIAS_PERIODO_IDEAL_LABELS: Record<FeriasPeriodoIdeal, string> = {
  ferias_fim_ano: 'Férias de Fim de Ano (15/Dez - 5/Jan)',
  carnaval: 'Carnaval (10 dias)',
  julho: '2ª Quinzena de Julho',
  outro: 'Outro Período',
};

/**
 * Cores para Períodos Ideais (Tailwind classes)
 */
export const FERIAS_PERIODO_IDEAL_COLORS: Record<FeriasPeriodoIdeal, string> = {
  ferias_fim_ano: 'violet',
  carnaval: 'amber',
  julho: 'cyan',
  outro: 'slate',
};
