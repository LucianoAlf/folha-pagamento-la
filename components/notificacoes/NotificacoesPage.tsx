import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, CustomSelect, Modal, TimeSelect, ToggleSwitch, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { Bell, Calendar, ClipboardCheck, Clock, CreditCard, Loader2, Plus, Save, Send, Smartphone, Sparkles, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import type { NotificacaoConfig } from '../../types/agenda';
import type {
  WhatsappDestino,
  WhatsappDestinoFinalidade,
  WhatsappGrupoNotificacao,
  WhatsappGrupoNotificacaoFrequencia,
  WhatsappGrupoNotificacaoTipo,
} from '../../types';
import { fetchNotificacaoConfig, upsertNotificacaoConfig } from '../../services/agendaService';
import {
  createGrupoNotificacao,
  deleteGrupoNotificacao,
  listDestinos,
  listGrupoNotificacoes,
  toggleGrupoNotificacao,
  updateGrupoNotificacao,
} from '../../services/whatsappGruposService';
import { sendWhatsappMessage } from '../../services/whatsappService';

const grupoTipoOptions: { value: WhatsappGrupoNotificacaoTipo; label: string }[] = [
  { value: 'contas_a_pagar_dia', label: 'Contas a pagar do dia' },
  { value: 'resumo_financeiro_semanal', label: 'Resumo financeiro semanal' },
  { value: 'resumo_financeiro_mensal', label: 'Resumo financeiro mensal' },
];

const grupoTipoLabels = Object.fromEntries(grupoTipoOptions.map((opt) => [opt.value, opt.label])) as Record<
  WhatsappGrupoNotificacaoTipo,
  string
>;

const frequenciaOptions: { value: WhatsappGrupoNotificacaoFrequencia; label: string }[] = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
];

const diasSemanaGrupo = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda' },
  { value: '2', label: 'Terça' },
  { value: '3', label: 'Quarta' },
  { value: '4', label: 'Quinta' },
  { value: '5', label: 'Sexta' },
  { value: '6', label: 'Sábado' },
];

const diasMesGrupo = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

const finalidadeLabels: Record<WhatsappDestinoFinalidade, string> = {
  contas_diario: 'Financeiro Geral',
  diretoria: 'Diretoria',
  conciliacao: 'Conciliação',
  suporte: 'Suporte',
};

type GrupoDraft = {
  tipo: WhatsappGrupoNotificacaoTipo;
  frequencia: WhatsappGrupoNotificacaoFrequencia;
  horario: string;
  dia_semana: number | null;
  dia_mes: number | null;
};

const defaultFrequenciaPorTipo: Record<WhatsappGrupoNotificacaoTipo, WhatsappGrupoNotificacaoFrequencia> = {
  contas_a_pagar_dia: 'diario',
  resumo_financeiro_semanal: 'semanal',
  resumo_financeiro_mensal: 'mensal',
};

const normalizeHHMMDisplay = (value?: string | null) => String(value || '08:00').slice(0, 5);

