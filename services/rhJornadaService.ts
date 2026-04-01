import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';
import { api } from './api';
import { rhAgendaSyncService } from './rhAgendaSyncService';
import type {
  RhCandidate,
  RhCandidateApprovalInput,
  RhCandidateAiDraft,
  RhCandidateComparisonResult,
  RhCandidateCreateInput,
  RhChecklistItem,
  RhChecklistItemCreateInput,
  RhComment,
  RhCollaboratorAchievement,
  RhCollaboratorAchievementCreateInput,
  RhCollaboratorDocument,
  RhCollaboratorDocumentCreateInput,
  RhCollaboratorJourney,
  RhCollaboratorJourneyCreateInput,
  RhCollaboratorJourneySummary,
  RhCollaboratorMilestone,
  RhCollaboratorMilestoneCreateInput,
  RhCareerLevel,
  RhCareerMovement,
  RhDashboardAiInsight,
  RhDashboardKpis,
  RhDevelopmentHealthSnapshot,
  RhDocument,
  RhDocumentInboxItem,
  RhEvaluation,
  RhEvaluationCreateInput,
  RhEvaluationUpdateInput,
  RhGeneratedDocument,
  RhOffboarding,
  RhOffboardingCreateInput,
  RhPendingDocumentView,
  RhPdiBadge,
  RhPdiCheckpoint,
  RhPdiCheckpointCreateInput,
  RhPdiCycle,
  RhPdiDashboardKpis,
  RhPdiEvidence,
  RhPdiEvidenceCreateInput,
  RhPdiFeedback,
  RhPdiFeedbackCreateInput,
  RhPdiCompetence,
  RhPdiObjective,
  RhPdiObjectiveCreateInput,
  RhPdiPlan,
  RhPdiPlanCreateInput,
  RhPdiTemplate,
  RhPdiTemplateCheckpoint,
  RhPdiTemplateCompetence,
  RhPdiTemplateCreateInput,
  RhPdiTemplateObjective,
  RhJourneyAiInsight,
  RhParticipantRole,
  RhProcess,
  RhProcessParticipant,
  RhProcessCreateInput,
  RhProcessSummary,
  RhStageResponsible,
  RhStage,
  RhTemplate,
  RhTemplateChecklistItemCreateInput,
  RhTemplateChecklistItem,
  RhTemplateCreateInput,
  RhTemplateDocumentCreateInput,
  RhTemplateDocument,
  RhTemplateStageCreateInput,
  RhTemplateStage,
} from '../types/rh';
import type { Colaborador, UserProfile } from '../types';

