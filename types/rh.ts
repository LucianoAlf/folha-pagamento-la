export const RH_PROCESS_TYPES = ['recrutamento', 'onboarding', 'desligamento'] as const;
export type RhProcessType = (typeof RH_PROCESS_TYPES)[number];

export const RH_PROCESS_STATUSES = [
  'rascunho',
  'em_andamento',
  'aguardando_documentos',
  'aguardando_avaliacao',
  'aguardando_aprovacao',
  'concluido',
  'cancelado',
] as const;
export type RhProcessStatus = (typeof RH_PROCESS_STATUSES)[number];

export const RH_PROCESS_ACTIVE_STATUSES: readonly RhProcessStatus[] = [
  'rascunho',
  'em_andamento',
  'aguardando_documentos',
  'aguardando_avaliacao',
  'aguardando_aprovacao',
] as const;

export const RH_CANDIDATE_STATUSES = [
  'novo',
  'questionario_pendente',
  'questionario_recebido',
  'entrevista',
  'aula_teste',
  'aprovado',
  'reprovado',
  'arquivado',
] as const;
export type RhCandidateStatus = (typeof RH_CANDIDATE_STATUSES)[number];

export const RH_STAGE_STATUSES = [
  'nao_iniciada',
  'em_andamento',
  'bloqueada',
  'concluida',
  'dispensada',
  'atrasada',
] as const;
export type RhStageStatus = (typeof RH_STAGE_STATUSES)[number];

export const RH_STAGE_CATEGORIES = [
  'entrevista',
  'aula_teste',
  'documentacao',
  'admissional',
  'sistema',
  'financeiro',
  'cultura',
  'acessos',
  'treinamento',
  'feedback',
  'saida',
  'documento_oficial',
  'encerramento',
] as const;
export type RhStageCategory = (typeof RH_STAGE_CATEGORIES)[number];

export const RH_DOCUMENT_STATUSES = ['pendente', 'enviado', 'em_analise', 'conferido', 'rejeitado'] as const;
export type RhDocumentStatus = (typeof RH_DOCUMENT_STATUSES)[number];

export const RH_PARTICIPANT_ROLES = ['rh', 'gestor', 'mentor', 'avaliador', 'financeiro'] as const;
export type RhParticipantRole = (typeof RH_PARTICIPANT_ROLES)[number];

export const RH_EVALUATION_TYPES = [
  'entrevista',
  'aula_teste',
  'feedback_7d',
  'feedback_30d',
  'feedback_45d',
  'feedback_90d',
  'entrevista_saida',
] as const;
export type RhEvaluationType = (typeof RH_EVALUATION_TYPES)[number];

export const RH_EVALUATION_DECISIONS = ['aprovado', 'reprovado', 'ajustes', 'neutro'] as const;
export type RhEvaluationDecision = (typeof RH_EVALUATION_DECISIONS)[number];

export const RH_OFFBOARDING_REASONS = [
  'pedido_demissao',
  'sem_justa_causa',
  'justa_causa',
  'termino_contrato',
  'acordo',
  'encerramento_pj',
] as const;
export type RhOffboardingReason = (typeof RH_OFFBOARDING_REASONS)[number];

export const RH_NOTICE_TYPES = ['trabalhado', 'indenizado', 'nao_aplica'] as const;
export type RhNoticeType = (typeof RH_NOTICE_TYPES)[number];

export const RH_REDUCTION_OPTIONS = ['2h_dia', '7_dias', 'nao_aplica'] as const;
export type RhReductionOption = (typeof RH_REDUCTION_OPTIONS)[number];

export const RH_TABS = ['dashboard', 'candidatos', 'onboarding', 'colaboradores', 'desenvolvimento', 'desligamentos', 'documentos', 'templates'] as const;
export type RhJornadaTab = (typeof RH_TABS)[number];

export const RH_JOURNEY_STATUSES = ['ativa', 'pausada', 'encerrada'] as const;
export type RhJourneyStatus = (typeof RH_JOURNEY_STATUSES)[number];

export const RH_JOURNEY_STAGES = ['onboarding', 'adaptacao', 'performance', 'desenvolvimento', 'lideranca', 'transicao', 'desligamento'] as const;
export type RhJourneyStage = (typeof RH_JOURNEY_STAGES)[number];

