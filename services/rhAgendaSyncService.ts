import { supabase } from './supabase';
import { completeRhAgendaMirrorTask, createRhAgendaMirrorTask, fetchNotificacaoConfig, updateRhAgendaMirrorTask } from './agendaService';
import type { RhProcess, RhStage } from '../types/rh';

type RhAgendaReminderConfig = {
  processReminderMinutes: number[];
  stageReminderMinutes: number[];
  pdiReminderMinutes: number[];
};

const CONFIG_CACHE_TTL_MS = 30_000;

let configCache:
  | {
      expiresAt: number;
      value: RhAgendaReminderConfig;
    }
  | null = null;

const buildProcessTaskTitle = (process: RhProcess) => `Jornada RH: ${process.titulo}`;

const buildStageTaskTitle = (process: RhProcess, stage: RhStage) => `Jornada RH: ${process.titulo} - ${stage.titulo}`;

const getStageDueDateTime = (stage: RhStage) => {
  if (stage.agendado_em) return stage.agendado_em;
  if (stage.data_limite) return `${stage.data_limite}T09:00:00`;
  return null;
};

const findMirrorTask = async (vinculoTipo: 'rh_processo' | 'rh_etapa' | 'rh_pdi_checkpoint', vinculoId: string) => {
  const { data, error } = await supabase
    .from('tarefas')
    .select('id,status')
    .eq('vinculo_tipo', vinculoTipo)
    .eq('vinculo_id', vinculoId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
};

const isTerminalStatus = (status: string) => status === 'concluido' || status === 'cancelado';
const isTerminalStageStatus = (status: string) => status === 'concluida' || status === 'dispensada';

const toReminderMinutes = (active: boolean | undefined, value: number | undefined, fallback: number) => {
  if (active === false) return [];
  const minutes = Number.isFinite(value) ? Number(value) : fallback;
  return minutes > 0 ? [minutes] : [];
};

const getRhAgendaReminderConfig = async (): Promise<RhAgendaReminderConfig> => {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) {
    return configCache.value;
  }

  const config = await fetchNotificacaoConfig().catch(() => null);
  const value: RhAgendaReminderConfig = {
    processReminderMinutes: toReminderMinutes(config?.rh_agenda_lembrete_processos_ativo, config?.rh_agenda_lembrete_processos_minutos, 1440),
    stageReminderMinutes: toReminderMinutes(config?.rh_agenda_lembrete_etapas_ativo, config?.rh_agenda_lembrete_etapas_minutos, 1440),
    pdiReminderMinutes: toReminderMinutes(config?.rh_agenda_lembrete_pdi_ativo, config?.rh_agenda_lembrete_pdi_minutos, 1440),
  };

  configCache = {
    expiresAt: now + CONFIG_CACHE_TTL_MS,
    value,
  };

  return value;
};

