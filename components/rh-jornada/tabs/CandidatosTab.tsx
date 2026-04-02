import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Briefcase, CheckCircle2, FileSearch, Filter, Loader2, Mail, Pencil, Phone, Plus, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { Badge, Card, CustomSelect, ErrorState, LoadingSpinner } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhCandidate, RhCandidateComparisonResult, RhCandidateStatus, RhProcess, RhStage, RhTemplate } from '../../../types/rh';
import { CandidateFormModal } from '../candidates/CandidateFormModal';
import { CandidateApprovalModal } from '../candidates/CandidateApprovalModal';
import { RhStageExecutionPanel } from '../process/RhStageExecutionPanel';
import { RhProcessActivityPanel } from '../process/RhProcessActivityPanel';
import { RhEvaluationPanel } from '../process/RhEvaluationPanel';
import { RhParticipantsPanel } from '../process/RhParticipantsPanel';

const STATUS_META: Record<RhCandidateStatus, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' | 'info' | 'purple' }> = {
  novo: { label: 'Novo', variant: 'default' },
  questionario_pendente: { label: 'Questionário pendente', variant: 'warning' },
  questionario_recebido: { label: 'Questionário recebido', variant: 'info' },
  entrevista: { label: 'Entrevista', variant: 'purple' },
  aula_teste: { label: 'Aula teste', variant: 'purple' },
  aprovado: { label: 'Aprovado', variant: 'success' },
  reprovado: { label: 'Reprovado', variant: 'danger' },
  arquivado: { label: 'Arquivado', variant: 'default' },
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
];