export const NotificacoesPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'individual' | 'grupos'>('individual');
  const [gruposLoading, setGruposLoading] = useState(false);
  const [gruposLoaded, setGruposLoaded] = useState(false);
  const [gruposError, setGruposError] = useState<string | null>(null);
  const [destinos, setDestinos] = useState<WhatsappDestino[]>([]);
  const [grupoNotificacoes, setGrupoNotificacoes] = useState<WhatsappGrupoNotificacao[]>([]);
  const [grupoDrafts, setGrupoDrafts] = useState<Record<string, Partial<WhatsappGrupoNotificacao>>>({});
  const [grupoSavingIds, setGrupoSavingIds] = useState<Record<string, boolean>>({});
  const [addingDestinoId, setAddingDestinoId] = useState<string | null>(null);
  const [newGrupoDrafts, setNewGrupoDrafts] = useState<Record<string, GrupoDraft>>({});
  const [deleteGrupoTarget, setDeleteGrupoTarget] = useState<WhatsappGrupoNotificacao | null>(null);

  // Mobile detection (reactive)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Accordion state (mobile only)
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('notificacoes:accordion');
      return stored ? JSON.parse(stored) : { whatsapp: true, agenda: false, rh: false, contas: false, folha: false, ferias: false };
    } catch {
      return { whatsapp: true, agenda: false, rh: false, contas: false, folha: false, ferias: false };
    }
  });

  const toggleAccordion = (key: string) => {
    setAccordionOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('notificacoes:accordion', JSON.stringify(next));
      return next;
    });
  };

  const [config, setConfig] = useState<Partial<NotificacaoConfig>>({
    whatsapp_ativo: false,
    whatsapp_numero: '',

    agenda_lembrete_tarefas_ativo: true,
    agenda_lembrete_aniversarios_ativo: true,
    lembrete_padrao_minutos: 30,
    rh_agenda_lembrete_processos_ativo: true,
    rh_agenda_lembrete_processos_minutos: 1440,
    rh_agenda_lembrete_etapas_ativo: true,
    rh_agenda_lembrete_etapas_minutos: 1440,
    rh_agenda_lembrete_pdi_ativo: true,
    rh_agenda_lembrete_pdi_minutos: 1440,

    resumo_diario_ativo: true,
    resumo_diario_hora: '08:00',

    resumo_semanal_ativo: false,
    resumo_semanal_dia: 'domingo',
    resumo_semanal_hora: '20:00',

    contas_alerta_3d: false,
    contas_alerta_1d: false,
    contas_alerta_no_dia: false,
    contas_alerta_hora: '08:00',
    contas_resumo_semanal_ativo: false,
    contas_resumo_semanal_dia: 'segunda',
    contas_resumo_semanal_hora: '08:00',

    folha_alerta_fechamento_ativo: false,
    folha_alerta_fechamento_dia: 25,
    folha_alerta_aprovacao_pendente_ativo: false,

    ferias_alerta_vencimento_multa: true,
    ferias_alerta_concessivo_critico: true,
    ferias_alerta_concessivo_dias: 60,
    ferias_alerta_pagamento_pendente: true,
    ferias_alerta_aquisitivo_prox: false,
    ferias_alerta_aquisitivo_dias: 30,
    ferias_resumo_mensal_ativo: false,
    ferias_resumo_mensal_dia: 1,
    ferias_resumo_mensal_hora: 8,
  });

  // Padrão do sistema: Card “dark” com borda (como usamos no resto do app)
  // OBS: quando usamos bg-slate-* o componente Card não aplica borda padrão automaticamente.
  const cardClass = 'bg-bg/85 border border-line/70 backdrop-blur-none';

  const diasSemana = useMemo(
    () => [
      { value: 'segunda', label: 'Segunda' },
      { value: 'terca', label: 'Terça' },
      { value: 'quarta', label: 'Quarta' },
      { value: 'quinta', label: 'Quinta' },
      { value: 'sexta', label: 'Sexta' },
      { value: 'sabado', label: 'Sábado' },
      { value: 'domingo', label: 'Domingo' },
    ],
    []
  );

  const lembreteOptions = useMemo(
    () => [
      { value: '0', label: 'Sem lembrete' },
      { value: '10', label: '10 minutos antes' },
      { value: '15', label: '15 minutos antes' },
      { value: '30', label: '30 minutos antes' },
      { value: '60', label: '1 hora antes' },
      { value: '180', label: '3 horas antes' },
      { value: '1440', label: '1 dia antes' },
    ],
    []
  );

  useEffect(() => {
    setLoading(true);
    fetchNotificacaoConfig()
      .then((row) => {
        if (row) {
          // não expor google_refresh_token
          const { google_refresh_token: _ignored, ...safe } = row as any;
          setConfig((prev) => ({ ...prev, ...safe }));
        }
      })
      .catch((e: any) => setError(e?.message || 'Falha ao carregar configurações'))
      .finally(() => setLoading(false));
  }, []);

  const loadGrupoConfig = async () => {
    setGruposLoading(true);
    setGruposError(null);
    try {
      const [destinosRows, notificacoesRows] = await Promise.all([
        listDestinos(),
        listGrupoNotificacoes(),
      ]);
      setDestinos(destinosRows);
      setGrupoNotificacoes(notificacoesRows);
      setGruposLoaded(true);
    } catch (e: any) {
      setGruposError(e?.message || 'Falha ao carregar grupos de WhatsApp');
    } finally {
      setGruposLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'grupos' || gruposLoaded || gruposLoading) return;
    void loadGrupoConfig();
  }, [activeTab, gruposLoaded, gruposLoading]);

  const notificacoesPorDestino = useMemo(() => {
    const grouped = new Map<string, WhatsappGrupoNotificacao[]>();
    for (const notificacao of grupoNotificacoes) {
      const rows = grouped.get(notificacao.destino_id) || [];
      rows.push(notificacao);
      grouped.set(notificacao.destino_id, rows);
    }
    for (const rows of grouped.values()) {
      rows.sort((a, b) => grupoTipoLabels[a.tipo].localeCompare(grupoTipoLabels[b.tipo]));
    }
    return grouped;
  }, [grupoNotificacoes]);

  const setGrupoSaving = (id: string, next: boolean) => {
    setGrupoSavingIds((prev) => ({ ...prev, [id]: next }));
  };

  const getUnusedTipos = (destinoId: string) => {
    const usados = new Set((notificacoesPorDestino.get(destinoId) || []).map((notificacao) => notificacao.tipo));
    return grupoTipoOptions.filter((opt) => !usados.has(opt.value));
  };

  const buildDefaultGrupoDraft = (tipo: WhatsappGrupoNotificacaoTipo): GrupoDraft => {
    const frequencia = defaultFrequenciaPorTipo[tipo];
    return {
      tipo,
      frequencia,
      horario: '08:00',
      dia_semana: frequencia === 'semanal' ? 1 : null,
      dia_mes: frequencia === 'mensal' ? 1 : null,
    };
  };

  const applyFrequenciaRules = (draft: GrupoDraft): GrupoDraft => ({
    ...draft,
    horario: normalizeHHMMDisplay(draft.horario),
    dia_semana: draft.frequencia === 'semanal' ? Number(draft.dia_semana ?? 1) : null,
    dia_mes: draft.frequencia === 'mensal' ? Number(draft.dia_mes ?? 1) : null,
  });

  const resolveGrupoDraft = (notificacao: WhatsappGrupoNotificacao): GrupoDraft => {
    const draft = grupoDrafts[notificacao.id] || {};
    return applyFrequenciaRules({
      tipo: notificacao.tipo,
      frequencia: (draft.frequencia || notificacao.frequencia) as WhatsappGrupoNotificacaoFrequencia,
      horario: normalizeHHMMDisplay(draft.horario ?? notificacao.horario),
      dia_semana: draft.dia_semana ?? notificacao.dia_semana ?? 1,
      dia_mes: draft.dia_mes ?? notificacao.dia_mes ?? 1,
    });
  };

  const handleGrupoDraftChange = (
    notificacao: WhatsappGrupoNotificacao,
    patch: Partial<GrupoDraft>
  ) => {
    setGrupoDrafts((prev) => {
      const current = resolveGrupoDraft(notificacao);
      const next = applyFrequenciaRules({ ...current, ...patch });
      return { ...prev, [notificacao.id]: next };
    });
  };

  const handleSaveGrupoNotificacao = async (notificacao: WhatsappGrupoNotificacao) => {
    const draft = resolveGrupoDraft(notificacao);
    setGrupoSaving(notificacao.id, true);
    setGruposError(null);
    try {
      const savedRow = await updateGrupoNotificacao(notificacao.id, {
        frequencia: draft.frequencia,
        horario: draft.horario,
        dia_semana: draft.dia_semana,
        dia_mes: draft.dia_mes,
      });
      setGrupoNotificacoes((prev) => prev.map((row) => (row.id === savedRow.id ? savedRow : row)));
      setGrupoDrafts((prev) => {
        const next = { ...prev };
        delete next[notificacao.id];
        return next;
      });
    } catch (e: any) {
      setGruposError(e?.message || 'Falha ao salvar notificacao do grupo');
    } finally {
      setGrupoSaving(notificacao.id, false);
    }
  };

  const handleToggleGrupoNotificacao = async (notificacao: WhatsappGrupoNotificacao, ativo: boolean) => {
    const previous = notificacao;
    setGrupoSaving(notificacao.id, true);
    setGruposError(null);
    setGrupoNotificacoes((prev) => prev.map((row) => (row.id === notificacao.id ? { ...row, ativo } : row)));
    try {
      const savedRow = await toggleGrupoNotificacao(notificacao.id, ativo);
      setGrupoNotificacoes((prev) => prev.map((row) => (row.id === savedRow.id ? savedRow : row)));
    } catch (e: any) {
      setGrupoNotificacoes((prev) => prev.map((row) => (row.id === previous.id ? previous : row)));
      setGruposError(e?.message || 'Falha ao alterar status da notificacao');
    } finally {
      setGrupoSaving(notificacao.id, false);
    }
  };

  const handleStartAddingGrupo = (destinoId: string) => {
    const unused = getUnusedTipos(destinoId);
    if (!unused.length) return;
    setAddingDestinoId(destinoId);
    setNewGrupoDrafts((prev) => ({
      ...prev,
      [destinoId]: prev[destinoId] || buildDefaultGrupoDraft(unused[0].value),
    }));
  };

  const handleNewGrupoDraftChange = (destinoId: string, patch: Partial<GrupoDraft>) => {
    setNewGrupoDrafts((prev) => {
      const current = prev[destinoId] || buildDefaultGrupoDraft(getUnusedTipos(destinoId)[0]?.value || 'contas_a_pagar_dia');
      const patched = { ...current, ...patch };
      if (patch.tipo) {
        patched.frequencia = defaultFrequenciaPorTipo[patch.tipo];
      }
      return { ...prev, [destinoId]: applyFrequenciaRules(patched) };
    });
  };

  const handleCreateGrupoNotificacao = async (destinoId: string) => {
    const draft = applyFrequenciaRules(newGrupoDrafts[destinoId] || buildDefaultGrupoDraft(getUnusedTipos(destinoId)[0]?.value || 'contas_a_pagar_dia'));
    setGrupoSaving(`new:${destinoId}`, true);
    setGruposError(null);
    try {
      const savedRow = await createGrupoNotificacao({
        destino_id: destinoId,
        tipo: draft.tipo,
        frequencia: draft.frequencia,
        horario: draft.horario,
        dia_semana: draft.dia_semana,
        dia_mes: draft.dia_mes,
        ativo: false,
      });
      setGrupoNotificacoes((prev) => [...prev, savedRow]);
      setAddingDestinoId(null);
      setNewGrupoDrafts((prev) => {
        const next = { ...prev };
        delete next[destinoId];
        return next;
      });
    } catch (e: any) {
      setGruposError(e?.message || 'Falha ao adicionar notificacao');
    } finally {
      setGrupoSaving(`new:${destinoId}`, false);
    }
  };

  const handleDeleteGrupoNotificacao = async (notificacao: WhatsappGrupoNotificacao) => {
    setGrupoSaving(notificacao.id, true);
    setGruposError(null);
    try {
      await deleteGrupoNotificacao(notificacao.id);
      setGrupoNotificacoes((prev) => prev.filter((row) => row.id !== notificacao.id));
      setDeleteGrupoTarget(null);
    } catch (e: any) {
      setGruposError(e?.message || 'Falha ao remover notificacao');
    } finally {
      setGrupoSaving(notificacao.id, false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { google_refresh_token: _ignored, ...safe } = config as any;
      const savedRow = await upsertNotificacaoConfig(safe);
      const { google_refresh_token: _ignored2, ...safeSaved } = savedRow as any;
      setConfig(safeSaved);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  // WhatsApp: envio de teste
  const [waTesting, setWaTesting] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [waTestMsg, setWaTestMsg] = useState<string>('');

  const handleTesteWhatsApp = async () => {
    const numero = String(config?.whatsapp_numero || '').trim();
    if (!numero) {
      setWaTestStatus('error');
      setWaTestMsg('Configure o número primeiro.');
      return;
    }
    if (!config?.whatsapp_ativo) {
      setWaTestStatus('error');
      setWaTestMsg('Ative o WhatsApp primeiro.');
      return;
    }

    setWaTesting(true);
    setWaTestStatus('idle');
    setWaTestMsg('');
    try {
      const mensagem = `✅ *TESTE LA MUSIC*\n\nSeu WhatsApp está configurado corretamente!\n\n🔔 Você receberá lembretes aqui\n\n_${new Date().toLocaleString('pt-BR')}_`;
      await sendWhatsappMessage(numero, mensagem);

      setWaTestStatus('success');
      setWaTestMsg('Mensagem de teste enviada!');
      setTimeout(() => {
        setWaTestStatus('idle');
        setWaTestMsg('');
      }, 2500);
    } catch (e: any) {
      setWaTestStatus('error');
      setWaTestMsg(e?.message || 'Falha ao enviar');
    } finally {
      setWaTesting(false);
    }
  };

  const renderGruposTab = () => {
    const addingDestino = addingDestinoId ? destinos.find((destino) => destino.id === addingDestinoId) || null : null;
    const addingUnusedTipos = addingDestinoId ? getUnusedTipos(addingDestinoId) : [];
    const addingDraft = addingDestinoId
      ? newGrupoDrafts[addingDestinoId] || (addingUnusedTipos[0] ? buildDefaultGrupoDraft(addingUnusedTipos[0].value) : null)
      : null;

    return (
    <div className="w-full max-w-4xl space-y-6">
      {gruposError ? (
        <Card className={cn('p-4 border-danger/30 bg-danger/10')}>
          <div className="text-danger font-bold">Erro nos grupos</div>
          <div className="text-danger/80 text-sm mt-1">{gruposError}</div>
        </Card>
      ) : null}

      {gruposLoading ? (
        <Card className={cn('p-6 flex items-center justify-center gap-3', cardClass)}>
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <span className="text-sm font-bold text-secondary">Carregando grupos...</span>
        </Card>
      ) : destinos.length === 0 ? (
        <Card className={cn('p-6 text-center', cardClass)}>
          <Users className="w-8 h-8 text-muted mx-auto mb-3" />
          <div className="font-black text-primary">Nenhum grupo ativo encontrado</div>
          <div className="text-sm text-muted mt-1">Cadastre os destinos no Supabase para configurar notificacoes por grupo.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {destinos.map((destino) => {
            const notificacoes = notificacoesPorDestino.get(destino.id) || [];
            const unusedTipos = getUnusedTipos(destino.id);
            const isAdding = addingDestinoId === destino.id;

            return (
              <Card key={destino.id} className={cn('p-5 md:p-6', cardClass)}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-primary font-black text-lg leading-tight truncate">{destino.nome}</div>
                        <Badge variant="purple" className="font-black">
                          {finalidadeLabels[destino.finalidade] || destino.finalidade}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted font-bold truncate">{destino.jid}</div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleStartAddingGrupo(destino.id)}
                    disabled={!unusedTipos.length || isAdding}
                    className="w-full md:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar notificacao
                  </Button>
                </div>

                <div className="mt-5 space-y-3">
                  {notificacoes.length === 0 && !isAdding ? (
                    <div className="rounded-2xl border border-line bg-surface/40 px-5 py-8 text-center">
                      <Clock className="w-8 h-8 text-muted mx-auto mb-3" />
                      <div className="font-black text-primary">Nenhuma notificacao configurada</div>
                      <div className="text-sm text-secondary mt-1">Adicione um tipo de aviso para este grupo. Ele nasce desligado.</div>
                    </div>
                  ) : null}

                  {notificacoes.map((notificacao) => {
                    const draft = resolveGrupoDraft(notificacao);
                    const isSavingRow = !!grupoSavingIds[notificacao.id];
                    const hasChanges = !!grupoDrafts[notificacao.id];

                    return (
                      <div key={notificacao.id} className="rounded-2xl border border-line bg-surface/40 p-4 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-primary font-black">{grupoTipoLabels[notificacao.tipo]}</div>
                            <div className="text-xs text-muted font-bold mt-1">
                              {notificacao.ativo ? 'Envio automatico ligado' : 'Envio automatico desligado'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Ativo</span>
                            <ToggleSwitch
                              checked={!!notificacao.ativo}
                              onCheckedChange={(next) => void handleToggleGrupoNotificacao(notificacao, next)}
                              disabled={isSavingRow}
                              variant="emerald"
                              size="sm"
                              ariaLabel={`Ativar ${grupoTipoLabels[notificacao.tipo]}`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(150px,170px)_minmax(180px,1fr)_minmax(130px,160px)_auto_auto] md:items-end">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Horario</div>
                            <TimeSelect
                              value={draft.horario}
                              onValueChange={(horario) => handleGrupoDraftChange(notificacao, { horario })}
                              stepMinutes={15}
                              className="min-w-0"
                            />
                          </div>

                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Frequencia</div>
                            <CustomSelect
                              value={draft.frequencia}
                              onValueChange={(frequencia) =>
                                handleGrupoDraftChange(notificacao, { frequencia: frequencia as WhatsappGrupoNotificacaoFrequencia })
                              }
                              options={frequenciaOptions}
                            />
                          </div>

                          {draft.frequencia === 'semanal' ? (
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Dia</div>
                              <CustomSelect
                                value={String(draft.dia_semana ?? 1)}
                                onValueChange={(dia) => handleGrupoDraftChange(notificacao, { dia_semana: Number(dia) })}
                                options={diasSemanaGrupo}
                              />
                            </div>
                          ) : draft.frequencia === 'mensal' ? (
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Dia</div>
                              <CustomSelect
                                value={String(draft.dia_mes ?? 1)}
                                onValueChange={(dia) => handleGrupoDraftChange(notificacao, { dia_mes: Number(dia) })}
                                options={diasMesGrupo}
                              />
                            </div>
                          ) : (
                            <div className="hidden md:block" />
                          )}

                          <Button
                            variant="primary"
                            onClick={() => void handleSaveGrupoNotificacao(notificacao)}
                            disabled={!hasChanges || isSavingRow}
                            className="h-[46px]"
                          >
                            {isSavingRow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar
                          </Button>

                          <Tooltip content="Remover notificacao">
                            <button
                              type="button"
                              onClick={() => setDeleteGrupoTarget(notificacao)}
                              disabled={isSavingRow}
                              className={cn(
                                'inline-flex items-center justify-center w-11 h-11 rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-all focus:outline-none focus:ring-2 focus:ring-danger/30',
                                isSavingRow && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!addingDestino && !!addingDraft}
        onClose={() => setAddingDestinoId(null)}
        title="Nova notificacao"
        subtitle={addingDestino ? `Grupo: ${addingDestino.nome}` : undefined}
        size="md"
        headerIcon={
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Plus className="w-5 h-5 text-accent" />
          </div>
        }
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAddingDestinoId(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!addingDestinoId || !addingDraft || !!grupoSavingIds[`new:${addingDestinoId}`]}
              onClick={() => addingDestinoId && void handleCreateGrupoNotificacao(addingDestinoId)}
            >
              {addingDestinoId && grupoSavingIds[`new:${addingDestinoId}`] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar
            </Button>
          </div>
        }
      >
        {addingDestinoId && addingDraft ? (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Tipo</div>
              <CustomSelect
                value={addingDraft.tipo}
                onValueChange={(tipo) => handleNewGrupoDraftChange(addingDestinoId, { tipo: tipo as WhatsappGrupoNotificacaoTipo })}
                options={addingUnusedTipos}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Horario</div>
                <TimeSelect
                  value={addingDraft.horario}
                  onValueChange={(horario) => handleNewGrupoDraftChange(addingDestinoId, { horario })}
                  stepMinutes={15}
                  className="min-w-0"
                />
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Frequencia</div>
                <CustomSelect
                  value={addingDraft.frequencia}
                  onValueChange={(frequencia) =>
                    handleNewGrupoDraftChange(addingDestinoId, { frequencia: frequencia as WhatsappGrupoNotificacaoFrequencia })
                  }
                  options={frequenciaOptions}
                />
              </div>
            </div>

            {addingDraft.frequencia === 'semanal' ? (
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Dia da semana</div>
                <CustomSelect
                  value={String(addingDraft.dia_semana ?? 1)}
                  onValueChange={(dia) => handleNewGrupoDraftChange(addingDestinoId, { dia_semana: Number(dia) })}
                  options={diasSemanaGrupo}
                />
              </div>
            ) : addingDraft.frequencia === 'mensal' ? (
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Dia do mes</div>
                <CustomSelect
                  value={String(addingDraft.dia_mes ?? 1)}
                  onValueChange={(dia) => handleNewGrupoDraftChange(addingDestinoId, { dia_mes: Number(dia) })}
                  options={diasMesGrupo}
                />
              </div>
            ) : null}

            <div className="rounded-2xl border border-line bg-surface/40 p-4 text-sm text-secondary font-bold">
              A nova configuracao nasce desligada. Ligue o envio automatico na linha depois de criar.
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteGrupoTarget}
        onClose={() => setDeleteGrupoTarget(null)}
        onConfirm={() => deleteGrupoTarget && void handleDeleteGrupoNotificacao(deleteGrupoTarget)}
        title="Remover notificacao"
        message={
          deleteGrupoTarget
            ? `Remover "${grupoTipoLabels[deleteGrupoTarget.tipo]}" deste grupo?`
            : 'Remover esta notificacao do grupo?'
        }
        confirmLabel="Remover"
        variant="danger"
      />
    </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted text-sm">Carregando notificações…</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-0 pb-24 lg:pb-0">
      {/* Mobile Premium Header Card */}
      {isMobile ? (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <Card className="p-4 bg-surface/40 border border-line/60">
            <div className="flex items-center gap-3 mb-1">
              <Bell className="w-5 h-5 text-accent" />
              <h2 className="text-xl font-black text-primary leading-tight">Central de Notificações</h2>
            </div>
            <p className="text-sm text-muted font-medium mt-1 leading-snug">
              Configure alertas automáticos por WhatsApp para todos os módulos do sistema.
            </p>
          </Card>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              <h2 className="text-2xl font-black text-primary">Configurações de Notificações</h2>
            </div>
            <p className="text-sm text-muted font-bold mt-1">
              Centralize WhatsApp, Agenda e alertas automáticos por módulo (com overrides por item quando necessário).
            </p>
          </div>

          <div className={cn('flex items-center gap-2', activeTab !== 'individual' && 'hidden')}>
            {saved ? <Badge variant="success">Salvo</Badge> : null}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all',
                'bg-accent/90 hover:bg-accent border-accent/40 text-white font-black shadow-lg shadow-[var(--shadow-card)]',
                saving && 'opacity-70 cursor-not-allowed'
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="inline-flex w-full sm:w-auto items-center gap-1 rounded-2xl border border-line bg-surface/70 p-1">
          {[
            { key: 'individual', label: 'Individual', icon: Bell },
            { key: 'grupos', label: 'Grupos', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as 'individual' | 'grupos')}
                className={cn(
                  'flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all focus:outline-none focus:ring-2 focus:ring-accent/30',
                  selected ? 'bg-bg text-accent shadow-sm border border-line' : 'text-secondary hover:text-primary'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="mb-6">
          <Card className={cn('p-4 border-danger/30 bg-danger/10')}>
            <div className="text-danger font-bold">Erro</div>
            <div className="text-danger/80 text-sm mt-1">{error}</div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'individual' ? (
      <div className="grid grid-cols-1 gap-6">
        {/* WhatsApp */}
        <Card className={cn('p-0 overflow-hidden', cardClass, 'bg-bg/95')}>
          <div
            role={isMobile ? 'button' : undefined}
            tabIndex={isMobile ? 0 : -1}
            onClick={() => isMobile && toggleAccordion('whatsapp')}
            onKeyDown={(e) => {
              if (!isMobile) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion('whatsapp');
              }
            }}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'cursor-pointer active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-success" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">WhatsApp</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Canal de envio</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isMobile && <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Ativo</div>}
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <ToggleSwitch
                  checked={!!config.whatsapp_ativo}
                  onCheckedChange={(next) => setConfig((prev) => ({ ...prev, whatsapp_ativo: next }))}
                  variant="emerald"
                  ariaLabel="Ativar WhatsApp"
                />
              </div>
              {isMobile && (
                accordionOpen.whatsapp ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
              )}
            </div>
          </div>
          {(!isMobile || accordionOpen.whatsapp) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Número</div>
                  <input
                    value={String(config.whatsapp_numero || '')}
                    onChange={(e) => setConfig((prev) => ({ ...prev, whatsapp_numero: e.target.value }))}
                    placeholder="55DDDNUMERO"
                    className="w-full px-4 py-3 rounded-xl bg-surface/50 border border-line text-secondary outline-none focus:ring-2 focus:ring-accent"
                  />
                  {waTestStatus !== 'idle' ? (
                    <div
                      className={cn(
                        'mt-2 text-xs font-bold',
                        waTestStatus === 'success' ? 'text-success' : 'text-danger'
                      )}
                    >
                      {waTestMsg}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleTesteWhatsApp}
                  disabled={waTesting || !config.whatsapp_ativo || !String(config.whatsapp_numero || '').trim()}
                  className={cn(
                    'inline-flex items-center gap-2 px-5 py-3 rounded-xl border transition-all w-full justify-center',
                    'bg-success/90 hover:bg-success border-success/30 text-white font-black',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {waTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {waTesting ? 'Enviando…' : 'Enviar teste'}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Agenda */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('agenda')}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-accent" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">Agenda</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Lembretes e resumos</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.agenda ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
            )}
          </button>
          {(!isMobile || accordionOpen.agenda) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-6">
                {/* Lembrete de tarefas */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Lembrete de tarefas</div>
                    <ToggleSwitch
                      checked={config.agenda_lembrete_tarefas_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, agenda_lembrete_tarefas_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete de tarefas"
                    />
                  </div>
                  <div className="w-full">
                    <CustomSelect
                      value={String(config.lembrete_padrao_minutos ?? 30)}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, lembrete_padrao_minutos: Number(v) }))}
                      options={lembreteOptions}
                      className={cn(config.agenda_lembrete_tarefas_ativo === false && 'opacity-60 pointer-events-none')}
                    />
                  </div>
                </div>

                {/* Lembrete de aniversários */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-secondary font-black">Lembrete de aniversários</div>
                      <div className="text-xs text-muted font-bold mt-0.5">Conforme configuração de cada aniversário</div>
                    </div>
                    <ToggleSwitch
                      checked={config.agenda_lembrete_aniversarios_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, agenda_lembrete_aniversarios_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete de aniversários"
                    />
                  </div>
                </div>

                {/* Resumo diário */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Resumo diário</div>
                    <ToggleSwitch
                      checked={!!config.resumo_diario_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, resumo_diario_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo diário"
                    />
                  </div>
                  <TimeSelect
                    value={String(config.resumo_diario_hora || '08:00')}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_diario_hora: v }))}
                    stepMinutes={30}
                    className="w-full"
                    disabled={!config.resumo_diario_ativo}
                  />
                </div>

                {/* Resumo semanal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Resumo semanal</div>
                    <ToggleSwitch
                      checked={!!config.resumo_semanal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, resumo_semanal_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo semanal"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      value={String(config.resumo_semanal_dia || 'domingo')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_semanal_dia: v }))}
                      options={diasSemana}
                      className={cn(!config.resumo_semanal_ativo && 'opacity-60 pointer-events-none')}
                    />
                    <TimeSelect
                      value={String(config.resumo_semanal_hora || '20:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_semanal_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                      disabled={!config.resumo_semanal_ativo}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Jornada RH */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('rh')}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-accent" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">Jornada RH</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Agenda e lembretes da Ana</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.rh ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
            )}
          </button>
          {(!isMobile || accordionOpen.rh) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-6">
                <div className="rounded-2xl border border-line bg-bg/25 px-4 py-3">
                  <div className="text-sm text-secondary font-black">Espelhamento automatico na Agenda</div>
                  <div className="mt-1 text-xs text-muted font-medium leading-relaxed">
                    Tudo o que for agendado na Jornada RH continua aparecendo na Agenda da Ana. Aqui voce configura a antecedencia dos lembretes desses espelhos.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-secondary font-black">Processos RH</div>
                      <div className="text-xs text-muted font-medium mt-0.5">Recrutamento, onboarding e desligamento.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_processos_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_processos_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para processos da Jornada RH"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_processos_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_processos_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_processos_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-secondary font-black">Etapas da Jornada</div>
                      <div className="text-xs text-muted font-medium mt-0.5">Entrevistas, boas-vindas, treinamentos e tarefas operacionais.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_etapas_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_etapas_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para etapas da Jornada RH"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_etapas_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_etapas_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_etapas_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-secondary font-black">Checkpoints de PDI</div>
                      <div className="text-xs text-muted font-medium mt-0.5">Acompanhamentos de 30, 60, 90 dias e ciclos do desenvolvimento.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_pdi_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_pdi_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para checkpoints de PDI"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_pdi_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_pdi_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_pdi_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="rounded-2xl border border-line bg-bg/25 px-4 py-3">
                  <div className="text-sm text-secondary font-black">WhatsApp da Jornada RH</div>
                  <div className="mt-1 text-xs text-muted font-medium leading-relaxed">
                    O canal de WhatsApp continua sendo configurado acima. Dentro da Jornada RH, cada etapa pode marcar se deve avisar os responsaveis e o colaborador.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Contas a pagar */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('contas')}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-info" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">Contas a Pagar</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Alertas e resumo</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.contas ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
            )}
          </button>
          {(!isMobile || accordionOpen.contas) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alertas por vencimento */}
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-3">
                    Alertas por vencimento
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg/25 px-4 py-3">
                      <div className="text-sm text-secondary font-black whitespace-nowrap">3 dias antes</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_3d}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_3d: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta 3 dias antes"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg/25 px-4 py-3">
                      <div className="text-sm text-secondary font-black whitespace-nowrap">1 dia antes</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_1d}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_1d: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta 1 dia antes"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg/25 px-4 py-3">
                      <div className="text-sm text-secondary font-black whitespace-nowrap">No dia</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_no_dia}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_no_dia: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta no dia"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em] shrink-0">Horário</div>
                    <TimeSelect
                      value={String(config.contas_alerta_hora || '08:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_alerta_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Resumo semanal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Resumo semanal de contas</div>
                    <ToggleSwitch
                      checked={!!config.contas_resumo_semanal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_ativo: next }))}
                      variant="cyan"
                      ariaLabel="Ativar resumo semanal de contas"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      value={String(config.contas_resumo_semanal_dia || 'segunda')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_dia: v }))}
                      options={diasSemana}
                      className={cn(!config.contas_resumo_semanal_ativo && 'opacity-60 pointer-events-none')}
                    />
                    <TimeSelect
                      value={String(config.contas_resumo_semanal_hora || '08:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                      disabled={!config.contas_resumo_semanal_ativo}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Folha */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('folha')}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-warning" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">Folha de Pagamento</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Alertas operacionais</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.folha ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
            )}
          </button>
          {(!isMobile || accordionOpen.folha) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alerta de fechamento */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Alerta de fechamento</div>
                    <ToggleSwitch
                      checked={!!config.folha_alerta_fechamento_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, folha_alerta_fechamento_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de fechamento"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Dia</div>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={Number(config.folha_alerta_fechamento_dia ?? 25)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, folha_alerta_fechamento_dia: Number(e.target.value || 25) }))}
                      className={cn(
                        'w-full px-3 py-2.5 rounded-xl bg-surface/50 border border-line text-secondary outline-none',
                        !config.folha_alerta_fechamento_ativo && 'opacity-60 pointer-events-none'
                      )}
                    />
                  </div>
                </div>

                {/* Alerta de aprovação pendente */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">Alerta de aprovação pendente</div>
                    <ToggleSwitch
                      checked={!!config.folha_alerta_aprovacao_pendente_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, folha_alerta_aprovacao_pendente_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de aprovação pendente"
                    />
                  </div>
                  <div className="text-xs text-muted font-medium leading-relaxed">
                    Envia quando existir folha em status <span className="text-secondary font-bold">pendente</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Férias CLT */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('ferias')}
            className={cn(
              'w-full px-6 py-4 border-b border-line/70 flex items-center justify-between',
              isMobile && 'active:bg-surface/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-accent" />
              </div>
              <div className="text-left">
                <div className="text-primary font-black">Férias CLT</div>
                <div className="text-xs text-secondary font-bold uppercase tracking-widest">Alertas de vencimento</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.ferias ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />
            )}
          </button>
          {(!isMobile || accordionOpen.ferias) && (
            <div className="divide-y divide-line/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alerta de férias vencidas (CRÍTICO) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">🚨 Férias vencidas (MULTA)</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_vencimento_multa}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_vencimento_multa: next }))}
                      variant="rose"
                      ariaLabel="Ativar alerta de férias vencidas"
                    />
                  </div>
                  <div className="text-xs text-muted font-medium leading-relaxed">
                    Alerta CRÍTICO quando período concessivo vencer. Férias devem ser pagas em <span className="text-danger font-bold">DOBRO</span>.
                  </div>
                </div>

                {/* Alerta de concessivo próximo de vencer */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">⏰ Período concessivo próximo</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_concessivo_critico}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_concessivo_critico: next }))}
                      variant="amber"
                      ariaLabel="Ativar alerta de concessivo próximo"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Alertar com</div>
                    <input
                      type="number"
                      min={7}
                      max={90}
                      value={Number(config.ferias_alerta_concessivo_dias ?? 60)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, ferias_alerta_concessivo_dias: Number(e.target.value || 60) }))}
                      className={cn(
                        'w-20 px-3 py-2.5 rounded-xl bg-surface/50 border border-line text-secondary outline-none',
                        !config.ferias_alerta_concessivo_critico && 'opacity-60 pointer-events-none'
                      )}
                    />
                    <div className="text-xs text-muted font-medium">dias de antecedência</div>
                  </div>
                </div>

                {/* Alerta de pagamento pendente */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">💳 Pagamento pendente</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_pagamento_pendente}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_pagamento_pendente: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de pagamento pendente"
                    />
                  </div>
                  <div className="text-xs text-muted font-medium leading-relaxed">
                    Alerta quando férias programadas estiverem próximas e pagamento não foi efetuado (prazo: 2 dias antes).
                  </div>
                </div>

                {/* Alerta de período aquisitivo próximo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">📅 Período aquisitivo próximo</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_aquisitivo_prox}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_aquisitivo_prox: next }))}
                      variant="cyan"
                      ariaLabel="Ativar alerta de período aquisitivo"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Alertar com</div>
                    <input
                      type="number"
                      min={7}
                      max={60}
                      value={Number(config.ferias_alerta_aquisitivo_dias ?? 30)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, ferias_alerta_aquisitivo_dias: Number(e.target.value || 30) }))}
                      className={cn(
                        'w-20 px-3 py-2.5 rounded-xl bg-surface/50 border border-line text-secondary outline-none',
                        !config.ferias_alerta_aquisitivo_prox && 'opacity-60 pointer-events-none'
                      )}
                    />
                    <div className="text-xs text-muted font-medium">dias de antecedência</div>
                  </div>
                </div>

                {/* Resumo mensal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-secondary font-black">📊 Resumo mensal</div>
                    <ToggleSwitch
                      checked={!!config.ferias_resumo_mensal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo mensal de férias"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Dia</div>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={Number(config.ferias_resumo_mensal_dia ?? 1)}
                        onChange={(e) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_dia: Number(e.target.value || 1) }))}
                        className={cn(
                          'w-full px-3 py-2.5 rounded-xl bg-surface/50 border border-line text-secondary outline-none',
                          !config.ferias_resumo_mensal_ativo && 'opacity-60 pointer-events-none'
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Hora</div>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={Number(config.ferias_resumo_mensal_hora ?? 8)}
                        onChange={(e) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_hora: Number(e.target.value || 8) }))}
                        className={cn(
                          'w-full px-3 py-2.5 rounded-xl bg-surface/50 border border-line text-secondary outline-none',
                          !config.ferias_resumo_mensal_ativo && 'opacity-60 pointer-events-none'
                        )}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted font-medium leading-relaxed">
                    Resumo executivo com estatísticas gerais, situações críticas e próximas férias programadas.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      ) : (
        renderGruposTab()
      )}

      {/* Sticky Save Bar (Mobile) */}
      {isMobile && activeTab === 'individual' && (
        <div 
          className="fixed left-0 right-0 z-[10400] bg-bg/95 backdrop-blur-xl border-t border-line/70 p-4 animate-in slide-in-from-bottom-2 duration-300"
          style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border transition-all',
              'bg-accent/90 hover:bg-accent active:scale-[0.98] border-accent/40 text-white font-black shadow-lg shadow-[var(--shadow-card)]',
              saving && 'opacity-70 cursor-not-allowed'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando…
              </>
            ) : saved ? (
              <>
                <Save className="w-5 h-5" />
                Salvo ✓
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

