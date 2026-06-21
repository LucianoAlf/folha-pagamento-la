import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Eye, FileText, FileWarning, LogOut, Plus, Route } from 'lucide-react';
import { Badge, Card, CustomSelect, DatePicker, ErrorState, LoadingSpinner, Modal } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { Colaborador } from '../../../types';
import type { RhGeneratedDocument, RhOffboarding, RhProcessSummary, RhStage, RhTemplate } from '../../../types/rh';
import { cn } from '../../CollaboratorComponents';
import { RhProcessActivityPanel } from '../process/RhProcessActivityPanel';
import { RhEvaluationPanel } from '../process/RhEvaluationPanel';
import { RhParticipantsPanel } from '../process/RhParticipantsPanel';
import { RhStageExecutionPanel } from '../process/RhStageExecutionPanel';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

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

const MOTIVO_OPTIONS = [
  { value: 'pedido_demissao', label: 'Pedido de demissão' },
  { value: 'sem_justa_causa', label: 'Sem justa causa' },
  { value: 'justa_causa', label: 'Justa causa' },
  { value: 'termino_contrato', label: 'Término de contrato' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'encerramento_pj', label: 'Encerramento PJ' },
];

const AVISO_OPTIONS = [
  { value: 'trabalhado', label: 'Trabalhado' },
  { value: 'indenizado', label: 'Indenizado' },
  { value: 'nao_aplica', label: 'Não se aplica' },
];

const REDUCAO_OPTIONS = [
  { value: '2h_dia', label: '2 horas por dia' },
  { value: '7_dias', label: 'Últimos 7 dias' },
  { value: 'nao_aplica', label: 'Não se aplica' },
];

