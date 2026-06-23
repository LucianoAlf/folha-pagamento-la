import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Briefcase, FileBadge, Milestone, Plus, Route, TrendingUp, UploadCloud, Users } from 'lucide-react';
import { Badge, Card, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { cn } from '../../CollaboratorComponents';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { Colaborador } from '../../../types';
import type { RhCollaboratorAchievement, RhCollaboratorDocument, RhCollaboratorDocumentCategory, RhCollaboratorJourney, RhCollaboratorJourneySummary, RhCollaboratorMilestone, RhCareerLevel, RhCareerMovement, RhPdiBadge, RhPdiPlan } from '../../../types/rh';
import { RH_COLLAB_DOC_CATEGORIES, RH_MILESTONE_TYPES } from '../../../types/rh';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { RH_KPI_GRID_CLASS, RhKpiCard } from '../RhKpiCard';

const DOC_CATEGORY_OPTIONS = RH_COLLAB_DOC_CATEGORIES.map((value) => ({ value, label: value.replace(/_/g, ' ') }));
const MILESTONE_OPTIONS = RH_MILESTONE_TYPES.map((value) => ({ value, label: value.replace(/_/g, ' ') }));

type DocDraft = { categoria: RhCollaboratorDocumentCategory; titulo: string; tipo_documento: string; observacao: string; file: File | null };
const emptyDocDraft: DocDraft = { categoria: 'pessoal', titulo: '', tipo_documento: '', observacao: '', file: null };

export const ColaboradoresTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [journeys, setJourneys] = useState<RhCollaboratorJourneySummary[]>([]);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<RhCollaboratorJourney | null>(null);
  const [documents, setDocuments] = useState<RhCollaboratorDocument[]>([]);
  const [milestones, setMilestones] = useState<RhCollaboratorMilestone[]>([]);
  const [achievements, setAchievements] = useState<RhCollaboratorAchievement[]>([]);
  const [plans, setPlans] = useState<RhPdiPlan[]>([]);
  const [badges, setBadges] = useState<RhPdiBadge[]>([]);
  const [careerLevels, setCareerLevels] = useState<RhCareerLevel[]>([]);
  const [careerMovements, setCareerMovements] = useState<RhCareerMovement[]>([]);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [docDraft, setDocDraft] = useState<DocDraft>(emptyDocDraft);
  const [milestoneType, setMilestoneType] = useState(RH_MILESTONE_TYPES[0]);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [achievementTitle, setAchievementTitle] = useState('');
  const [achievementDescription, setAchievementDescription] = useState('');
  const [achievementScore, setAchievementScore] = useState('10');
  const [movementLevelId, setMovementLevelId] = useState('');
  const [movementTitle, setMovementTitle] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { run } = useAsyncAction();

  const selectedCollaborator = useMemo(() => colaboradores.find((item) => item.id === selectedCollaboratorId) || null, [colaboradores, selectedCollaboratorId]);
  const journeySummary = useMemo(() => journeys.find((item) => item.colaborador_id === selectedCollaboratorId) || null, [journeys, selectedCollaboratorId]);
  const currentLevel = useMemo(() => careerLevels.find((item) => item.id === selectedJourney?.nivel_carreira_id) || null, [careerLevels, selectedJourney?.nivel_carreira_id]);

  const journeyTimeline = useMemo(() => {
    const timeline = [
      ...milestones.map((item) => ({ id: `milestone-${item.id}`, title: item.titulo, subtitle: item.tipo.replace(/_/g, ' '), description: item.descricao || '', date: item.celebrado_em || item.created_at, variant: item.celebrado ? 'success' : 'warning' })),
      ...achievements.map((item) => ({ id: `achievement-${item.id}`, title: item.titulo, subtitle: item.badge?.nome || 'Conquista', description: item.descricao || '', date: item.concedida_em, variant: 'info' })),
      ...careerMovements.map((item) => ({ id: `movement-${item.id}`, title: item.titulo, subtitle: 'Movimentacao de carreira', description: item.motivo || '', date: item.efetivado_em, variant: 'purple' })),
    ];
    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [achievements, careerMovements, milestones]);

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextColaboradores, nextJourneys, nextBadges] = await Promise.all([
        rhJornadaService.fetchColaboradores(),
        rhJornadaService.fetchCollaboratorJourneys(),
        rhJornadaService.fetchPdiBadges(),
      ]);
      const activeColaboradores = nextColaboradores.filter((item) => item.ativo);
      setColaboradores(activeColaboradores);
      setJourneys(nextJourneys);
      setBadges(nextBadges);
      setSelectedCollaboratorId((current) => current || activeColaboradores[0]?.id || null);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar os colaboradores.');
    } finally {
      setLoading(false);
    }
  };

  const loadSelected = async (colaboradorId: number) => {
    const [journey, nextDocuments, nextPlans, nextMovements] = await Promise.all([
      rhJornadaService.fetchCollaboratorJourneyByCollaboratorId(colaboradorId),
      rhJornadaService.fetchCollaboratorDocuments(colaboradorId),
      rhJornadaService.fetchPdiPlans({ colaboradorId }),
      rhJornadaService.fetchCareerMovements(colaboradorId),
    ]);
    setSelectedJourney(journey);
    setDocuments(nextDocuments);
    setPlans(nextPlans);
    setCareerMovements(nextMovements);
    const [nextMilestones, nextAchievements, nextCareerLevels] = await Promise.all([
      journey ? rhJornadaService.fetchJourneyMilestones(journey.id) : Promise.resolve([]),
      journey ? rhJornadaService.fetchJourneyAchievements(journey.id) : Promise.resolve([]),
      rhJornadaService.fetchCareerLevels(selectedCollaborator?.funcao || undefined),
    ]);
    setMilestones(nextMilestones);
    setAchievements(nextAchievements);
    setCareerLevels(nextCareerLevels);
  };

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => {
    if (!selectedCollaboratorId) return;
    void loadSelected(selectedCollaboratorId).catch((err: any) => setError(err?.message || 'Nao foi possivel carregar a jornada do colaborador.'));
  }, [selectedCollaboratorId]);

  const refreshSelected = async () => {
    if (!selectedCollaboratorId) return;
    await loadBase();
    await loadSelected(selectedCollaboratorId);
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadBase} />;

  return (
    <div className="space-y-6">
      <div className={`${RH_KPI_GRID_CLASS} md:grid-cols-4`}>
        <RhKpiCard label="Colaboradores" value={colaboradores.length} />
        <RhKpiCard label="Jornadas ativas" value={journeys.filter((item) => item.status === 'ativa').length} valueClassName="text-info" />
        <RhKpiCard label="PDIs ativos" value={journeys.reduce((sum, item) => sum + Number(item.pdis_ativos || 0), 0)} valueClassName="text-accent" />
        <RhKpiCard label="Conquistas" value={journeys.reduce((sum, item) => sum + Number(item.conquistas_total || 0), 0)} valueClassName="text-success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <Card className="p-5 border border-line-strong/50">
          <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Colaboradores ativos</h3></div>
          <div className="space-y-3">
            {colaboradores.map((item) => {
              const active = item.id === selectedCollaboratorId;
              const summary = journeys.find((journey) => journey.colaborador_id === item.id);
              return <button key={item.id} type="button" onClick={() => setSelectedCollaboratorId(item.id)} className={cn('w-full rounded-3xl border p-4 text-left transition-all', active ? 'border-accent/30 bg-accent/10' : 'border-line bg-surface/30 hover:bg-surface/50')}><div className="text-primary font-black">{item.nome}</div><div className="mt-1 text-xs font-bold text-muted">{item.funcao || 'Sem funcao'} • {item.tipo}</div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant={summary ? 'info' : 'default'}>{summary ? summary.etapa_atual : 'Sem jornada'}</Badge><span className="text-[11px] font-black text-muted">{summary ? `${Math.round(summary.score_jornada)} pts` : '0 pts'}</span></div></button>;
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 border border-line-strong/50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div><div className="text-primary text-xl font-black">{selectedCollaborator?.nome || 'Selecione um colaborador'}</div><div className="mt-1 text-sm font-bold text-muted">{selectedCollaborator?.funcao || 'Sem funcao'} • {selectedCollaborator?.tipo || 'Sem vinculo'}</div></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!selectedCollaborator || saving || !!selectedJourney} onClick={async () => { const collaborator = selectedCollaborator; if (!collaborator) return; setSaving(true); await run(async () => { await rhJornadaService.ensureCollaboratorJourney({ colaborador_id: collaborator.id, data_inicio: collaborator.data_admissao || new Date().toISOString().slice(0, 10) }); await refreshSelected(); }, { success: 'Jornada iniciada.', error: 'Não foi possível iniciar a jornada.' }); setSaving(false); }} className={cn('px-4 py-2.5 rounded-2xl font-black', !selectedCollaborator || saving || !!selectedJourney ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-info hover:bg-info text-white')}>Iniciar jornada</button>
                <button type="button" disabled={!selectedCollaborator || saving} onClick={() => setDocModalOpen(true)} className={cn('px-4 py-2.5 rounded-2xl font-black', !selectedCollaborator || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-accent hover:bg-accent text-white')}>Novo documento</button>
                <button type="button" disabled={!selectedCollaborator || !selectedJourney || saving} onClick={() => setMilestoneModalOpen(true)} className={cn('px-4 py-2.5 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-warning hover:bg-warning text-white')}>Novo marco</button>
                <button type="button" disabled={!selectedCollaborator || !selectedJourney || saving} onClick={() => setMovementModalOpen(true)} className={cn('px-4 py-2.5 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white')}>Movimentacao</button>
                <button type="button" disabled={!selectedCollaborator || !selectedJourney || saving} onClick={() => setAchievementModalOpen(true)} className={cn('px-4 py-2.5 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-success hover:bg-success text-white')}>Conceder badge</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mt-5">
              <div className="rounded-2xl border border-line bg-surface/30 p-3.5 sm:p-4"><div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">Etapa atual</div><div className="mt-2 text-sm font-black text-primary line-clamp-2">{journeySummary?.etapa_atual || 'Sem jornada'}</div></div>
              <div className="rounded-2xl border border-line bg-surface/30 p-3.5 sm:p-4"><div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">Score</div><div className="mt-2 text-sm font-black text-primary">{Math.round(journeySummary?.score_jornada || 0)} pts</div></div>
              <div className="rounded-2xl border border-line bg-surface/30 p-3.5 sm:p-4"><div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">Nivel atual</div><div className="mt-2 text-sm font-black text-primary line-clamp-2">{currentLevel?.titulo || 'Nao definido'}</div></div>
              <div className="rounded-2xl border border-line bg-surface/30 p-3.5 sm:p-4"><div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">Proximo checkpoint</div><div className="mt-2 text-sm font-black text-primary">{journeySummary?.proximo_checkpoint ? new Date(`${journeySummary.proximo_checkpoint}T00:00:00`).toLocaleDateString('pt-BR') : 'Nao definido'}</div></div>
              <div className="rounded-2xl border border-line bg-surface/30 p-3.5 sm:p-4"><div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">PDIs ativos</div><div className="mt-2 text-sm font-black text-primary">{journeySummary?.pdis_ativos || 0}</div></div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 border border-line-strong/50">
              <div className="flex items-center gap-2 mb-4"><FileBadge className="w-4 h-4 text-accent" /><h3 className="text-primary text-base font-black">Dossie documental</h3></div>
              <div className="space-y-3">
                {documents.map((document) => <div key={document.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{document.titulo}</div><div className="mt-1 text-xs font-bold text-muted">{document.tipo_documento} • {document.categoria}</div></div><Badge variant={document.status === 'conferido' ? 'success' : document.status === 'rejeitado' ? 'danger' : 'warning'}>{document.status}</Badge></div>{document.observacao ? <div className="mt-2 text-sm font-bold text-secondary">{document.observacao}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{document.storage_path ? <button type="button" onClick={() => run(async () => { const url = await rhJornadaService.getDocumentSignedUrl(document.storage_path!); window.open(url, '_blank', 'noopener,noreferrer'); }, { error: 'Não foi possível abrir o documento.' })} className="px-3 py-2 rounded-xl border border-line bg-surface/50 text-xs font-black text-secondary hover:bg-surface/70 transition-all">Visualizar</button> : null}<button type="button" onClick={() => run(async () => { await rhJornadaService.reviewCollaboratorDocument(document.id, document.status === 'conferido' ? 'em_analise' : 'conferido', document.observacao || null); await refreshSelected(); }, { success: document.status === 'conferido' ? 'Revisão reaberta.' : 'Documento conferido.', error: 'Não foi possível atualizar o documento.' })} className="px-3 py-2 rounded-xl bg-success hover:bg-success text-white text-xs font-black transition-all">{document.status === 'conferido' ? 'Reabrir revisão' : 'Marcar conferido'}</button><button type="button" onClick={() => { const confirmed = window.confirm(`Excluir o documento \"${document.titulo}\" do dossiê?`); if (!confirmed) return; return run(async () => { await rhJornadaService.deleteCollaboratorDocument(document.id); await refreshSelected(); }, { success: 'Documento excluído.', error: 'Não foi possível excluir o documento.' }); }} className="px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-xs font-black text-danger hover:bg-danger/20 transition-all">Excluir</button></div></div>)}
                {documents.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum documento permanente lancado.</div> : null}
              </div>
            </Card>
            <Card className="p-5 border border-line-strong/50">
              <div className="flex items-center gap-2 mb-4"><Route className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Timeline da jornada</h3></div>
              <div className="space-y-3">
                {journeyTimeline.map((item) => <div key={item.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{item.title}</div><div className="mt-1 text-xs font-bold text-muted">{item.subtitle}</div></div><Badge variant={item.variant === 'success' ? 'success' : item.variant === 'warning' ? 'warning' : 'info'}>{new Date(item.date).toLocaleDateString('pt-BR')}</Badge></div>{item.description ? <div className="mt-2 text-sm font-bold text-secondary">{item.description}</div> : null}</div>)}
                {journeyTimeline.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum evento da jornada registrado.</div> : null}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="p-5 border border-line-strong/50">
              <div className="flex items-center gap-2 mb-4"><Milestone className="w-4 h-4 text-warning" /><h3 className="text-primary text-base font-black">Marcos</h3></div>
              <div className="space-y-3">
                {milestones.map((item) => <div key={item.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-muted">{item.tipo} • {new Date(item.created_at).toLocaleDateString('pt-BR')}</div></div><Badge variant={item.celebrado ? 'success' : 'warning'}>{item.celebrado ? 'Celebrado' : 'Pendente'}</Badge></div>{item.descricao ? <div className="mt-2 text-sm font-bold text-secondary">{item.descricao}</div> : null}{!item.celebrado ? <button type="button" onClick={() => run(async () => { await rhJornadaService.celebrateMilestone(item.id); await refreshSelected(); }, { success: 'Marco celebrado.', error: 'Não foi possível celebrar o marco.' })} className="mt-3 px-3 py-2 rounded-xl bg-warning hover:bg-warning text-white text-xs font-black transition-all">Celebrar agora</button> : null}</div>)}
                {milestones.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum marco registrado.</div> : null}
              </div>
            </Card>
            <Card className="p-5 border border-line-strong/50">
              <div className="flex items-center gap-2 mb-4"><Award className="w-4 h-4 text-success" /><h3 className="text-primary text-base font-black">Conquistas</h3></div>
              <div className="space-y-3">
                {achievements.map((item) => <div key={item.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-muted">{item.badge?.nome || 'Conquista manual'} • +{item.score_impacto} pts</div></div><Badge variant="success">{new Date(item.concedida_em).toLocaleDateString('pt-BR')}</Badge></div>{item.descricao ? <div className="mt-2 text-sm font-bold text-secondary">{item.descricao}</div> : null}</div>)}
                {achievements.length === 0 ? <div className="text-sm font-bold text-muted">Nenhuma conquista concedida ainda.</div> : null}
              </div>
            </Card>
            <Card className="p-5 border border-line-strong/50">
              <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-fuchsia-300" /><h3 className="text-primary text-base font-black">Carreira</h3></div>
              <div className="space-y-3">
                {careerMovements.map((item) => { const nextLevel = careerLevels.find((level) => level.id === item.nivel_destino_id); return <div key={item.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{item.titulo}</div><div className="mt-1 text-xs font-bold text-muted">{nextLevel?.titulo || 'Novo nivel'} • {new Date(`${item.efetivado_em}T00:00:00`).toLocaleDateString('pt-BR')}</div></div><Badge variant="info">Mov.</Badge></div>{item.motivo ? <div className="mt-2 text-sm font-bold text-secondary">{item.motivo}</div> : null}</div>; })}
                {careerMovements.length === 0 ? <div className="text-sm font-bold text-muted">Nenhuma movimentacao registrada.</div> : null}
              </div>
            </Card>
          </div>

          <Card className="p-5 border border-line-strong/50">
            <div className="flex items-center gap-2 mb-4"><Briefcase className="w-4 h-4 text-info" /><h3 className="text-primary text-base font-black">Planos de desenvolvimento</h3></div>
            <div className="space-y-3">
              {plans.map((plan) => <div key={plan.id} className="rounded-2xl border border-line bg-surface/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-primary font-black">{plan.titulo}</div><div className="mt-1 text-xs font-bold text-muted">{plan.template_nome || 'Plano manual'} • {plan.data_fim_prevista ? new Date(`${plan.data_fim_prevista}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo final'}</div></div><Badge variant={plan.status === 'concluido' ? 'success' : plan.status === 'em_andamento' ? 'info' : 'warning'}>{plan.status}</Badge></div><div className="mt-3 text-sm font-bold text-secondary">Progresso atual: {Math.round(plan.score_progresso || 0)}%</div></div>)}
              {plans.length === 0 ? <div className="text-sm font-bold text-muted">Nenhum PDI ativo para este colaborador.</div> : null}
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={docModalOpen} onClose={() => { setDocModalOpen(false); setDocDraft(emptyDocDraft); }} title="Novo documento do dossie" className="max-w-2xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => { setDocModalOpen(false); setDocDraft(emptyDocDraft); }} className="px-5 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || saving || !docDraft.titulo.trim() || !docDraft.tipo_documento.trim()} onClick={async () => { const collaborator = selectedCollaborator; if (!collaborator) return; setSaving(true); await run(async () => { const created = await rhJornadaService.createCollaboratorDocumentEntry({ colaborador_id: collaborator.id, jornada_id: selectedJourney?.id || null, categoria: docDraft.categoria, titulo: docDraft.titulo.trim(), tipo_documento: docDraft.tipo_documento.trim(), observacao: docDraft.observacao.trim() || null }); if (docDraft.file) await rhJornadaService.uploadCollaboratorDocument(created.id, docDraft.file); await refreshSelected(); }, { success: 'Documento criado.', error: 'Não foi possível criar o documento.', onSuccess: () => { setDocModalOpen(false); setDocDraft(emptyDocDraft); } }); setSaving(false); }} className={cn('px-6 py-3 rounded-2xl font-black', !selectedCollaborator || saving || !docDraft.titulo.trim() || !docDraft.tipo_documento.trim() ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-accent hover:bg-accent text-white')}><Plus className="w-4 h-4 inline mr-2" />Salvar</button></div>}><div className="space-y-4"><div><div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Categoria</div><CustomSelect value={docDraft.categoria} onValueChange={(value) => setDocDraft((current) => ({ ...current, categoria: value as RhCollaboratorDocumentCategory }))} options={DOC_CATEGORY_OPTIONS} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input value={docDraft.titulo} onChange={(e) => setDocDraft((current) => ({ ...current, titulo: e.target.value }))} placeholder="Titulo do documento" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><input value={docDraft.tipo_documento} onChange={(e) => setDocDraft((current) => ({ ...current, tipo_documento: e.target.value }))} placeholder="Tipo documental" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /></div><textarea value={docDraft.observacao} onChange={(e) => setDocDraft((current) => ({ ...current, observacao: e.target.value }))} rows={4} placeholder="Observacoes do dossie" className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" /><button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black flex items-center gap-2"><UploadCloud className="w-4 h-4" />{docDraft.file ? docDraft.file.name : 'Selecionar arquivo opcional'}</button></div></Modal>

      <Modal isOpen={milestoneModalOpen} onClose={() => setMilestoneModalOpen(false)} title="Novo marco da jornada" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setMilestoneModalOpen(false)} className="px-5 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || !selectedJourney || saving || !milestoneTitle.trim()} onClick={async () => { const collaborator = selectedCollaborator; const journey = selectedJourney; if (!collaborator || !journey) return; setSaving(true); await run(async () => { await rhJornadaService.createJourneyMilestone({ jornada_id: journey.id, colaborador_id: collaborator.id, tipo: milestoneType, titulo: milestoneTitle.trim(), descricao: milestoneDescription.trim() || null }); await refreshSelected(); }, { success: 'Marco registrado.', error: 'Não foi possível registrar o marco.', onSuccess: () => { setMilestoneModalOpen(false); setMilestoneTitle(''); setMilestoneDescription(''); } }); setSaving(false); }} className={cn('px-6 py-3 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || saving || !milestoneTitle.trim() ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-warning hover:bg-warning text-white')}>Salvar marco</button></div>}><div className="space-y-4"><CustomSelect value={milestoneType} onValueChange={(value) => setMilestoneType(value as typeof milestoneType)} options={MILESTONE_OPTIONS} /><input value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Titulo do marco" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><textarea value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} rows={4} placeholder="Contexto, resultado ou celebracao" className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" /></div></Modal>

      <Modal isOpen={movementModalOpen} onClose={() => setMovementModalOpen(false)} title="Movimentacao de carreira" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setMovementModalOpen(false)} className="px-5 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || !selectedJourney || !movementTitle.trim() || !movementLevelId || saving} onClick={async () => { const collaborator = selectedCollaborator; const journey = selectedJourney; if (!collaborator || !journey || !movementLevelId) return; setSaving(true); await run(async () => { await rhJornadaService.createCareerMovement({ colaborador_id: collaborator.id, jornada_id: journey.id, nivel_origem_id: journey.nivel_carreira_id || null, nivel_destino_id: movementLevelId, titulo: movementTitle.trim(), motivo: movementReason.trim() || null, efetivado_em: new Date().toISOString().slice(0, 10), aprovado_por: null }); await refreshSelected(); }, { success: 'Movimentação registrada.', error: 'Não foi possível registrar a movimentação.', onSuccess: () => { setMovementModalOpen(false); setMovementLevelId(''); setMovementTitle(''); setMovementReason(''); } }); setSaving(false); }} className={cn('px-6 py-3 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || !movementTitle.trim() || !movementLevelId || saving ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white')}>Salvar movimentacao</button></div>}><div className="space-y-4"><CustomSelect value={movementLevelId} onValueChange={setMovementLevelId} options={[{ value: '', label: 'Selecione o nivel de destino' }, ...careerLevels.map((item) => ({ value: item.id, label: `${item.titulo} • ${item.cargo_base}` }))]} /><input value={movementTitle} onChange={(e) => setMovementTitle(e.target.value)} placeholder="Titulo da movimentacao" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><textarea value={movementReason} onChange={(e) => setMovementReason(e.target.value)} rows={4} placeholder="Motivo ou contexto da progressao" className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" /></div></Modal>

      <Modal isOpen={achievementModalOpen} onClose={() => setAchievementModalOpen(false)} title="Conceder conquista" className="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setAchievementModalOpen(false)} className="px-5 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black">Cancelar</button><button type="button" disabled={!selectedCollaborator || !selectedJourney || saving || !achievementTitle.trim()} onClick={async () => { const collaborator = selectedCollaborator; const journey = selectedJourney; if (!collaborator || !journey) return; setSaving(true); await run(async () => { await rhJornadaService.grantAchievement({ jornada_id: journey.id, colaborador_id: collaborator.id, badge_id: badgeId || null, titulo: achievementTitle.trim(), descricao: achievementDescription.trim() || null, score_impacto: Number(achievementScore || 0) }); await refreshSelected(); }, { success: 'Conquista concedida.', error: 'Não foi possível conceder a conquista.', onSuccess: () => { setAchievementModalOpen(false); setBadgeId(''); setAchievementTitle(''); setAchievementDescription(''); setAchievementScore('10'); } }); setSaving(false); }} className={cn('px-6 py-3 rounded-2xl font-black', !selectedCollaborator || !selectedJourney || saving || !achievementTitle.trim() ? 'bg-surface-2 text-muted border border-line cursor-not-allowed' : 'bg-success hover:bg-success text-white')}>Salvar conquista</button></div>}><div className="space-y-4"><CustomSelect value={badgeId} onValueChange={setBadgeId} options={[{ value: '', label: 'Sem badge especifico' }, ...badges.map((item) => ({ value: item.id, label: item.nome }))]} /><input value={achievementTitle} onChange={(e) => setAchievementTitle(e.target.value)} placeholder="Titulo da conquista" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><input value={achievementScore} onChange={(e) => setAchievementScore(e.target.value)} placeholder="Score" className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40" /><textarea value={achievementDescription} onChange={(e) => setAchievementDescription(e.target.value)} rows={4} placeholder="Descricao da conquista" className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" /></div></Modal>

      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setDocDraft((current) => ({ ...current, file: e.target.files?.[0] || null }))} />
    </div>
  );
};
