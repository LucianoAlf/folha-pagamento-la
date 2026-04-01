import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, BrainCircuit, ClipboardCheck, FileText, Goal, MessageSquare, Sparkles, Target } from 'lucide-react';
import { Badge, Card, CustomSelect, DatePicker, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { cn } from '../../CollaboratorComponents';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { Colaborador } from '../../../types';
import type { RhCollaboratorJourney, RhDevelopmentHealthSnapshot, RhJourneyAiInsight, RhPdiCheckpoint, RhPdiCompetence, RhPdiCycle, RhPdiEvidence, RhPdiFeedback, RhPdiObjective, RhPdiPlan, RhPdiTemplate } from '../../../types/rh';
import { RH_PDI_CHECKPOINT_STATUSES, RH_PDI_CHECKPOINT_TYPES, RH_PDI_COMPETENCE_CATEGORIES, RH_PDI_COMPETENCE_STATUSES, RH_PDI_FEEDBACK_TYPES, RH_PDI_OBJECTIVE_STATUSES, RH_PDI_OBJECTIVE_TYPES } from '../../../types/rh';

export const DesenvolvimentoTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
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
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createCompetenceOpen, setCreateCompetenceOpen] = useState(false);
  const [createObjectiveOpen, setCreateObjectiveOpen] = useState(false);
  const [createCheckpointOpen, setCreateCheckpointOpen] = useState(false);
  const [createFeedbackOpen, setCreateFeedbackOpen] = useState(false);
  const [createEvidenceOpen, setCreateEvidenceOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planTemplateId, setPlanTemplateId] = useState('');
  const [planCycleId, setPlanCycleId] = useState('');
  const [planEnd, setPlanEnd] = useState<string | undefined>(undefined);
  const [competenceName, setCompetenceName] = useState('');
  const [competenceCategory, setCompetenceCategory] = useState(RH_PDI_COMPETENCE_CATEGORIES[0]);
  const [competenceLevel, setCompetenceLevel] = useState('3');
  const [objectiveTitle, setObjectiveTitle] = useState('');
  const [objectiveType, setObjectiveType] = useState(RH_PDI_OBJECTIVE_TYPES[0]);
  const [objectiveCompetenceId, setObjectiveCompetenceId] = useState('');
  const [objectiveLimit, setObjectiveLimit] = useState<string | undefined>(undefined);
  const [checkpointTitle, setCheckpointTitle] = useState('');
  const [checkpointType, setCheckpointType] = useState(RH_PDI_CHECKPOINT_TYPES[0]);
  const [checkpointDate, setCheckpointDate] = useState<string | undefined>(new Date().toISOString().slice(0, 10));
  const [feedbackType, setFeedbackType] = useState(RH_PDI_FEEDBACK_TYPES[0]);
  const [feedbackResumo, setFeedbackResumo] = useState('');
  const [feedbackStrengths, setFeedbackStrengths] = useState('');
  const [feedbackGaps, setFeedbackGaps] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCollaborator = useMemo(() => colaboradores.find((item) => item.id === selectedCollaboratorId) || null, [colaboradores, selectedCollaboratorId]);
  const selectedJourney = selectedCollaboratorId ? journeys[selectedCollaboratorId] || null : null;
  const filteredPlans = useMemo(() => plans.filter((item) => item.colaborador_id === selectedCollaboratorId), [plans, selectedCollaboratorId]);
  const selectedPlan = useMemo(() => filteredPlans.find((item) => item.id === selectedPlanId) || null, [filteredPlans, selectedPlanId]);

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextColaboradores, nextCycles, journeySummaries, nextPlans, nextTemplates, nextHealth] = await Promise.all([
        rhJornadaService.fetchColaboradores(),
        rhJornadaService.fetchPdiCycles(),
        rhJornadaService.fetchCollaboratorJourneys(),
        rhJornadaService.fetchPdiPlans(),
        rhJornadaService.fetchPdiTemplates(),
        rhJornadaService.fetchDevelopmentHealthSnapshot(),
      ]);
      const activeColaboradores = nextColaboradores.filter((item) => item.ativo);
      setColaboradores(activeColaboradores);
      setCycles(nextCycles);
      setPlans(nextPlans);
      setTemplates(nextTemplates.filter((item) => item.ativo));
      setHealth(nextHealth);
      setSelectedCollaboratorId((current) => current || activeColaboradores[0]?.id || null);
      const journeyMap: Record<number, RhCollaboratorJourney | null> = {};
      journeySummaries.forEach((item) => { journeyMap[item.colaborador_id] = item; });
      setJourneys(journeyMap);
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

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => { if (selectedCollaboratorId) setSelectedPlanId(filteredPlans[0]?.id || null); }, [selectedCollaboratorId, filteredPlans]);
  useEffect(() => {
    if (selectedPlanId) void loadPlan(selectedPlanId, selectedCollaboratorId).catch((err: any) => setError(err?.message || 'Nao foi possivel carregar o plano.'));
    else { setCompetences([]); setObjectives([]); setCheckpoints([]); setFeedbacks([]); setEvidences([]); setAiInsight(null); }
  }, [selectedPlanId, selectedCollaboratorId]);

  const refresh = async () => {
    await loadBase();
    if (selectedPlanId) await loadPlan(selectedPlanId, selectedCollaboratorId);
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadBase} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">PDIs ativos</div><div className="mt-2 text-3xl font-black text-violet-300">{health?.colaboradores_em_desenvolvimento || 0}</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Sem PDI</div><div className="mt-2 text-3xl font-black text-white">{health?.colaboradores_sem_pdi || 0}</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Checkpoints criticos</div><div className="mt-2 text-3xl font-black text-amber-300">{health?.checkpoints_criticos || 0}</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Conquistas recentes</div><div className="mt-2 text-3xl font-black text-emerald-300">{health?.conquistas_recentes || 0}</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Prontos p/ promocao</div><div className="mt-2 text-3xl font-black text-cyan-300">{health?.prontos_para_promocao || 0}</div></Card>
        <Card className="p-5 border border-slate-700/50"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Travados</div><div className="mt-2 text-3xl font-black text-rose-300">{health?.colaboradores_travados || 0}</div></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-violet-300" /><h3 className="text-white text-base font-black">Colaboradores em desenvolvimento</h3></div>
          <div className="space-y-3">
            {colaboradores.map((item) => { const active = item.id === selectedCollaboratorId; const journey = journeys[item.id]; const count = plans.filter((plan) => plan.colaborador_id === item.id).length; return <button key={item.id} type="button" onClick={() => setSelectedCollaboratorId(item.id)} className={cn('w-full rounded-3xl border p-4 text-left transition-all', active ? 'border-violet-500/30 bg-violet-500/10' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50')}><div className="text-white font-black">{item.nome}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.funcao || 'Sem funcao'} • {journey?.etapa_atual || 'sem jornada'}</div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant={journey ? 'info' : 'default'}>{journey ? `${Math.round(journey.score_jornada)} pts` : '0 pts'}</Badge><span className="text-[11px] font-black text-slate-500">{count} plano(s)</span></div></button>; })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div><div className="text-white text-xl font-black">{selectedCollaborator?.nome || 'Selecione um colaborador'}</div><div className="mt-1 text-sm font-bold text-slate-400">{selectedCollaborator?.funcao || 'Sem funcao'} • Score {Math.round(selectedJourney?.score_jornada || 0)} pts</div></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCreatePlanOpen(true)} disabled={!selectedCollaborator || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedCollaborator || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}>Novo plano</button>
                <button type="button" onClick={() => setCreateCompetenceOpen(true)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')}>Competencia</button>
                <button type="button" onClick={() => setCreateObjectiveOpen(true)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500')}>Objetivo</button>
                <button type="button" onClick={() => setCreateCheckpointOpen(true)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500')}>Checkpoint</button>
                <button type="button" onClick={() => setCreateFeedbackOpen(true)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500')}>Feedback</button>
                <button type="button" onClick={() => setCreateEvidenceOpen(true)} disabled={!selectedPlan || saving} className={cn('px-4 py-2.5 rounded-2xl font-black text-white', !selectedPlan || saving ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500')}>Evidencia</button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <CustomSelect value={selectedPlanId || ''} onValueChange={setSelectedPlanId} options={[{ value: '', label: 'Selecione um plano' }, ...filteredPlans.map((item) => ({ value: item.id, label: `${item.titulo} • ${item.status}` }))]} />
              <CustomSelect value={planTemplateId} onValueChange={setPlanTemplateId} options={[{ value: '', label: 'Plano manual ou selecione um template' }, ...templates.map((item) => ({ value: item.id, label: `${item.nome}${item.escopo_cargo ? ` • ${item.escopo_cargo}` : ''}` }))]} />
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><Target className="w-4 h-4 text-cyan-300" /><h3 className="text-white text-base font-black">Competencias</h3></div><div className="space-y-3">{competences.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.nome}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.categoria} • atual {item.nivel_atual} / alvo {item.nivel_alvo}</div></div><CustomSelect value={item.status} onValueChange={async (value) => { await rhJornadaService.updatePdiCompetence(item.id, { status: value as RhPdiCompetence['status'] }); if (selectedPlanId) await loadPlan(selectedPlanId, selectedCollaboratorId); }} options={RH_PDI_COMPETENCE_STATUSES.map((status) => ({ value: status, label: status }))} className="max-w-[220px]" /></div></div>)}{competences.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma competencia mapeada ainda.</div> : null}</div></Card>
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><Goal className="w-4 h-4 text-sky-300" /><h3 className="text-white text-base font-black">Objetivos</h3></div><div className="space-y-3">{objectives.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.tipo} • peso {item.score_peso}{item.data_limite ? ` • ${new Date(`${item.data_limite}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}</div></div><CustomSelect value={item.status} onValueChange={async (value) => { await rhJornadaService.updatePdiObjectiveStatus(item.id, value as RhPdiObjective['status']); await refresh(); }} options={RH_PDI_OBJECTIVE_STATUSES.map((status) => ({ value: status, label: status }))} className="max-w-[190px]" /></div></div>)}{objectives.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum objetivo criado ainda.</div> : null}</div></Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><ClipboardCheck className="w-4 h-4 text-amber-300" /><h3 className="text-white text-base font-black">Checkpoints</h3></div><div className="space-y-3">{checkpoints.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.tipo} • {new Date(`${item.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')}</div></div><Badge variant={item.status === 'realizado' ? 'success' : item.status === 'atrasado' ? 'danger' : 'warning'}>{item.status}</Badge></div>{item.status !== 'realizado' ? <div className="mt-3 flex gap-2"><button type="button" onClick={async () => { await rhJornadaService.updatePdiCheckpoint(item.id, { status: 'realizado', data_realizada: new Date().toISOString().slice(0, 10) }); await refresh(); }} className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all">Marcar realizado</button><CustomSelect value={item.status} onValueChange={async (value) => { await rhJornadaService.updatePdiCheckpoint(item.id, { status: value as RhPdiCheckpoint['status'] }); await refresh(); }} options={RH_PDI_CHECKPOINT_STATUSES.map((status) => ({ value: status, label: status }))} className="max-w-[180px]" /></div> : null}</div>)}{checkpoints.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum checkpoint criado ainda.</div> : null}</div></Card>
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><BrainCircuit className="w-4 h-4 text-fuchsia-300" /><h3 className="text-white text-base font-black">IA da jornada</h3></div>{aiInsight ? <div className="space-y-4"><div className="text-sm font-bold text-slate-200 leading-relaxed">{aiInsight.resumo_executivo}</div><div className="grid grid-cols-1 gap-3"><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Destaques</div><div className="space-y-2">{aiInsight.destaques.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-emerald-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Riscos</div><div className="space-y-2">{aiInsight.riscos.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-amber-200">{item}</div>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Recomendacoes</div><div className="space-y-2">{aiInsight.recomendacoes.map((item, index) => <div key={`${item}-${index}`} className="text-sm font-bold text-cyan-200">{item}</div>)}</div></div></div></div> : <div className="text-sm font-bold text-slate-500">Selecione um plano para gerar insights executivos da jornada.</div>}</Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-emerald-300" /><h3 className="text-white text-base font-black">Feedbacks</h3></div><div className="space-y-3">{feedbacks.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.resumo}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.tipo}</div></div><Badge variant="info">{new Date(item.created_at).toLocaleDateString('pt-BR')}</Badge></div>{item.pontos_fortes ? <div className="mt-2 text-sm font-bold text-emerald-200">Fortes: {item.pontos_fortes}</div> : null}{item.pontos_desenvolver ? <div className="mt-1 text-sm font-bold text-amber-200">Desenvolver: {item.pontos_desenvolver}</div> : null}</div>)}{feedbacks.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum feedback registrado.</div> : null}</div></Card>
            <Card className="p-5 border border-slate-700/50"><div className="flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-fuchsia-300" /><h3 className="text-white text-base font-black">Evidencias</h3></div><div className="space-y-3">{evidences.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-white font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.tipo}</div></div>{item.storage_path ? <button type="button" onClick={async () => { const url = await rhJornadaService.getDocumentSignedUrl(item.storage_path!); window.open(url, '_blank', 'noopener,noreferrer'); }} className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-black text-slate-300 hover:bg-slate-900/70 transition-all">Abrir</button> : null}</div>{item.descricao ? <div className="mt-2 text-sm font-bold text-slate-300">{item.descricao}</div> : null}</div>)}{evidences.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma evidencia anexada.</div> : null}</div></Card>
          </div>
        </div>
      </div>

      <Modal isOpen={createPlanOpen} onClose={() => setCreatePlanOpen(false)} title="Novo plano de desenvolvimento" className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreatePlanOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || saving || (!planTitle.trim() && !planTemplateId)} onClick={async () => { if (!selectedCollaborator) return; setSaving(true); try { let created: RhPdiPlan; if (planTemplateId) { created = await rhJornadaService.instantiatePdiTemplate(planTemplateId, { colaboradorId: selectedCollaborator.id, jornadaId: selectedJourney?.id || null, cicloId: planCycleId || null, dataFimPrevista: planEnd || null }); } else { created = await rhJornadaService.createPdiPlan({ colaborador_id: selectedCollaborator.id, jornada_id: selectedJourney?.id || null, ciclo_id: planCycleId || null, titulo: planTitle.trim(), data_inicio: new Date().toISOString().slice(0, 10), data_fim_prevista: planEnd || null }); } setPlans((current) => [created, ...current]); setSelectedPlanId(created.id); setCreatePlanOpen(false); setPlanTitle(''); setPlanTemplateId(''); setPlanCycleId(''); setPlanEnd(undefined); await refresh(); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedCollaborator || saving || (!planTitle.trim() && !planTemplateId) ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500')}>Salvar plano</button></div>}><div className="space-y-4"><CustomSelect value={planTemplateId} onValueChange={setPlanTemplateId} options={[{ value: '', label: 'Criar plano manual' }, ...templates.map((item) => ({ value: item.id, label: `${item.nome}${item.escopo_cargo ? ` • ${item.escopo_cargo}` : ''}` }))]} /><input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="Titulo do plano manual" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" disabled={!!planTemplateId} /><CustomSelect value={planCycleId} onValueChange={setPlanCycleId} options={[{ value: '', label: 'Sem ciclo especifico' }, ...cycles.map((item) => ({ value: item.id, label: item.nome }))]} /><DatePicker value={planEnd} onChange={setPlanEnd} /></div></Modal>

      <Modal isOpen={createCompetenceOpen} onClose={() => setCreateCompetenceOpen(false)} title="Nova competencia" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreateCompetenceOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !competenceName.trim()} onClick={async () => { if (!selectedPlan) return; setSaving(true); try { await rhJornadaService.createPdiCompetence({ plano_id: selectedPlan.id, nome: competenceName.trim(), categoria: competenceCategory, nivel_atual: 1, nivel_alvo: Number(competenceLevel || 3), status: 'pendente', ordem: competences.length + 1 }); await refresh(); setCreateCompetenceOpen(false); setCompetenceName(''); setCompetenceLevel('3'); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !competenceName.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500')}>Salvar competencia</button></div>}><div className="space-y-4"><input value={competenceName} onChange={(e) => setCompetenceName(e.target.value)} placeholder="Nome da competencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><CustomSelect value={competenceCategory} onValueChange={(value) => setCompetenceCategory(value as typeof competenceCategory)} options={RH_PDI_COMPETENCE_CATEGORIES.map((item) => ({ value: item, label: item }))} /><input value={competenceLevel} onChange={(e) => setCompetenceLevel(e.target.value)} placeholder="Nivel alvo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></Modal>

      <Modal isOpen={createObjectiveOpen} onClose={() => setCreateObjectiveOpen(false)} title="Novo objetivo do PDI" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreateObjectiveOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !objectiveTitle.trim()} onClick={async () => { if (!selectedPlan) return; setSaving(true); try { await rhJornadaService.createPdiObjective({ plano_id: selectedPlan.id, competencia_id: objectiveCompetenceId || null, titulo: objectiveTitle.trim(), tipo: objectiveType, data_limite: objectiveLimit || null }); await refresh(); setCreateObjectiveOpen(false); setObjectiveTitle(''); setObjectiveCompetenceId(''); setObjectiveLimit(undefined); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !objectiveTitle.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500')}>Salvar objetivo</button></div>}><div className="space-y-4"><input value={objectiveTitle} onChange={(e) => setObjectiveTitle(e.target.value)} placeholder="Titulo do objetivo" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><CustomSelect value={objectiveType} onValueChange={(value) => setObjectiveType(value as typeof objectiveType)} options={RH_PDI_OBJECTIVE_TYPES.map((item) => ({ value: item, label: item }))} /><CustomSelect value={objectiveCompetenceId} onValueChange={setObjectiveCompetenceId} options={[{ value: '', label: 'Sem competencia vinculada' }, ...competences.map((item) => ({ value: item.id, label: item.nome }))]} /><DatePicker value={objectiveLimit} onChange={setObjectiveLimit} /></div></Modal>

      <Modal isOpen={createCheckpointOpen} onClose={() => setCreateCheckpointOpen(false)} title="Novo checkpoint" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreateCheckpointOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !checkpointTitle.trim() || !checkpointDate} onClick={async () => { if (!selectedPlan || !checkpointDate) return; setSaving(true); try { await rhJornadaService.createPdiCheckpoint({ plano_id: selectedPlan.id, titulo: checkpointTitle.trim(), tipo: checkpointType, data_prevista: checkpointDate }); await refresh(); setCreateCheckpointOpen(false); setCheckpointTitle(''); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !checkpointTitle.trim() || !checkpointDate ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500')}>Salvar checkpoint</button></div>}><div className="space-y-4"><input value={checkpointTitle} onChange={(e) => setCheckpointTitle(e.target.value)} placeholder="Titulo do checkpoint" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><CustomSelect value={checkpointType} onValueChange={(value) => setCheckpointType(value as typeof checkpointType)} options={RH_PDI_CHECKPOINT_TYPES.map((item) => ({ value: item, label: item }))} /><DatePicker value={checkpointDate} onChange={setCheckpointDate} /></div></Modal>

      <Modal isOpen={createFeedbackOpen} onClose={() => setCreateFeedbackOpen(false)} title="Novo feedback" className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreateFeedbackOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !feedbackResumo.trim()} onClick={async () => { if (!selectedPlan) return; setSaving(true); try { await rhJornadaService.createPdiFeedback({ plano_id: selectedPlan.id, tipo: feedbackType, resumo: feedbackResumo.trim(), pontos_fortes: feedbackStrengths.trim() || null, pontos_desenvolver: feedbackGaps.trim() || null }); await refresh(); setCreateFeedbackOpen(false); setFeedbackResumo(''); setFeedbackStrengths(''); setFeedbackGaps(''); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !feedbackResumo.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500')}>Salvar feedback</button></div>}><div className="space-y-4"><CustomSelect value={feedbackType} onValueChange={(value) => setFeedbackType(value as typeof feedbackType)} options={RH_PDI_FEEDBACK_TYPES.map((item) => ({ value: item, label: item }))} /><textarea value={feedbackResumo} onChange={(e) => setFeedbackResumo(e.target.value)} rows={3} placeholder="Resumo do feedback" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><textarea value={feedbackStrengths} onChange={(e) => setFeedbackStrengths(e.target.value)} rows={3} placeholder="Pontos fortes" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><textarea value={feedbackGaps} onChange={(e) => setFeedbackGaps(e.target.value)} rows={3} placeholder="Pontos a desenvolver" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /></div></Modal>

      <Modal isOpen={createEvidenceOpen} onClose={() => setCreateEvidenceOpen(false)} title="Nova evidencia" className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setCreateEvidenceOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black">Cancelar</button><button type="button" disabled={!selectedPlan || saving || !evidenceTitle.trim()} onClick={async () => { if (!selectedPlan) return; setSaving(true); try { await rhJornadaService.createPdiEvidence({ plano_id: selectedPlan.id, tipo: evidenceFile ? 'arquivo' : evidenceLink ? 'link' : 'texto', titulo: evidenceTitle.trim(), descricao: evidenceDescription.trim() || null, link_url: evidenceLink.trim() || null }, evidenceFile); await refresh(); setCreateEvidenceOpen(false); setEvidenceTitle(''); setEvidenceDescription(''); setEvidenceLink(''); setEvidenceFile(null); } finally { setSaving(false); } }} className={cn('px-6 py-3 rounded-2xl font-black text-white', !selectedPlan || saving || !evidenceTitle.trim() ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500')}>Salvar evidencia</button></div>}><div className="space-y-4"><input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder="Titulo da evidencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><input value={evidenceLink} onChange={(e) => setEvidenceLink(e.target.value)} placeholder="Link opcional" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /><textarea value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} rows={4} placeholder="Descricao da evidencia" className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" /><button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black flex items-center gap-2"><BadgeCheck className="w-4 h-4" />{evidenceFile ? evidenceFile.name : 'Selecionar arquivo opcional'}</button></div></Modal>

      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
    </div>
  );
};