export const rhAgendaSyncService = {
  async createProcessMirror(process: RhProcess) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return createRhAgendaMirrorTask({
      titulo: buildProcessTaskTitle(process),
      descricao: `Processo ${process.tipo} em ${process.status}.`,
      vencimento_em: process.data_fim_prevista ? `${process.data_fim_prevista}T09:00:00` : null,
      categoria: 'rh',
      prioridade: process.prioridade === 'urgente' ? 'urgente' : process.prioridade === 'alta' ? 'alta' : 'media',
      vinculo_tipo: 'rh_processo',
      vinculo_id: process.id,
      lembrete_minutos: reminderConfig.processReminderMinutes,
    });
  },

  async updateProcessMirror(taskId: string, process: RhProcess) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return updateRhAgendaMirrorTask(taskId, {
      titulo: buildProcessTaskTitle(process),
      descricao: `Processo ${process.tipo} em ${process.status}.`,
      vencimento_em: process.data_fim_prevista ? `${process.data_fim_prevista}T09:00:00` : null,
      prioridade: process.prioridade === 'urgente' ? 'urgente' : process.prioridade === 'alta' ? 'alta' : 'media',
      lembrete_minutos: reminderConfig.processReminderMinutes,
    });
  },

  async completeProcessMirror(taskId: string) {
    return completeRhAgendaMirrorTask(taskId);
  },

  async createStageMirror(process: RhProcess, stage: RhStage) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return createRhAgendaMirrorTask({
      titulo: buildStageTaskTitle(process, stage),
      descricao: `Etapa ${stage.categoria} em ${stage.status}.`,
      vencimento_em: getStageDueDateTime(stage),
      categoria: 'rh',
      prioridade: stage.status === 'atrasada' ? 'urgente' : 'media',
      vinculo_tipo: 'rh_etapa',
      vinculo_id: stage.id,
      lembrete_minutos: reminderConfig.stageReminderMinutes,
    });
  },

  async updateStageMirror(taskId: string, process: RhProcess, stage: RhStage) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return updateRhAgendaMirrorTask(taskId, {
      titulo: buildStageTaskTitle(process, stage),
      descricao: `Etapa ${stage.categoria} em ${stage.status}.`,
      vencimento_em: getStageDueDateTime(stage),
      prioridade: stage.status === 'atrasada' ? 'urgente' : 'media',
      lembrete_minutos: reminderConfig.stageReminderMinutes,
    });
  },

  async completeStageMirror(taskId: string) {
    return completeRhAgendaMirrorTask(taskId);
  },

  async completeAllStageMirrors(processId: string) {
    const { data: stages, error: stagesError } = await supabase.from('rh_processo_etapas').select('id').eq('processo_id', processId);
    if (stagesError) throw stagesError;

    const stageIds = (stages || []).map((stage) => stage.id);
    if (stageIds.length === 0) return;

    const { data: tasks, error: tasksError } = await supabase
      .from('tarefas')
      .select('id,status')
      .eq('vinculo_tipo', 'rh_etapa')
      .in('vinculo_id', stageIds);
    if (tasksError) throw tasksError;

    await Promise.all(
      (tasks || [])
        .filter((task) => task.status !== 'concluida')
        .map((task) => this.completeStageMirror(task.id))
    );
  },

  async syncProcessMirror(process: RhProcess) {
    const existing = await findMirrorTask('rh_processo', process.id);

    if (!existing) {
      if (!isTerminalStatus(process.status)) {
        return this.createProcessMirror(process);
      }
      return null;
    }

    if (isTerminalStatus(process.status)) {
      if (existing.status !== 'concluida') {
        await this.completeProcessMirror(existing.id);
        await this.completeAllStageMirrors(process.id);
        return null;
      }
      await this.completeAllStageMirrors(process.id);
      return null;
    }

    return this.updateProcessMirror(existing.id, process);
  },

  async syncStageMirror(process: RhProcess, stage: RhStage) {
    const existing = await findMirrorTask('rh_etapa', stage.id);

    if (!existing) {
      if (!isTerminalStageStatus(stage.status)) {
        return this.createStageMirror(process, stage);
      }
      return null;
    }

    if (isTerminalStageStatus(stage.status)) {
      if (existing.status !== 'concluida') {
        return this.completeStageMirror(existing.id);
      }
      return null;
    }

    return this.updateStageMirror(existing.id, process, stage);
  },

  async createPdiCheckpointMirror(planTitle: string, checkpoint: { id: string; titulo: string; tipo: string; status: string; data_prevista: string }) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return createRhAgendaMirrorTask({
      titulo: `PDI: ${planTitle} - ${checkpoint.titulo}`,
      descricao: `Checkpoint ${checkpoint.tipo} em ${checkpoint.status}.`,
      vencimento_em: checkpoint.data_prevista ? `${checkpoint.data_prevista}T09:00:00` : null,
      categoria: 'rh',
      prioridade: checkpoint.status === 'atrasado' ? 'urgente' : 'media',
      vinculo_tipo: 'rh_pdi_checkpoint',
      vinculo_id: checkpoint.id,
      lembrete_minutos: reminderConfig.pdiReminderMinutes,
    });
  },

  async updatePdiCheckpointMirror(taskId: string, planTitle: string, checkpoint: { titulo: string; tipo: string; status: string; data_prevista: string }) {
    const reminderConfig = await getRhAgendaReminderConfig();
    return updateRhAgendaMirrorTask(taskId, {
      titulo: `PDI: ${planTitle} - ${checkpoint.titulo}`,
      descricao: `Checkpoint ${checkpoint.tipo} em ${checkpoint.status}.`,
      vencimento_em: checkpoint.data_prevista ? `${checkpoint.data_prevista}T09:00:00` : null,
      prioridade: checkpoint.status === 'atrasado' ? 'urgente' : 'media',
      lembrete_minutos: reminderConfig.pdiReminderMinutes,
    });
  },

  async syncPdiCheckpointMirror(planTitle: string, checkpoint: { id: string; titulo: string; tipo: string; status: string; data_prevista: string }) {
    const existing = await findMirrorTask('rh_pdi_checkpoint', checkpoint.id);
    if (!existing) {
      if (checkpoint.status !== 'realizado' && checkpoint.status !== 'cancelado') {
        return this.createPdiCheckpointMirror(planTitle, checkpoint);
      }
      return null;
    }
    if (checkpoint.status === 'realizado' || checkpoint.status === 'cancelado') {
      if (existing.status !== 'concluida') return this.completeStageMirror(existing.id);
      return null;
    }
    return this.updatePdiCheckpointMirror(existing.id, planTitle, checkpoint);
  },
};
