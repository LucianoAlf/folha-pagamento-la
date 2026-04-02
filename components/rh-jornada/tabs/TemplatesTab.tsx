import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, CopyPlus, ExternalLink, FileBadge, Layers3, LibraryBig, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Card, CustomSelect, ErrorState, LoadingSpinner } from '../../UI';
import { rhJornadaService } from '../../../services/rhJornadaService';
import type { RhParticipantRole, RhPdiTemplate, RhPdiTemplateCheckpoint, RhPdiTemplateCompetence, RhPdiTemplateObjective, RhPdiCycleType, RhProcessType, RhStageCategory, RhTemplate, RhTemplateChecklistItem, RhTemplateDocument, RhTemplateStage } from '../../../types/rh';
import { RH_PDI_CHECKPOINT_TYPES, RH_PDI_COMPETENCE_CATEGORIES, RH_PDI_OBJECTIVE_TYPES, RH_PDI_CYCLE_TYPES } from '../../../types/rh';

const PROCESS_OPTIONS: { value: RhProcessType; label: string }[] = [
  { value: 'recrutamento', label: 'Recrutamento' },
  { value: 'onboarding', label: 'Integração' },
  { value: 'desligamento', label: 'Desligamento' },
];

const CATEGORY_OPTIONS: { value: RhStageCategory; label: string }[] = [
  { value: 'entrevista', label: 'Entrevista' },
  { value: 'aula_teste', label: 'Aula teste' },
  { value: 'documentacao', label: 'Documentação' },
  { value: 'admissional', label: 'Admissional' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'cultura', label: 'Cultura' },
  { value: 'acessos', label: 'Acessos' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'saida', label: 'Saída' },
  { value: 'documento_oficial', label: 'Documento oficial' },
  { value: 'encerramento', label: 'Encerramento' },
];

const ROLE_OPTIONS: { value: RhParticipantRole; label: string }[] = [
  { value: 'rh', label: 'RH' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'avaliador', label: 'Avaliador' },
  { value: 'financeiro', label: 'Financeiro' },
];

const PDI_CYCLE_OPTIONS: { value: RhPdiCycleType | ''; label: string }[] = [
  { value: '', label: 'Sem ciclo padrao' },
  ...RH_PDI_CYCLE_TYPES.map((value) => ({ value, label: value })),
];