export const RH_COLLAB_DOC_CATEGORIES = ['pessoal', 'contrato', 'aditivo', 'certificado', 'treinamento', 'avaliacao', 'advertencia', 'comprovante', 'outro'] as const;
export type RhCollaboratorDocumentCategory = (typeof RH_COLLAB_DOC_CATEGORIES)[number];

export const RH_MILESTONE_TYPES = ['onboarding_concluido', 'checkpoint', 'trilha_concluida', 'competencia_validada', 'promocao', 'mudanca_funcao', 'mudanca_unidade', 'reconhecimento'] as const;
export type RhMilestoneType = (typeof RH_MILESTONE_TYPES)[number];

export const RH_PDI_PLAN_STATUSES = ['rascunho', 'em_andamento', 'em_revisao', 'concluido', 'congelado'] as const;
export type RhPdiPlanStatus = (typeof RH_PDI_PLAN_STATUSES)[number];

export const RH_PDI_COMPETENCE_CATEGORIES = ['tecnica', 'comportamental', 'lideranca', 'cultura'] as const;
export type RhPdiCompetenceCategory = (typeof RH_PDI_COMPETENCE_CATEGORIES)[number];

export const RH_PDI_COMPETENCE_STATUSES = ['pendente', 'em_desenvolvimento', 'consolidada'] as const;
export type RhPdiCompetenceStatus = (typeof RH_PDI_COMPETENCE_STATUSES)[number];

export const RH_PDI_OBJECTIVE_TYPES = ['tecnico', 'comportamental', 'treinamento', 'projeto', 'resultado'] as const;
export type RhPdiObjectiveType = (typeof RH_PDI_OBJECTIVE_TYPES)[number];

export const RH_PDI_OBJECTIVE_STATUSES = ['nao_iniciado', 'em_andamento', 'concluido', 'atrasado', 'cancelado'] as const;
export type RhPdiObjectiveStatus = (typeof RH_PDI_OBJECTIVE_STATUSES)[number];

export const RH_PDI_CHECKPOINT_TYPES = ['7d', '30d', '60d', '90d', 'semestral', 'anual', 'custom'] as const;
export type RhPdiCheckpointType = (typeof RH_PDI_CHECKPOINT_TYPES)[number];

export const RH_PDI_CHECKPOINT_STATUSES = ['agendado', 'realizado', 'atrasado', 'cancelado'] as const;
export type RhPdiCheckpointStatus = (typeof RH_PDI_CHECKPOINT_STATUSES)[number];

export const RH_PDI_EVIDENCE_TYPES = ['arquivo', 'link', 'texto'] as const;
export type RhPdiEvidenceType = (typeof RH_PDI_EVIDENCE_TYPES)[number];

export const RH_PDI_FEEDBACK_TYPES = ['gestor', 'mentor', 'autoavaliacao', 'rh', 'pares'] as const;
export type RhPdiFeedbackType = (typeof RH_PDI_FEEDBACK_TYPES)[number];

export const RH_PDI_BADGE_CATEGORIES = ['cultura', 'treinamento', 'performance', 'lideranca', 'colaboracao', 'carreira'] as const;
export type RhPdiBadgeCategory = (typeof RH_PDI_BADGE_CATEGORIES)[number];

export const RH_PDI_CYCLE_TYPES = ['trimestral', 'semestral', 'anual', 'personalizado'] as const;
export type RhPdiCycleType = (typeof RH_PDI_CYCLE_TYPES)[number];