const addDaysISO = (baseISO: string, days?: number | null) => {
  if (!days && days !== 0) return null;
  const base = new Date(`${baseISO}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
};

const defaultTitleForProcess = (input: RhProcessCreateInput) => {
  if (input.titulo?.trim()) return input.titulo.trim();
  if (input.tipo === 'onboarding') return `Onboarding - ${input.cargo || 'Colaborador'}`;
  if (input.tipo === 'desligamento') return `Desligamento - ${input.cargo || 'Colaborador'}`;
  return `Recrutamento - ${input.cargo || 'Candidato'}`;
};

const TERMINAL_STAGE_STATUSES = new Set(['concluida', 'dispensada']);
const EVALUATION_STAGE_CATEGORIES = new Set(['entrevista', 'aula_teste', 'feedback']);

const runRhAgendaSync = async (callback: () => Promise<unknown>) => {
  try {
    await callback();
  } catch (error) {
    console.error('Falha ao sincronizar espelho RH na Agenda.', error);
  }
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });

export const rhJornadaService = {
  async invokeAiFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Não foi possível executar ${functionName}.`);
    }
    return payload as T;
  },

  async insertHistoryEvent(payload: {
    processo_id: string;
    entidade_tipo: string;
    entidade_id?: string | null;
    acao: string;
    de_json?: Record<string, unknown> | null;
    para_json?: Record<string, unknown> | null;
    comentario?: string | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const { error } = await supabase.from('rh_historico_eventos').insert([
      {
        processo_id: payload.processo_id,
        entidade_tipo: payload.entidade_tipo,
        entidade_id: payload.entidade_id || null,
        acao: payload.acao,
        de_json: payload.de_json || null,
        para_json: payload.para_json || null,
        comentario: payload.comentario || null,
        actor_user_id: userId,
      },
    ]);
    if (error) throw error;
  },

  async fetchDashboardKpis(): Promise<RhDashboardKpis | null> {
    const { data, error } = await supabase.from('v_rh_dashboard_kpis').select('*').maybeSingle();
    if (error) throw error;
    return (data as RhDashboardKpis | null) ?? null;
  },

  async fetchCriticalAlerts() {
    const { data, error } = await supabase
      .from('v_rh_alertas_criticos')
      .select('*')
      .order('data_limite', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async fetchPendingDocumentsView(): Promise<RhPendingDocumentView[]> {
    const { data, error } = await supabase
      .from('v_rh_documentos_pendentes')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as RhPendingDocumentView[];
  },

  async fetchRecentHistory(limit = 8) {
    const { data, error } = await supabase
      .from('rh_historico_eventos')
      .select('*, processo:rh_processos(id,titulo,tipo,status)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async fetchDashboardAiInsights(force = false): Promise<RhDashboardAiInsight> {
    return this.invokeAiFunction<RhDashboardAiInsight>('rh-ai-dashboard-insights', { force });
  },

  async fetchJourneyAiInsights(colaboradorId: number, planId?: string | null, force = false): Promise<RhJourneyAiInsight> {
    return this.invokeAiFunction<RhJourneyAiInsight>('rh-ai-journey-insights', {
      colaboradorId,
      planId: planId || null,
      force,
    });
  },

  async fetchDevelopmentHealthSnapshot(): Promise<RhDevelopmentHealthSnapshot> {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [journeySummaries, activePlans, criticalCheckpoints, recentAchievements] = await Promise.all([
      this.fetchCollaboratorJourneys(),
      supabase.from('rh_pdi_planos').select('id,colaborador_id,status,score_progresso').in('status', ['rascunho', 'em_andamento', 'em_revisao']),
      supabase
        .from('rh_pdi_checkpoints')
        .select('id,plano_id,status,data_prevista,rh_pdi_planos!inner(colaborador_id)')
        .in('status', ['agendado', 'atrasado'])
        .lte('data_prevista', today),
      supabase
        .from('rh_colaborador_conquistas')
        .select('id,colaborador_id')
        .gte('concedida_em', thirtyDaysAgo.toISOString()),
    ]);

    if (activePlans.error) throw activePlans.error;
    if (criticalCheckpoints.error) throw criticalCheckpoints.error;
    if (recentAchievements.error) throw recentAchievements.error;

    const activePlanRows = (activePlans.data || []) as Array<{ id: string; colaborador_id: number; status: string; score_progresso: number | null }>;
    const criticalCheckpointRows = (criticalCheckpoints.data || []) as Array<{ rh_pdi_planos?: { colaborador_id?: number | null } | null }>;
    const uniqueDevelopmentCollaborators = new Set(activePlanRows.map((item) => item.colaborador_id));
    const blockedCollaborators = new Set(
      criticalCheckpointRows
        .map((item) => Number(item.rh_pdi_planos?.colaborador_id || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    const promotionReady = journeySummaries.filter((journey) => {
      const hasRelevantPlan = activePlanRows.some((plan) => plan.colaborador_id === journey.colaborador_id && Number(plan.score_progresso || 0) >= 75);
      return Number(journey.score_jornada || 0) >= 80 && hasRelevantPlan && !blockedCollaborators.has(journey.colaborador_id);
    }).length;

    return {
      colaboradores_em_desenvolvimento: uniqueDevelopmentCollaborators.size,
      colaboradores_sem_pdi: journeySummaries.filter((journey) => Number(journey.pdis_ativos || 0) === 0).length,
      checkpoints_criticos: criticalCheckpointRows.length,
      conquistas_recentes: (recentAchievements.data || []).length,
      prontos_para_promocao: promotionReady,
      colaboradores_travados: blockedCollaborators.size,
    };
  },

  async fetchProcesses(params?: { tipo?: string; status?: string; search?: string }): Promise<RhProcessSummary[]> {
    let query = supabase
      .from('v_rh_processos_resumo')
      .select('*')
      .order('data_inicio', { ascending: false });

    if (params?.tipo) query = query.eq('tipo', params.tipo);
    if (params?.status) query = query.eq('status', params.status);
    if (params?.search) query = query.ilike('titulo', `%${params.search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhProcessSummary[];
  },

  async fetchMyQueue(limit = 6): Promise<RhProcessSummary[]> {
    const { userId } = await this.fetchCurrentUserContext();
    if (!userId) return [];

    const [ownedOrMentored, participantRows, stageResponsibleRows] = await Promise.all([
      supabase
        .from('v_rh_processos_resumo')
        .select('*')
        .or(`owner_user_id.eq.${userId},mentor_user_id.eq.${userId}`)
        .order('data_inicio', { ascending: false }),
      supabase.from('rh_processo_participantes').select('processo_id').eq('user_id', userId),
      supabase.from('rh_etapa_responsaveis').select('etapa_id').eq('user_id', userId),
    ]);

    if (ownedOrMentored.error) throw ownedOrMentored.error;
    if (participantRows.error) throw participantRows.error;
    if (stageResponsibleRows.error) throw stageResponsibleRows.error;

    const stageIds = (stageResponsibleRows.data || []).map((row) => row.etapa_id);
    let stageProcessIds: string[] = [];
    if (stageIds.length > 0) {
      const { data: stageRows, error: stageRowsError } = await supabase
        .from('rh_processo_etapas')
        .select('processo_id')
        .in('id', stageIds);
      if (stageRowsError) throw stageRowsError;
      stageProcessIds = (stageRows || []).map((row) => row.processo_id);
    }

    const processIds = Array.from(
      new Set([
        ...((ownedOrMentored.data || []) as RhProcessSummary[]).map((row) => row.id),
        ...((participantRows.data || []) as Array<{ processo_id: string }>).map((row) => row.processo_id),
        ...stageProcessIds,
      ])
    );

    if (processIds.length === 0) return [];

    const { data, error } = await supabase
      .from('v_rh_processos_resumo')
      .select('*')
      .in('id', processIds)
      .order('data_inicio', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as RhProcessSummary[];
  },

  async fetchProcessById(processId: string): Promise<RhProcess | null> {
    const { data, error } = await supabase.from('rh_processos').select('*').eq('id', processId).maybeSingle();
    if (error) throw error;
    return (data as RhProcess | null) ?? null;
  },

  async fetchActiveRecruitmentProcess(candidateId: string): Promise<RhProcess | null> {
    const { data, error } = await supabase
      .from('rh_processos')
      .select('*')
      .eq('tipo', 'recrutamento')
      .eq('candidato_id', candidateId)
      .is('arquivado_em', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return ((data || [])[0] as RhProcess | undefined) ?? null;
  },

  async fetchColaboradores(): Promise<Colaborador[]> {
    return api.fetchColaboradores();
  },

  async fetchUserProfiles(): Promise<UserProfile[]> {
    const { data, error } = await supabase.from('user_profiles').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return (data || []) as UserProfile[];
  },

  async fetchCurrentUserContext(): Promise<{ userId: string | null; role: UserProfile['role'] | 'user' }> {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const userId = auth.user?.id || null;
    if (!userId) return { userId: null, role: 'user' };

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    return {
      userId,
      role: ((profile?.role as UserProfile['role'] | undefined) || 'user'),
    };
  },

  async fetchProcessParticipants(processId: string): Promise<RhProcessParticipant[]> {
    const { data, error } = await supabase
      .from('rh_processo_participantes')
      .select('*, user:user_profiles(id,nome,role,avatar_url)')
      .eq('processo_id', processId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as RhProcessParticipant[];
  },

  async addProcessParticipant(processId: string, userId: string, papel: RhProcessParticipant['papel'], principal = false): Promise<RhProcessParticipant> {
    const { data, error } = await supabase
      .from('rh_processo_participantes')
      .insert([
        {
          processo_id: processId,
          user_id: userId,
          papel,
          principal,
        },
      ])
      .select('*, user:user_profiles(id,nome,role,avatar_url)')
      .single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: processId,
      entidade_tipo: 'rh_processo_participantes',
      entidade_id: data.id,
      acao: 'participante_adicionado',
      comentario: `Participante ${papel} adicionado ao processo.`,
    });

    await this.syncDefaultStageResponsibles(processId);

    return data as unknown as RhProcessParticipant;
  },

  async fetchStages(processId: string): Promise<RhStage[]> {
    const { data, error } = await supabase
      .from('rh_processo_etapas')
      .select('*')
      .eq('processo_id', processId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhStage[];
  },

  async fetchStageById(stageId: string): Promise<RhStage | null> {
    const { data, error } = await supabase.from('rh_processo_etapas').select('*').eq('id', stageId).maybeSingle();
    if (error) throw error;
    return (data as RhStage | null) ?? null;
  },

  async fetchChecklistItems(stageId: string): Promise<RhChecklistItem[]> {
    const { data, error } = await supabase
      .from('rh_checklist_itens')
      .select('*')
      .eq('etapa_id', stageId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhChecklistItem[];
  },

  async createChecklistItem(input: RhChecklistItemCreateInput): Promise<RhChecklistItem> {
    const currentItems = await this.fetchChecklistItems(input.etapa_id);
    const nextOrder = currentItems.length + 1;
    const { data, error } = await supabase
      .from('rh_checklist_itens')
      .insert([
        {
          etapa_id: input.etapa_id,
          titulo: input.titulo,
          descricao: input.descricao || null,
          obrigatorio: input.obrigatorio ?? true,
          ordem: nextOrder,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    await this.syncStageLifecycle(input.etapa_id);
    return data as RhChecklistItem;
  },

  async toggleChecklistItem(id: string, concluido: boolean): Promise<RhChecklistItem> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('rh_checklist_itens')
      .update({
        concluido,
        concluido_em: concluido ? new Date().toISOString() : null,
        concluido_por: concluido ? userId : null,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    await this.syncStageLifecycle(data.etapa_id);
    return data as RhChecklistItem;
  },

  async fetchStageResponsibles(stageId: string): Promise<RhStageResponsible[]> {
    const { data, error } = await supabase
      .from('rh_etapa_responsaveis')
      .select('*, user:user_profiles(id,nome,role,avatar_url)')
      .eq('etapa_id', stageId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as RhStageResponsible[];
  },

  async addStageResponsible(stageId: string, userId: string, papel: RhStageResponsible['papel'], principal = false): Promise<RhStageResponsible> {
    const { data, error } = await supabase
      .from('rh_etapa_responsaveis')
      .insert([
        {
          etapa_id: stageId,
          user_id: userId,
          papel,
          principal,
        },
      ])
      .select('*, user:user_profiles(id,nome,role,avatar_url)')
      .single();
    if (error) throw error;
    return data as unknown as RhStageResponsible;
  },

  async syncDefaultStageResponsibles(
    processId: string,
    options?: { stages?: RhStage[]; participants?: RhProcessParticipant[] }
  ): Promise<void> {
    const stages = options?.stages || (await this.fetchStages(processId));
    const templateStageIds = Array.from(new Set(stages.map((stage) => stage.template_etapa_id).filter(Boolean))) as string[];
    if (templateStageIds.length === 0) return;

    const [participants, existingResponsibles, templateStages] = await Promise.all([
      options?.participants || this.fetchProcessParticipants(processId),
      Promise.all(stages.map((stage) => this.fetchStageResponsibles(stage.id))).then((rows) => rows.flat()),
      supabase.from('rh_template_etapas').select('*').in('id', templateStageIds),
    ]);

    if (templateStages.error) throw templateStages.error;

    const templateStageMap = new Map(
      ((templateStages.data || []) as RhTemplateStage[]).map((stage) => [stage.id, stage])
    );
    const existingKeys = new Set(existingResponsibles.map((item) => `${item.etapa_id}:${item.user_id}:${item.papel}`));
    const rowsToInsert: Array<{
      etapa_id: string;
      user_id: string;
      papel: RhParticipantRole;
      principal: boolean;
    }> = [];

    stages.forEach((stage) => {
      if (!stage.template_etapa_id) return;
      const templateStage = templateStageMap.get(stage.template_etapa_id);
      const defaultRole = templateStage?.responsavel_padrao_papel as RhParticipantRole | null | undefined;
      if (!defaultRole) return;

      const matchingParticipants = participants.filter((participant) => participant.papel === defaultRole);
      matchingParticipants.forEach((participant, index) => {
        const key = `${stage.id}:${participant.user_id}:${defaultRole}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        rowsToInsert.push({
          etapa_id: stage.id,
          user_id: participant.user_id,
          papel: defaultRole,
          principal: matchingParticipants.some((item) => item.principal) ? participant.principal : index === 0,
        });
      });
    });

    if (rowsToInsert.length === 0) return;

    const { error } = await supabase.from('rh_etapa_responsaveis').insert(rowsToInsert);
    if (error) throw error;
  },

  async fetchDocuments(processId: string) {
    const { data, error } = await supabase
      .from('rh_documentos')
      .select('*')
      .eq('processo_id', processId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as RhDocument[];
  },

  async updateStageStatus(stageId: string, status: RhStage['status']): Promise<RhStage> {
    const current = await this.fetchStageById(stageId);
    if (!current) throw new Error('Etapa não encontrada.');

    const payload: Partial<RhStage> = {
      status,
      data_realizada: status === 'concluida' ? new Date().toISOString().slice(0, 10) : null,
    };

    const { data, error } = await supabase.from('rh_processo_etapas').update(payload).eq('id', stageId).select('*').single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: current.processo_id,
      entidade_tipo: 'rh_processo_etapas',
      entidade_id: stageId,
      acao: 'etapa_status_atualizado',
      de_json: { status: current.status },
      para_json: { status },
      comentario: `Etapa ${current.titulo} atualizada para ${status}.`,
    });

    const process = await this.fetchProcessById(current.processo_id);
    if (process) {
      await runRhAgendaSync(() => rhAgendaSyncService.syncStageMirror(process, data as RhStage));
    }
    await this.syncProcessLifecycle(current.processo_id);

    return data as RhStage;
  },

  async updateProcessStatus(processId: string, status: RhProcess['status']): Promise<RhProcess> {
    const current = await this.fetchProcessById(processId);
    if (!current) throw new Error('Processo não encontrado.');

    const payload: Partial<RhProcess> = {
      status,
      data_fim_real: status === 'concluido' || status === 'cancelado' ? new Date().toISOString().slice(0, 10) : null,
    };

    const { data, error } = await supabase.from('rh_processos').update(payload).eq('id', processId).select('*').single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: processId,
      entidade_tipo: 'rh_processos',
      entidade_id: processId,
      acao: 'processo_status_atualizado',
      de_json: { status: current.status },
      para_json: { status },
      comentario: `Processo atualizado para ${status}.`,
    });

    await runRhAgendaSync(() => rhAgendaSyncService.syncProcessMirror(data as RhProcess));
    return data as RhProcess;
  },

  async syncStageLifecycle(stageId: string): Promise<RhStage | null> {
    const stage = await this.fetchStageById(stageId);
    if (!stage) return null;

    if (stage.status === 'bloqueada' || stage.status === 'dispensada') {
      const process = await this.fetchProcessById(stage.processo_id);
      if (process) await runRhAgendaSync(() => rhAgendaSyncService.syncStageMirror(process, stage));
      await this.syncProcessLifecycle(stage.processo_id);
      return stage;
    }

    const checklist = await this.fetchChecklistItems(stageId);
    const relevantItems = checklist.filter((item) => item.obrigatorio);
    const itemsToEvaluate = relevantItems.length > 0 ? relevantItems : checklist;

    let nextStatus = stage.status;
    if (itemsToEvaluate.length > 0) {
      const allDone = itemsToEvaluate.every((item) => item.concluido);
      const someDone = itemsToEvaluate.some((item) => item.concluido);
      nextStatus = allDone ? 'concluida' : someDone ? 'em_andamento' : 'nao_iniciada';
    }

    const finalStage =
      nextStatus !== stage.status
        ? await this.updateStageStatus(stageId, nextStatus)
        : stage;

    const process = await this.fetchProcessById(finalStage.processo_id);
    if (process) await runRhAgendaSync(() => rhAgendaSyncService.syncStageMirror(process, finalStage));
    await this.syncProcessLifecycle(finalStage.processo_id);
    return finalStage;
  },

  async syncProcessLifecycle(processId: string): Promise<RhProcess | null> {
    const process = await this.fetchProcessById(processId);
    if (!process || process.status === 'cancelado') return process;

    const [stages, documents] = await Promise.all([this.fetchStages(processId), this.fetchDocuments(processId)]);
    const requiredStages = stages.filter((stage) => stage.obrigatoria);
    const stagesToEvaluate = requiredStages.length > 0 ? requiredStages : stages;

    const allStagesComplete =
      stagesToEvaluate.length > 0 && stagesToEvaluate.every((stage) => TERMINAL_STAGE_STATUSES.has(stage.status));
    const hasPendingRequiredDocs = documents.some((document) => document.obrigatorio && ['pendente', 'rejeitado'].includes(document.status));
    const hasDocsUnderReview = documents.some((document) => document.obrigatorio && ['enviado', 'em_analise'].includes(document.status));
    const hasOpenEvaluationStage = stages.some(
      (stage) => EVALUATION_STAGE_CATEGORIES.has(stage.categoria) && !TERMINAL_STAGE_STATUSES.has(stage.status)
    );

    let nextStatus: RhProcess['status'] = process.status;
    if (allStagesComplete && !hasPendingRequiredDocs && !hasDocsUnderReview) {
      nextStatus = 'concluido';
    } else if (hasPendingRequiredDocs || hasDocsUnderReview) {
      nextStatus = 'aguardando_documentos';
    } else if (hasOpenEvaluationStage) {
      nextStatus = 'aguardando_avaliacao';
    } else if (process.tipo === 'recrutamento' && stagesToEvaluate.length > 0) {
      nextStatus = 'aguardando_aprovacao';
    } else {
      nextStatus = 'em_andamento';
    }

    const finalProcess =
      nextStatus !== process.status
        ? await this.updateProcessStatus(processId, nextStatus)
        : process;

    if (finalProcess.status === 'concluido' && finalProcess.colaborador_id) {
      if (finalProcess.tipo === 'onboarding') {
        const journey = await this.ensureCollaboratorJourney({
          colaborador_id: finalProcess.colaborador_id,
          etapa_atual: 'adaptacao',
          status: 'ativa',
          data_inicio: finalProcess.data_inicio,
          proximo_checkpoint: finalProcess.data_fim_prevista || addDaysISO(finalProcess.data_inicio, 30),
        });
        const existingPlans = await this.fetchPdiPlans({ colaboradorId: finalProcess.colaborador_id, jornadaId: journey.id });
        if (existingPlans.length === 0) {
          const collaborator = finalProcess.colaborador_id ? (await this.fetchColaboradores()).find((item) => item.id === finalProcess.colaborador_id) || null : null;
          const templates = await this.fetchPdiTemplates();
          const matchedTemplate =
            templates.find((item) => item.ativo && item.escopo_cargo && collaborator?.funcao?.toLowerCase().includes(item.escopo_cargo.toLowerCase())) ||
            templates.find((item) => item.ativo);
          if (matchedTemplate) {
            await this.instantiatePdiTemplate(matchedTemplate.id, {
              colaboradorId: finalProcess.colaborador_id,
              jornadaId: journey.id,
              dataInicio: finalProcess.data_inicio,
              dataFimPrevista: finalProcess.data_fim_prevista || addDaysISO(finalProcess.data_inicio, 90),
            });
          }
        }
      }

      if (finalProcess.tipo === 'desligamento') {
        const journey = await this.fetchCollaboratorJourneyByCollaboratorId(finalProcess.colaborador_id);
        if (journey && journey.status !== 'encerrada') {
          await supabase
            .from('rh_colaborador_jornadas')
            .update({
              status: 'encerrada',
              etapa_atual: 'desligamento',
              data_fim: new Date().toISOString().slice(0, 10),
            })
            .eq('id', journey.id);
        }
      }
    }

    await runRhAgendaSync(() => rhAgendaSyncService.syncProcessMirror(finalProcess));
    return finalProcess;
  },

  async fetchDocumentInbox(params?: { status?: string; processoTipo?: string }): Promise<RhDocumentInboxItem[]> {
    let query = supabase
      .from('rh_documentos')
      .select('*, processo:rh_processos(id,titulo,tipo,status,owner_user_id,mentor_user_id), colaborador:colaboradores(id,nome,funcao), candidato:rh_candidatos(id,nome,cargo_pretendido)')
      .order('updated_at', { ascending: false });

    if (params?.status) query = query.eq('status', params.status);

    const [processDocsRes, collaboratorDocsRes] = await Promise.all([
      query,
      supabase
        .from('rh_colaborador_documentos')
        .select('*, colaborador:colaboradores(id,nome,funcao)')
        .order('updated_at', { ascending: false }),
    ]);

    if (processDocsRes.error) throw processDocsRes.error;
    if (collaboratorDocsRes.error) throw collaboratorDocsRes.error;

    const processRows = ((processDocsRes.data || []) as unknown as RhDocumentInboxItem[]).map((row) => ({
      ...row,
      origem: 'processo' as const,
      titulo_display: row.tipo_documento,
    }));

    const collaboratorRows = ((collaboratorDocsRes.data || []) as Array<Record<string, any>>)
      .filter((row) => !params?.status || row.status === params.status)
      .map((row) => ({
        id: row.id,
        processo_id: '',
        etapa_id: null,
        candidato_id: null,
        colaborador_id: row.colaborador_id,
        tipo_documento: row.tipo_documento,
        obrigatorio: true,
        status: row.status,
        storage_path: row.storage_path,
        nome_arquivo: row.nome_arquivo,
        mime_type: row.mime_type,
        tamanho_bytes: row.tamanho_bytes,
        enviado_em: row.enviado_em,
        conferido_em: row.conferido_em,
        conferido_por: row.conferido_por,
        observacao: row.observacao,
        created_at: row.created_at,
        updated_at: row.updated_at,
        origem: 'colaborador' as const,
        categoria: row.categoria,
        titulo_display: row.titulo,
        colaborador: row.colaborador,
        processo: null,
        candidato: null,
      })) as RhDocumentInboxItem[];

    const mergedRows = [...processRows, ...collaboratorRows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    if (params?.processoTipo) {
      if (params.processoTipo === 'colaborador') {
        return mergedRows.filter((row) => row.origem === 'colaborador');
      }
      return mergedRows.filter((row) => row.processo?.tipo === params.processoTipo);
    }
    return mergedRows;
  },

  async fetchOffboarding(processId: string): Promise<RhOffboarding | null> {
    const { data, error } = await supabase.from('rh_desligamentos').select('*').eq('processo_id', processId).maybeSingle();
    if (error) throw error;
    return (data as RhOffboarding | null) ?? null;
  },

  async fetchTemplates(tipoProcesso?: string): Promise<RhTemplate[]> {
    let query = supabase
      .from('rh_templates')
      .select('*')
      .is('arquivado_em', null)
      .order('tipo_processo', { ascending: true })
      .order('nome', { ascending: true });

    if (tipoProcesso) query = query.eq('tipo_processo', tipoProcesso);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhTemplate[];
  },

  async fetchTemplateStages(templateId: string): Promise<RhTemplateStage[]> {
    const { data, error } = await supabase
      .from('rh_template_etapas')
      .select('*')
      .eq('template_id', templateId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhTemplateStage[];
  },

  async fetchTemplateDocuments(templateId: string): Promise<RhTemplateDocument[]> {
    const { data, error } = await supabase
      .from('rh_template_documentos')
      .select('*')
      .eq('template_id', templateId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhTemplateDocument[];
  },

  async fetchTemplateChecklistItems(templateStageId: string): Promise<RhTemplateChecklistItem[]> {
    const { data, error } = await supabase
      .from('rh_template_checklist_itens')
      .select('*')
      .eq('template_etapa_id', templateStageId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhTemplateChecklistItem[];
  },

  async fetchCandidates(status?: string): Promise<RhCandidate[]> {
    let query = supabase
      .from('rh_candidatos')
      .select('*')
      .is('arquivado_em', null)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhCandidate[];
  },

  async createCandidate(
    payload: RhCandidateCreateInput,
    options?: { curriculumFile?: File | null; curriculoTextoExtraido?: string | null }
  ): Promise<RhCandidate> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const hasQuestionnaire =
      !!payload.questionario_resumo ||
      (payload.questionario_respostas ? Object.keys(payload.questionario_respostas).length > 0 : false);

    const { data, error } = await supabase
      .from('rh_candidatos')
      .insert([
        {
          ...payload,
          status: hasQuestionnaire ? 'questionario_recebido' : 'novo',
          created_by: userId,
          questionario_respostas: payload.questionario_respostas || {},
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    let candidate = data as RhCandidate;

    if (options?.curriculumFile) {
      const sanitizedName = options.curriculumFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `candidatos/${candidate.id}/curriculo/${candidate.id}-${sanitizedName}`;
      const { error: uploadError } = await supabase.storage.from('rh-documentos').upload(storagePath, options.curriculumFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: options.curriculumFile.type || 'application/octet-stream',
      });
      if (uploadError) throw uploadError;

      const { data: updatedCandidate, error: candidateUploadError } = await supabase
        .from('rh_candidatos')
        .update({
          curriculo_storage_path: storagePath,
          curriculo_texto_extraido: options.curriculoTextoExtraido || null,
        })
        .eq('id', candidate.id)
        .select('*')
        .single();
      if (candidateUploadError) throw candidateUploadError;
      candidate = updatedCandidate as RhCandidate;
    }

    try {
      const recrutamentoTemplates = await this.fetchTemplates('recrutamento');
      const defaultTemplate = recrutamentoTemplates[0];
      if (defaultTemplate) {
        await this.createProcessFromTemplate({
          tipo: 'recrutamento',
          template_id: defaultTemplate.id,
          candidato_id: candidate.id,
          data_inicio: new Date().toISOString().slice(0, 10),
          titulo: `Recrutamento - ${candidate.nome}`,
          cargo: candidate.cargo_pretendido || 'Candidato',
          tipo_vinculo: candidate.tipo_vinculo_pretendido || null,
          observacoes: candidate.observacoes || null,
          metadata_json: {
            origem: 'candidate_creation',
          },
        });
      }
    } catch {
      // Não bloqueia o cadastro do candidato se a automação do processo falhar.
    }

    return candidate;
  },

  async analyzeCandidateWithAi(input: {
    file?: File | null;
    questionnaireText?: string | null;
    candidateName?: string | null;
    cargoPretendido?: string | null;
    observacoes?: string | null;
  }): Promise<RhCandidateAiDraft> {
    const body: Record<string, unknown> = {
      questionnaireText: input.questionnaireText || null,
      candidateName: input.candidateName || null,
      cargoPretendido: input.cargoPretendido || null,
      observacoes: input.observacoes || null,
    };

    if (input.file) {
      body.fileName = input.file.name;
      body.mimeType = input.file.type || 'application/octet-stream';
      body.fileBase64 = await readFileAsBase64(input.file);
    }

    return this.invokeAiFunction<RhCandidateAiDraft>('rh-ai-candidate-parse', body);
  },

  async compareCandidatesWithAi(candidateIds: string[]): Promise<RhCandidateComparisonResult> {
    return this.invokeAiFunction<RhCandidateComparisonResult>('rh-ai-candidate-compare', { candidateIds });
  },

  async updateCandidate(id: string, payload: Partial<RhCandidateCreateInput> & { status?: string }): Promise<RhCandidate> {
    const { data, error } = await supabase.from('rh_candidatos').update(payload).eq('id', id).select('*').single();
    if (error) throw error;
    return data as RhCandidate;
  },

  async approveCandidate(input: RhCandidateApprovalInput): Promise<{ candidate: RhCandidate; collaborator: Colaborador; onboardingProcess?: RhProcess | null }> {
    const collaborator = await api.createColaborador({
      nome: input.nome,
      funcao: input.funcao,
      departamento: input.departamento,
      tipo: input.tipo,
      salario_base: input.salario_base,
      data_admissao: input.data_admissao || undefined,
      unidade_fixa: input.is_rateado ? undefined : (input.unidade_fixa as any) || undefined,
      is_rateado: input.is_rateado,
      ativo: true,
      status: 'active',
      email: input.email || undefined,
      telefone: input.telefone || undefined,
      cpf: input.cpf || undefined,
    });

    const candidate = await this.updateCandidate(input.candidateId, {
      status: 'aprovado',
      aprovado_em: new Date().toISOString() as any,
      colaborador_convertido_id: collaborator.id as any,
    } as any);

    let onboardingProcess: RhProcess | null = null;
    if (input.createOnboardingNow && input.onboardingTemplateId) {
      onboardingProcess = await this.createProcessFromTemplate({
        tipo: 'onboarding',
        template_id: input.onboardingTemplateId,
        colaborador_id: collaborator.id,
        data_inicio: input.onboardingDataInicio || new Date().toISOString().slice(0, 10),
        data_fim_prevista: input.onboardingDataFimPrevista || null,
        titulo: `Onboarding - ${collaborator.nome}`,
        cargo: collaborator.funcao,
        tipo_vinculo: collaborator.tipo,
        unidade: collaborator.unidade_fixa || null,
        observacoes: input.onboardingObservacoes || null,
        metadata_json: {
          origem: 'candidate_approval',
          candidate_id: input.candidateId,
        },
      });
    }

    const { data: recrutamento } = await supabase
      .from('rh_processos')
      .select('id,status')
      .eq('tipo', 'recrutamento')
      .eq('candidato_id', input.candidateId)
      .in('status', ['rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao'])
      .maybeSingle();

    if (recrutamento?.id) {
      await this.updateProcessStatus(recrutamento.id, 'concluido');
      await this.insertHistoryEvent({
        processo_id: recrutamento.id,
        entidade_tipo: 'rh_processos',
        entidade_id: recrutamento.id,
        acao: 'candidato_aprovado',
        comentario: `Candidato ${input.nome} aprovado e convertido em colaborador.`,
      });
    }

    return { candidate, collaborator, onboardingProcess };
  },

  async rejectCandidate(candidateId: string, motivo?: string | null): Promise<RhCandidate> {
    const current = await supabase.from('rh_candidatos').select('*').eq('id', candidateId).single();
    if (current.error) throw current.error;
    const existing = current.data as RhCandidate;
    const composedNotes = [existing.observacoes, motivo].filter(Boolean).join('\n\n');
    const updated = await this.updateCandidate(candidateId, {
      status: 'reprovado',
      reprovado_em: new Date().toISOString() as any,
      observacoes: composedNotes || null,
    } as any);

    const { data: recrutamento } = await supabase
      .from('rh_processos')
      .select('id,status')
      .eq('tipo', 'recrutamento')
      .eq('candidato_id', candidateId)
      .in('status', ['rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao'])
      .maybeSingle();

    if (recrutamento?.id) {
      await this.updateProcessStatus(recrutamento.id, 'cancelado');
      await this.insertHistoryEvent({
        processo_id: recrutamento.id,
        entidade_tipo: 'rh_processos',
        entidade_id: recrutamento.id,
        acao: 'candidato_reprovado',
        comentario: motivo || 'Candidato reprovado no pipeline RH.',
      });
    }

    return updated;
  },

  async fetchEvaluations(processId: string, stageId?: string | null): Promise<RhEvaluation[]> {
    let query = supabase.from('rh_avaliacoes').select('*').eq('processo_id', processId).order('realizada_em', { ascending: false });
    if (stageId) query = query.eq('etapa_id', stageId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhEvaluation[];
  },

  async createEvaluation(input: RhEvaluationCreateInput): Promise<RhEvaluation> {
    const { data, error } = await supabase
      .from('rh_avaliacoes')
      .insert([
        {
          processo_id: input.processo_id,
          etapa_id: input.etapa_id || null,
          tipo: input.tipo,
          avaliador_user_id: input.avaliador_user_id || null,
          nota: input.nota ?? null,
          decisao: input.decisao ?? null,
          resumo: input.resumo || null,
          respostas_json: input.respostas_json || {},
          observacoes: input.observacoes || null,
          realizada_em: input.realizada_em || new Date().toISOString(),
        },
      ])
      .select('*')
      .single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: input.processo_id,
      entidade_tipo: 'rh_avaliacoes',
      entidade_id: data.id,
      acao: 'avaliacao_criada',
      comentario: `Avaliação ${input.tipo} registrada.`,
    });

    return data as RhEvaluation;
  },

  async updateEvaluation(input: RhEvaluationUpdateInput): Promise<RhEvaluation> {
    const { id, ...payload } = input;
    const { data, error } = await supabase
      .from('rh_avaliacoes')
      .update({
        ...payload,
        etapa_id: payload.etapa_id === undefined ? undefined : payload.etapa_id || null,
        avaliador_user_id: payload.avaliador_user_id === undefined ? undefined : payload.avaliador_user_id || null,
        resumo: payload.resumo === undefined ? undefined : payload.resumo || null,
        observacoes: payload.observacoes === undefined ? undefined : payload.observacoes || null,
        respostas_json: payload.respostas_json === undefined ? undefined : payload.respostas_json || {},
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: data.processo_id,
      entidade_tipo: 'rh_avaliacoes',
      entidade_id: data.id,
      acao: 'avaliacao_atualizada',
      comentario: `Avaliação ${data.tipo} atualizada.`,
    });

    return data as RhEvaluation;
  },

  async createProcessFromTemplate(
    input: RhProcessCreateInput,
    options?: { offboarding?: RhOffboardingCreateInput }
  ): Promise<RhProcess> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const [templateStages, templateDocuments] = await Promise.all([
      this.fetchTemplateStages(input.template_id),
      this.fetchTemplateDocuments(input.template_id),
    ]);

    let templateChecklistItems: RhTemplateChecklistItem[] = [];
    if (templateStages.length) {
      const { data: checklistData, error: checklistFetchError } = await supabase
        .from('rh_template_checklist_itens')
        .select('*')
        .in(
          'template_etapa_id',
          templateStages.map((stage) => stage.id)
        )
        .order('ordem', { ascending: true });
      if (checklistFetchError) throw checklistFetchError;
      templateChecklistItems = (checklistData || []) as RhTemplateChecklistItem[];
    }

    const processInsert = {
      tipo: input.tipo,
      status: 'em_andamento',
      candidato_id: input.candidato_id || null,
      colaborador_id: input.colaborador_id || null,
      template_id: input.template_id,
      titulo: defaultTitleForProcess(input),
      unidade: input.unidade || null,
      departamento: input.departamento || null,
      cargo: input.cargo || null,
      tipo_vinculo: input.tipo_vinculo || null,
      owner_user_id: userId,
      mentor_user_id: input.mentor_user_id || null,
      prioridade: input.prioridade || 'media',
      data_inicio: input.data_inicio,
      data_fim_prevista: input.data_fim_prevista || null,
      observacoes: input.observacoes || null,
      metadata_json: input.metadata_json || {},
    };

    const { data: process, error: processError } = await supabase
      .from('rh_processos')
      .insert([processInsert])
      .select('*')
      .single();
    if (processError) throw processError;

    const participantRows = [
      {
        processo_id: process.id,
        user_id: userId,
        papel: 'rh',
        principal: true,
      },
      ...(input.mentor_user_id
        ? [
            {
              processo_id: process.id,
              user_id: input.mentor_user_id,
              papel: 'mentor',
              principal: false,
            },
          ]
        : []),
    ];

    const { error: participantError } = await supabase.from('rh_processo_participantes').insert(participantRows);
    if (participantError) throw participantError;

    if (templateStages.length > 0) {
      const stageRows = templateStages.map((stage) => ({
        processo_id: process.id,
        template_etapa_id: stage.id,
        codigo: stage.codigo,
        titulo: stage.titulo,
        categoria: stage.categoria,
        status: 'nao_iniciada',
        ordem: stage.ordem,
        obrigatoria: stage.obrigatoria,
        data_prevista: addDaysISO(input.data_inicio, stage.prazo_offset_dias),
        data_limite: addDaysISO(input.data_inicio, stage.prazo_offset_dias),
        metadata_json: stage.metadata_json || {},
      }));
      const { data: insertedStages, error: stagesError } = await supabase.from('rh_processo_etapas').insert(stageRows).select('*');
      if (stagesError) throw stagesError;

      if (insertedStages?.length) {
        const stageIdByTemplateStageId = new Map(
          (insertedStages as RhStage[])
            .filter((stage) => stage.template_etapa_id)
            .map((stage) => [stage.template_etapa_id as string, stage.id])
        );

        const checklistRows = templateChecklistItems
          .map((item) => {
            const etapaId = stageIdByTemplateStageId.get(item.template_etapa_id);
            if (!etapaId) return null;
            return {
              etapa_id: etapaId,
              titulo: item.titulo,
              obrigatorio: item.obrigatorio,
              ordem: item.ordem,
              metadata_json: item.metadata_json || {},
            };
          })
          .filter(Boolean);

        if (checklistRows.length > 0) {
          const { error: checklistError } = await supabase.from('rh_checklist_itens').insert(checklistRows);
          if (checklistError) throw checklistError;
        }

        await this.syncDefaultStageResponsibles(process.id, { stages: insertedStages as RhStage[] });
        await Promise.all((insertedStages as RhStage[]).map((stage) => runRhAgendaSync(() => rhAgendaSyncService.syncStageMirror(process as RhProcess, stage))));
      }
    }

    if (templateDocuments.length > 0) {
      const documentRows = templateDocuments.map((document) => ({
        processo_id: process.id,
        colaborador_id: input.colaborador_id || null,
        candidato_id: input.candidato_id || null,
        tipo_documento: document.tipo_documento,
        obrigatorio: document.obrigatorio,
        status: 'pendente',
      }));
      const { error: documentsError } = await supabase.from('rh_documentos').insert(documentRows);
      if (documentsError) throw documentsError;
    }

    if (input.tipo === 'desligamento' && options?.offboarding) {
      const { error: offboardingError } = await supabase.from('rh_desligamentos').insert([
        {
          processo_id: process.id,
          motivo_tipo: options.offboarding.motivo_tipo,
          motivo_detalhado: options.offboarding.motivo_detalhado || null,
          aviso_previo_tipo: options.offboarding.aviso_previo_tipo,
          aviso_previo_inicio: options.offboarding.aviso_previo_inicio || null,
          aviso_previo_fim: options.offboarding.aviso_previo_fim || null,
          opcao_reducao_jornada: options.offboarding.opcao_reducao_jornada || null,
          bloqueio_acessos_em: options.offboarding.bloqueio_acessos_em || null,
          devolucao_materiais_em: options.offboarding.devolucao_materiais_em || null,
          entrevista_saida_realizada: options.offboarding.entrevista_saida_realizada || false,
          status_financeiro: options.offboarding.status_financeiro || 'pendente',
          status_documental: options.offboarding.status_documental || 'pendente',
          observacoes: options.offboarding.observacoes || null,
        },
      ]);
      if (offboardingError) throw offboardingError;
    }

    await this.insertHistoryEvent({
      processo_id: process.id,
      entidade_tipo: 'rh_processos',
      entidade_id: process.id,
      acao: 'processo_criado',
      para_json: processInsert as Record<string, unknown>,
      comentario: `Processo ${input.tipo} criado a partir de template.`,
    });

    await runRhAgendaSync(() => rhAgendaSyncService.syncProcessMirror(process as RhProcess));
    await this.syncProcessLifecycle(process.id);

    return process as RhProcess;
  },

  async fetchComments(processId: string, etapaId?: string | null): Promise<RhComment[]> {
    let query = supabase.from('rh_processo_comentarios').select('*').eq('processo_id', processId).order('created_at', { ascending: false });
    if (etapaId) query = query.eq('etapa_id', etapaId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhComment[];
  },

  async createTemplate(input: RhTemplateCreateInput): Promise<RhTemplate> {
    const { data, error } = await supabase
      .from('rh_templates')
      .insert([
        {
          ...input,
          ativo: input.ativo ?? true,
          versao: 1,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhTemplate;
  },

  async updateTemplate(templateId: string, payload: Partial<RhTemplateCreateInput> & { ativo?: boolean }): Promise<RhTemplate> {
    const { data, error } = await supabase.from('rh_templates').update(payload).eq('id', templateId).select('*').single();
    if (error) throw error;
    return data as RhTemplate;
  },

  async archiveTemplate(templateId: string): Promise<RhTemplate> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('rh_templates')
      .update({
        ativo: false,
        arquivado_em: new Date().toISOString(),
        arquivado_por: userId,
      })
      .eq('id', templateId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RhTemplate;
  },

  async createTemplateStage(input: RhTemplateStageCreateInput): Promise<RhTemplateStage> {
    const { data, error } = await supabase.from('rh_template_etapas').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhTemplateStage;
  },

  async updateTemplateStage(stageId: string, payload: Partial<RhTemplateStageCreateInput>): Promise<RhTemplateStage> {
    const { data, error } = await supabase.from('rh_template_etapas').update(payload).eq('id', stageId).select('*').single();
    if (error) throw error;
    return data as RhTemplateStage;
  },

  async createTemplateChecklistItem(input: RhTemplateChecklistItemCreateInput): Promise<RhTemplateChecklistItem> {
    const { data, error } = await supabase.from('rh_template_checklist_itens').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhTemplateChecklistItem;
  },

  async createTemplateDocument(input: RhTemplateDocumentCreateInput): Promise<RhTemplateDocument> {
    const { data, error } = await supabase.from('rh_template_documentos').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhTemplateDocument;
  },

  async updateTemplateDocument(documentId: string, payload: Partial<RhTemplateDocumentCreateInput>): Promise<RhTemplateDocument> {
    const { data, error } = await supabase.from('rh_template_documentos').update(payload).eq('id', documentId).select('*').single();
    if (error) throw error;
    return data as RhTemplateDocument;
  },

  async createTemplateVersionFrom(templateId: string): Promise<RhTemplate> {
    const template = (await this.fetchTemplates()).find((item) => item.id === templateId);
    if (!template) throw new Error('Template não encontrado.');

    const [stages, documents] = await Promise.all([this.fetchTemplateStages(templateId), this.fetchTemplateDocuments(templateId)]);
    const checklistByStage = new Map<string, RhTemplateChecklistItem[]>();
    await Promise.all(
      stages.map(async (stage) => {
        checklistByStage.set(stage.id, await this.fetchTemplateChecklistItems(stage.id));
      })
    );

    const newTemplate = await this.createTemplate({
      tipo_processo: template.tipo_processo,
      nome: `${template.nome} v${template.versao + 1}`,
      descricao: template.descricao,
      ativo: true,
      escopo_cargo: template.escopo_cargo,
      escopo_contrato: template.escopo_contrato,
      escopo_departamento: template.escopo_departamento,
      escopo_unidade: template.escopo_unidade,
    });

    const { data: versionedTemplate, error: versionError } = await supabase
      .from('rh_templates')
      .update({ versao: template.versao + 1 })
      .eq('id', newTemplate.id)
      .select('*')
      .single();
    if (versionError) throw versionError;

    const stageIdMap = new Map<string, string>();
    for (const stage of stages) {
      const clonedStage = await this.createTemplateStage({
        template_id: newTemplate.id,
        codigo: stage.codigo,
        titulo: stage.titulo,
        categoria: stage.categoria,
        ordem: stage.ordem,
        obrigatoria: stage.obrigatoria,
        prazo_offset_dias: stage.prazo_offset_dias,
        responsavel_padrao_papel: stage.responsavel_padrao_papel as any,
        metadata_json: stage.metadata_json || {},
      });
      stageIdMap.set(stage.id, clonedStage.id);
    }

    for (const [oldStageId, checklistItems] of checklistByStage.entries()) {
      const newStageId = stageIdMap.get(oldStageId);
      if (!newStageId) continue;
      for (const item of checklistItems) {
        await this.createTemplateChecklistItem({
          template_etapa_id: newStageId,
          titulo: item.titulo,
          obrigatorio: item.obrigatorio,
          ordem: item.ordem,
          metadata_json: item.metadata_json || {},
        });
      }
    }

    for (const document of documents) {
      await this.createTemplateDocument({
        template_id: newTemplate.id,
        tipo_documento: document.tipo_documento,
        obrigatorio: document.obrigatorio,
        ordem: document.ordem,
        metadata_json: document.metadata_json || {},
      });
    }

    return versionedTemplate as RhTemplate;
  },

  async createComment(processId: string, comentario: string, etapaId?: string | null): Promise<RhComment> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('rh_processo_comentarios')
      .insert([
        {
          processo_id: processId,
          etapa_id: etapaId || null,
          autor_user_id: userId,
          comentario,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;

    await this.insertHistoryEvent({
      processo_id: processId,
      entidade_tipo: 'rh_processo_comentarios',
      entidade_id: data.id,
      acao: 'comentario_criado',
      comentario,
    });

    return data as RhComment;
  },

  async fetchHistory(processId: string) {
    const { data, error } = await supabase
      .from('rh_historico_eventos')
      .select('*')
      .eq('processo_id', processId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async fetchPdiDashboardKpis(): Promise<RhPdiDashboardKpis | null> {
    const { data, error } = await supabase.from('v_rh_pdi_dashboard_kpis').select('*').maybeSingle();
    if (error) throw error;
    return (data as RhPdiDashboardKpis | null) ?? null;
  },

  async fetchCollaboratorJourneys(search?: string): Promise<RhCollaboratorJourneySummary[]> {
    let query = supabase
      .from('v_rh_colaborador_jornadas_resumo')
      .select('*')
      .order('score_jornada', { ascending: false })
      .order('data_inicio', { ascending: false });

    if (search?.trim()) {
      query = query.or(`colaborador_nome.ilike.%${search.trim()}%,colaborador_funcao.ilike.%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhCollaboratorJourneySummary[];
  },

  async fetchCollaboratorJourneyByCollaboratorId(colaboradorId: number): Promise<RhCollaboratorJourney | null> {
    const { data, error } = await supabase
      .from('rh_colaborador_jornadas')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .in('status', ['ativa', 'pausada'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as RhCollaboratorJourney | null) ?? null;
  },

  async ensureCollaboratorJourney(input: RhCollaboratorJourneyCreateInput): Promise<RhCollaboratorJourney> {
    const existing = await this.fetchCollaboratorJourneyByCollaboratorId(input.colaborador_id);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('rh_colaborador_jornadas')
      .insert([
        {
          colaborador_id: input.colaborador_id,
          status: input.status || 'ativa',
          etapa_atual: input.etapa_atual || 'adaptacao',
          gestor_user_id: input.gestor_user_id || null,
          mentor_user_id: input.mentor_user_id || null,
          nivel_carreira_id: input.nivel_carreira_id || null,
          data_inicio: input.data_inicio || new Date().toISOString().slice(0, 10),
          proximo_checkpoint: input.proximo_checkpoint || null,
          observacoes: input.observacoes || null,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorJourney;
  },

  async fetchCollaboratorDocuments(colaboradorId: number): Promise<RhCollaboratorDocument[]> {
    const { data, error } = await supabase
      .from('rh_colaborador_documentos')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as RhCollaboratorDocument[];
  },

  async createCollaboratorDocumentEntry(input: RhCollaboratorDocumentCreateInput): Promise<RhCollaboratorDocument> {
    const { data, error } = await supabase
      .from('rh_colaborador_documentos')
      .insert([
        {
          colaborador_id: input.colaborador_id,
          jornada_id: input.jornada_id || null,
          categoria: input.categoria,
          titulo: input.titulo,
          tipo_documento: input.tipo_documento,
          observacao: input.observacao || null,
          status: 'pendente',
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorDocument;
  },

  async uploadCollaboratorDocument(documentId: string, file: File): Promise<RhCollaboratorDocument> {
    const { data: current, error: currentError } = await supabase
      .from('rh_colaborador_documentos')
      .select('id,colaborador_id,tipo_documento')
      .eq('id', documentId)
      .single();
    if (currentError) throw currentError;

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `colaboradores/${current.colaborador_id}/documentos/${documentId}-${sanitizedName}`;
    const { error: uploadError } = await supabase.storage.from('rh-documentos').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('rh_colaborador_documentos')
      .update({
        storage_path: storagePath,
        nome_arquivo: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorDocument;
  },

  async reviewCollaboratorDocument(documentId: string, status: 'em_analise' | 'conferido' | 'rejeitado', observacao?: string | null): Promise<RhCollaboratorDocument> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const payload: Record<string, unknown> = {
      status,
      observacao: observacao || null,
    };

    if (status === 'conferido') {
      payload.conferido_em = new Date().toISOString();
      payload.conferido_por = userId;
    }

    const { data, error } = await supabase
      .from('rh_colaborador_documentos')
      .update(payload)
      .eq('id', documentId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorDocument;
  },

  async fetchJourneyMilestones(jornadaId: string): Promise<RhCollaboratorMilestone[]> {
    const { data, error } = await supabase
      .from('rh_colaborador_marcos')
      .select('*')
      .eq('jornada_id', jornadaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as RhCollaboratorMilestone[];
  },

  async createJourneyMilestone(input: RhCollaboratorMilestoneCreateInput): Promise<RhCollaboratorMilestone> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id || null;
    const { data, error } = await supabase
      .from('rh_colaborador_marcos')
      .insert([
        {
          jornada_id: input.jornada_id,
          colaborador_id: input.colaborador_id,
          tipo: input.tipo,
          titulo: input.titulo,
          descricao: input.descricao || null,
          referencia_tipo: input.referencia_tipo || null,
          referencia_id: input.referencia_id || null,
          created_by: userId,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorMilestone;
  },

  async celebrateMilestone(milestoneId: string): Promise<RhCollaboratorMilestone> {
    const { data, error } = await supabase
      .from('rh_colaborador_marcos')
      .update({
        celebrado: true,
        celebrado_em: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RhCollaboratorMilestone;
  },

  async fetchJourneyAchievements(jornadaId: string): Promise<RhCollaboratorAchievement[]> {
    const { data, error } = await supabase
      .from('rh_colaborador_conquistas')
      .select('*, badge:rh_pdi_badges(*)')
      .eq('jornada_id', jornadaId)
      .order('concedida_em', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as RhCollaboratorAchievement[];
  },

  async fetchPdiBadges(): Promise<RhPdiBadge[]> {
    const { data, error } = await supabase
      .from('rh_pdi_badges')
      .select('*')
      .eq('ativo', true)
      .order('categoria', { ascending: true })
      .order('nome', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiBadge[];
  },

  async grantAchievement(input: RhCollaboratorAchievementCreateInput): Promise<RhCollaboratorAchievement> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id || null;
    const { data, error } = await supabase
      .from('rh_colaborador_conquistas')
      .insert([
        {
          jornada_id: input.jornada_id,
          colaborador_id: input.colaborador_id,
          badge_id: input.badge_id || null,
          titulo: input.titulo,
          descricao: input.descricao || null,
          score_impacto: input.score_impacto || 0,
          concedida_por: userId,
          metadata_json: input.metadata_json || {},
        },
      ])
      .select('*, badge:rh_pdi_badges(*)')
      .single();
    if (error) throw error;

    await this.syncJourneyMetrics(input.jornada_id);
    return data as unknown as RhCollaboratorAchievement;
  },

  async syncJourneyMetrics(jornadaId: string): Promise<void> {
    const [achievements, plans] = await Promise.all([
      this.fetchJourneyAchievements(jornadaId),
      supabase.from('rh_pdi_planos').select('score_progresso').eq('jornada_id', jornadaId),
    ]);

    const scoreFromAchievements = achievements.reduce((sum, item) => sum + (item.score_impacto || 0), 0);
    const scoreFromPlans = ((plans.data || []) as Array<{ score_progresso: number | null }>).reduce((sum, item) => sum + Number(item.score_progresso || 0), 0);

    const { error } = await supabase
      .from('rh_colaborador_jornadas')
      .update({
        score_jornada: scoreFromAchievements + scoreFromPlans,
        badges_count: achievements.length,
      })
      .eq('id', jornadaId);
    if (error) throw error;
  },

  async fetchPdiCycles(): Promise<RhPdiCycle[]> {
    const { data, error } = await supabase
      .from('rh_pdi_ciclos')
      .select('*')
      .eq('ativo', true)
      .order('data_inicio', { ascending: false });
    if (error) throw error;
    return (data || []) as RhPdiCycle[];
  },

  async fetchPdiTemplates(): Promise<RhPdiTemplate[]> {
    const { data, error } = await supabase
      .from('rh_pdi_templates')
      .select('*')
      .order('ativo', { ascending: false })
      .order('nome', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiTemplate[];
  },

  async createPdiTemplate(input: RhPdiTemplateCreateInput): Promise<RhPdiTemplate> {
    const { data, error } = await supabase
      .from('rh_pdi_templates')
      .insert([{
        nome: input.nome,
        descricao: input.descricao || null,
        ativo: input.ativo ?? true,
        escopo_cargo: input.escopo_cargo || null,
        escopo_departamento: input.escopo_departamento || null,
        escopo_unidade: input.escopo_unidade || null,
        ciclo_tipo: input.ciclo_tipo || null,
      }])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiTemplate;
  },

  async updatePdiTemplate(templateId: string, payload: Partial<RhPdiTemplateCreateInput> & { ativo?: boolean }): Promise<RhPdiTemplate> {
    const { data, error } = await supabase.from('rh_pdi_templates').update(payload).eq('id', templateId).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplate;
  },

  async archivePdiTemplate(templateId: string): Promise<RhPdiTemplate> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');
    const { data, error } = await supabase
      .from('rh_pdi_templates')
      .update({ ativo: false, arquivado_em: new Date().toISOString(), arquivado_por: userId })
      .eq('id', templateId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiTemplate;
  },

  async fetchPdiTemplateCompetences(templateId: string): Promise<RhPdiTemplateCompetence[]> {
    const { data, error } = await supabase.from('rh_pdi_template_competencias').select('*').eq('template_id', templateId).order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiTemplateCompetence[];
  },

  async fetchPdiTemplateObjectives(templateId: string): Promise<RhPdiTemplateObjective[]> {
    const { data, error } = await supabase.from('rh_pdi_template_objetivos').select('*').eq('template_id', templateId).order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiTemplateObjective[];
  },

  async fetchPdiTemplateCheckpoints(templateId: string): Promise<RhPdiTemplateCheckpoint[]> {
    const { data, error } = await supabase.from('rh_pdi_template_checkpoints').select('*').eq('template_id', templateId).order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiTemplateCheckpoint[];
  },

  async createPdiTemplateCompetence(input: Omit<RhPdiTemplateCompetence, 'id' | 'created_at' | 'updated_at'>): Promise<RhPdiTemplateCompetence> {
    const { data, error } = await supabase.from('rh_pdi_template_competencias').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateCompetence;
  },

  async updatePdiTemplateCompetence(competenceId: string, payload: Partial<Pick<RhPdiTemplateCompetence, 'nome' | 'categoria' | 'nivel_alvo' | 'ordem'>>): Promise<RhPdiTemplateCompetence> {
    const { data, error } = await supabase.from('rh_pdi_template_competencias').update(payload).eq('id', competenceId).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateCompetence;
  },

  async createPdiTemplateObjective(input: Omit<RhPdiTemplateObjective, 'id' | 'created_at' | 'updated_at'>): Promise<RhPdiTemplateObjective> {
    const { data, error } = await supabase.from('rh_pdi_template_objetivos').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateObjective;
  },

  async updatePdiTemplateObjective(objectiveId: string, payload: Partial<Pick<RhPdiTemplateObjective, 'competencia_template_id' | 'titulo' | 'descricao' | 'tipo' | 'obrigatorio' | 'score_peso' | 'ordem' | 'prazo_offset_dias'>>): Promise<RhPdiTemplateObjective> {
    const { data, error } = await supabase.from('rh_pdi_template_objetivos').update(payload).eq('id', objectiveId).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateObjective;
  },

  async createPdiTemplateCheckpoint(input: Omit<RhPdiTemplateCheckpoint, 'id' | 'created_at' | 'updated_at'>): Promise<RhPdiTemplateCheckpoint> {
    const { data, error } = await supabase.from('rh_pdi_template_checkpoints').insert([input]).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateCheckpoint;
  },

  async updatePdiTemplateCheckpoint(checkpointId: string, payload: Partial<Pick<RhPdiTemplateCheckpoint, 'objetivo_template_id' | 'titulo' | 'tipo' | 'ordem' | 'prazo_offset_dias'>>): Promise<RhPdiTemplateCheckpoint> {
    const { data, error } = await supabase.from('rh_pdi_template_checkpoints').update(payload).eq('id', checkpointId).select('*').single();
    if (error) throw error;
    return data as RhPdiTemplateCheckpoint;
  },

  async fetchCareerLevels(cargoBase?: string | null): Promise<RhCareerLevel[]> {
    let query = supabase.from('rh_carreira_niveis').select('*').eq('ativo', true).order('cargo_base', { ascending: true }).order('ordem', { ascending: true });
    if (cargoBase) query = query.eq('cargo_base', cargoBase);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhCareerLevel[];
  },

  async fetchPdiPlans(params?: { colaboradorId?: number | null; jornadaId?: string | null; status?: string }): Promise<RhPdiPlan[]> {
    let query = supabase.from('rh_pdi_planos').select('*').order('data_inicio', { ascending: false });
    if (params?.colaboradorId) query = query.eq('colaborador_id', params.colaboradorId);
    if (params?.jornadaId) query = query.eq('jornada_id', params.jornadaId);
    if (params?.status) query = query.eq('status', params.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RhPdiPlan[];
  },

  async createPdiPlan(input: RhPdiPlanCreateInput): Promise<RhPdiPlan> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('rh_pdi_planos')
      .insert([
        {
          colaborador_id: input.colaborador_id,
          jornada_id: input.jornada_id || null,
          ciclo_id: input.ciclo_id || null,
          template_nome: input.template_nome || null,
          status: input.status || 'em_andamento',
          titulo: input.titulo,
          objetivo_geral: input.objetivo_geral || null,
          owner_user_id: userId,
          gestor_user_id: input.gestor_user_id || null,
          mentor_user_id: input.mentor_user_id || null,
          data_inicio: input.data_inicio,
          data_fim_prevista: input.data_fim_prevista || null,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiPlan;
  },

  async fetchPdiCompetences(planId: string): Promise<RhPdiCompetence[]> {
    const { data, error } = await supabase
      .from('rh_pdi_competencias')
      .select('*')
      .eq('plano_id', planId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiCompetence[];
  },

  async createPdiCompetence(input: Omit<RhPdiCompetence, 'id' | 'created_at' | 'updated_at'>): Promise<RhPdiCompetence> {
    const { data, error } = await supabase
      .from('rh_pdi_competencias')
      .insert([input])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiCompetence;
  },

  async updatePdiCompetence(competenceId: string, payload: Partial<Pick<RhPdiCompetence, 'nome' | 'categoria' | 'nivel_atual' | 'nivel_alvo' | 'status' | 'ordem'>>): Promise<RhPdiCompetence> {
    const { data, error } = await supabase.from('rh_pdi_competencias').update(payload).eq('id', competenceId).select('*').single();
    if (error) throw error;
    return data as RhPdiCompetence;
  },

  async instantiatePdiTemplate(templateId: string, input: { colaboradorId: number; jornadaId?: string | null; cicloId?: string | null; gestorUserId?: string | null; mentorUserId?: string | null; dataInicio?: string; dataFimPrevista?: string | null }): Promise<RhPdiPlan> {
    const [template, competences, objectives, checkpoints] = await Promise.all([
      supabase.from('rh_pdi_templates').select('*').eq('id', templateId).single(),
      this.fetchPdiTemplateCompetences(templateId),
      this.fetchPdiTemplateObjectives(templateId),
      this.fetchPdiTemplateCheckpoints(templateId),
    ]);
    if (template.error) throw template.error;

    const plan = await this.createPdiPlan({
      colaborador_id: input.colaboradorId,
      jornada_id: input.jornadaId || null,
      ciclo_id: input.cicloId || null,
      template_nome: template.data.nome,
      titulo: template.data.nome,
      objetivo_geral: template.data.descricao || null,
      gestor_user_id: input.gestorUserId || null,
      mentor_user_id: input.mentorUserId || null,
      data_inicio: input.dataInicio || new Date().toISOString().slice(0, 10),
      data_fim_prevista: input.dataFimPrevista || null,
    });

    const competenceMap = new Map<string, string>();
    for (const competence of competences) {
      const created = await this.createPdiCompetence({
        plano_id: plan.id,
        nome: competence.nome,
        categoria: competence.categoria,
        nivel_atual: 1,
        nivel_alvo: competence.nivel_alvo,
        status: 'pendente',
        ordem: competence.ordem,
      });
      competenceMap.set(competence.id, created.id);
    }

    const objectiveMap = new Map<string, string>();
    for (const objective of objectives) {
      const created = await this.createPdiObjective({
        plano_id: plan.id,
        competencia_id: objective.competencia_template_id ? competenceMap.get(objective.competencia_template_id) || null : null,
        titulo: objective.titulo,
        descricao: objective.descricao || null,
        tipo: objective.tipo,
        obrigatorio: objective.obrigatorio,
        score_peso: Number(objective.score_peso || 0),
        data_inicio: plan.data_inicio,
        data_limite: addDaysISO(plan.data_inicio, objective.prazo_offset_dias),
        ordem: objective.ordem,
      });
      objectiveMap.set(objective.id, created.id);
    }

    for (const checkpoint of checkpoints) {
      await this.createPdiCheckpoint({
        plano_id: plan.id,
        objetivo_id: checkpoint.objetivo_template_id ? objectiveMap.get(checkpoint.objetivo_template_id) || null : null,
        titulo: checkpoint.titulo,
        tipo: checkpoint.tipo,
        data_prevista: addDaysISO(plan.data_inicio, checkpoint.prazo_offset_dias) || plan.data_inicio,
      });
    }

    await this.syncPdiPlanProgress(plan.id);
    return plan;
  },

  async fetchPdiObjectives(planId: string): Promise<RhPdiObjective[]> {
    const { data, error } = await supabase
      .from('rh_pdi_objetivos')
      .select('*')
      .eq('plano_id', planId)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiObjective[];
  },

  async createPdiObjective(input: RhPdiObjectiveCreateInput): Promise<RhPdiObjective> {
    const current = await this.fetchPdiObjectives(input.plano_id);
    const { data, error } = await supabase
      .from('rh_pdi_objetivos')
      .insert([
        {
          plano_id: input.plano_id,
          competencia_id: input.competencia_id || null,
          titulo: input.titulo,
          descricao: input.descricao || null,
          tipo: input.tipo,
          obrigatorio: input.obrigatorio ?? true,
          score_peso: input.score_peso ?? 10,
          data_inicio: input.data_inicio || null,
          data_limite: input.data_limite || null,
          ordem: input.ordem || current.length + 1,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    await this.syncPdiPlanProgress(input.plano_id);
    return data as RhPdiObjective;
  },

  async updatePdiObjectiveStatus(objectiveId: string, status: RhPdiObjective['status']): Promise<RhPdiObjective> {
    const { data: current, error: currentError } = await supabase.from('rh_pdi_objetivos').select('*').eq('id', objectiveId).single();
    if (currentError) throw currentError;
    const { data, error } = await supabase
      .from('rh_pdi_objetivos')
      .update({
        status,
        concluido_em: status === 'concluido' ? new Date().toISOString() : null,
      })
      .eq('id', objectiveId)
      .select('*')
      .single();
    if (error) throw error;
    await this.syncPdiPlanProgress(current.plano_id);
    return data as RhPdiObjective;
  },

  async syncPdiPlanProgress(planId: string): Promise<void> {
    const objectives = await this.fetchPdiObjectives(planId);
    const validObjectives = objectives.filter((item) => item.status !== 'cancelado');
    const totalWeight = validObjectives.reduce((sum, item) => sum + Number(item.score_peso || 0), 0);
    const concludedWeight = validObjectives
      .filter((item) => item.status === 'concluido')
      .reduce((sum, item) => sum + Number(item.score_peso || 0), 0);
    const progress = totalWeight === 0 ? 0 : Number(((concludedWeight / totalWeight) * 100).toFixed(2));

    const { data: plan, error: planError } = await supabase
      .from('rh_pdi_planos')
      .update({
        score_progresso: progress,
        status: progress >= 100 ? 'concluido' : progress > 0 ? 'em_andamento' : 'rascunho',
        data_conclusao: progress >= 100 ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', planId)
      .select('jornada_id')
      .single();
    if (planError) throw planError;

    if (plan?.jornada_id) {
      await this.syncJourneyMetrics(plan.jornada_id);
    }
  },

  async fetchPdiCheckpoints(planId: string): Promise<RhPdiCheckpoint[]> {
    const { data, error } = await supabase
      .from('rh_pdi_checkpoints')
      .select('*')
      .eq('plano_id', planId)
      .order('data_prevista', { ascending: true });
    if (error) throw error;
    return (data || []) as RhPdiCheckpoint[];
  },

  async createPdiCheckpoint(input: RhPdiCheckpointCreateInput): Promise<RhPdiCheckpoint> {
    const { data, error } = await supabase
      .from('rh_pdi_checkpoints')
      .insert([
        {
          plano_id: input.plano_id,
          objetivo_id: input.objetivo_id || null,
          titulo: input.titulo,
          tipo: input.tipo,
          responsavel_user_id: input.responsavel_user_id || null,
          data_prevista: input.data_prevista,
          observacoes: input.observacoes || null,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    const { data: plan } = await supabase.from('rh_pdi_planos').select('titulo').eq('id', input.plano_id).maybeSingle();
    if (plan?.titulo) {
      await runRhAgendaSync(() => rhAgendaSyncService.syncPdiCheckpointMirror(plan.titulo, data as RhPdiCheckpoint));
    }
    return data as RhPdiCheckpoint;
  },

  async updatePdiCheckpoint(checkpointId: string, payload: Partial<Pick<RhPdiCheckpoint, 'status' | 'data_realizada' | 'observacoes'>>): Promise<RhPdiCheckpoint> {
    const { data, error } = await supabase
      .from('rh_pdi_checkpoints')
      .update(payload)
      .eq('id', checkpointId)
      .select('*')
      .single();
    if (error) throw error;
    const { data: plan } = await supabase
      .from('rh_pdi_planos')
      .select('titulo')
      .eq('id', data.plano_id)
      .maybeSingle();
    if (plan?.titulo) {
      await runRhAgendaSync(() => rhAgendaSyncService.syncPdiCheckpointMirror(plan.titulo, data as RhPdiCheckpoint));
    }
    return data as RhPdiCheckpoint;
  },

  async fetchPdiFeedbacks(planId: string): Promise<RhPdiFeedback[]> {
    const { data, error } = await supabase
      .from('rh_pdi_feedbacks')
      .select('*')
      .eq('plano_id', planId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as RhPdiFeedback[];
  },

  async createPdiFeedback(input: RhPdiFeedbackCreateInput): Promise<RhPdiFeedback> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id || null;
    const { data, error } = await supabase
      .from('rh_pdi_feedbacks')
      .insert([
        {
          plano_id: input.plano_id,
          checkpoint_id: input.checkpoint_id || null,
          tipo: input.tipo,
          autor_user_id: userId,
          resumo: input.resumo,
          pontos_fortes: input.pontos_fortes || null,
          pontos_desenvolver: input.pontos_desenvolver || null,
          nota: input.nota ?? null,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiFeedback;
  },

  async fetchPdiEvidences(planId: string): Promise<RhPdiEvidence[]> {
    const { data, error } = await supabase
      .from('rh_pdi_evidencias')
      .select('*')
      .eq('plano_id', planId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as RhPdiEvidence[];
  },

  async createPdiEvidence(input: RhPdiEvidenceCreateInput, file?: File | null): Promise<RhPdiEvidence> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    let storagePath: string | null = null;
    let evidenceType = input.tipo;
    if (file) {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath = `pdi/${input.plano_id}/evidencias/${Date.now()}-${sanitizedName}`;
      const { error: uploadError } = await supabase.storage.from('rh-documentos').upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      });
      if (uploadError) throw uploadError;
      evidenceType = 'arquivo';
    }

    const { data, error } = await supabase
      .from('rh_pdi_evidencias')
      .insert([
        {
          plano_id: input.plano_id,
          objetivo_id: input.objetivo_id || null,
          checkpoint_id: input.checkpoint_id || null,
          tipo: evidenceType,
          titulo: input.titulo,
          descricao: input.descricao || null,
          storage_path: storagePath,
          link_url: input.link_url || null,
          created_by: userId,
        },
      ])
      .select('*')
      .single();
    if (error) throw error;
    return data as RhPdiEvidence;
  },

  async fetchCareerMovements(colaboradorId: number): Promise<RhCareerMovement[]> {
    const { data, error } = await supabase
      .from('rh_carreira_movimentacoes')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .order('efetivado_em', { ascending: false });
    if (error) throw error;
    return (data || []) as RhCareerMovement[];
  },

  async createCareerMovement(payload: Omit<RhCareerMovement, 'id' | 'created_at'>): Promise<RhCareerMovement> {
    const { data, error } = await supabase
      .from('rh_carreira_movimentacoes')
      .insert([payload])
      .select('*')
      .single();
    if (error) throw error;
    if (payload.jornada_id) {
      await supabase
        .from('rh_colaborador_jornadas')
        .update({ nivel_carreira_id: payload.nivel_destino_id || null })
        .eq('id', payload.jornada_id);
      await this.createJourneyMilestone({
        jornada_id: payload.jornada_id,
        colaborador_id: payload.colaborador_id,
        tipo: 'promocao',
        titulo: payload.titulo,
        descricao: payload.motivo || 'Movimentação de carreira registrada.',
        referencia_tipo: 'rh_carreira_movimentacoes',
        referencia_id: data.id,
      });
    }
    return data as RhCareerMovement;
  },

  async fetchGeneratedDocuments(processId: string): Promise<RhGeneratedDocument[]> {
    const { data, error } = await supabase
      .from('rh_documentos_gerados')
      .select('*')
      .eq('processo_id', processId)
      .order('gerado_em', { ascending: false });
    if (error) throw error;
    return (data || []) as RhGeneratedDocument[];
  },

  async generateDocument(processId: string, tipoDocumento: string): Promise<{ storage_path: string; documento_gerado_id: string }> {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw refreshError;
    }

    const session = refreshed.session;
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente para gerar o documento.');
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/rh-generate-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        process_id: processId,
        tipo_documento: tipoDocumento,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Não foi possível gerar o documento.');
    }

    return data as { storage_path: string; documento_gerado_id: string };
  },

  async uploadDocument(documentId: string, file: File): Promise<RhDocument> {
    const { data: current, error: currentError } = await supabase
      .from('rh_documentos')
      .select('id,processo_id,tipo_documento')
      .eq('id', documentId)
      .single();
    if (currentError) throw currentError;

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `processos/${current.processo_id}/documentos/${documentId}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage.from('rh-documentos').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('rh_documentos')
      .update({
        storage_path: storagePath,
        nome_arquivo: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select('*')
      .single();
    if (error) throw error;
    await this.insertHistoryEvent({
      processo_id: current.processo_id,
      entidade_tipo: 'rh_documentos',
      entidade_id: documentId,
      acao: 'documento_enviado',
      comentario: `${file.name} enviado para ${current.tipo_documento}.`,
    });
    await this.syncProcessLifecycle(current.processo_id);
    return data as RhDocument;
  },

  async reviewDocument(documentId: string, status: 'em_analise' | 'conferido' | 'rejeitado', observacao?: string | null): Promise<RhDocument> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const payload: Record<string, unknown> = {
      status,
      observacao: observacao || null,
    };

    if (status === 'conferido') {
      payload.conferido_em = new Date().toISOString();
      payload.conferido_por = userId;
    }

    const { data, error } = await supabase.from('rh_documentos').update(payload).eq('id', documentId).select('*').single();
    if (error) throw error;
    await this.insertHistoryEvent({
      processo_id: data.processo_id,
      entidade_tipo: 'rh_documentos',
      entidade_id: documentId,
      acao: 'documento_revisado',
      para_json: { status, observacao: observacao || null },
      comentario: `Documento atualizado para ${status}.`,
    });
    await this.syncProcessLifecycle(data.processo_id);
    return data as RhDocument;
  },

  async getDocumentSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from('rh-documentos').createSignedUrl(storagePath, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  },
};