export const TemplatesTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RhTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [stages, setStages] = useState<RhTemplateStage[]>([]);
  const [documents, setDocuments] = useState<RhTemplateDocument[]>([]);
  const [checklistItems, setChecklistItems] = useState<RhTemplateChecklistItem[]>([]);
  const [templateForm, setTemplateForm] = useState({
    nome: '',
    descricao: '',
    tipo_processo: 'onboarding' as RhProcessType,
    ativo: true,
  });
  const [newStage, setNewStage] = useState({
    codigo: '',
    titulo: '',
    categoria: 'documentacao' as RhStageCategory,
    ordem: '1',
    obrigatoria: true,
    responsavel_padrao_papel: 'rh' as RhParticipantRole,
    instrucoes: '',
    modelo_mensagem: '',
    link_referencia: '',
    link_reuniao: '',
    notificar_responsaveis: true,
    notificar_colaborador: false,
  });
  const [newChecklist, setNewChecklist] = useState({
    titulo: '',
    descricao: '',
    link_url: '',
    obrigatorio: true,
  });
  const [newDocument, setNewDocument] = useState({
    tipo_documento: '',
    ordem: '1',
    obrigatorio: true,
  });
  const [pdiTemplates, setPdiTemplates] = useState<RhPdiTemplate[]>([]);
  const [selectedPdiTemplateId, setSelectedPdiTemplateId] = useState<string | null>(null);
  const [pdiCompetences, setPdiCompetences] = useState<RhPdiTemplateCompetence[]>([]);
  const [pdiObjectives, setPdiObjectives] = useState<RhPdiTemplateObjective[]>([]);
  const [pdiCheckpoints, setPdiCheckpoints] = useState<RhPdiTemplateCheckpoint[]>([]);
  const [pdiTemplateForm, setPdiTemplateForm] = useState({
    nome: '',
    descricao: '',
    escopo_cargo: '',
    ciclo_tipo: '' as RhPdiCycleType | '',
    ativo: true,
  });
  const [newPdiCompetence, setNewPdiCompetence] = useState({
    nome: '',
    categoria: RH_PDI_COMPETENCE_CATEGORIES[0],
    nivel_alvo: '3',
  });
  const [newPdiObjective, setNewPdiObjective] = useState({
    competencia_template_id: '',
    titulo: '',
    tipo: RH_PDI_OBJECTIVE_TYPES[0],
    prazo_offset_dias: '30',
  });
  const [newPdiCheckpoint, setNewPdiCheckpoint] = useState({
    objetivo_template_id: '',
    titulo: '',
    tipo: RH_PDI_CHECKPOINT_TYPES[0],
    prazo_offset_dias: '30',
  });
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, nextPdiTemplates] = await Promise.all([
        rhJornadaService.fetchTemplates(),
        rhJornadaService.fetchPdiTemplates(),
      ]);
      setTemplates(data);
      setPdiTemplates(nextPdiTemplates);
      setSelectedTemplateId((prev) => prev || data[0]?.id || null);
      setSelectedPdiTemplateId((prev) => prev || nextPdiTemplates[0]?.id || null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setStages([]);
      setDocuments([]);
      setChecklistItems([]);
      return;
    }
    let mounted = true;
    void Promise.all([
      rhJornadaService.fetchTemplateStages(selectedTemplateId),
      rhJornadaService.fetchTemplateDocuments(selectedTemplateId),
    ])
      .then(([nextStages, nextDocuments]) => {
        if (!mounted) return;
        setStages(nextStages);
        setDocuments(nextDocuments);
        setSelectedStageId((current) => current && nextStages.some((stage) => stage.id === current) ? current : (nextStages[0]?.id || null));
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err?.message || 'Não foi possível carregar o conteúdo do template.');
      });
    return () => {
      mounted = false;
    };
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!selectedStageId) {
      setChecklistItems([]);
      return;
    }
    void rhJornadaService.fetchTemplateChecklistItems(selectedStageId).then(setChecklistItems).catch((err: any) => {
      setError(err?.message || 'Não foi possível carregar o checklist da etapa.');
    });
  }, [selectedStageId]);

  useEffect(() => {
    if (!selectedPdiTemplateId) {
      setPdiCompetences([]);
      setPdiObjectives([]);
      setPdiCheckpoints([]);
      return;
    }
    void Promise.all([
      rhJornadaService.fetchPdiTemplateCompetences(selectedPdiTemplateId),
      rhJornadaService.fetchPdiTemplateObjectives(selectedPdiTemplateId),
      rhJornadaService.fetchPdiTemplateCheckpoints(selectedPdiTemplateId),
    ]).then(([nextCompetences, nextObjectives, nextCheckpoints]) => {
      setPdiCompetences(nextCompetences);
      setPdiObjectives(nextObjectives);
      setPdiCheckpoints(nextCheckpoints);
    }).catch((err: any) => {
      setError(err?.message || 'Não foi possível carregar o modelo de PDI.');
    });
  }, [selectedPdiTemplateId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );
  const selectedStage = useMemo(() => stages.find((stage) => stage.id === selectedStageId) || null, [stages, selectedStageId]);
  const selectedPdiTemplate = useMemo(() => pdiTemplates.find((template) => template.id === selectedPdiTemplateId) || null, [pdiTemplates, selectedPdiTemplateId]);
  const selectedTemplateContext = selectedTemplate?.nome || 'Selecione um modelo operacional';
  const selectedPdiTemplateContext = selectedPdiTemplate?.nome || 'Selecione um modelo de PDI';

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateForm({
      nome: selectedTemplate.nome,
      descricao: selectedTemplate.descricao || '',
      tipo_processo: selectedTemplate.tipo_processo,
      ativo: selectedTemplate.ativo,
    });
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (!selectedPdiTemplate) return;
    setPdiTemplateForm({
      nome: selectedPdiTemplate.nome,
      descricao: selectedPdiTemplate.descricao || '',
      escopo_cargo: selectedPdiTemplate.escopo_cargo || '',
      ciclo_tipo: selectedPdiTemplate.ciclo_tipo || '',
      ativo: selectedPdiTemplate.ativo,
    });
  }, [selectedPdiTemplate?.id]);

  const refreshTemplateDetails = async (templateId = selectedTemplateId) => {
    if (!templateId) return;
    const [nextTemplates, nextStages, nextDocuments] = await Promise.all([
      rhJornadaService.fetchTemplates(),
      rhJornadaService.fetchTemplateStages(templateId),
      rhJornadaService.fetchTemplateDocuments(templateId),
    ]);
    setTemplates(nextTemplates);
    setStages(nextStages);
    setDocuments(nextDocuments);
    setSelectedTemplateId(templateId);
    setSelectedStageId((current) => current && nextStages.some((stage) => stage.id === current) ? current : (nextStages[0]?.id || null));
  };

  const refreshPdiTemplateDetails = async (templateId = selectedPdiTemplateId) => {
    if (!templateId) return;
    const [nextTemplates, nextCompetences, nextObjectives, nextCheckpoints] = await Promise.all([
      rhJornadaService.fetchPdiTemplates(),
      rhJornadaService.fetchPdiTemplateCompetences(templateId),
      rhJornadaService.fetchPdiTemplateObjectives(templateId),
      rhJornadaService.fetchPdiTemplateCheckpoints(templateId),
    ]);
    setPdiTemplates(nextTemplates);
    setPdiCompetences(nextCompetences);
    setPdiObjectives(nextObjectives);
    setPdiCheckpoints(nextCheckpoints);
    setSelectedPdiTemplateId(templateId);
  };

  if (loading) return <LoadingSpinner />;
  if (error && templates.length === 0) return <ErrorState message={error} onRetry={loadTemplates} />;

  return (
    <div className="space-y-6">
      <Card className="p-5 border border-violet-500/20 bg-violet-500/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-violet-200/80 font-black">Governança de modelos</div>
            <div className="mt-2 text-lg font-black text-white">{selectedTemplateContext}</div>
            <div className="mt-1 text-sm font-bold text-slate-300">
              {selectedTemplate ? `${selectedTemplate.tipo_processo} • v${selectedTemplate.versao}` : 'Selecione um modelo operacional para editar etapas, checklist e documentos.'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">Modelo de PDI em foco</div>
            <div className="mt-2 text-base font-black text-white truncate">{selectedPdiTemplateContext}</div>
            <div className="mt-1 text-xs font-bold text-slate-400">{pdiTemplates.filter((item) => item.ativo).length} ativos</div>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Modelos ativos</div>
          <div className="mt-2 text-3xl font-black text-white">{templates.filter((item) => item.ativo).length}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Base operacional do módulo</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Etapas</div>
          <div className="mt-2 text-3xl font-black text-white">{stages.length}</div>
          <div className="mt-1 text-xs font-bold text-slate-400 truncate">{selectedTemplateContext}</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Documentos</div>
          <div className="mt-2 text-3xl font-black text-white">{documents.length}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Materialização documental prevista</div>
        </Card>
        <Card className="p-5 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Versão</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">v{selectedTemplate?.versao || 0}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">Controle de governança do modelo</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <Card className="p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <LibraryBig className="w-4 h-4 text-violet-300" />
            <h3 className="text-white text-base font-black">Catálogo de modelos</h3>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                try {
                  const created = await rhJornadaService.createTemplate({
                    nome: 'Novo modelo RH',
                    descricao: 'Ajuste os dados, etapas e documentos.',
                    tipo_processo: 'onboarding',
                    ativo: true,
                  });
                  await refreshTemplateDetails(created.id);
                } finally {
                  setSaving(false);
                }
              }}
              className="w-full rounded-3xl border border-dashed border-violet-500/40 bg-violet-500/10 p-4 text-left text-violet-200 font-black hover:bg-violet-500/15 transition-all"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Novo modelo
              </div>
            </button>
            {templates.map((template) => {
              const active = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={[
                    'w-full rounded-3xl border p-4 text-left transition-all',
                    active
                      ? 'border-violet-500/30 bg-violet-500/10'
                      : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-black truncate">{template.nome}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400 line-clamp-2">{template.descricao || 'Sem descrição.'}</div>
                    </div>
                    <Badge variant={template.ativo ? 'success' : 'default'}>{template.tipo_processo}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    versão {template.versao}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 border border-slate-700/50">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-white text-xl font-black">{selectedTemplate?.nome || 'Selecione um modelo'}</div>
                  <div className="mt-1 text-sm font-bold text-slate-400">
                    {selectedTemplate?.descricao || 'Selecione um modelo para ver etapas e documentos obrigatórios.'}
                  </div>
                </div>
                {selectedTemplate ? <Badge variant="info">{selectedTemplate.tipo_processo}</Badge> : null}
              </div>

              {selectedTemplate ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Nome</div>
                      <input
                        value={templateForm.nome}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, nome: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Tipo de processo</div>
                      <CustomSelect
                        value={templateForm.tipo_processo}
                        onValueChange={(value) => setTemplateForm((prev) => ({ ...prev, tipo_processo: value as RhProcessType }))}
                        options={PROCESS_OPTIONS}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">Descrição</div>
                      <textarea
                        value={templateForm.descricao}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, descricao: e.target.value }))}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await rhJornadaService.updateTemplate(selectedTemplate.id, templateForm);
                          await refreshTemplateDetails(selectedTemplate.id);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black flex items-center gap-2 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      Salvar modelo
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const versioned = await rhJornadaService.createTemplateVersionFrom(selectedTemplate.id);
                          await refreshTemplateDetails(versioned.id);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black hover:bg-slate-900/60 flex items-center gap-2 transition-all"
                    >
                      <CopyPlus className="w-4 h-4" />
                      Nova versão
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await rhJornadaService.archiveTemplate(selectedTemplate.id);
                          await refreshTemplateDetails(selectedTemplate.id);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 font-black hover:bg-rose-500/15 transition-all"
                    >
                      Arquivar modelo
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <Layers3 className="w-4 h-4 text-cyan-300" />
                <h3 className="text-white text-base font-black">Etapas oficiais</h3>
              </div>
              <div className="space-y-3">
                {stages.map((stage) => (
                  <div
                    key={stage.id}
                    className={`rounded-2xl border p-4 ${selectedStageId === stage.id ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/30'}`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[90px_minmax(0,1fr)_180px] gap-3">
                      <input
                        value={stage.ordem}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, ordem: Number(e.target.value) || item.ordem } : item))}
                        className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <input
                        value={stage.titulo}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, titulo: e.target.value } : item))}
                        onClick={() => setSelectedStageId(stage.id)}
                        className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <CustomSelect
                        value={stage.categoria}
                        onValueChange={(value) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, categoria: value as RhStageCategory } : item))}
                        options={CATEGORY_OPTIONS}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={stage.obrigatoria}
                          onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, obrigatoria: e.target.checked } : item))}
                          className="accent-cyan-500"
                        />
                        Obrigatória
                      </label>
                      <div className="min-w-[220px] flex-1">
                        <CustomSelect
                          value={stage.responsavel_padrao_papel || 'rh'}
                          onValueChange={(value) =>
                            setStages((prev) =>
                              prev.map((item) => item.id === stage.id ? { ...item, responsavel_padrao_papel: value as RhParticipantRole } : item)
                            )
                          }
                          options={ROLE_OPTIONS}
                        />
                      </div>
                      <input
                        value={stage.link_referencia || ''}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, link_referencia: e.target.value } : item))}
                        onClick={() => setSelectedStageId(stage.id)}
                        placeholder="Link de referência"
                        className="min-w-[240px] flex-1 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <input
                        value={stage.link_reuniao || ''}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, link_reuniao: e.target.value } : item))}
                        onClick={() => setSelectedStageId(stage.id)}
                        placeholder="Link de reunião"
                        className="min-w-[240px] flex-1 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await rhJornadaService.updateTemplateStage(stage.id, {
                            titulo: stage.titulo,
                            categoria: stage.categoria,
                            ordem: stage.ordem,
                            obrigatoria: stage.obrigatoria,
                            responsavel_padrao_papel: stage.responsavel_padrao_papel || null,
                            instrucoes: stage.instrucoes || null,
                            modelo_mensagem: stage.modelo_mensagem || null,
                            link_referencia: stage.link_referencia || null,
                            link_reuniao: stage.link_reuniao || null,
                            notificar_responsaveis: stage.notificar_responsaveis,
                            notificar_colaborador: stage.notificar_colaborador,
                          });
                          await refreshTemplateDetails(selectedTemplate?.id || null);
                        }}
                        className="px-4 py-2 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition-all"
                      >
                        Salvar etapa
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <textarea
                        value={stage.instrucoes || ''}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, instrucoes: e.target.value } : item))}
                        onClick={() => setSelectedStageId(stage.id)}
                        rows={3}
                        placeholder="Instruções da etapa"
                        className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <textarea
                        value={stage.modelo_mensagem || ''}
                        onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, modelo_mensagem: e.target.value } : item))}
                        onClick={() => setSelectedStageId(stage.id)}
                        rows={3}
                        placeholder="Modelo de mensagem"
                        className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={stage.notificar_responsaveis}
                          onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, notificar_responsaveis: e.target.checked } : item))}
                          className="accent-cyan-500"
                        />
                        Notificar responsáveis
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={stage.notificar_colaborador}
                          onChange={(e) => setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, notificar_colaborador: e.target.checked } : item))}
                          className="accent-cyan-500"
                        />
                        Notificar colaborador
                      </label>
                    </div>
                  </div>
                ))}
                {stages.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhuma etapa carregada.</div> : null}
              </div>
              {selectedTemplate ? (
                <>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)_180px_180px] gap-3">
                  <input
                    value={newStage.ordem}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, ordem: e.target.value }))}
                    placeholder="Ordem"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <input
                    value={newStage.titulo}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, titulo: e.target.value, codigo: prev.codigo || e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    placeholder="Nova etapa"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <input
                    value={newStage.link_referencia}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, link_referencia: e.target.value }))}
                    placeholder="Link de referência"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <input
                    value={newStage.link_reuniao}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, link_reuniao: e.target.value }))}
                    placeholder="Link de reunião"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <CustomSelect value={newStage.categoria} onValueChange={(value) => setNewStage((prev) => ({ ...prev, categoria: value as RhStageCategory }))} options={CATEGORY_OPTIONS} />
                  <button
                    type="button"
                    onClick={async () => {
                      await rhJornadaService.createTemplateStage({
                        template_id: selectedTemplate.id,
                        codigo: newStage.codigo || newStage.titulo.toLowerCase().replace(/\s+/g, '_'),
                        titulo: newStage.titulo,
                        categoria: newStage.categoria,
                        ordem: Number(newStage.ordem) || stages.length + 1,
                        obrigatoria: newStage.obrigatoria,
                        responsavel_padrao_papel: newStage.responsavel_padrao_papel,
                        instrucoes: newStage.instrucoes || null,
                        modelo_mensagem: newStage.modelo_mensagem || null,
                        link_referencia: newStage.link_referencia || null,
                        link_reuniao: newStage.link_reuniao || null,
                        notificar_responsaveis: newStage.notificar_responsaveis,
                        notificar_colaborador: newStage.notificar_colaborador,
                      });
                      setNewStage((prev) => ({ ...prev, titulo: '', codigo: '', ordem: String(stages.length + 2), instrucoes: '', modelo_mensagem: '', link_referencia: '', link_reuniao: '', notificar_responsaveis: true, notificar_colaborador: false }));
                      await refreshTemplateDetails(selectedTemplate.id);
                    }}
                    className="px-4 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition-all"
                  >
                    Adicionar etapa
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                  <CustomSelect
                    value={newStage.responsavel_padrao_papel}
                    onValueChange={(value) => setNewStage((prev) => ({ ...prev, responsavel_padrao_papel: value as RhParticipantRole }))}
                    options={ROLE_OPTIONS}
                  />
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={newStage.obrigatoria}
                      onChange={(e) => setNewStage((prev) => ({ ...prev, obrigatoria: e.target.checked }))}
                      className="accent-cyan-500"
                    />
                    Etapa obrigatória
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <textarea
                    value={newStage.instrucoes}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, instrucoes: e.target.value }))}
                    rows={3}
                    placeholder="Instruções padrão da etapa"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <textarea
                    value={newStage.modelo_mensagem}
                    onChange={(e) => setNewStage((prev) => ({ ...prev, modelo_mensagem: e.target.value }))}
                    rows={3}
                    placeholder="Modelo de mensagem padrão"
                    className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={newStage.notificar_responsaveis}
                      onChange={(e) => setNewStage((prev) => ({ ...prev, notificar_responsaveis: e.target.checked }))}
                      className="accent-cyan-500"
                    />
                    Notificar responsáveis
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={newStage.notificar_colaborador}
                      onChange={(e) => setNewStage((prev) => ({ ...prev, notificar_colaborador: e.target.checked }))}
                      className="accent-cyan-500"
                    />
                    Notificar colaborador
                  </label>
                </div>
                </>
              ) : null}
            </Card>

            <div className="space-y-6">
              <Card className="p-5 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-4">
                  <FileBadge className="w-4 h-4 text-amber-300" />
                  <h3 className="text-white text-base font-black">Documentos obrigatórios</h3>
                </div>
                <div className="space-y-3">
                  {documents.map((document) => (
                    <div key={document.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_auto] gap-3">
                        <input
                          value={document.tipo_documento}
                          onChange={(e) => setDocuments((prev) => prev.map((item) => item.id === document.id ? { ...item, tipo_documento: e.target.value } : item))}
                          className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                        <input
                          value={document.ordem}
                          onChange={(e) => setDocuments((prev) => prev.map((item) => item.id === document.id ? { ...item, ordem: Number(e.target.value) || item.ordem } : item))}
                          className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await rhJornadaService.updateTemplateDocument(document.id, {
                              tipo_documento: document.tipo_documento,
                              ordem: document.ordem,
                              obrigatorio: document.obrigatorio,
                            });
                            await refreshTemplateDetails(selectedTemplate?.id || null);
                          }}
                          className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black transition-all"
                        >
                          Salvar
                        </button>
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={document.obrigatorio}
                          onChange={(e) => setDocuments((prev) => prev.map((item) => item.id === document.id ? { ...item, obrigatorio: e.target.checked } : item))}
                          className="accent-amber-500"
                        />
                        Obrigatório
                      </label>
                    </div>
                  ))}
                  {documents.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum documento obrigatório configurado.</div> : null}
                </div>

                {selectedTemplate ? (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3">
                    <input
                      value={newDocument.tipo_documento}
                      onChange={(e) => setNewDocument((prev) => ({ ...prev, tipo_documento: e.target.value }))}
                      placeholder="Novo documento"
                      className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                    <input
                      value={newDocument.ordem}
                      onChange={(e) => setNewDocument((prev) => ({ ...prev, ordem: e.target.value }))}
                      placeholder="Ordem"
                      className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await rhJornadaService.createTemplateDocument({
                          template_id: selectedTemplate.id,
                          tipo_documento: newDocument.tipo_documento,
                          ordem: Number(newDocument.ordem) || documents.length + 1,
                          obrigatorio: newDocument.obrigatorio,
                        });
                        setNewDocument({ tipo_documento: '', ordem: String(documents.length + 2), obrigatorio: true });
                        await refreshTemplateDetails(selectedTemplate.id);
                      }}
                      className="px-4 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black transition-all"
                    >
                      Adicionar documento
                    </button>
                  </div>
                ) : null}
              </Card>

              <Card className="p-5 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="w-4 h-4 text-emerald-300" />
                  <h3 className="text-white text-base font-black">Checklist da etapa</h3>
                  {selectedStage ? <Badge variant="info">{selectedStage.titulo}</Badge> : null}
                </div>
                <div className="space-y-3">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-[90px_1fr_180px_auto] gap-3">
                        <input
                          value={item.ordem}
                          onChange={(e) => setChecklistItems((prev) => prev.map((current) => current.id === item.id ? { ...current, ordem: Number(e.target.value) || current.ordem } : current))}
                          className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                        <input
                          value={item.titulo}
                          onChange={(e) => setChecklistItems((prev) => prev.map((current) => current.id === item.id ? { ...current, titulo: e.target.value } : current))}
                          className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                        <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-300">
                          <input
                            type="checkbox"
                            checked={item.obrigatorio}
                            onChange={(e) => setChecklistItems((prev) => prev.map((current) => current.id === item.id ? { ...current, obrigatorio: e.target.checked } : current))}
                            className="accent-emerald-500"
                          />
                          Obrigatório
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await rhJornadaService.updateTemplateChecklistItem(item.id, {
                                titulo: item.titulo,
                                descricao: item.descricao || null,
                                link_url: item.link_url || null,
                                obrigatorio: item.obrigatorio,
                                ordem: item.ordem,
                              });
                              if (selectedStage) setChecklistItems(await rhJornadaService.fetchTemplateChecklistItems(selectedStage.id));
                            }}
                            className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition-all"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await rhJornadaService.deleteTemplateChecklistItem(item.id);
                              if (selectedStage) setChecklistItems(await rhJornadaService.fetchTemplateChecklistItems(selectedStage.id));
                            }}
                            className="p-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={item.descricao || ''}
                        onChange={(e) => setChecklistItems((prev) => prev.map((current) => current.id === item.id ? { ...current, descricao: e.target.value } : current))}
                        rows={3}
                        placeholder="Descrição do item"
                        className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                        <input
                          value={item.link_url || ''}
                          onChange={(e) => setChecklistItems((prev) => prev.map((current) => current.id === item.id ? { ...current, link_url: e.target.value } : current))}
                          placeholder="Link opcional"
                          className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                        {item.link_url ? (
                          <button
                            type="button"
                            onClick={() => window.open(item.link_url!, '_blank', 'noopener,noreferrer')}
                            className="px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-200 font-black hover:bg-slate-900/60 flex items-center gap-2 transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Abrir
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {checklistItems.length === 0 ? <div className="text-sm font-bold text-slate-500">Nenhum item de checklist para a etapa selecionada.</div> : null}
                </div>

                {selectedStage ? (
                  <div className="mt-5 space-y-3">
                    <input
                      value={newChecklist.titulo}
                      onChange={(e) => setNewChecklist((prev) => ({ ...prev, titulo: e.target.value }))}
                      placeholder="Novo item de checklist"
                      className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <textarea
                      value={newChecklist.descricao}
                      onChange={(e) => setNewChecklist((prev) => ({ ...prev, descricao: e.target.value }))}
                      rows={3}
                      placeholder="Descrição padrão do item"
                      className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                      <input
                        value={newChecklist.link_url}
                        onChange={(e) => setNewChecklist((prev) => ({ ...prev, link_url: e.target.value }))}
                        placeholder="Link opcional"
                        className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      />
                      <label className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={newChecklist.obrigatorio}
                          onChange={(e) => setNewChecklist((prev) => ({ ...prev, obrigatorio: e.target.checked }))}
                          className="accent-emerald-500"
                        />
                        Obrigatório
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          await rhJornadaService.createTemplateChecklistItem({
                            template_etapa_id: selectedStage.id,
                            titulo: newChecklist.titulo,
                            descricao: newChecklist.descricao || null,
                            link_url: newChecklist.link_url || null,
                            obrigatorio: newChecklist.obrigatorio,
                            ordem: checklistItems.length + 1,
                          });
                          setNewChecklist({ titulo: '', descricao: '', link_url: '', obrigatorio: true });
                          setChecklistItems(await rhJornadaService.fetchTemplateChecklistItems(selectedStage.id));
                        }}
                        className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition-all"
                      >
                        Adicionar item
                      </button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            <Card className="p-5 border border-slate-700/50">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div><div className="text-white text-xl font-black">Modelos de PDI</div><div className="mt-1 text-sm font-bold text-slate-400">Padronize trilhas, competências, objetivos e checkpoints por cargo.</div></div>
                <button type="button" onClick={async () => { setSaving(true); try { const created = await rhJornadaService.createPdiTemplate({ nome: 'Novo modelo de PDI', descricao: 'Ajuste trilha, competências e objetivos.', ativo: true }); await refreshPdiTemplateDetails(created.id); } finally { setSaving(false); } }} className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all">Novo modelo de PDI</button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-6">
                <div className="space-y-3">
                  {pdiTemplates.map((template) => <button key={template.id} type="button" onClick={() => setSelectedPdiTemplateId(template.id)} className={['w-full rounded-3xl border p-4 text-left transition-all', template.id === selectedPdiTemplateId ? 'border-violet-500/30 bg-violet-500/10' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50'].join(' ')}><div className="text-white font-black">{template.nome}</div><div className="mt-1 text-xs font-bold text-slate-400">{template.escopo_cargo || 'Sem cargo'} • v{template.versao}</div><div className="mt-3"><Badge variant={template.ativo ? 'success' : 'default'}>{template.ciclo_tipo || 'personalizado'}</Badge></div></button>)}
                </div>

                {selectedPdiTemplate ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input value={pdiTemplateForm.nome} onChange={(e) => setPdiTemplateForm((prev) => ({ ...prev, nome: e.target.value }))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" placeholder="Nome do modelo" />
                      <input value={pdiTemplateForm.escopo_cargo} onChange={(e) => setPdiTemplateForm((prev) => ({ ...prev, escopo_cargo: e.target.value }))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40" placeholder="Cargo alvo" />
                      <div className="md:col-span-2"><textarea value={pdiTemplateForm.descricao} onChange={(e) => setPdiTemplateForm((prev) => ({ ...prev, descricao: e.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-5 py-4 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none" placeholder="Descrição do modelo" /></div>
                      <CustomSelect value={pdiTemplateForm.ciclo_tipo} onValueChange={(value) => setPdiTemplateForm((prev) => ({ ...prev, ciclo_tipo: value as RhPdiCycleType | '' }))} options={PDI_CYCLE_OPTIONS} />
                      <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={pdiTemplateForm.ativo} onChange={(e) => setPdiTemplateForm((prev) => ({ ...prev, ativo: e.target.checked }))} className="accent-violet-500" />Ativo</label></div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={async () => { setSaving(true); try { await rhJornadaService.updatePdiTemplate(selectedPdiTemplate.id, pdiTemplateForm); await refreshPdiTemplateDetails(selectedPdiTemplate.id); } finally { setSaving(false); } }} className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all">Salvar modelo de PDI</button>
                      <button type="button" onClick={async () => { setSaving(true); try { await rhJornadaService.archivePdiTemplate(selectedPdiTemplate.id); await refreshPdiTemplateDetails(selectedPdiTemplate.id); } finally { setSaving(false); } }} className="px-4 py-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 font-black hover:bg-rose-500/15 transition-all">Arquivar</button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      <Card className="p-5 border border-slate-700/50">
                        <div className="text-white font-black mb-4">Competencias base</div>
                        <div className="space-y-3">
                          {pdiCompetences.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><input value={item.nome} onChange={(e) => setPdiCompetences((prev) => prev.map((current) => current.id === item.id ? { ...current, nome: e.target.value } : current))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /><div className="mt-3 grid grid-cols-2 gap-3"><CustomSelect value={item.categoria} onValueChange={(value) => setPdiCompetences((prev) => prev.map((current) => current.id === item.id ? { ...current, categoria: value as typeof item.categoria } : current))} options={RH_PDI_COMPETENCE_CATEGORIES.map((value) => ({ value, label: value }))} /><input value={item.nivel_alvo} onChange={(e) => setPdiCompetences((prev) => prev.map((current) => current.id === item.id ? { ...current, nivel_alvo: Number(e.target.value) || current.nivel_alvo } : current))} className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.updatePdiTemplateCompetence(item.id, { nome: item.nome, categoria: item.categoria, nivel_alvo: item.nivel_alvo, ordem: item.ordem }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="mt-3 px-4 py-2 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition-all">Salvar</button></div>)}
                          <div className="grid grid-cols-1 gap-3"><input value={newPdiCompetence.nome} onChange={(e) => setNewPdiCompetence((prev) => ({ ...prev, nome: e.target.value }))} placeholder="Nova competencia" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /><div className="grid grid-cols-2 gap-3"><CustomSelect value={newPdiCompetence.categoria} onValueChange={(value) => setNewPdiCompetence((prev) => ({ ...prev, categoria: value as typeof prev.categoria }))} options={RH_PDI_COMPETENCE_CATEGORIES.map((value) => ({ value, label: value }))} /><input value={newPdiCompetence.nivel_alvo} onChange={(e) => setNewPdiCompetence((prev) => ({ ...prev, nivel_alvo: e.target.value }))} placeholder="Nivel alvo" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.createPdiTemplateCompetence({ template_id: selectedPdiTemplate.id, nome: newPdiCompetence.nome, categoria: newPdiCompetence.categoria, nivel_alvo: Number(newPdiCompetence.nivel_alvo || 3), ordem: pdiCompetences.length + 1 }); setNewPdiCompetence({ nome: '', categoria: RH_PDI_COMPETENCE_CATEGORIES[0], nivel_alvo: '3' }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="px-4 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition-all">Adicionar competencia</button></div>
                        </div>
                      </Card>

                      <Card className="p-5 border border-slate-700/50">
                        <div className="text-white font-black mb-4">Objetivos padrao</div>
                        <div className="space-y-3">
                          {pdiObjectives.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><input value={item.titulo} onChange={(e) => setPdiObjectives((prev) => prev.map((current) => current.id === item.id ? { ...current, titulo: e.target.value } : current))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40" /><div className="mt-3 grid grid-cols-2 gap-3"><CustomSelect value={item.tipo} onValueChange={(value) => setPdiObjectives((prev) => prev.map((current) => current.id === item.id ? { ...current, tipo: value as typeof item.tipo } : current))} options={RH_PDI_OBJECTIVE_TYPES.map((value) => ({ value, label: value }))} /><input value={item.prazo_offset_dias || 0} onChange={(e) => setPdiObjectives((prev) => prev.map((current) => current.id === item.id ? { ...current, prazo_offset_dias: Number(e.target.value) || 0 } : current))} className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.updatePdiTemplateObjective(item.id, { titulo: item.titulo, tipo: item.tipo, prazo_offset_dias: item.prazo_offset_dias, competencia_template_id: item.competencia_template_id || null, ordem: item.ordem, obrigatorio: item.obrigatorio, score_peso: item.score_peso }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="mt-3 px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black transition-all">Salvar</button></div>)}
                          <div className="grid grid-cols-1 gap-3"><input value={newPdiObjective.titulo} onChange={(e) => setNewPdiObjective((prev) => ({ ...prev, titulo: e.target.value }))} placeholder="Novo objetivo" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40" /><CustomSelect value={newPdiObjective.competencia_template_id} onValueChange={(value) => setNewPdiObjective((prev) => ({ ...prev, competencia_template_id: value }))} options={[{ value: '', label: 'Sem competencia vinculada' }, ...pdiCompetences.map((item) => ({ value: item.id, label: item.nome }))]} /><div className="grid grid-cols-2 gap-3"><CustomSelect value={newPdiObjective.tipo} onValueChange={(value) => setNewPdiObjective((prev) => ({ ...prev, tipo: value as typeof prev.tipo }))} options={RH_PDI_OBJECTIVE_TYPES.map((value) => ({ value, label: value }))} /><input value={newPdiObjective.prazo_offset_dias} onChange={(e) => setNewPdiObjective((prev) => ({ ...prev, prazo_offset_dias: e.target.value }))} placeholder="Prazo em dias" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.createPdiTemplateObjective({ template_id: selectedPdiTemplate.id, competencia_template_id: newPdiObjective.competencia_template_id || null, titulo: newPdiObjective.titulo, tipo: newPdiObjective.tipo, descricao: null, obrigatorio: true, score_peso: 10, ordem: pdiObjectives.length + 1, prazo_offset_dias: Number(newPdiObjective.prazo_offset_dias || 30) }); setNewPdiObjective({ competencia_template_id: '', titulo: '', tipo: RH_PDI_OBJECTIVE_TYPES[0], prazo_offset_dias: '30' }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="px-4 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black transition-all">Adicionar objetivo</button></div>
                        </div>
                      </Card>

                      <Card className="p-5 border border-slate-700/50">
                        <div className="text-white font-black mb-4">Checkpoints padrao</div>
                        <div className="space-y-3">
                          {pdiCheckpoints.map((item) => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4"><input value={item.titulo} onChange={(e) => setPdiCheckpoints((prev) => prev.map((current) => current.id === item.id ? { ...current, titulo: e.target.value } : current))} className="w-full rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40" /><div className="mt-3 grid grid-cols-2 gap-3"><CustomSelect value={item.tipo} onValueChange={(value) => setPdiCheckpoints((prev) => prev.map((current) => current.id === item.id ? { ...current, tipo: value as typeof item.tipo } : current))} options={RH_PDI_CHECKPOINT_TYPES.map((value) => ({ value, label: value }))} /><input value={item.prazo_offset_dias || 0} onChange={(e) => setPdiCheckpoints((prev) => prev.map((current) => current.id === item.id ? { ...current, prazo_offset_dias: Number(e.target.value) || 0 } : current))} className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.updatePdiTemplateCheckpoint(item.id, { titulo: item.titulo, tipo: item.tipo, prazo_offset_dias: item.prazo_offset_dias, objetivo_template_id: item.objetivo_template_id || null, ordem: item.ordem }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="mt-3 px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black transition-all">Salvar</button></div>)}
                          <div className="grid grid-cols-1 gap-3"><input value={newPdiCheckpoint.titulo} onChange={(e) => setNewPdiCheckpoint((prev) => ({ ...prev, titulo: e.target.value }))} placeholder="Novo checkpoint" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40" /><CustomSelect value={newPdiCheckpoint.objetivo_template_id} onValueChange={(value) => setNewPdiCheckpoint((prev) => ({ ...prev, objetivo_template_id: value }))} options={[{ value: '', label: 'Sem objetivo vinculado' }, ...pdiObjectives.map((item) => ({ value: item.id, label: item.titulo }))]} /><div className="grid grid-cols-2 gap-3"><CustomSelect value={newPdiCheckpoint.tipo} onValueChange={(value) => setNewPdiCheckpoint((prev) => ({ ...prev, tipo: value as typeof prev.tipo }))} options={RH_PDI_CHECKPOINT_TYPES.map((value) => ({ value, label: value }))} /><input value={newPdiCheckpoint.prazo_offset_dias} onChange={(e) => setNewPdiCheckpoint((prev) => ({ ...prev, prazo_offset_dias: e.target.value }))} placeholder="Prazo em dias" className="rounded-2xl border border-slate-800 bg-[#0a0d14] px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40" /></div><button type="button" onClick={async () => { await rhJornadaService.createPdiTemplateCheckpoint({ template_id: selectedPdiTemplate.id, objetivo_template_id: newPdiCheckpoint.objetivo_template_id || null, titulo: newPdiCheckpoint.titulo, tipo: newPdiCheckpoint.tipo, ordem: pdiCheckpoints.length + 1, prazo_offset_dias: Number(newPdiCheckpoint.prazo_offset_dias || 30) }); setNewPdiCheckpoint({ objetivo_template_id: '', titulo: '', tipo: RH_PDI_CHECKPOINT_TYPES[0], prazo_offset_dias: '30' }); await refreshPdiTemplateDetails(selectedPdiTemplate.id); }} className="px-4 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black transition-all">Adicionar checkpoint</button></div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : <div className="text-sm font-bold text-slate-500">Selecione um modelo de PDI para editar.</div>}
              </div>
            </Card>
          </div>

          {error ? (
            <Card className="p-4 border border-amber-500/30 bg-amber-500/10">
              <div className="flex items-center gap-2 text-amber-200 font-black text-sm">
                <ClipboardList className="w-4 h-4" />
                {error}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};
