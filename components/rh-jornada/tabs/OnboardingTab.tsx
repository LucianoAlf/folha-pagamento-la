import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Plus, Route, UserCheck, Users } from 'lucide-react';
import { Badge, Card, CustomSelect, DatePicker, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { Colaborador } from '../../../types';
import type { RhProcessSummary, RhStage, RhTemplate } from '../../../types/rh';
import { cn } from '../../CollaboratorComponents';
import { RhProcessActivityPanel } from '../process/RhProcessActivityPanel';
import { RhEvaluationPanel } from '../process/RhEvaluationPanel';
import { RhParticipantsPanel } from '../process/RhParticipantsPanel';
import { RhStageExecutionPanel } from '../process/RhStageExecutionPanel';

const PROCESS_STATUS_META: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' | 'info' | 'purple' }> = {
  rascunho: { label: 'Rascunho', variant: 'default' },
  em_andamento: { label: 'Em andamento', variant: 'info' },
  aguardando_documentos: { label: 'Aguardando docs', variant: 'warning' },
  aguardando_avaliacao: { label: 'Aguardando avaliação', variant: 'purple' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', variant: 'warning' },
  concluido: { label: 'Concluído', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
};

const STAGE_STATUS_META: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' | 'info' | 'purple' }> = {
  nao_iniciada: { label: 'Não iniciada', variant: 'default' },
  em_andamento: { label: 'Em andamento', variant: 'info' },
  bloqueada: { label: 'Bloqueada', variant: 'danger' },
  concluida: { label: 'Concluída', variant: 'success' },
  dispensada: { label: 'Dispensada', variant: 'default' },
  atrasada: { label: 'Atrasada', variant: 'warning' },
};

const PRIORIDADE_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const OnboardingCreateModal: React.FC<{
  isOpen: boolean;
  templates: RhTemplate[];
  colaboradores: Colaborador[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}> = ({ isOpen, templates, colaboradores, onClose, onCreated }) => {
  const [templateId, setTemplateId] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [dataInicio, setDataInicio] = useState<string | undefined>(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState<string | undefined>(undefined);
  const [prioridade, setPrioridade] = useState('media');
  const [titulo, setTitulo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateOptions = useMemo(() => templates.map((t) => ({ value: t.id, label: t.nome })), [templates]);
  const colaboradorOptions = useMemo(
    () => colaboradores.filter((c) => c.ativo).map((c) => ({ value: String(c.id), label: `${c.nome} • ${c.funcao}` })),
    [colaboradores]
  );

  const selectedColaborador = useMemo(
    () => colaboradores.find((c) => String(c.id) === colaboradorId) || null,
    [colaboradores, colaboradorId]
  );

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova integração"
      subtitle="Crie a jornada de entrada a partir de um colaborador e do modelo oficial."
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 font-black hover:bg-slate-900/60 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !templateId || !colaboradorId || !dataInicio}
            onClick={async () => {
              if (!templateId || !colaboradorId || !dataInicio || !selectedColaborador) return;
              setSaving(true);
              setError(null);
              try {
                await rhJornadaService.createProcessFromTemplate({
                  tipo: 'onboarding',
                  template_id: templateId,
                  colaborador_id: Number(colaboradorId),
                  data_inicio: dataInicio,
                  data_fim_prevista: dataFim || null,
                  prioridade: prioridade as any,
                  titulo: titulo.trim() || `Integração - ${selectedColaborador.nome}`,
                  cargo: selectedColaborador.funcao,
                  tipo_vinculo: selectedColaborador.tipo,
                  observacoes: observacoes.trim() || null,
                  metadata_json: {
                    origem: 'ui_onboarding',
                  },
                });
                await onCreated();
                onClose();
              } catch (err: any) {
                setError(err?.message || 'Não foi possível criar a integração.');
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'px-8 py-3 rounded-2xl font-black text-white transition-all flex items-center gap-2',
              saving || !templateId || !colaboradorId || !dataInicio ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
            )}
          >
            <Plus className="w-4 h-4" />
            Criar integração
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-300">{error}</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Colaborador *</div>
            <CustomSelect value={colaboradorId} onValueChange={setColaboradorId} options={colaboradorOptions} placeholder="Selecione..." />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Modelo *</div>
            <CustomSelect value={templateId} onValueChange={setTemplateId} options={templateOptions} placeholder="Selecione..." />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Início *</div>
            <DatePicker value={dataInicio} onChange={setDataInicio} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Fim previsto</div>
            <DatePicker value={dataFim} onChange={setDataFim} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Prioridade</div>
            <CustomSelect value={prioridade} onValueChange={setPrioridade} options={PRIORIDADE_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Título</div>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Integração João Silva"
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Observações</div>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
              placeholder="Anotações da admissão, mentor, prioridades ou contexto da integração"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const OnboardingTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processes, setProcesses] = useState<RhProcessSummary[]>([]);
  const [templates, setTemplates] = useState<RhTemplate[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [stages, setStages] = useState<RhStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refreshSelectedProcess = async () => {
    if (!selectedProcessId) {
      await loadData();
      return;
    }

    const [nextProcesses, nextStages] = await Promise.all([
      rhJornadaService.fetchProcesses({ tipo: 'onboarding' }),
      rhJornadaService.fetchStages(selectedProcessId),
    ]);

    setProcesses(nextProcesses);
    setStages(nextStages);
    setSelectedStageId((prev) => (prev && nextStages.some((stage) => stage.id === prev) ? prev : nextStages[0]?.id || null));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProcesses, nextTemplates, nextColaboradores] = await Promise.all([
        rhJornadaService.fetchProcesses({ tipo: 'onboarding' }),
        rhJornadaService.fetchTemplates('onboarding'),
        rhJornadaService.fetchColaboradores(),
      ]);
      setProcesses(nextProcesses);
      setTemplates(nextTemplates);
      setColaboradores(nextColaboradores);
      setSelectedProcessId((prev) => prev || nextProcesses[0]?.id || null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as integrações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedProcessId) {
      setStages([]);
      setSelectedStageId(null);
      return;
    }
    void rhJornadaService
      .fetchStages(selectedProcessId)
      .then((nextStages) => {
        setStages(nextStages);
        setSelectedStageId((prev) => (prev && nextStages.some((stage) => stage.id === prev) ? prev : nextStages[0]?.id || null));
      })
      .catch(() => {
        setStages([]);
        setSelectedStageId(null);
      });
  }, [selectedProcessId]);

  const selectedProcess = useMemo(
    () => processes.find((process) => process.id === selectedProcessId) || null,
    [processes, selectedProcessId]
  );

  const collaboratorMap = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const selectedStage = useMemo(() => stages.find((stage) => stage.id === selectedStageId) || null, [stages, selectedStageId]);
  const activeProcessesCount = useMemo(
    () => processes.filter((process) => !['concluido', 'cancelado'].includes(process.status)).length,
    [processes]
  );
  const selectedProcessContext = selectedProcess?.titulo || 'Selecione uma integração';

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Ativos</div>
          <div className="mt-2 text-3xl font-black text-white">{activeProcessesCount}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Integrações em andamento</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Etapas</div>
          <div className="mt-2 text-3xl font-black text-white">{selectedProcess?.total_etapas || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400 truncate">{selectedProcessContext}</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Concluídas</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{selectedProcess?.etapas_concluidas || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Etapas fechadas</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Progresso</div>
          <div className="mt-2 text-3xl font-black text-violet-300">{Math.round(selectedProcess?.percentual_conclusao || 0)}%</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Conclusão estimada</div>
        </Card>
      </div>

      <Card className="p-5 border border-slate-700/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-white text-lg font-black">Integrações ativas</div>
            <div className="text-sm font-bold text-slate-400">Crie a jornada de entrada e acompanhe o avanço por etapa.</div>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-5 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova integração
          </button>
        </div>
      </Card>

      {processes.length === 0 ? (
        <Card className="p-10 border border-dashed border-slate-700 bg-slate-900/30 text-center">
          <div className="mx-auto w-14 h-14 rounded-3xl bg-slate-800/70 flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <div className="text-white font-black">Nenhuma integração criada</div>
          <div className="mt-2 text-sm font-bold text-slate-400">Use o modelo oficial para abrir o primeiro processo de entrada.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <Route className="w-4 h-4 text-cyan-300" />
              <h3 className="text-white text-base font-black">Lista de processos</h3>
            </div>
            <div className="space-y-3">
              {processes.map((process) => {
                const active = process.id === selectedProcessId;
                const status = PROCESS_STATUS_META[process.status] || PROCESS_STATUS_META.em_andamento;
                const colaborador = process.colaborador_id ? collaboratorMap.get(process.colaborador_id) : null;
                return (
                  <button
                    key={process.id}
                    type="button"
                    onClick={() => setSelectedProcessId(process.id)}
                    className={[
                      'w-full rounded-3xl border p-4 text-left transition-all',
                      active ? 'border-violet-500/30 bg-violet-500/10' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50',
                    ].join(' ')}
                  >
                    <div className="text-white font-black truncate">{process.titulo}</div>
                    <div className="mt-1 text-xs font-bold text-slate-400 truncate">{colaborador?.nome || process.cargo || 'Colaborador'}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <div className="text-[11px] font-bold text-slate-500">{Math.round(process.percentual_conclusao)}%</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-white text-xl font-black">{selectedProcess?.titulo || 'Selecione um processo'}</div>
                  <div className="mt-1 text-sm font-bold text-slate-400">
                    {selectedProcess?.colaborador_id ? collaboratorMap.get(selectedProcess.colaborador_id)?.nome : selectedProcess?.cargo}
                  </div>
                </div>
                {selectedProcess ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={PROCESS_STATUS_META[selectedProcess.status]?.variant || 'default'}>
                      {PROCESS_STATUS_META[selectedProcess.status]?.label || selectedProcess.status}
                    </Badge>
                    <Badge variant="info">{selectedProcess.prioridade}</Badge>
                  </div>
                ) : null}
              </div>

              {selectedProcess ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Início</div>
                    <div className="mt-2 text-sm font-black text-white">{new Date(`${selectedProcess.data_inicio}T00:00:00`).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Fim previsto</div>
                    <div className="mt-2 text-sm font-black text-white">
                      {selectedProcess.data_fim_prevista ? new Date(`${selectedProcess.data_fim_prevista}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Cargo</div>
                    <div className="mt-2 text-sm font-black text-white">{selectedProcess.cargo || 'Não informado'}</div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4 text-amber-300" />
                <h3 className="text-white text-base font-black">Timeline de etapas</h3>
              </div>
              <div className="space-y-3">
                {stages.map((stage) => {
                  const status = STAGE_STATUS_META[stage.status] || STAGE_STATUS_META.nao_iniciada;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={cn(
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        selectedStageId === stage.id ? 'border-violet-500/40 bg-violet-500/10' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50'
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-white font-black">{stage.ordem}. {stage.titulo}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">
                            Categoria: {stage.categoria}
                            {stage.agendado_em
                              ? ` • Agendado: ${new Date(stage.agendado_em).toLocaleString('pt-BR')}`
                              : stage.data_limite
                                ? ` • Prazo: ${new Date(`${stage.data_limite}T00:00:00`).toLocaleDateString('pt-BR')}`
                                : ''}
                          </div>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </button>
                  );
                })}
                {stages.length === 0 ? <div className="text-sm font-bold text-slate-500">As etapas aparecerão aqui após a criação do processo.</div> : null}
              </div>
            </Card>

            <RhStageExecutionPanel process={selectedProcess} stage={selectedStage} onStageUpdated={refreshSelectedProcess} />

            <RhEvaluationPanel process={selectedProcess} processId={selectedProcessId} stage={selectedStage} />

            <RhParticipantsPanel process={selectedProcess} />

            <RhProcessActivityPanel processId={selectedProcessId} stageId={selectedStageId} />
          </div>
        </div>
      )}

      <OnboardingCreateModal isOpen={createOpen} templates={templates} colaboradores={colaboradores} onClose={() => setCreateOpen(false)} onCreated={loadData} />
    </div>
  );
};