export const CandidatosTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RhCandidate[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<RhCandidate | null>(null);
  const [approvalOpen, setApprovalOpen] = useState<RhCandidate | null>(null);
  const [onboardingTemplates, setOnboardingTemplates] = useState<RhTemplate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<RhProcess | null>(null);
  const [stages, setStages] = useState<RhStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<RhCandidateStatus>('novo');
  const [comparisonCandidateId, setComparisonCandidateId] = useState('');
  const [comparison, setComparison] = useState<RhCandidateComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, templates] = await Promise.all([
        rhJornadaService.fetchCandidates(statusFilter === 'all' ? undefined : statusFilter),
        rhJornadaService.fetchTemplates('onboarding'),
      ]);
      setCandidates(data);
      setOnboardingTemplates(templates);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os candidatos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidates();
  }, [statusFilter]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((candidate) =>
      [candidate.nome, candidate.email, candidate.cargo_pretendido, candidate.tipo_vinculo_pretendido]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [candidates, search]);

  const counts = useMemo(() => {
    return candidates.reduce<Record<string, number>>((acc, candidate) => {
      acc[candidate.status] = (acc[candidate.status] || 0) + 1;
      return acc;
    }, {});
  }, [candidates]);

  useEffect(() => {
    if (!filteredCandidates.length) {
      setSelectedCandidateId(null);
      return;
    }
    if (!selectedCandidateId || !filteredCandidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredCandidates[0].id);
    }
  }, [filteredCandidates, selectedCandidateId]);

  useEffect(() => {
    const loadRecruitment = async () => {
      if (!selectedCandidateId) {
        setSelectedProcess(null);
        setStages([]);
        setSelectedStageId(null);
        return;
      }
      const process = await rhJornadaService.fetchActiveRecruitmentProcess(selectedCandidateId);
      setSelectedProcess(process);
      if (!process) {
        setStages([]);
        setSelectedStageId(null);
        return;
      }
      const nextStages = await rhJornadaService.fetchStages(process.id);
      setStages(nextStages);
      setSelectedStageId((current) => (current && nextStages.some((stage) => stage.id === current) ? current : nextStages[0]?.id || null));
    };
    void loadRecruitment();
  }, [selectedCandidateId]);

  const selectedCandidate = filteredCandidates.find((candidate) => candidate.id === selectedCandidateId) || null;
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || null;
  const comparisonOptions = filteredCandidates
    .filter((candidate) => candidate.id !== selectedCandidateId)
    .map((candidate) => ({ value: candidate.id, label: `${candidate.nome} • ${STATUS_META[candidate.status].label}` }));

  useEffect(() => {
    setSelectedStatus(selectedCandidate?.status || 'novo');
    setComparisonCandidateId('');
    setComparison(null);
  }, [selectedCandidate?.id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadCandidates} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Total</div>
          <div className="mt-2 text-3xl font-black text-white">{candidates.length}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Base ativa de candidatos</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Entrevistas</div>
          <div className="mt-2 text-3xl font-black text-white">{counts.entrevista || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Aguardando conversa RH</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Aula teste</div>
          <div className="mt-2 text-3xl font-black text-white">{counts.aula_teste || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Em avaliação técnica</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Aprovados</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{counts.aprovado || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Prontos para integração</div>
        </Card>
      </div>

      <Card className="p-5 border border-slate-700/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 flex-1">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Status</div>
              <CustomSelect value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Busca</div>
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, cargo, e-mail ou vínculo"
                  className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                <Filter className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-5 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo candidato
          </button>
        </div>
      </Card>

      <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-violet-300" />
          <h3 className="text-white text-base font-black">Pipeline de recrutamento</h3>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-3xl bg-slate-800/70 flex items-center justify-center mb-4">
              <FileSearch className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-white font-black">Nenhum candidato encontrado</div>
            <div className="mt-2 text-sm font-bold text-slate-400">
              Ajuste os filtros ou crie o primeiro candidato para iniciar o fluxo de recrutamento.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredCandidates.map((candidate) => {
              const meta = STATUS_META[candidate.status];
              return (
                <div
                  key={candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCandidateId(candidate.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`rounded-3xl border p-5 text-left transition-all ${
                    selectedCandidateId === candidate.id
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-white text-lg font-black truncate">{candidate.nome}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {candidate.tipo_vinculo_pretendido ? <Badge variant="info">{candidate.tipo_vinculo_pretendido}</Badge> : null}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-bold">
                      {candidate.created_at ? new Date(candidate.created_at).toLocaleDateString('pt-BR') : 'Sem data'}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2 text-slate-300 font-bold">
                      <Briefcase className="w-4 h-4 text-slate-500" />
                      <span>{candidate.cargo_pretendido || 'Cargo não informado'}</span>
                    </div>
                    {candidate.email ? (
                      <div className="flex items-center gap-2 text-slate-300 font-bold">
                        <Mail className="w-4 h-4 text-slate-500" />
                        <span className="truncate">{candidate.email}</span>
                      </div>
                    ) : null}
                    {candidate.telefone ? (
                      <div className="flex items-center gap-2 text-slate-300 font-bold">
                        <Phone className="w-4 h-4 text-slate-500" />
                        <span>{candidate.telefone}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Resumo operacional</div>
                    <div className="text-sm font-bold text-slate-300 leading-relaxed">
                      {candidate.questionario_resumo || candidate.observacoes || 'Sem resumo operacional registrado ainda.'}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {candidate.status !== 'aprovado' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setApprovalOpen(candidate);
                        }}
                        className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar
                      </button>
                    ) : null}

                    {candidate.status !== 'reprovado' ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await rhJornadaService.rejectCandidate(candidate.id, 'Reprovado via pipeline RH.');
                          await loadCandidates();
                        }}
                        className="px-4 py-2.5 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black hover:bg-slate-900/60 flex items-center gap-2 transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        Reprovar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {selectedCandidate ? (
        <div className="grid grid-cols-1 2xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Candidato selecionado</div>
            <div className="mt-3 text-2xl font-black text-white">{selectedCandidate.nome}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={STATUS_META[selectedCandidate.status].variant}>{STATUS_META[selectedCandidate.status].label}</Badge>
              {selectedCandidate.tipo_vinculo_pretendido ? <Badge variant="info">{selectedCandidate.tipo_vinculo_pretendido}</Badge> : null}
            </div>
            <div className="mt-5 space-y-3 text-sm font-bold text-slate-300">
              <div>{selectedCandidate.cargo_pretendido || 'Cargo não informado'}</div>
              {selectedCandidate.email ? <div>{selectedCandidate.email}</div> : null}
              {selectedCandidate.telefone ? <div>{selectedCandidate.telefone}</div> : null}
              {selectedCandidate.questionario_resumo ? <div className="text-slate-400">{selectedCandidate.questionario_resumo}</div> : null}
              {selectedCandidate.curriculo_storage_path ? <div className="text-cyan-300">Currículo anexado ao candidato.</div> : null}
            </div>

            <div className="mt-5 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Status do pipeline</div>
              <CustomSelect value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as RhCandidateStatus)} options={STATUS_OPTIONS.slice(1)} />
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCandidate) return;
                  await rhJornadaService.updateCandidate(selectedCandidate.id, { status: selectedStatus });
                  await loadCandidates();
                }}
                className="w-full px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all"
              >
                Salvar status do candidato
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(selectedCandidate)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black hover:bg-slate-900/60 transition-all flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Editar cadastro
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedCandidate) return;
                    const confirmed = window.confirm(`Arquivar o candidato ${selectedCandidate.nome}?`);
                    if (!confirmed) return;
                    await rhJornadaService.archiveCandidate(selectedCandidate.id, 'Arquivado manualmente pela operação RH.');
                    await loadCandidates();
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 font-black hover:bg-rose-500/15 transition-all flex items-center justify-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Arquivar candidato
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <div className="flex items-center gap-2 text-white font-black">
                <Sparkles className="w-4 h-4 text-cyan-300" />
                Comparativo IA entre candidatos
              </div>
              <div className="mt-3">
                <CustomSelect
                  value={comparisonCandidateId}
                  onValueChange={setComparisonCandidateId}
                  options={comparisonOptions}
                  placeholder="Selecione outro candidato"
                />
              </div>
              <button
                type="button"
                disabled={!comparisonCandidateId || comparing}
                onClick={async () => {
                  if (!selectedCandidateId || !comparisonCandidateId) return;
                  setComparing(true);
                  try {
                    const result = await rhJornadaService.compareCandidatesWithAi([selectedCandidateId, comparisonCandidateId]);
                    setComparison(result);
                  } finally {
                    setComparing(false);
                  }
                }}
                className={`mt-3 w-full px-4 py-3 rounded-2xl font-black text-white transition-all ${
                  !comparisonCandidateId || comparing ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                {comparing ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Gerando comparativo</span> : 'Gerar comparativo IA'}
              </button>
              {comparison ? (
                <div className="mt-4 space-y-3">
                  <div className="text-sm font-bold text-slate-200">{comparison.resumo_executivo}</div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Recomendação</div>
                    <div className="text-sm font-bold text-emerald-200">{comparison.recomendacao_final}</div>
                  </div>
                  <div className="space-y-2">
                    {comparison.ranking.map((item) => (
                      <div key={item.candidate_id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-white font-black">{item.nome}</div>
                          <Badge variant="purple">{item.score}</Badge>
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-400">{item.motivo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Processo de recrutamento</div>
                  <div className="mt-2 text-white text-xl font-black">{selectedProcess?.titulo || 'Processo ainda não materializado'}</div>
                  <div className="mt-1 text-sm font-bold text-slate-400">
                    {selectedProcess ? `${selectedProcess.status} • ${selectedProcess.prioridade}` : 'Crie um modelo de recrutamento para materialização automática.'}
                  </div>
                </div>
                {selectedProcess ? <Badge variant="purple">Recrutamento</Badge> : null}
              </div>

              {stages.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${
                        selectedStageId === stage.id
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-800 bg-slate-900/30 text-slate-300 hover:bg-slate-900/60'
                      }`}
                    >
                      {stage.titulo}
                    </button>
                  ))}
                </div>
              ) : null}
            </Card>

            {selectedProcess ? (
              <>
                <RhStageExecutionPanel
                  process={selectedProcess}
                  stage={selectedStage}
                  onStageUpdated={async () => {
                    const [nextProcess, nextStages] = await Promise.all([
                      rhJornadaService.fetchProcessById(selectedProcess.id),
                      rhJornadaService.fetchStages(selectedProcess.id),
                    ]);
                    setSelectedProcess(nextProcess);
                    setStages(nextStages);
                  }}
                />
                <RhEvaluationPanel process={selectedProcess} processId={selectedProcess.id} stage={selectedStage} />
                <RhParticipantsPanel process={selectedProcess} />
                <RhProcessActivityPanel processId={selectedProcess.id} stageId={selectedStageId} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <CandidateFormModal
        isOpen={createOpen || !!editingCandidate}
        candidate={editingCandidate}
        onClose={() => {
          setCreateOpen(false);
          setEditingCandidate(null);
        }}
        onConfirm={async (payload, options) => {
          if (editingCandidate) {
            await rhJornadaService.updateCandidate(editingCandidate.id, payload);
          } else {
            await rhJornadaService.createCandidate(payload, options);
          }
          await loadCandidates();
        }}
      />

      <CandidateApprovalModal
        candidate={approvalOpen}
        onboardingTemplates={onboardingTemplates}
        onClose={() => setApprovalOpen(null)}
        onConfirm={async (payload) => {
          await rhJornadaService.approveCandidate(payload as any);
          await loadCandidates();
        }}
      />
    </div>
  );
};