const PRIORIDADE_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const DesligamentoCreateModal: React.FC<{
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
  const [prioridade, setPrioridade] = useState('alta');
  const [titulo, setTitulo] = useState('');
  const [motivoTipo, setMotivoTipo] = useState('pedido_demissao');
  const [motivoDetalhado, setMotivoDetalhado] = useState('');
  const [avisoTipo, setAvisoTipo] = useState('trabalhado');
  const [avisoInicio, setAvisoInicio] = useState<string | undefined>(undefined);
  const [avisoFim, setAvisoFim] = useState<string | undefined>(undefined);
  const [reducao, setReducao] = useState('nao_aplica');
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
      title="Novo desligamento"
      subtitle="Abra a jornada de saída com aviso prévio, checklist e fluxo rescisório."
      className="max-w-4xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl border border-line bg-surface/40 text-secondary font-black hover:bg-surface/60 transition-all"
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
                await rhJornadaService.createProcessFromTemplate(
                  {
                    tipo: 'desligamento',
                    template_id: templateId,
                    colaborador_id: Number(colaboradorId),
                    data_inicio: dataInicio,
                    data_fim_prevista: dataFim || null,
                    prioridade: prioridade as any,
                    titulo: titulo.trim() || `Desligamento - ${selectedColaborador.nome}`,
                    cargo: selectedColaborador.funcao,
                    tipo_vinculo: selectedColaborador.tipo,
                    observacoes: observacoes.trim() || null,
                    metadata_json: {
                      origem: 'ui_desligamento',
                    },
                  },
                  {
                    offboarding: {
                      motivo_tipo: motivoTipo as any,
                      motivo_detalhado: motivoDetalhado.trim() || null,
                      aviso_previo_tipo: avisoTipo as any,
                      aviso_previo_inicio: avisoInicio || null,
                      aviso_previo_fim: avisoFim || null,
                      opcao_reducao_jornada: reducao as any,
                      observacoes: observacoes.trim() || null,
                    },
                  }
                );
                await onCreated();
                onClose();
              } catch (err: any) {
                setError(err?.message || 'Não foi possível criar o desligamento.');
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'px-8 py-3 rounded-2xl font-black text-primary transition-all flex items-center gap-2',
              saving || !templateId || !colaboradorId || !dataInicio ? 'bg-surface-3 opacity-60 cursor-not-allowed' : 'bg-accent hover:bg-accent'
            )}
          >
            <Plus className="w-4 h-4" />
            Criar desligamento
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-bold text-danger">{error}</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Colaborador *</div>
            <CustomSelect value={colaboradorId} onValueChange={setColaboradorId} options={colaboradorOptions} placeholder="Selecione..." />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Modelo *</div>
            <CustomSelect value={templateId} onValueChange={setTemplateId} options={templateOptions} placeholder="Selecione..." />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Data de abertura *</div>
            <DatePicker value={dataInicio} onChange={setDataInicio} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Fim previsto</div>
            <DatePicker value={dataFim} onChange={setDataFim} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Motivo *</div>
            <CustomSelect value={motivoTipo} onValueChange={setMotivoTipo} options={MOTIVO_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Aviso prévio *</div>
            <CustomSelect value={avisoTipo} onValueChange={setAvisoTipo} options={AVISO_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Início do aviso</div>
            <DatePicker value={avisoInicio} onChange={setAvisoInicio} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Fim do aviso</div>
            <DatePicker value={avisoFim} onChange={setAvisoFim} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Redução de jornada</div>
            <CustomSelect value={reducao} onValueChange={setReducao} options={REDUCAO_OPTIONS} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Prioridade</div>
            <CustomSelect value={prioridade} onValueChange={setPrioridade} options={PRIORIDADE_OPTIONS} />
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Título</div>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Desligamento João Silva"
              className="w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Detalhamento do motivo</div>
            <textarea
              value={motivoDetalhado}
              onChange={(e) => setMotivoDetalhado(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              placeholder="Explique o contexto e o motivo detalhado da saída"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black mb-2">Observações operacionais</div>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              placeholder="Alinhamentos do aviso prévio, financeiro, acessos e próximos passos"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const DesligamentosTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processes, setProcesses] = useState<RhProcessSummary[]>([]);
  const [templates, setTemplates] = useState<RhTemplate[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [stages, setStages] = useState<RhStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [offboarding, setOffboarding] = useState<RhOffboarding | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<RhGeneratedDocument[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { run } = useAsyncAction();

  const refreshSelectedProcess = async () => {
    if (!selectedProcessId) {
      await loadData();
      return;
    }

    const [nextProcesses, nextStages, nextOffboarding, nextGeneratedDocs] = await Promise.all([
      rhJornadaService.fetchProcesses({ tipo: 'desligamento' }),
      rhJornadaService.fetchStages(selectedProcessId),
      rhJornadaService.fetchOffboarding(selectedProcessId),
      rhJornadaService.fetchGeneratedDocuments(selectedProcessId),
    ]);

    setProcesses(nextProcesses);
    setStages(nextStages);
    setOffboarding(nextOffboarding);
    setGeneratedDocs(nextGeneratedDocs);
    setSelectedStageId((prev) => (prev && nextStages.some((stage) => stage.id === prev) ? prev : nextStages[0]?.id || null));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProcesses, nextTemplates, nextColaboradores] = await Promise.all([
        rhJornadaService.fetchProcesses({ tipo: 'desligamento' }),
        rhJornadaService.fetchTemplates('desligamento'),
        rhJornadaService.fetchColaboradores(),
      ]);
      setProcesses(nextProcesses);
      setTemplates(nextTemplates);
      setColaboradores(nextColaboradores);
      setSelectedProcessId((prev) => prev || nextProcesses[0]?.id || null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os desligamentos.');
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
      setOffboarding(null);
      setGeneratedDocs([]);
      return;
    }
    void Promise.all([
      rhJornadaService.fetchStages(selectedProcessId),
      rhJornadaService.fetchOffboarding(selectedProcessId),
      rhJornadaService.fetchGeneratedDocuments(selectedProcessId),
    ])
      .then(([nextStages, nextOffboarding, nextGeneratedDocs]) => {
        setStages(nextStages);
        setSelectedStageId((prev) => (prev && nextStages.some((stage) => stage.id === prev) ? prev : nextStages[0]?.id || null));
        setOffboarding(nextOffboarding);
        setGeneratedDocs(nextGeneratedDocs);
      })
      .catch(() => {
        setStages([]);
        setSelectedStageId(null);
        setOffboarding(null);
        setGeneratedDocs([]);
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
  const selectedProcessContext = selectedProcess?.titulo || 'Selecione um desligamento';

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-line-strong/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Ativos</div>
          <div className="mt-2 text-3xl font-black text-primary">{activeProcessesCount}</div>
          <div className="mt-1 text-xs font-bold text-muted">Desligamentos abertos</div>
        </Card>
        <Card className="p-5 border border-line-strong/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Etapas</div>
          <div className="mt-2 text-3xl font-black text-primary">{selectedProcess?.total_etapas || 0}</div>
          <div className="mt-1 text-xs font-bold text-muted truncate">{selectedProcessContext}</div>
        </Card>
        <Card className="p-5 border border-line-strong/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Aviso</div>
          <div className="mt-2 text-xl font-black text-warning">{offboarding?.aviso_previo_tipo || '—'}</div>
          <div className="mt-1 text-xs font-bold text-muted">Tipo de aviso prévio</div>
        </Card>
        <Card className="p-5 border border-line-strong/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Status doc.</div>
          <div className="mt-2 text-xl font-black text-accent">{offboarding?.status_documental || 'pendente'}</div>
          <div className="mt-1 text-xs font-bold text-muted">Controle rescisório</div>
        </Card>
      </div>

      <Card className="p-5 border border-line-strong/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-primary text-lg font-black">Desligamentos ativos</div>
            <div className="text-sm font-bold text-muted">Abra a jornada de saída com aviso prévio, checklist e etapas de encerramento.</div>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-5 py-3.5 rounded-2xl bg-accent hover:bg-accent text-white font-black flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo desligamento
          </button>
        </div>
      </Card>

      {processes.length === 0 ? (
        <Card className="p-10 border border-dashed border-line-strong bg-surface/30 text-center">
          <div className="mx-auto w-14 h-14 rounded-3xl bg-surface-2/70 flex items-center justify-center mb-4">
            <LogOut className="w-6 h-6 text-muted" />
          </div>
          <div className="text-primary font-black">Nenhum desligamento criado</div>
          <div className="mt-2 text-sm font-bold text-muted">Use o modelo padrão para abrir a primeira jornada de saída.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <Card className="p-5 border border-line-strong/50">
            <div className="flex items-center gap-2 mb-4">
              <Route className="w-4 h-4 text-info" />
              <h3 className="text-primary text-base font-black">Lista de processos</h3>
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
                      active ? 'border-accent/30 bg-accent/10' : 'border-line bg-surface/30 hover:bg-surface/50',
                    ].join(' ')}
                  >
                    <div className="text-primary font-black truncate">{process.titulo}</div>
                    <div className="mt-1 text-xs font-bold text-muted truncate">{colaborador?.nome || process.cargo || 'Colaborador'}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <div className="text-[11px] font-bold text-muted">{Math.round(process.percentual_conclusao)}%</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5 border border-line-strong/50">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-primary text-xl font-black">{selectedProcess?.titulo || 'Selecione um processo'}</div>
                  <div className="mt-1 text-sm font-bold text-muted">
                    {selectedProcess?.colaborador_id ? collaboratorMap.get(selectedProcess.colaborador_id)?.nome : selectedProcess?.cargo}
                  </div>
                </div>
                {selectedProcess ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={PROCESS_STATUS_META[selectedProcess.status]?.variant || 'default'}>
                      {PROCESS_STATUS_META[selectedProcess.status]?.label || selectedProcess.status}
                    </Badge>
                    <Badge variant="danger">{selectedProcess.prioridade}</Badge>
                  </div>
                ) : null}
              </div>

              {selectedProcess ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  <div className="rounded-2xl border border-line bg-surface/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Abertura</div>
                    <div className="mt-2 text-sm font-black text-primary">{new Date(`${selectedProcess.data_inicio}T00:00:00`).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Fim previsto</div>
                    <div className="mt-2 text-sm font-black text-primary">
                      {selectedProcess.data_fim_prevista ? new Date(`${selectedProcess.data_fim_prevista}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface/30 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Cargo</div>
                    <div className="mt-2 text-sm font-black text-primary">{selectedProcess.cargo || 'Não informado'}</div>
                  </div>
                </div>
              ) : null}
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
              <Card className="p-5 border border-line-strong/50">
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="w-4 h-4 text-warning" />
                  <h3 className="text-primary text-base font-black">Timeline de etapas</h3>
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
                          selectedStageId === stage.id ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface/30 hover:bg-surface/50'
                        )}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-primary font-black">{stage.ordem}. {stage.titulo}</div>
                            <div className="mt-1 text-xs font-bold text-muted">
                              Categoria: {stage.categoria}
                              {stage.data_limite ? ` • Prazo: ${new Date(`${stage.data_limite}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}
                            </div>
                          </div>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                      </button>
                    );
                  })}
                  {stages.length === 0 ? <div className="text-sm font-bold text-muted">As etapas aparecerão aqui após a criação do processo.</div> : null}
                </div>
              </Card>

              <Card className="p-5 border border-line-strong/50">
                <div className="flex items-center gap-2 mb-4">
                  <FileWarning className="w-4 h-4 text-danger" />
                  <h3 className="text-primary text-base font-black">Dados do desligamento</h3>
                </div>
                {offboarding ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">PDFs oficiais</div>
                          <div className="mt-2 text-sm font-bold text-secondary">Gere o aviso prévio oficial e mantenha o histórico dos documentos gerados nesta jornada.</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={!selectedProcessId || generating}
                            onClick={async () => {
                              const processId = selectedProcessId;
                              if (!processId) return;
                              setGenerating(true);
                              await run(
                                async () => {
                                  await rhJornadaService.generateDocument(processId, 'aviso_previo');
                                  const docs = await rhJornadaService.fetchGeneratedDocuments(processId);
                                  setGeneratedDocs(docs);
                                },
                                {
                                  success: 'Aviso prévio gerado.',
                                  error: 'Não foi possível gerar o aviso prévio.',
                                }
                              );
                              setGenerating(false);
                            }}
                            className={cn(
                              'px-4 py-2.5 rounded-2xl font-black text-primary flex items-center gap-2 transition-all',
                              !selectedProcessId || generating ? 'bg-surface-3 opacity-60 cursor-not-allowed' : 'bg-accent hover:bg-accent'
                            )}
                          >
                            <FileText className="w-4 h-4" />
                            Gerar aviso prévio
                          </button>
                          <button
                            type="button"
                            disabled={!selectedProcessId || generating}
                            onClick={async () => {
                              const processId = selectedProcessId;
                              if (!processId) return;
                              setGenerating(true);
                              await run(
                                async () => {
                                  await rhJornadaService.generateDocument(processId, 'checklist_documental');
                                  const docs = await rhJornadaService.fetchGeneratedDocuments(processId);
                                  setGeneratedDocs(docs);
                                },
                                {
                                  success: 'Checklist documental gerado.',
                                  error: 'Não foi possível gerar o checklist documental.',
                                }
                              );
                              setGenerating(false);
                            }}
                            className={cn(
                              'px-4 py-2.5 rounded-2xl font-black text-primary flex items-center gap-2 transition-all',
                              !selectedProcessId || generating ? 'bg-surface-3 opacity-60 cursor-not-allowed' : 'bg-surface-2 hover:bg-surface-3'
                            )}
                          >
                            <FileText className="w-4 h-4" />
                            Gerar checklist
                          </button>
                        </div>
                      </div>
                      {generatedDocs.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {generatedDocs.map((doc) => (
                            <div key={doc.id} className="rounded-2xl border border-line bg-bg/40 p-3 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-primary font-black">{doc.tipo_documento.replaceAll('_', ' ')}</div>
                                <div className="mt-1 text-xs font-bold text-muted">
                                  {new Date(doc.gerado_em).toLocaleString('pt-BR')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => run(
                                  async () => {
                                    const url = await rhJornadaService.getGeneratedDocumentSignedUrl(doc);
                                    if (selectedProcessId) {
                                      const docs = await rhJornadaService.fetchGeneratedDocuments(selectedProcessId);
                                      setGeneratedDocs(docs);
                                    }
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  },
                                  { error: 'Não foi possível abrir o documento.' }
                                )}
                                className="px-4 py-2.5 rounded-2xl border border-line bg-surface/40 text-secondary font-black hover:bg-surface/60 flex items-center gap-2 transition-all"
                              >
                                <Eye className="w-4 h-4" />
                                Abrir
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Motivo</div>
                      <div className="mt-2 text-sm font-black text-primary">{MOTIVO_OPTIONS.find((item) => item.value === offboarding.motivo_tipo)?.label || offboarding.motivo_tipo}</div>
                    </div>
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Aviso prévio</div>
                      <div className="mt-2 text-sm font-black text-primary">{AVISO_OPTIONS.find((item) => item.value === offboarding.aviso_previo_tipo)?.label || offboarding.aviso_previo_tipo}</div>
                      <div className="mt-1 text-xs font-bold text-muted">
                        {offboarding.aviso_previo_inicio || offboarding.aviso_previo_fim
                          ? `${offboarding.aviso_previo_inicio ? new Date(`${offboarding.aviso_previo_inicio}T00:00:00`).toLocaleDateString('pt-BR') : '—'} até ${offboarding.aviso_previo_fim ? new Date(`${offboarding.aviso_previo_fim}T00:00:00`).toLocaleDateString('pt-BR') : '—'}`
                          : 'Sem datas informadas'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Redução / Liberação</div>
                      <div className="mt-2 text-sm font-black text-primary">{REDUCAO_OPTIONS.find((item) => item.value === offboarding.opcao_reducao_jornada)?.label || 'Não se aplica'}</div>
                    </div>
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Motivo detalhado</div>
                      <div className="mt-2 text-sm font-bold text-secondary">{offboarding.motivo_detalhado || 'Sem detalhamento adicional.'}</div>
                    </div>
                    <div className="rounded-2xl border border-line bg-surface/30 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-black">Observações</div>
                      <div className="mt-2 text-sm font-bold text-secondary">{offboarding.observacoes || 'Sem observações adicionais.'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-muted">Os dados específicos do desligamento aparecerão aqui.</div>
                )}
              </Card>
            </div>

            <RhStageExecutionPanel process={selectedProcess} stage={selectedStage} onStageUpdated={refreshSelectedProcess} />

            <RhEvaluationPanel process={selectedProcess} processId={selectedProcessId} stage={selectedStage} />

            <RhParticipantsPanel process={selectedProcess} />

            <RhProcessActivityPanel processId={selectedProcessId} stageId={selectedStageId} />
          </div>
        </div>
      )}

      <DesligamentoCreateModal isOpen={createOpen} templates={templates} colaboradores={colaboradores} onClose={() => setCreateOpen(false)} onCreated={loadData} />
    </div>
  );
};