export interface RhCandidate {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  cargo_pretendido?: string | null;
  tipo_vinculo_pretendido?: string | null;
  origem?: string | null;
  status: RhCandidateStatus;
  questionario_resumo?: string | null;
  questionario_respostas: Record<string, unknown>;
  curriculo_storage_path?: string | null;
  curriculo_texto_extraido?: string | null;
  observacoes?: string | null;
  aprovado_em?: string | null;
  reprovado_em?: string | null;
  colaborador_convertido_id?: number | null;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RhCandidateCreateInput {
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  cargo_pretendido?: string | null;
  tipo_vinculo_pretendido?: string | null;
  origem?: string | null;
  observacoes?: string | null;
  questionario_resumo?: string | null;
  questionario_respostas?: Record<string, unknown>;
}

export interface RhCandidateAiDraft {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  cargo_pretendido?: string | null;
  tipo_vinculo_pretendido?: string | null;
  resumo_candidato?: string | null;
  questionario_resumo?: string | null;
  curriculo_texto_extraido?: string | null;
  pontos_fortes: string[];
  alertas: string[];
  status_sugerido?: RhCandidateStatus | null;
}

export interface RhCandidateComparisonResult {
  resumo_executivo: string;
  recomendacao_final: string;
  ranking: Array<{
    candidate_id: string;
    nome: string;
    score: number;
    motivo: string;
  }>;
  criterios: Array<{
    titulo: string;
    detalhe: string;
  }>;
  riscos: string[];
}

export interface RhCandidateApprovalInput {
  candidateId: string;
  nome: string;
  funcao: string;
  departamento: 'staff_rateado' | 'equipe_operacional' | 'professores';
  tipo: 'pj' | 'clt' | 'mei' | 'estagiario' | 'diarista' | 'rpa';
  salario_base: number;
  data_admissao?: string | null;
  unidade_fixa?: string | null;
  is_rateado: boolean;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  createOnboardingNow?: boolean;
  onboardingTemplateId?: string | null;
  onboardingDataInicio?: string | null;
  onboardingDataFimPrevista?: string | null;
  onboardingObservacoes?: string | null;
}

export interface RhTemplate {
  id: string;
  tipo_processo: RhProcessType;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  escopo_cargo?: string | null;
  escopo_contrato?: string | null;
  escopo_departamento?: string | null;
  escopo_unidade?: string | null;
  versao: number;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhTemplateDocument {
  id: string;
  template_id: string;
  tipo_documento: string;
  obrigatorio: boolean;
  ordem: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhTemplateStage {
  id: string;
  template_id: string;
  codigo: string;
  titulo: string;
  categoria: string;
  ordem: number;
  obrigatoria: boolean;
  prazo_offset_dias?: number | null;
  responsavel_padrao_papel?: string | null;
  instrucoes?: string | null;
  modelo_mensagem?: string | null;
  link_referencia?: string | null;
  link_reuniao?: string | null;
  notificar_responsaveis: boolean;
  notificar_colaborador: boolean;
  metadata_json?: Record<string, unknown>;
}

export interface RhTemplateChecklistItem {
  id: string;
  template_etapa_id: string;
  titulo: string;
  descricao?: string | null;
  link_url?: string | null;
  obrigatorio: boolean;
  ordem: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhProcess {
  id: string;
  tipo: RhProcessType;
  status: RhProcessStatus;
  candidato_id?: string | null;
  colaborador_id?: number | null;
  template_id?: string | null;
  titulo: string;
  unidade?: string | null;
  departamento?: string | null;
  cargo?: string | null;
  tipo_vinculo?: string | null;
  owner_user_id: string;
  mentor_user_id?: string | null;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  data_inicio: string;
  data_fim_prevista?: string | null;
  data_fim_real?: string | null;
  observacoes?: string | null;
  metadata_json?: Record<string, unknown>;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhProcessCreateInput {
  tipo: Extract<RhProcessType, 'onboarding' | 'desligamento' | 'recrutamento'>;
  template_id: string;
  titulo?: string;
  colaborador_id?: number | null;
  candidato_id?: string | null;
  unidade?: string | null;
  departamento?: string | null;
  cargo?: string | null;
  tipo_vinculo?: string | null;
  mentor_user_id?: string | null;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
  data_inicio: string;
  data_fim_prevista?: string | null;
  observacoes?: string | null;
  metadata_json?: Record<string, unknown>;
}

export interface RhProcessSummary extends RhProcess {
  total_etapas: number;
  etapas_concluidas: number;
  percentual_conclusao: number;
}

export interface RhProcessParticipant {
  id: string;
  processo_id: string;
  user_id: string;
  papel: RhParticipantRole;
  principal: boolean;
  created_at: string;
  user?: {
    id: string;
    nome: string;
    role: 'admin' | 'rh' | 'user';
    avatar_url?: string | null;
  } | null;
}

export interface RhStage {
  id: string;
  processo_id: string;
  template_etapa_id?: string | null;
  codigo: string;
  titulo: string;
  categoria: RhStageCategory;
  status: RhStageStatus;
  ordem: number;
  obrigatoria: boolean;
  data_prevista?: string | null;
  data_limite?: string | null;
  data_realizada?: string | null;
  agendado_em?: string | null;
  instrucoes?: string | null;
  modelo_mensagem?: string | null;
  link_referencia?: string | null;
  link_reuniao?: string | null;
  notificar_responsaveis: boolean;
  notificar_colaborador: boolean;
  ultimo_aviso_whatsapp_em?: string | null;
  observacoes?: string | null;
  metadata_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RhChecklistItem {
  id: string;
  etapa_id: string;
  titulo: string;
  descricao?: string | null;
  link_url?: string | null;
  obrigatorio: boolean;
  concluido: boolean;
  concluido_em?: string | null;
  concluido_por?: string | null;
  ordem: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhChecklistItemCreateInput {
  etapa_id: string;
  titulo: string;
  descricao?: string | null;
  link_url?: string | null;
  obrigatorio?: boolean;
}

export interface RhStageResponsible {
  id: string;
  etapa_id: string;
  user_id: string;
  papel: RhParticipantRole;
  principal: boolean;
  created_at: string;
  user?: {
    id: string;
    nome: string;
    role: 'admin' | 'rh' | 'user';
    avatar_url?: string | null;
  } | null;
}

export interface RhDocument {
  id: string;
  processo_id: string;
  etapa_id?: string | null;
  candidato_id?: string | null;
  colaborador_id?: number | null;
  tipo_documento: string;
  obrigatorio: boolean;
  status: RhDocumentStatus;
  storage_path?: string | null;
  nome_arquivo?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  enviado_em?: string | null;
  conferido_em?: string | null;
  conferido_por?: string | null;
  observacao?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhDocumentProcessRef {
  id: string;
  titulo: string;
  tipo: RhProcessType;
  status: RhProcessStatus;
  owner_user_id: string;
  mentor_user_id?: string | null;
}

export interface RhDocumentCollaboratorRef {
  id: number;
  nome: string;
  funcao: string;
}

export interface RhDocumentCandidateRef {
  id: string;
  nome: string;
  cargo_pretendido?: string | null;
}

export interface RhDocumentInboxItem extends RhDocument {
  origem?: 'processo' | 'colaborador';
  categoria?: string | null;
  titulo_display?: string | null;
  processo?: RhDocumentProcessRef | null;
  colaborador?: RhDocumentCollaboratorRef | null;
  candidato?: RhDocumentCandidateRef | null;
}

export interface RhGeneratedDocument {
  id: string;
  processo_id: string;
  tipo_documento: string;
  template_slug: string;
  template_id?: string | null;
  template_versao?: number | null;
  storage_path: string;
  gerado_por: string;
  gerado_em: string;
}

export interface RhEvaluation {
  id: string;
  processo_id: string;
  etapa_id?: string | null;
  tipo: RhEvaluationType;
  avaliador_user_id?: string | null;
  nota?: number | null;
  decisao?: RhEvaluationDecision | null;
  resumo?: string | null;
  respostas_json: Record<string, unknown>;
  observacoes?: string | null;
  realizada_em: string;
}

export interface RhEvaluationCreateInput {
  processo_id: string;
  etapa_id?: string | null;
  tipo: RhEvaluationType;
  avaliador_user_id?: string | null;
  nota?: number | null;
  decisao?: RhEvaluationDecision | null;
  resumo?: string | null;
  respostas_json?: Record<string, unknown>;
  observacoes?: string | null;
  realizada_em?: string;
}

export interface RhEvaluationUpdateInput extends Partial<RhEvaluationCreateInput> {
  id: string;
}

export interface RhTemplateCreateInput {
  tipo_processo: RhProcessType;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  escopo_cargo?: string | null;
  escopo_contrato?: string | null;
  escopo_departamento?: string | null;
  escopo_unidade?: string | null;
}

export interface RhTemplateStageCreateInput {
  template_id: string;
  codigo: string;
  titulo: string;
  categoria: RhStageCategory;
  ordem: number;
  obrigatoria?: boolean;
  prazo_offset_dias?: number | null;
  responsavel_padrao_papel?: RhParticipantRole | null;
  instrucoes?: string | null;
  modelo_mensagem?: string | null;
  link_referencia?: string | null;
  link_reuniao?: string | null;
  notificar_responsaveis?: boolean;
  notificar_colaborador?: boolean;
  metadata_json?: Record<string, unknown>;
}

export interface RhTemplateChecklistItemCreateInput {
  template_etapa_id: string;
  titulo: string;
  descricao?: string | null;
  link_url?: string | null;
  obrigatorio?: boolean;
  ordem: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhTemplateDocumentCreateInput {
  template_id: string;
  tipo_documento: string;
  obrigatorio?: boolean;
  ordem: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhComment {
  id: string;
  processo_id: string;
  etapa_id?: string | null;
  autor_user_id: string;
  comentario: string;
  created_at: string;
  updated_at: string;
}

export interface RhHistoryEvent {
  id: string;
  processo_id: string;
  entidade_tipo: string;
  entidade_id?: string | null;
  acao: string;
  de_json?: Record<string, unknown> | null;
  para_json?: Record<string, unknown> | null;
  comentario?: string | null;
  actor_user_id: string;
  created_at: string;
}

export interface RhOffboarding {
  id: string;
  processo_id: string;
  motivo_tipo: RhOffboardingReason;
  motivo_detalhado?: string | null;
  aviso_previo_tipo: RhNoticeType;
  aviso_previo_inicio?: string | null;
  aviso_previo_fim?: string | null;
  opcao_reducao_jornada?: RhReductionOption | null;
  bloqueio_acessos_em?: string | null;
  devolucao_materiais_em?: string | null;
  entrevista_saida_realizada: boolean;
  status_financeiro: string;
  status_documental: string;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhOffboardingCreateInput {
  motivo_tipo: RhOffboardingReason;
  motivo_detalhado?: string | null;
  aviso_previo_tipo: RhNoticeType;
  aviso_previo_inicio?: string | null;
  aviso_previo_fim?: string | null;
  opcao_reducao_jornada?: RhReductionOption | null;
  bloqueio_acessos_em?: string | null;
  devolucao_materiais_em?: string | null;
  entrevista_saida_realizada?: boolean;
  status_financeiro?: string;
  status_documental?: string;
  observacoes?: string | null;
}

export interface RhDashboardKpis {
  recrutamentos_ativos: number;
  onboardings_ativos: number;
  desligamentos_ativos: number;
  documentos_pendentes: number;
  etapas_atrasadas: number;
}

export interface RhPdiDashboardKpis {
  pdis_ativos: number;
  pdis_concluidos: number;
  checkpoints_atrasados: number;
  conquistas_mes: number;
}

export interface RhDashboardAiInsight {
  resumo_executivo: string;
  prioridades: string[];
  riscos: string[];
  recomendacoes: string[];
}

export interface RhJourneyAiInsight {
  resumo_executivo: string;
  destaques: string[];
  riscos: string[];
  recomendacoes: string[];
}

export interface RhDevelopmentHealthSnapshot {
  colaboradores_em_desenvolvimento: number;
  colaboradores_sem_pdi: number;
  checkpoints_criticos: number;
  conquistas_recentes: number;
  prontos_para_promocao: number;
  colaboradores_travados: number;
}

export interface RhAlertCritical {
  etapa_id: string;
  processo_id: string;
  processo_tipo: RhProcessType;
  processo_titulo: string;
  etapa_titulo: string;
  etapa_status: RhStageStatus;
  data_limite?: string | null;
  dias_para_vencimento?: number | null;
}

export interface RhPendingDocumentView {
  id: string;
  processo_id: string;
  processo_tipo: RhProcessType;
  processo_titulo: string;
  tipo_documento: string;
  status: RhDocumentStatus;
  obrigatorio: boolean;
  candidato_id?: string | null;
  colaborador_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RhCollaboratorJourney {
  id: string;
  colaborador_id: number;
  status: RhJourneyStatus;
  etapa_atual: RhJourneyStage;
  gestor_user_id?: string | null;
  mentor_user_id?: string | null;
  nivel_carreira_id?: string | null;
  data_inicio: string;
  data_fim?: string | null;
  proximo_checkpoint?: string | null;
  score_jornada: number;
  badges_count: number;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhCollaboratorJourneySummary extends RhCollaboratorJourney {
  colaborador_nome: string;
  colaborador_funcao: string;
  colaborador_vinculo: string;
  pdis_ativos: number;
  marcos_total: number;
  conquistas_total: number;
}

export interface RhCollaboratorJourneyCreateInput {
  colaborador_id: number;
  status?: RhJourneyStatus;
  etapa_atual?: RhJourneyStage;
  gestor_user_id?: string | null;
  mentor_user_id?: string | null;
  nivel_carreira_id?: string | null;
  data_inicio?: string;
  proximo_checkpoint?: string | null;
  observacoes?: string | null;
}

export interface RhCollaboratorDocument {
  id: string;
  colaborador_id: number;
  jornada_id?: string | null;
  categoria: RhCollaboratorDocumentCategory;
  titulo: string;
  tipo_documento: string;
  status: RhDocumentStatus;
  storage_path?: string | null;
  nome_arquivo?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  observacao?: string | null;
  enviado_em?: string | null;
  conferido_em?: string | null;
  conferido_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhCollaboratorDocumentCreateInput {
  colaborador_id: number;
  jornada_id?: string | null;
  categoria: RhCollaboratorDocumentCategory;
  titulo: string;
  tipo_documento: string;
  observacao?: string | null;
}

export interface RhCollaboratorMilestone {
  id: string;
  jornada_id: string;
  colaborador_id: number;
  tipo: RhMilestoneType;
  titulo: string;
  descricao?: string | null;
  celebrado: boolean;
  celebrado_em?: string | null;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface RhCollaboratorMilestoneCreateInput {
  jornada_id: string;
  colaborador_id: number;
  tipo: RhMilestoneType;
  titulo: string;
  descricao?: string | null;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
}

export interface RhPdiBadge {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  icon_key?: string | null;
  categoria: RhPdiBadgeCategory;
  cor?: string | null;
  score_base: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RhCollaboratorAchievement {
  id: string;
  jornada_id: string;
  colaborador_id: number;
  badge_id?: string | null;
  titulo: string;
  descricao?: string | null;
  score_impacto: number;
  concedida_por?: string | null;
  concedida_em: string;
  metadata_json?: Record<string, unknown>;
  badge?: RhPdiBadge | null;
}

export interface RhCollaboratorAchievementCreateInput {
  jornada_id: string;
  colaborador_id: number;
  badge_id?: string | null;
  titulo: string;
  descricao?: string | null;
  score_impacto?: number;
  metadata_json?: Record<string, unknown>;
}

export interface RhPdiCycle {
  id: string;
  nome: string;
  tipo: RhPdiCycleType;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RhPdiTemplate {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  escopo_cargo?: string | null;
  escopo_departamento?: string | null;
  escopo_unidade?: string | null;
  ciclo_tipo?: RhPdiCycleType | null;
  versao: number;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhPdiTemplateCompetence {
  id: string;
  template_id: string;
  nome: string;
  categoria: RhPdiCompetenceCategory;
  nivel_alvo: number;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface RhPdiTemplateObjective {
  id: string;
  template_id: string;
  competencia_template_id?: string | null;
  titulo: string;
  descricao?: string | null;
  tipo: RhPdiObjectiveType;
  obrigatorio: boolean;
  score_peso: number;
  ordem: number;
  prazo_offset_dias?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RhPdiTemplateCheckpoint {
  id: string;
  template_id: string;
  objetivo_template_id?: string | null;
  titulo: string;
  tipo: RhPdiCheckpointType;
  ordem: number;
  prazo_offset_dias?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RhPdiTemplateCreateInput {
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  escopo_cargo?: string | null;
  escopo_departamento?: string | null;
  escopo_unidade?: string | null;
  ciclo_tipo?: RhPdiCycleType | null;
}

export interface RhCareerLevel {
  id: string;
  cargo_base: string;
  nivel_codigo: string;
  titulo: string;
  descricao?: string | null;
  ordem: number;
  score_minimo: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RhPdiPlan {
  id: string;
  colaborador_id: number;
  jornada_id?: string | null;
  ciclo_id?: string | null;
  template_nome?: string | null;
  status: RhPdiPlanStatus;
  titulo: string;
  objetivo_geral?: string | null;
  owner_user_id: string;
  gestor_user_id?: string | null;
  mentor_user_id?: string | null;
  score_progresso: number;
  data_inicio: string;
  data_fim_prevista?: string | null;
  data_conclusao?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhPdiPlanCreateInput {
  colaborador_id: number;
  jornada_id?: string | null;
  ciclo_id?: string | null;
  template_nome?: string | null;
  status?: RhPdiPlanStatus;
  titulo: string;
  objetivo_geral?: string | null;
  gestor_user_id?: string | null;
  mentor_user_id?: string | null;
  data_inicio: string;
  data_fim_prevista?: string | null;
}

export interface RhPdiCompetence {
  id: string;
  plano_id: string;
  nome: string;
  categoria: RhPdiCompetenceCategory;
  nivel_atual: number;
  nivel_alvo: number;
  status: RhPdiCompetenceStatus;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface RhPdiObjective {
  id: string;
  plano_id: string;
  competencia_id?: string | null;
  titulo: string;
  descricao?: string | null;
  tipo: RhPdiObjectiveType;
  status: RhPdiObjectiveStatus;
  obrigatorio: boolean;
  score_peso: number;
  data_inicio?: string | null;
  data_limite?: string | null;
  concluido_em?: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface RhPdiObjectiveCreateInput {
  plano_id: string;
  competencia_id?: string | null;
  titulo: string;
  descricao?: string | null;
  tipo: RhPdiObjectiveType;
  obrigatorio?: boolean;
  score_peso?: number;
  data_inicio?: string | null;
  data_limite?: string | null;
  ordem?: number;
}

export interface RhPdiCheckpoint {
  id: string;
  plano_id: string;
  objetivo_id?: string | null;
  titulo: string;
  tipo: RhPdiCheckpointType;
  status: RhPdiCheckpointStatus;
  responsavel_user_id?: string | null;
  data_prevista: string;
  data_realizada?: string | null;
  celebracao_gerada: boolean;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RhPdiCheckpointCreateInput {
  plano_id: string;
  objetivo_id?: string | null;
  titulo: string;
  tipo: RhPdiCheckpointType;
  responsavel_user_id?: string | null;
  data_prevista: string;
  observacoes?: string | null;
}

export interface RhPdiEvidence {
  id: string;
  plano_id: string;
  objetivo_id?: string | null;
  checkpoint_id?: string | null;
  tipo: RhPdiEvidenceType;
  titulo: string;
  descricao?: string | null;
  storage_path?: string | null;
  link_url?: string | null;
  created_by: string;
  created_at: string;
}

export interface RhPdiEvidenceCreateInput {
  plano_id: string;
  objetivo_id?: string | null;
  checkpoint_id?: string | null;
  tipo: RhPdiEvidenceType;
  titulo: string;
  descricao?: string | null;
  link_url?: string | null;
}

export interface RhPdiFeedback {
  id: string;
  plano_id: string;
  checkpoint_id?: string | null;
  tipo: RhPdiFeedbackType;
  autor_user_id?: string | null;
  resumo: string;
  pontos_fortes?: string | null;
  pontos_desenvolver?: string | null;
  nota?: number | null;
  created_at: string;
}

export interface RhPdiFeedbackCreateInput {
  plano_id: string;
  checkpoint_id?: string | null;
  tipo: RhPdiFeedbackType;
  resumo: string;
  pontos_fortes?: string | null;
  pontos_desenvolver?: string | null;
  nota?: number | null;
}

export interface RhCareerMovement {
  id: string;
  colaborador_id: number;
  jornada_id?: string | null;
  nivel_origem_id?: string | null;
  nivel_destino_id?: string | null;
  titulo: string;
  motivo?: string | null;
  efetivado_em: string;
  aprovado_por?: string | null;
  created_at: string;
}
