import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  Goal,
  MessageSquare,
  Pencil,
  Save,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { Badge, Card, CustomSelect, DatePicker, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { cn } from '../../CollaboratorComponents';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { Colaborador, UserProfile } from '../../../types';
import type {
  RhCollaboratorJourney,
  RhDevelopmentHealthSnapshot,
  RhJourneyAiInsight,
  RhPdiCheckpoint,
  RhPdiCheckpointStatus,
  RhPdiCheckpointType,
  RhPdiCompetence,
  RhPdiCompetenceCategory,
  RhPdiCompetenceStatus,
  RhPdiCycle,
  RhPdiEvidence,
  RhPdiFeedback,
  RhPdiFeedbackType,
  RhPdiObjective,
  RhPdiObjectiveStatus,
  RhPdiObjectiveType,
  RhPdiPlan,
  RhPdiPlanStatus,
  RhPdiTemplate,
} from '../../../types/rh';
import {
  RH_PDI_CHECKPOINT_STATUSES,
  RH_PDI_CHECKPOINT_TYPES,
  RH_PDI_COMPETENCE_CATEGORIES,
  RH_PDI_COMPETENCE_STATUSES,
  RH_PDI_FEEDBACK_TYPES,
  RH_PDI_OBJECTIVE_STATUSES,
  RH_PDI_OBJECTIVE_TYPES,
  RH_PDI_PLAN_STATUSES,
} from '../../../types/rh';

type PlanDraft = { templateId: string; title: string; objectiveGeneral: string; cycleId: string; endDate?: string; status: RhPdiPlanStatus; gestorUserId: string; mentorUserId: string };
type CompetenceDraft = { name: string; category: RhPdiCompetenceCategory; currentLevel: string; targetLevel: string; status: RhPdiCompetenceStatus };
type ObjectiveDraft = { competenceId: string; title: string; description: string; type: RhPdiObjectiveType; status: RhPdiObjectiveStatus; mandatory: boolean; scoreWeight: string; startDate?: string; limitDate?: string };
type CheckpointDraft = { objectiveId: string; title: string; type: RhPdiCheckpointType; status: RhPdiCheckpointStatus; responsibleUserId: string; expectedDate?: string; completedDate?: string; notes: string };
type FeedbackDraft = { checkpointId: string; type: RhPdiFeedbackType; summary: string; strengths: string; developmentGaps: string; score: string };
type EvidenceDraft = { objectiveId: string; checkpointId: string; title: string; description: string; linkUrl: string; file: File | null };

const emptyPlanDraft = (): PlanDraft => ({ templateId: '', title: '', objectiveGeneral: '', cycleId: '', endDate: undefined, status: 'em_andamento', gestorUserId: '', mentorUserId: '' });
const emptyCompetenceDraft = (): CompetenceDraft => ({ name: '', category: RH_PDI_COMPETENCE_CATEGORIES[0], currentLevel: '1', targetLevel: '3', status: 'pendente' });
const emptyObjectiveDraft = (): ObjectiveDraft => ({ competenceId: '', title: '', description: '', type: RH_PDI_OBJECTIVE_TYPES[0], status: 'nao_iniciado', mandatory: true, scoreWeight: '10', startDate: undefined, limitDate: undefined });
const emptyCheckpointDraft = (): CheckpointDraft => ({ objectiveId: '', title: '', type: RH_PDI_CHECKPOINT_TYPES[0], status: 'agendado', responsibleUserId: '', expectedDate: new Date().toISOString().slice(0, 10), completedDate: undefined, notes: '' });
const emptyFeedbackDraft = (): FeedbackDraft => ({ checkpointId: '', type: RH_PDI_FEEDBACK_TYPES[0], summary: '', strengths: '', developmentGaps: '', score: '' });
const emptyEvidenceDraft = (): EvidenceDraft => ({ objectiveId: '', checkpointId: '', title: '', description: '', linkUrl: '', file: null });

const humanize = (value?: string | null) => (value || '').replace(/_/g, ' ');
const formatDate = (value?: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data');
const parseNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DesenvolvimentoTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [journeys, setJourneys] = useState<Record<number, RhCollaboratorJourney | null>>({});
  const [cycles, setCycles] = useState<RhPdiCycle[]>([]);
  const [plans, setPlans] = useState<RhPdiPlan[]>([]);
  const [templates, setTemplates] = useState<RhPdiTemplate[]>([]);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [competences, setCompetences] = useState<RhPdiCompetence[]>([]);
  const [objectives, setObjectives] = useState<RhPdiObjective[]>([]);
  const [checkpoints, setCheckpoints] = useState<RhPdiCheckpoint[]>([]);
  const [feedbacks, setFeedbacks] = useState<RhPdiFeedback[]>([]);
  const [evidences, setEvidences] = useState<RhPdiEvidence[]>([]);
  const [health, setHealth] = useState<RhDevelopmentHealthSnapshot | null>(null);
  const [aiInsight, setAiInsight] = useState<RhJourneyAiInsight | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [competenceModalOpen, setCompetenceModalOpen] = useState(false);
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false);
  const [checkpointModalOpen, setCheckpointModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingCompetenceId, setEditingCompetenceId] = useState<string | null>(null);
  const [editingObjectiveId, setEditingObjectiveId] = useState<string | null>(null);
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null);
  const [editingEvidenceId, setEditingEvidenceId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(emptyPlanDraft);
  const [competenceDraft, setCompetenceDraft] = useState<CompetenceDraft>(emptyCompetenceDraft);
  const [objectiveDraft, setObjectiveDraft] = useState<ObjectiveDraft>(emptyObjectiveDraft);
  const [checkpointDraft, setCheckpointDraft] = useState<CheckpointDraft>(emptyCheckpointDraft);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>(emptyFeedbackDraft);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(emptyEvidenceDraft);
  const evidenceFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCollaborator = useMemo(() => colaboradores.find((item) => item.id === selectedCollaboratorId) || null, [colaboradores, selectedCollaboratorId]);
  const selectedJourney = selectedCollaboratorId ? journeys[selectedCollaboratorId] || null : null;
  const filteredPlans = useMemo(() => plans.filter((item) => item.colaborador_id === selectedCollaboratorId), [plans, selectedCollaboratorId]);
  const selectedPlan = useMemo(() => filteredPlans.find((item) => item.id === selectedPlanId) || null, [filteredPlans, selectedPlanId]);
  const activePlanStatuses = useMemo(() => new Set<RhPdiPlanStatus>(['rascunho', 'em_andamento', 'em_revisao']), []);
  const collaboratorsWithActivePlan = useMemo(
    () => new Set(plans.filter((item) => activePlanStatuses.has(item.status)).map((item) => item.colaborador_id)),
    [plans, activePlanStatuses]
  );
  const developmentCollaboratorsCount = useMemo(
    () => colaboradores.filter((item) => collaboratorsWithActivePlan.has(item.id)).length,
    [colaboradores, collaboratorsWithActivePlan]
  );
  const withoutPlanCount = useMemo(
    () => colaboradores.filter((item) => !collaboratorsWithActivePlan.has(item.id)).length,
    [colaboradores, collaboratorsWithActivePlan]
  );
  const competenceOptions = useMemo(() => [{ value: '', label: 'Sem competencia vinculada' }, ...competences.map((item) => ({ value: item.id, label: item.nome }))], [competences]);
  const objectiveOptions = useMemo(() => [{ value: '', label: 'Sem objetivo vinculado' }, ...objectives.map((item) => ({ value: item.id, label: item.titulo }))], [objectives]);
  const checkpointOptions = useMemo(() => [{ value: '', label: 'Sem checkpoint vinculado' }, ...checkpoints.map((item) => ({ value: item.id, label: item.titulo }))], [checkpoints]);
  const userOptions = useMemo(() => [{ value: '', label: 'Sem responsavel especifico' }, ...userProfiles.map((item) => ({ value: item.id, label: item.nome }))], [userProfiles]);

  const getUserName = (userId?: string | null) => userProfiles.find((profile) => profile.id === userId)?.nome || 'Nao definido';
  const getCompetenceName = (competenceId?: string | null) => competences.find((item) => item.id === competenceId)?.nome || 'Sem competencia';
  const getCheckpointName = (checkpointId?: string | null) => checkpoints.find((item) => item.id === checkpointId)?.titulo || 'Sem checkpoint';

  const loadBase = async () => {
    const shouldBlock = colaboradores.length === 0 && plans.length === 0;
    if (shouldBlock) setLoading(true);
    setError(null);
    try {
      const [nextColaboradores, nextProfiles, nextCycles, journeySummaries, nextPlans, nextTemplates] = await Promise.all([
        rhJornadaService.fetchColaboradores(),
        rhJornadaService.fetchUserProfiles(),
        rhJornadaService.fetchPdiCycles(),
        rhJornadaService.fetchCollaboratorJourneys(),
        rhJornadaService.fetchPdiPlans(),
        rhJornadaService.fetchPdiTemplates(),
      ]);
      const activeColaboradores = nextColaboradores.filter((item) => item.ativo);
      const journeyMap: Record<number, RhCollaboratorJourney | null> = {};
      journeySummaries.forEach((item) => { journeyMap[item.colaborador_id] = item; });
      setColaboradores(activeColaboradores);
      setUserProfiles(nextProfiles);
      setCycles(nextCycles);
      setPlans(nextPlans);
      setTemplates(nextTemplates.filter((item) => item.ativo));
      setJourneys(journeyMap);
      setSelectedCollaboratorId((current) => current || activeColaboradores[0]?.id || null);
      void rhJornadaService.fetchDevelopmentHealthSnapshot().then(setHealth).catch(() => null);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar o modulo de desenvolvimento.');
    } finally {
      setLoading(false);
    }
  };

  const loadPlan = async (planId: string, collaboratorId?: number | null) => {
    const [nextCompetences, nextObjectives, nextCheckpoints, nextFeedbacks, nextEvidences] = await Promise.all([
      rhJornadaService.fetchPdiCompetences(planId),
      rhJornadaService.fetchPdiObjectives(planId),
      rhJornadaService.fetchPdiCheckpoints(planId),
      rhJornadaService.fetchPdiFeedbacks(planId),
      rhJornadaService.fetchPdiEvidences(planId),
    ]);
    setCompetences(nextCompetences);
    setObjectives(nextObjectives);
    setCheckpoints(nextCheckpoints);
    setFeedbacks(nextFeedbacks);
    setEvidences(nextEvidences);
    if (collaboratorId) setAiInsight(await rhJornadaService.fetchJourneyAiInsights(collaboratorId, planId).catch(() => null));
  };

  const refresh = async () => {
    await loadBase();
    if (selectedPlanId) await loadPlan(selectedPlanId, selectedCollaboratorId);
  };

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => { setSelectedPlanId(filteredPlans[0]?.id || null); }, [selectedCollaboratorId, filteredPlans]);
  useEffect(() => {
    if (!selectedPlanId) {
      setCompetences([]);
      setObjectives([]);
      setCheckpoints([]);
      setFeedbacks([]);
      setEvidences([]);
      setAiInsight(null);
      return;
    }
    void loadPlan(selectedPlanId, selectedCollaboratorId).catch((err: any) => setError(err?.message || 'Nao foi possivel carregar o plano.'));
  }, [selectedPlanId, selectedCollaboratorId]);

  const resetPlanDraft = () => { setPlanDraft(emptyPlanDraft()); setEditingPlanId(null); };
  const resetCompetenceDraft = () => { setCompetenceDraft(emptyCompetenceDraft()); setEditingCompetenceId(null); };
  const resetObjectiveDraft = () => { setObjectiveDraft(emptyObjectiveDraft()); setEditingObjectiveId(null); };
  const resetCheckpointDraft = () => { setCheckpointDraft(emptyCheckpointDraft()); setEditingCheckpointId(null); };
  const resetFeedbackDraft = () => { setFeedbackDraft(emptyFeedbackDraft()); setEditingFeedbackId(null); };
  const resetEvidenceDraft = () => {
    setEvidenceDraft(emptyEvidenceDraft());
    setEditingEvidenceId(null);
    if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = '';
  };

  const runAction = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel concluir a operacao.');
    } finally {
      setSaving(false);
    }
  };

  const openEditPlan = (plan: RhPdiPlan) => {
    setEditingPlanId(plan.id);
    setPlanDraft({ templateId: '', title: plan.titulo, objectiveGeneral: plan.objetivo_geral || '', cycleId: plan.ciclo_id || '', endDate: plan.data_fim_prevista || undefined, status: plan.status, gestorUserId: plan.gestor_user_id || '', mentorUserId: plan.mentor_user_id || '' });
    setPlanModalOpen(true);
  };
  const openEditCompetence = (item: RhPdiCompetence) => {
    setEditingCompetenceId(item.id);
    setCompetenceDraft({ name: item.nome, category: item.categoria, currentLevel: String(item.nivel_atual), targetLevel: String(item.nivel_alvo), status: item.status });
    setCompetenceModalOpen(true);
  };
  const openEditObjective = (item: RhPdiObjective) => {
    setEditingObjectiveId(item.id);
    setObjectiveDraft({ competenceId: item.competencia_id || '', title: item.titulo, description: item.descricao || '', type: item.tipo, status: item.status, mandatory: item.obrigatorio, scoreWeight: String(item.score_peso || 10), startDate: item.data_inicio || undefined, limitDate: item.data_limite || undefined });
    setObjectiveModalOpen(true);
  };
  const openEditCheckpoint = (item: RhPdiCheckpoint) => {
    setEditingCheckpointId(item.id);
    setCheckpointDraft({ objectiveId: item.objetivo_id || '', title: item.titulo, type: item.tipo, status: item.status, responsibleUserId: item.responsavel_user_id || '', expectedDate: item.data_prevista || undefined, completedDate: item.data_realizada || undefined, notes: item.observacoes || '' });
    setCheckpointModalOpen(true);
  };
  const openEditFeedback = (item: RhPdiFeedback) => {
    setEditingFeedbackId(item.id);
    setFeedbackDraft({ checkpointId: item.checkpoint_id || '', type: item.tipo, summary: item.resumo, strengths: item.pontos_fortes || '', developmentGaps: item.pontos_desenvolver || '', score: item.nota != null ? String(item.nota) : '' });
    setFeedbackModalOpen(true);
  };
  const openEditEvidence = (item: RhPdiEvidence) => {
    setEditingEvidenceId(item.id);
    setEvidenceDraft({ objectiveId: item.objetivo_id || '', checkpointId: item.checkpoint_id || '', title: item.titulo, description: item.descricao || '', linkUrl: item.link_url || '', file: null });
    setEvidenceModalOpen(true);
  };

  const handleOpenEvidence = async (item: RhPdiEvidence) => {
    if (item.storage_path) {
      const url = await rhJornadaService.getDocumentSignedUrl(item.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.link_url) window.open(item.link_url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadBase} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">PDIs ativos</div><div className="mt-2 text-3xl font-black text-violet-300">{developmentCollaboratorsCount}</div><div className="mt-1 text-xs font-bold text-slate-400">Colaboradores ativos com plano em andamento</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Sem PDI</div><div className="mt-2 text-3xl font-black text-white">{withoutPlanCount}</div><div className="mt-1 text-xs font-bold text-slate-400">Base ativa sem plano em andamento</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Checkpoints criticos</div><div className="mt-2 text-3xl font-black text-amber-300">{health?.checkpoints_criticos || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Checkpoints vencidos ou em risco hoje</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Conquistas recentes</div><div className="mt-2 text-3xl font-black text-emerald-300">{health?.conquistas_recentes || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Reconhecimentos nos ultimos 30 dias</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Prontos p/ promocao</div><div className="mt-2 text-3xl font-black text-cyan-300">{health?.prontos_para_promocao || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Jornada forte sem bloqueios criticos</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Travados</div><div className="mt-2 text-3xl font-black text-rose-300">{health?.colaboradores_travados || 0}</div><div className="mt-1 text-xs font-bold text-slate-400">Com checkpoint critico pendente</div></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-violet-300" /><h3 className="text-white text-base font-black">Colaboradores ativos</h3></div>
          <div className="mb-4 text-sm font-bold text-slate-400">A lista mostra toda a base ativa. O card <span className="text-white">Sem PDI</span> usa esse mesmo universo.</div>
          <div className="space-y-3">
            {colaboradores.map((item) => {
              const active = item.id === selectedCollaboratorId;
              const journey = journeys[item.id];
              const count = plans.filter((plan) => plan.colaborador_id === item.id).length;
              return <button key={item.id} type="button" onClick={() => setSelectedCollaboratorId(item.id)} className={cn('w-full rounded-3xl border p-4 text-left transition-all', active ? 'border-violet-500/30 bg-violet-500/10' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50')}><div className="text-white font-black">{item.nome}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.funcao || 'Sem funcao'} • {journey?.etapa_atual || 'sem jornada'}</div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant={journey ? 'info' : 'default'}>{journey ? `${Math.round(journey.score_jornada)} pts` : '0 pts'}</Badge><div className="flex items-center gap-2"><Badge variant={count > 0 ? 'success' : 'default'}>{count > 0 ? 'Com PDI' : 'Sem PDI'}</Badge><span className="text-[11px] font-black text-slate-500">{count} plano(s)</span></div></div></button>;
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div><div className="text-white text-xl font-black">{selectedCollaborator?.nome || 'Selecione um colaborador'}</div><div className="mt-1 text-sm font-bold text-slate-400">{selectedCollaborator?.funcao || 'Sem funcao'} • Score {Math.round(selectedJourney?.score_jornada || 0)} pts</div></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { resetPlanDraft(); setPlanModalOpen(true); }} disabled={!selectedCollaborator || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedCollaborator || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}>Novo plano</button>
                <button type="button" onClick={() => selectedPlan && openEditPlan(selectedPlan)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700')}>Editar plano</button>
                <button type="button" onClick={() => { resetCompetenceDraft(); setCompetenceModalOpen(true); }} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')}>Competencia</button>
                <button type="button" onClick={() => { resetObjectiveDraft(); setObjectiveModalOpen(true); }} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500')}>Objetivo</button>
                <button type="button" onClick={() => { resetCheckpointDraft(); setCheckpointModalOpen(true); }} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500')}>Checkpoint</button>
                <button type="button" onClick={() => { resetFeedbackDraft(); setFeedbackModalOpen(true); }} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500')}>Feedback</button>
                <button type="button" onClick={() => { resetEvidenceDraft(); setEvidenceModalOpen(true); }} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500')}>Evidencia</button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <CustomSelect value={selectedPlanId || ''} onValueChange={setSelectedPlanId} options={[{ value: '', label: 'Selecione um plano' }, ...filteredPlans.map((item) => ({ value: item.id, label: `${item.titulo} • ${humanize(item.status)}` }))]} />
              <CustomSelect value={selectedPlan?.status || ''} onValueChange={(value) => { if (!selectedPlan) return; void runAction(async () => { await rhJornadaService.updatePdiPlan(selectedPlan.id, { status: value as RhPdiPlanStatus }); await refresh(); }); }} options={RH_PDI_PLAN_STATUSES.map((status) => ({ value: status, label: humanize(status) }))} disabled={!selectedPlan} />
            </div>
            {selectedPlan ? <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Plano selecionado</div><div className="mt-2 text-white font-black">{selectedPlan.titulo}</div><div className="mt-1 text-sm font-bold text-slate-400">{selectedPlan.template_nome || 'Plano manual'} • {humanize(selectedPlan.status)} • progresso {Math.round(selectedPlan.score_progresso || 0)}%</div>{selectedPlan.objetivo_geral ? <div className="mt-3 text-sm font-bold text-slate-300 leading-relaxed">{selectedPlan.objetivo_geral}</div> : null}</div> : null}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><Target className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Competencias</h3></div>
              <div className="space-y-3">
                {competences.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.nome}</div><div className="mt-1 text-xs font-bold text-slate-400">{humanize(item.categoria)} • atual {item.nivel_atual} / alvo {item.nivel_alvo}</div></div><Badge variant={item.status === 'consolidada' ? 'success' : item.status === 'em_desenvolvimento' ? 'info' : 'warning'}>{humanize(item.status)}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => openEditCompetence(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Editar</button><button type="button" onClick={() => void runAction(async () => { const confirmed = window.confirm(`Excluir a competencia \"${item.nome}\"?`); if (!confirmed) return; await rhJornadaService.deletePdiCompetence(item.id); await refresh(); })} className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Excluir</button></div></div>)}
                {competences.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma competencia mapeada ainda.</div> : null}
              </div>
            </Card>

            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><Goal className="w-4 h-4 text-sky-300" /><h3 className="text-white text-base font-black">Objetivos</h3></div>
              <div className="space-y-3">
                {objectives.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{humanize(item.tipo)} • {getCompetenceName(item.competencia_id)} • peso {item.score_peso}{item.data_limite ? ` • ${formatDate(item.data_limite)}` : ''}</div></div><Badge variant={item.status === 'concluido' ? 'success' : item.status === 'em_andamento' ? 'info' : item.status === 'atrasado' ? 'danger' : 'warning'}>{humanize(item.status)}</Badge></div>{item.descricao ? <div className="mt-2 text-sm font-bold text-slate-300">{item.descricao}</div> : null}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => openEditObjective(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Editar</button><button type="button" onClick={() => void runAction(async () => { const confirmed = window.confirm(`Excluir o objetivo \"${item.titulo}\"?`); if (!confirmed) return; await rhJornadaService.deletePdiObjective(item.id); await refresh(); })} className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Excluir</button></div></div>)}
                {objectives.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum objetivo criado ainda.</div> : null}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><ClipboardCheck className="w-4 h-4 text-amber-300" /><h3 className="text-white text-base font-black">Checkpoints</h3></div>
              <div className="space-y-3">
                {checkpoints.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{humanize(item.tipo)} • {formatDate(item.data_prevista)} • {getUserName(item.responsavel_user_id)}</div></div><Badge variant={item.status === 'realizado' ? 'success' : item.status === 'atrasado' ? 'danger' : item.status === 'cancelado' ? 'default' : 'warning'}>{humanize(item.status)}</Badge></div>{item.observacoes ? <div className="mt-2 text-sm font-bold text-slate-300">{item.observacoes}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{item.status !== 'realizado' ? <button type="button" onClick={() => void runAction(async () => { await rhJornadaService.updatePdiCheckpoint(item.id, { status: 'realizado', data_realizada: new Date().toISOString().slice(0, 10) }); await refresh(); })} className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all">Marcar realizado</button> : null}<button type="button" onClick={() => openEditCheckpoint(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Editar</button><button type="button" onClick={() => void runAction(async () => { const confirmed = window.confirm(`Excluir o checkpoint \"${item.titulo}\"?`); if (!confirmed) return; await rhJornadaService.deletePdiCheckpoint(item.id); await refresh(); })} className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Excluir</button></div></div>)}
                {checkpoints.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum checkpoint criado ainda.</div> : null}
              </div>
            </Card>

            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><BrainCircuit className="w-4 h-4 text-fuchsia-300" /><h3 className="text-white text-base font-black">IA da jornada</h3></div>
              {aiInsight ? <div className="space-y-4"><div className="text-sm font-bold text-slate-200 leading-relaxed">{aiInsight.resumo_executivo}</div><div className="grid grid-cols-1 gap-3"><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Destaques</div><div className="space-y-2">{aiInsight.destaques.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-emerald-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Riscos</div><div className="space-y-2">{aiInsight.riscos.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-amber-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Recomendacoes</div><div className="space-y-2">{aiInsight.recomendacoes.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-cyan-200">{item}</div>)}</div></div></div></div> : <div className="text-sm font-bold text-slate-500">Selecione um plano para gerar insights executivos da jornada.</div>}
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-emerald-300" /><h3 className="text-white text-base font-black">Feedbacks</h3></div>
              <div className="space-y-3">
                {feedbacks.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.resumo}</div><div className="mt-1 text-xs font-bold text-slate-400">{humanize(item.tipo)} • {getCheckpointName(item.checkpoint_id)}</div></div><Badge variant="info">{new Date(item.created_at).toLocaleDateString('pt-BR')}</Badge></div>{item.pontos_fortes ? <div className="mt-2 text-sm font-bold text-emerald-200">Fortes: {item.pontos_fortes}</div> : null}{item.pontos_desenvolver ? <div className="mt-1 text-sm font-bold text-amber-200">Desenvolver: {item.pontos_desenvolver}</div> : null}{item.nota != null ? <div className="mt-1 text-sm font-bold text-slate-300">Nota: {item.nota}</div> : null}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => openEditFeedback(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Editar</button><button type="button" onClick={() => void runAction(async () => { const confirmed = window.confirm('Excluir este feedback do PDI?'); if (!confirmed) return; await rhJornadaService.deletePdiFeedback(item.id); await refresh(); })} className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Excluir</button></div></div>)}
                {feedbacks.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum feedback registrado.</div> : null}
              </div>
            </Card>

            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-fuchsia-300" /><h3 className="text-white text-base font-black">Evidencias</h3></div>
              <div className="space-y-3">
                {evidences.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{humanize(item.tipo)} • {item.objetivo_id ? objectives.find((objective) => objective.id === item.objetivo_id)?.titulo || 'Sem objetivo' : 'Sem objetivo'}</div></div><Badge variant={item.storage_path ? 'info' : item.link_url ? 'purple' : 'default'}>{humanize(item.tipo)}</Badge></div>{item.descricao ? <div className="mt-2 text-sm font-bold text-slate-300">{item.descricao}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{(item.storage_path || item.link_url) ? <button type="button" onClick={() => void handleOpenEvidence(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all">Abrir</button> : null}<button type="button" onClick={() => openEditEvidence(item)} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Editar</button><button type="button" onClick={() => void runAction(async () => { const confirmed = window.confirm(`Excluir a evidencia \"${item.titulo}\"?`); if (!confirmed) return; await rhJornadaService.deletePdiEvidence(item.id); await refresh(); })} className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-black text-rose-200 hover:bg-rose-500/20 transition-all flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Excluir</button></div></div>)}
                {evidences.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma evidencia anexada.</div> : null}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={planModalOpen} onClose={() => { setPlanModalOpen(false); resetPlanDraft(); }} title={editingPlanId ? 'Editar plano de desenvolvimento' : 'Novo plano de desenvolvimento'} className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setPlanModalOpen(false); resetPlanDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || saving || (!planDraft.title.trim() && !planDraft.templateId)} onClick={() => void runAction(async () => { if (!selectedCollaborator) return; if (editingPlanId) { await rhJornadaService.updatePdiPlan(editingPlanId, { titulo: planDraft.title.trim(), objetivo_geral: planDraft.objectiveGeneral.trim() || null, ciclo_id: planDraft.cycleId || null, data_fim_prevista: planDraft.endDate || null, status: planDraft.status, gestor_user_id: planDraft.gestorUserId || null, mentor_user_id: planDraft.mentorUserId || null }); } else if (planDraft.templateId) { await rhJornadaService.instantiatePdiTemplate(planDraft.templateId, { colaboradorId: selectedCollaborator.id, jornadaId: selectedJourney?.id || null, cicloId: planDraft.cycleId || null, gestorUserId: planDraft.gestorUserId || null, mentorUserId: planDraft.mentorUserId || null, dataFimPrevista: planDraft.endDate || null }); } else { await rhJornadaService.createPdiPlan({ colaborador_id: selectedCollaborator.id, jornada_id: selectedJourney?.id || null, ciclo_id: planDraft.cycleId || null, titulo: planDraft.title.trim(), objetivo_geral: planDraft.objectiveGeneral.trim() || null, status: planDraft.status, gestor_user_id: planDraft.gestorUserId || null, mentor_user_id: planDraft.mentorUserId || null, data_inicio: new Date().toISOString().slice(0, 10), data_fim_prevista: planDraft.endDate || null }); } setPlanModalOpen(false); resetPlanDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedCollaborator || saving || (!planDraft.title.trim() && !planDraft.templateId) ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}><Save className="w-4 h-4 inline mr-2" />{editingPlanId ? 'Salvar alteracoes' : 'Salvar plano'}</button></div>}><div className="space-y-4">{!editingPlanId ? <CustomSelect value={planDraft.templateId} onValueChange={(value) => setPlanDraft((current) => ({ ...current, templateId: value }))} options={[{ value: '', label: 'Criar plano manual' }, ...templates.map((item) => ({ value: item.id, label: `${item.nome}${item.escopo_cargo ? ` • ${item.escopo_cargo}` : ''}` }))]} /> : null}<input value={planDraft.title} onChange={(event) => setPlanDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Titulo do plano" disabled={!editingPlanId && !!planDraft.templateId} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-50" /><textarea value={planDraft.objectiveGeneral} onChange={(event) => setPlanDraft((current) => ({ ...current, objectiveGeneral: event.target.value }))} rows={4} placeholder="Objetivo geral do plano" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={planDraft.cycleId} onValueChange={(value) => setPlanDraft((current) => ({ ...current, cycleId: value }))} options={[{ value: '', label: 'Sem ciclo especifico' }, ...cycles.map((item) => ({ value: item.id, label: item.nome }))]} /><CustomSelect value={planDraft.status} onValueChange={(value) => setPlanDraft((current) => ({ ...current, status: value as RhPdiPlanStatus }))} options={RH_PDI_PLAN_STATUSES.map((status) => ({ value: status, label: humanize(status) }))} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={planDraft.gestorUserId} onValueChange={(value) => setPlanDraft((current) => ({ ...current, gestorUserId: value }))} options={userOptions} /><CustomSelect value={planDraft.mentorUserId} onValueChange={(value) => setPlanDraft((current) => ({ ...current, mentorUserId: value }))} options={userOptions} /></div><DatePicker value={planDraft.endDate} onChange={(next) => setPlanDraft((current) => ({ ...current, endDate: next }))} /></div></Modal>

      <Modal isOpen={competenceModalOpen} onClose={() => { setCompetenceModalOpen(false); resetCompetenceDraft(); }} title={editingCompetenceId ? 'Editar competencia' : 'Nova competencia'} className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setCompetenceModalOpen(false); resetCompetenceDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !competenceDraft.name.trim()} onClick={() => void runAction(async () => { if (!selectedPlan) return; if (editingCompetenceId) { await rhJornadaService.updatePdiCompetence(editingCompetenceId, { nome: competenceDraft.name.trim(), categoria: competenceDraft.category, nivel_atual: parseNumber(competenceDraft.currentLevel, 1), nivel_alvo: parseNumber(competenceDraft.targetLevel, 3), status: competenceDraft.status }); } else { await rhJornadaService.createPdiCompetence({ plano_id: selectedPlan.id, nome: competenceDraft.name.trim(), categoria: competenceDraft.category, nivel_atual: parseNumber(competenceDraft.currentLevel, 1), nivel_alvo: parseNumber(competenceDraft.targetLevel, 3), status: competenceDraft.status, ordem: competences.length + 1 }); } setCompetenceModalOpen(false); resetCompetenceDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !competenceDraft.name.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')}>{editingCompetenceId ? 'Salvar alteracoes' : 'Salvar competencia'}</button></div>}><div className="space-y-4"><input value={competenceDraft.name} onChange={(event) => setCompetenceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da competencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><CustomSelect value={competenceDraft.category} onValueChange={(value) => setCompetenceDraft((current) => ({ ...current, category: value as RhPdiCompetenceCategory }))} options={RH_PDI_COMPETENCE_CATEGORIES.map((item) => ({ value: item, label: humanize(item) }))} /><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><input value={competenceDraft.currentLevel} onChange={(event) => setCompetenceDraft((current) => ({ ...current, currentLevel: event.target.value }))} placeholder="Nivel atual" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><input value={competenceDraft.targetLevel} onChange={(event) => setCompetenceDraft((current) => ({ ...current, targetLevel: event.target.value }))} placeholder="Nivel alvo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><CustomSelect value={competenceDraft.status} onValueChange={(value) => setCompetenceDraft((current) => ({ ...current, status: value as RhPdiCompetenceStatus }))} options={RH_PDI_COMPETENCE_STATUSES.map((item) => ({ value: item, label: humanize(item) }))} /></div></div></Modal>

      <Modal isOpen={objectiveModalOpen} onClose={() => { setObjectiveModalOpen(false); resetObjectiveDraft(); }} title={editingObjectiveId ? 'Editar objetivo do PDI' : 'Novo objetivo do PDI'} className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setObjectiveModalOpen(false); resetObjectiveDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !objectiveDraft.title.trim()} onClick={() => void runAction(async () => { if (!selectedPlan) return; if (editingObjectiveId) { await rhJornadaService.updatePdiObjective(editingObjectiveId, { competencia_id: objectiveDraft.competenceId || null, titulo: objectiveDraft.title.trim(), descricao: objectiveDraft.description.trim() || null, tipo: objectiveDraft.type, status: objectiveDraft.status, obrigatorio: objectiveDraft.mandatory, score_peso: parseNumber(objectiveDraft.scoreWeight, 10), data_inicio: objectiveDraft.startDate || null, data_limite: objectiveDraft.limitDate || null }); } else { await rhJornadaService.createPdiObjective({ plano_id: selectedPlan.id, competencia_id: objectiveDraft.competenceId || null, titulo: objectiveDraft.title.trim(), descricao: objectiveDraft.description.trim() || null, tipo: objectiveDraft.type, obrigatorio: objectiveDraft.mandatory, score_peso: parseNumber(objectiveDraft.scoreWeight, 10), data_inicio: objectiveDraft.startDate || null, data_limite: objectiveDraft.limitDate || null }); } setObjectiveModalOpen(false); resetObjectiveDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !objectiveDraft.title.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500')}>{editingObjectiveId ? 'Salvar alteracoes' : 'Salvar objetivo'}</button></div>}><div className="space-y-4"><input value={objectiveDraft.title} onChange={(event) => setObjectiveDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Titulo do objetivo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><textarea value={objectiveDraft.description} onChange={(event) => setObjectiveDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Descricao operacional do objetivo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={objectiveDraft.type} onValueChange={(value) => setObjectiveDraft((current) => ({ ...current, type: value as RhPdiObjectiveType }))} options={RH_PDI_OBJECTIVE_TYPES.map((item) => ({ value: item, label: humanize(item) }))} /><CustomSelect value={objectiveDraft.status} onValueChange={(value) => setObjectiveDraft((current) => ({ ...current, status: value as RhPdiObjectiveStatus }))} options={RH_PDI_OBJECTIVE_STATUSES.map((item) => ({ value: item, label: humanize(item) }))} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={objectiveDraft.competenceId} onValueChange={(value) => setObjectiveDraft((current) => ({ ...current, competenceId: value }))} options={competenceOptions} /><input value={objectiveDraft.scoreWeight} onChange={(event) => setObjectiveDraft((current) => ({ ...current, scoreWeight: event.target.value }))} placeholder="Peso do objetivo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><DatePicker value={objectiveDraft.startDate} onChange={(next) => setObjectiveDraft((current) => ({ ...current, startDate: next }))} /><DatePicker value={objectiveDraft.limitDate} onChange={(next) => setObjectiveDraft((current) => ({ ...current, limitDate: next }))} /></div><label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/30 px-4 py-3 text-sm font-bold text-slate-200"><input type="checkbox" checked={objectiveDraft.mandatory} onChange={(event) => setObjectiveDraft((current) => ({ ...current, mandatory: event.target.checked }))} className="rounded border-slate-600 bg-slate-950 text-violet-500 focus:ring-violet-500/40" />Objetivo obrigatorio</label></div></Modal>

      <Modal isOpen={checkpointModalOpen} onClose={() => { setCheckpointModalOpen(false); resetCheckpointDraft(); }} title={editingCheckpointId ? 'Editar checkpoint' : 'Novo checkpoint'} className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setCheckpointModalOpen(false); resetCheckpointDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !checkpointDraft.title.trim() || !checkpointDraft.expectedDate} onClick={() => void runAction(async () => { if (!selectedPlan || !checkpointDraft.expectedDate) return; if (editingCheckpointId) { await rhJornadaService.updatePdiCheckpointDetails(editingCheckpointId, { objetivo_id: checkpointDraft.objectiveId || null, titulo: checkpointDraft.title.trim(), tipo: checkpointDraft.type, status: checkpointDraft.status, responsavel_user_id: checkpointDraft.responsibleUserId || null, data_prevista: checkpointDraft.expectedDate, data_realizada: checkpointDraft.completedDate || null, observacoes: checkpointDraft.notes.trim() || null }); } else { await rhJornadaService.createPdiCheckpoint({ plano_id: selectedPlan.id, objetivo_id: checkpointDraft.objectiveId || null, titulo: checkpointDraft.title.trim(), tipo: checkpointDraft.type, responsavel_user_id: checkpointDraft.responsibleUserId || null, data_prevista: checkpointDraft.expectedDate, observacoes: checkpointDraft.notes.trim() || null }); } setCheckpointModalOpen(false); resetCheckpointDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !checkpointDraft.title.trim() || !checkpointDraft.expectedDate ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500')}>{editingCheckpointId ? 'Salvar alteracoes' : 'Salvar checkpoint'}</button></div>}><div className="space-y-4"><input value={checkpointDraft.title} onChange={(event) => setCheckpointDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Titulo do checkpoint" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={checkpointDraft.type} onValueChange={(value) => setCheckpointDraft((current) => ({ ...current, type: value as RhPdiCheckpointType }))} options={RH_PDI_CHECKPOINT_TYPES.map((item) => ({ value: item, label: humanize(item) }))} /><CustomSelect value={checkpointDraft.status} onValueChange={(value) => setCheckpointDraft((current) => ({ ...current, status: value as RhPdiCheckpointStatus }))} options={RH_PDI_CHECKPOINT_STATUSES.map((item) => ({ value: item, label: humanize(item) }))} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={checkpointDraft.objectiveId} onValueChange={(value) => setCheckpointDraft((current) => ({ ...current, objectiveId: value }))} options={objectiveOptions} /><CustomSelect value={checkpointDraft.responsibleUserId} onValueChange={(value) => setCheckpointDraft((current) => ({ ...current, responsibleUserId: value }))} options={userOptions} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><DatePicker value={checkpointDraft.expectedDate} onChange={(next) => setCheckpointDraft((current) => ({ ...current, expectedDate: next }))} /><DatePicker value={checkpointDraft.completedDate} onChange={(next) => setCheckpointDraft((current) => ({ ...current, completedDate: next }))} /></div><textarea value={checkpointDraft.notes} onChange={(event) => setCheckpointDraft((current) => ({ ...current, notes: event.target.value }))} rows={4} placeholder="Observacoes, combinados e contexto do checkpoint" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /></div></Modal>

      <Modal isOpen={feedbackModalOpen} onClose={() => { setFeedbackModalOpen(false); resetFeedbackDraft(); }} title={editingFeedbackId ? 'Editar feedback' : 'Novo feedback'} className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setFeedbackModalOpen(false); resetFeedbackDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !feedbackDraft.summary.trim()} onClick={() => void runAction(async () => { if (!selectedPlan) return; if (editingFeedbackId) { await rhJornadaService.updatePdiFeedback(editingFeedbackId, { checkpoint_id: feedbackDraft.checkpointId || null, tipo: feedbackDraft.type, resumo: feedbackDraft.summary.trim(), pontos_fortes: feedbackDraft.strengths.trim() || null, pontos_desenvolver: feedbackDraft.developmentGaps.trim() || null, nota: feedbackDraft.score ? parseNumber(feedbackDraft.score) : null }); } else { await rhJornadaService.createPdiFeedback({ plano_id: selectedPlan.id, checkpoint_id: feedbackDraft.checkpointId || null, tipo: feedbackDraft.type, resumo: feedbackDraft.summary.trim(), pontos_fortes: feedbackDraft.strengths.trim() || null, pontos_desenvolver: feedbackDraft.developmentGaps.trim() || null, nota: feedbackDraft.score ? parseNumber(feedbackDraft.score) : null }); } setFeedbackModalOpen(false); resetFeedbackDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !feedbackDraft.summary.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500')}>{editingFeedbackId ? 'Salvar alteracoes' : 'Salvar feedback'}</button></div>}><div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={feedbackDraft.type} onValueChange={(value) => setFeedbackDraft((current) => ({ ...current, type: value as RhPdiFeedbackType }))} options={RH_PDI_FEEDBACK_TYPES.map((item) => ({ value: item, label: humanize(item) }))} /><CustomSelect value={feedbackDraft.checkpointId} onValueChange={(value) => setFeedbackDraft((current) => ({ ...current, checkpointId: value }))} options={checkpointOptions} /></div><textarea value={feedbackDraft.summary} onChange={(event) => setFeedbackDraft((current) => ({ ...current, summary: event.target.value }))} rows={3} placeholder="Resumo do feedback" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><textarea value={feedbackDraft.strengths} onChange={(event) => setFeedbackDraft((current) => ({ ...current, strengths: event.target.value }))} rows={3} placeholder="Pontos fortes" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><textarea value={feedbackDraft.developmentGaps} onChange={(event) => setFeedbackDraft((current) => ({ ...current, developmentGaps: event.target.value }))} rows={3} placeholder="Pontos a desenvolver" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><input value={feedbackDraft.score} onChange={(event) => setFeedbackDraft((current) => ({ ...current, score: event.target.value }))} placeholder="Nota opcional" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></Modal>

      <Modal isOpen={evidenceModalOpen} onClose={() => { setEvidenceModalOpen(false); resetEvidenceDraft(); }} title={editingEvidenceId ? 'Editar evidencia' : 'Nova evidencia'} className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setEvidenceModalOpen(false); resetEvidenceDraft(); }} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !evidenceDraft.title.trim()} onClick={() => void runAction(async () => { if (!selectedPlan) return; if (editingEvidenceId) { await rhJornadaService.updatePdiEvidence(editingEvidenceId, { objetivo_id: evidenceDraft.objectiveId || null, checkpoint_id: evidenceDraft.checkpointId || null, titulo: evidenceDraft.title.trim(), descricao: evidenceDraft.description.trim() || null, link_url: evidenceDraft.linkUrl.trim() || null }, evidenceDraft.file); } else { await rhJornadaService.createPdiEvidence({ plano_id: selectedPlan.id, objetivo_id: evidenceDraft.objectiveId || null, checkpoint_id: evidenceDraft.checkpointId || null, tipo: evidenceDraft.file ? 'arquivo' : evidenceDraft.linkUrl.trim() ? 'link' : 'texto', titulo: evidenceDraft.title.trim(), descricao: evidenceDraft.description.trim() || null, link_url: evidenceDraft.linkUrl.trim() || null }, evidenceDraft.file); } setEvidenceModalOpen(false); resetEvidenceDraft(); await refresh(); })} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !evidenceDraft.title.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500')}>{editingEvidenceId ? 'Salvar alteracoes' : 'Salvar evidencia'}</button></div>}><div className="space-y-4"><input value={evidenceDraft.title} onChange={(event) => setEvidenceDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Titulo da evidencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><CustomSelect value={evidenceDraft.objectiveId} onValueChange={(value) => setEvidenceDraft((current) => ({ ...current, objectiveId: value }))} options={objectiveOptions} /><CustomSelect value={evidenceDraft.checkpointId} onValueChange={(value) => setEvidenceDraft((current) => ({ ...current, checkpointId: value }))} options={checkpointOptions} /></div><input value={evidenceDraft.linkUrl} onChange={(event) => setEvidenceDraft((current) => ({ ...current, linkUrl: event.target.value }))} placeholder="Link opcional" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><textarea value={evidenceDraft.description} onChange={(event) => setEvidenceDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Descricao da evidencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><button type="button" onClick={() => evidenceFileInputRef.current?.click()} className="px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black flex items-center gap-2"><BadgeCheck className="w-4 h-4" />{evidenceDraft.file ? evidenceDraft.file.name : editingEvidenceId ? 'Selecionar novo arquivo opcional' : 'Selecionar arquivo opcional'}</button></div></Modal>

      <input ref={evidenceFileInputRef} type="file" className="hidden" onChange={(event) => setEvidenceDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} />
    </div>
  );
};
