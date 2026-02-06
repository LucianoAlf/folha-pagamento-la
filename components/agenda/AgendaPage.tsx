import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, parseISO, startOfDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../../services/supabase';
import { cn } from '../CollaboratorComponents';
import type { Tarefa, TarefaLista } from '../../types/agenda';
import {
  fetchListas,
  fetchTarefas,
  fetchTarefasAtrasadas,
  fetchTarefasHoje,
  fetchTarefasImportantes,
  fetchNotificacaoConfig,
} from '../../services/agendaService';
import { syncAgendaIntegrations } from '../../services/agendaIntegrations';
import { AgendaSidebarListas } from './AgendaSidebarListas';
import { AgendaContent } from './AgendaContent';
import { TarefaDetailPanel } from './TarefaDetailPanel';
import { fetchAgendaKanbanConfig } from '../../services/agendaService';
import type { AgendaKanbanColumnConfig } from '../../types/agenda';
import { Modal, Badge, ConfirmDialog, Tooltip } from '../UI';
import { createLista, updateLista, deleteLista } from '../../services/agendaService';
import { AGENDA_BG_PRESETS, type AgendaBackgroundPresetId } from '../../types/agenda';
import type { ContaPagar } from '../../types/contasPagar';
import { PagarContaModal } from '../contas/PagarContaModal';
import { fetchContaPagarById, registrarPagamento } from '../../services/contasPagarService';
import { updateTarefa } from '../../services/agendaService';

// Emojis simples e úteis (sem scroll, ~15 opções)
const EMOJI_OPTIONS = [
  '💰', '💳', '📈', '🧾',
  '👩‍💼', '👨‍💼', '🤝', '📋',
  '🏢', '📁', '🗓️', '📌',
  '⭐', '🔥', '✅', '❤️',
];

const COLOR_PRESETS = [
  '#8b5cf6', // violet
  '#a78bfa', // violet 400
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#94a3b8', // slate
] as const;

type ListKey = `smart:${string}` | `list:${string}` | 'config';
type Mode = 'tarefas' | 'config';
type ViewMode = 'lista' | 'cards' | 'kanban' | 'mes' | 'semana' | '3dias' | 'dia';

const SMART_MEUDIA = 'smart:meu-dia' as const;
const SMART_IMPORTANTE = 'smart:importante' as const;
const SMART_PLANEJADO = 'smart:planejado' as const;

const normalizeSmartKey = (nome: string) => {
  const n = (nome || '').toLowerCase();
  if (n.includes('meu dia')) return SMART_MEUDIA;
  if (n.includes('importante')) return SMART_IMPORTANTE;
  if (n.includes('planejado')) return SMART_PLANEJADO;
  return `smart:${nome}` as const;
};

export const AgendaPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [listas, setListas] = useState<TarefaLista[]>([]);
  const [listKey, setListKey] = useState<ListKey>(SMART_MEUDIA);

  const [mode, setMode] = useState<Mode>('tarefas');
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [selectedDateISO, setSelectedDateISO] = useState<string | null>(null); // yyyy-mm-dd

  const [kanbanColumns, setKanbanColumns] = useState<AgendaKanbanColumnConfig[]>([
    { key: 'pendente', label: 'Pendente', visible: true, order: 10 },
    { key: 'em_andamento', label: 'Em Andamento', visible: true, order: 20 },
    { key: 'concluida', label: 'Concluída', visible: true, order: 30 },
    { key: 'adiada', label: 'Adiada', visible: true, order: 40 },
  ]);

  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [tarefasHoje, setTarefasHoje] = useState<Tarefa[]>([]);
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState<Tarefa[]>([]);
  const [tarefasTimeline, setTarefasTimeline] = useState<Tarefa[]>([]);

  const [selectedTarefaId, setSelectedTarefaId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1023px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    // Safari < 14 fallback
    try {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);

  // Forçar modo lista no mobile se estiver em kanban/cards
  useEffect(() => {
    if (isMobile && (viewMode === 'kanban' || (viewMode as any) === 'cards')) {
      setViewMode('lista');
    }
  }, [isMobile, viewMode]);

  // trava scroll do body quando o drawer estiver aberto
  useEffect(() => {
    if (!isMobile) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (isMobileSidebarOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, isMobileSidebarOpen]);

  // Aparência (fundo por usuário)
  const [agendaBgPreset, setAgendaBgPreset] = useState<AgendaBackgroundPresetId>('classic-dark');
  const [agendaBgUrl, setAgendaBgUrl] = useState<string | null>(null);

  // Nova Lista (CRUD básico — criação)
  const [novaListaOpen, setNovaListaOpen] = useState(false);
  const [novaListaNome, setNovaListaNome] = useState('');
  const [novaListaIcone, setNovaListaIcone] = useState('📌');
  const [novaListaCor, setNovaListaCor] = useState('#8b5cf6');
  const [novaListaSaving, setNovaListaSaving] = useState(false);
  const [novaListaError, setNovaListaError] = useState<string | null>(null);
  const [listaEditando, setListaEditando] = useState<TarefaLista | null>(null);
  const [confirmDeleteLista, setConfirmDeleteLista] = useState<TarefaLista | null>(null);
  const [quickPay, setQuickPay] = useState<{ tarefaId: string; contaId: string } | null>(null);
  const [quickPayConta, setQuickPayConta] = useState<ContaPagar | null>(null);
  const [quickPayLoading, setQuickPayLoading] = useState(false);

  const refreshTimer = useRef<number | null>(null);
  const lastIntegrationsSyncAt = useRef<number>(0);
  const integrationsSyncing = useRef<boolean>(false);

  const smartLists = useMemo(() => listas.filter((l) => l.is_smart), [listas]);
  const regularLists = useMemo(() => listas.filter((l) => !l.is_smart), [listas]);

  const listaAtiva = useMemo(() => {
    if (listKey.startsWith('list:')) {
      const id = listKey.replace('list:', '');
      return listas.find((l) => l.id === id) || null;
    }
    if (listKey.startsWith('smart:')) {
      // tenta achar pelo nome, mas o header usa o próprio key quando não encontrar
      const match =
        smartLists.find((l) => normalizeSmartKey(l.nome) === (listKey as any)) ||
        smartLists.find((l) => l.nome.toLowerCase() === (listKey.replace('smart:', '') || '').toLowerCase());
      return match || null;
    }
    return null;
  }, [listKey, listas, smartLists]);

  const selectedTarefa = useMemo(() => {
    const all = [...tarefas, ...tarefasHoje, ...tarefasAtrasadas, ...tarefasTimeline];
    return all.find((t) => t.id === selectedTarefaId) || null;
  }, [tarefas, tarefasHoje, tarefasAtrasadas, tarefasTimeline, selectedTarefaId]);

  const tituloTopo = useMemo(() => {
    if (listKey === 'config') return 'Configurações';
    if (listKey === SMART_MEUDIA) return 'Meu Dia';
    if (listKey === SMART_IMPORTANTE) return 'Importante';
    if (listKey === SMART_PLANEJADO) return 'Planejado';
    if (listKey.startsWith('list:')) return listaAtiva?.nome || 'Lista';
    return listaAtiva?.nome || 'Agenda';
  }, [listKey, listaAtiva]);

  const tituloIcon = useMemo(() => {
    // Aqui o ícone do título deve seguir os emojis da sidebar (pedido do usuário)
    if (listKey === 'config') return '⚙️';
    if (listKey === SMART_MEUDIA) return '☀️';
    if (listKey === SMART_IMPORTANTE) return '⭐';
    if (listKey === SMART_PLANEJADO) return '📅';
    if (listKey.startsWith('list:')) return listaAtiva?.icone || '📌';
    return '📌';
  }, [listKey, listaAtiva]);

  const accentColor = useMemo(() => {
    if (listKey === 'config') return '#94a3b8'; // Slate 400
    if (listKey === SMART_MEUDIA) return '#a78bfa'; // Violet 400
    if (listKey === SMART_IMPORTANTE) return '#fbbf24'; // Amber 400
    if (listKey === SMART_PLANEJADO) return '#60a5fa'; // Blue 400
    if (listKey.startsWith('list:')) return listaAtiva?.cor || '#8b5cf6';
    return '#8b5cf6';
  }, [listKey, listaAtiva]);

  const subtituloTopo = useMemo(() => {
    if (listKey === 'config') return 'Preferências de lembretes e integrações';
    if (listKey === SMART_MEUDIA) {
      const now = new Date();
      const label = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });
      const totalHoje = tarefasHoje.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada').length;
      const atrasadas = tarefasAtrasadas.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada').length;
      return `${label} • ${totalHoje} para hoje • ${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}`;
    }
    if (listKey === SMART_IMPORTANTE) return 'Prioridade alta e urgente para não esquecer';
    if (listKey === SMART_PLANEJADO) return 'Tarefas com data marcada';
    return `${tarefas.length} tarefa${tarefas.length === 1 ? '' : 's'}`;
  }, [listKey, tarefasHoje, tarefasAtrasadas, tarefas.length]);

  const loadListas = useCallback(async () => {
    const rows = await fetchListas();
    setListas(rows);

    // Se a Agenda for carregada pela primeira vez, tenta focar em "Meu Dia"
    if (!rows.length) return rows;
    if (listKey === SMART_MEUDIA) return rows;
    return rows;
  }, [listKey]);

  const syncIntegrations = useCallback(async (force = false) => {
    // Throttle: evita loop com realtime (tarefas inseridas -> scheduleRefresh -> sync novamente).
    const now = Date.now();
    if (integrationsSyncing.current) return;
    if (!force && now - lastIntegrationsSyncAt.current < 120_000) return;

    integrationsSyncing.current = true;
    try {
      await syncAgendaIntegrations();
      lastIntegrationsSyncAt.current = Date.now();
    } catch (e: any) {
      console.error('[AgendaPage] syncIntegrations error:', e?.message || e);
    } finally {
      integrationsSyncing.current = false;
    }
  }, []);

  const loadCounts = useCallback(async () => {
    const { data, error } = await supabase.from('tarefas').select('id,status,prioridade,lista_id,vencimento_em');
    if (error) throw error;

    const rows = (data || []) as Array<{
      id: string;
      status: string | null;
      prioridade: string | null;
      lista_id: string | null;
      vencimento_em: string | null;
    }>;

    const active = (s: string | null) => s !== 'concluida' && s !== 'cancelada';
    const map: Record<string, number> = {};

    // por lista
    for (const r of rows) {
      if (!active(r.status)) continue;
      if (r.lista_id) map[`list:${r.lista_id}`] = (map[`list:${r.lista_id}`] || 0) + 1;
    }

    // smart: Importante
    map[SMART_IMPORTANTE] = rows.filter((r) => active(r.status) && (r.prioridade === 'alta' || r.prioridade === 'urgente')).length;

    // smart: Planejado
    map[SMART_PLANEJADO] = rows.filter((r) => active(r.status) && !!r.vencimento_em).length;

    // smart: Meu Dia (hoje + atrasadas)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const startISO = hoje.toISOString();
    const endISO = new Date(hoje.getTime() + 24 * 60 * 60 * 1000).toISOString();
    map[SMART_MEUDIA] = rows.filter((r) => {
      if (!active(r.status)) return false;
      if (!r.vencimento_em) return false;
      return (r.vencimento_em >= startISO && r.vencimento_em < endISO) || r.vencimento_em < startISO;
    }).length;

    setCounts(map);
  }, []);

  const loadAppearance = useCallback(async () => {
    try {
      const cfg = await fetchNotificacaoConfig();
      const preset = (cfg?.agenda_bg_preset as AgendaBackgroundPresetId) || 'classic-dark';
      const isValid = AGENDA_BG_PRESETS.some((p) => p.id === preset);
      setAgendaBgPreset(isValid ? preset : 'classic-dark');
      setAgendaBgUrl(cfg?.agenda_bg_url || null);
    } catch {
      // não bloqueia o app
    }
  }, []);

  const loadTarefasForKey = useCallback(
    async (key: ListKey, opts?: { includeConcluidas?: boolean }) => {
      setError(null);

      // Configurações é uma tela separada
      if (key === 'config') {
        setTarefas([]);
        setTarefasHoje([]);
        setTarefasAtrasadas([]);
        return;
      }

      if (key === SMART_MEUDIA) {
        const [atrasadas, hoje] = await Promise.all([fetchTarefasAtrasadas(), fetchTarefasHoje()]);
        setTarefasAtrasadas(atrasadas);
        setTarefasHoje(hoje);
        setTarefas([]);
        return;
      }

      if (key === SMART_IMPORTANTE) {
        const imp = await fetchTarefasImportantes();
        setTarefas(imp);
        setTarefasHoje([]);
        setTarefasAtrasadas([]);
        return;
      }

      if (key === SMART_PLANEJADO) {
        const all = await fetchTarefas({ includeConcluidas: !!opts?.includeConcluidas });
        const planned = all.filter((t) => !!t.vencimento_em);
        setTarefas(planned);
        setTarefasHoje([]);
        setTarefasAtrasadas([]);
        return;
      }

      if (key.startsWith('list:')) {
        const id = key.replace('list:', '');
        const rows = await fetchTarefas({ lista_id: id, includeConcluidas: !!opts?.includeConcluidas });
        setTarefas(rows);
        setTarefasHoje([]);
        setTarefasAtrasadas([]);
        return;
      }
    },
    []
  );

  const loadTimeline = useCallback(async () => {
    // Timeline = base para calendário (mostra compromissos futuros, não só Meu Dia)
    try {
      const hoje = new Date();
      const start = new Date(hoje);
      start.setDate(start.getDate() - 90);
      const end = new Date(hoje);
      end.setDate(end.getDate() + 45);
      const rows = await fetchTarefas({
        vencimento_inicio: start.toISOString(),
        vencimento_fim: end.toISOString(),
        includeConcluidas: true,
      });
      setTarefasTimeline(rows);
    } catch {
      // best effort (não bloqueia)
    }
  }, []);

  const openNovaLista = useCallback(() => {
    setListaEditando(null);
    setNovaListaNome('');
    setNovaListaIcone('📌');
    setNovaListaCor('#8b5cf6');
    setNovaListaError(null);
    setNovaListaOpen(true);
  }, []);

  const openEditarLista = useCallback((lista: TarefaLista) => {
    setListaEditando(lista);
    setNovaListaNome(lista.nome || '');
    setNovaListaIcone((lista.icone as any) || '📌');
    setNovaListaCor((lista.cor as any) || '#8b5cf6');
    setNovaListaError(null);
    setNovaListaOpen(true);
  }, []);

  const handleSaveLista = useCallback(async () => {
    const nome = novaListaNome.trim();
    if (!nome) {
      setNovaListaError('Informe o nome da lista.');
      return;
    }
    setNovaListaSaving(true);
    setNovaListaError(null);
    try {
      let nextListKey: ListKey | null = null;
      if (listaEditando) {
        const updated = await updateLista(listaEditando.id, {
          nome,
          cor: novaListaCor || '#8b5cf6',
          icone: (novaListaIcone || '📌').slice(0, 6),
        } as any);
        nextListKey = (`list:${updated.id}` as const) as any;
      } else {
        const maxOrder = (listas || []).reduce((acc, l) => Math.max(acc, Number(l.ordem || 0) || 0), 0);
        const created = await createLista({
          nome,
          descricao: null,
          cor: novaListaCor || '#8b5cf6',
          icone: (novaListaIcone || '📌').slice(0, 6),
          ordem: maxOrder + 10,
          is_smart: false,
          smart_filter: null,
          is_default: false,
        } as any);
        nextListKey = (`list:${created.id}` as const) as any;
      }

      // Atualiza listas + contagens e navega para a lista criada/editada
      await loadListas();
      await loadCounts();
      if (nextListKey) setListKey(nextListKey);
      setMode('tarefas');
      setSelectedTarefaId(null);
      if (nextListKey) await loadTarefasForKey(nextListKey);

      setNovaListaOpen(false);
      setListaEditando(null);
    } catch (e: any) {
      setNovaListaError(e?.message || 'Falha ao criar lista');
    } finally {
      setNovaListaSaving(false);
    }
  }, [novaListaNome, novaListaCor, novaListaIcone, listas, loadCounts, loadListas, loadTarefasForKey, listaEditando]);

  const handleConfirmDeleteLista = useCallback(async () => {
    if (!confirmDeleteLista) return;
    const id = confirmDeleteLista.id;
    const deletingActive = listKey === (`list:${id}` as any);
    try {
      await deleteLista(id);
      await loadListas();
      await loadCounts();
      if (deletingActive) {
        setListKey(SMART_MEUDIA);
        setMode('tarefas');
        setSelectedTarefaId(null);
        await loadTarefasForKey(SMART_MEUDIA);
      } else {
        // refresh suave
        loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir lista');
    } finally {
      setConfirmDeleteLista(null);
    }
  }, [confirmDeleteLista, listKey, loadCounts, loadListas, loadTarefasForKey, viewMode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadListas();
      // Premium: integracoes (contas/folha) entram como tarefas automaticas na agenda
      // force=true no primeiro load para garantir que as contas aparecem
      await syncIntegrations(true);
      // Carrega tudo em paralelo APOS o sync (para pegar as tarefas recem-criadas)
      await Promise.all([
        loadCounts(),
        loadAppearance(),
        loadTimeline(),
        loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }),
      ]);
      // Kanban config (nao bloqueia)
      fetchAgendaKanbanConfig()
        .then((row) => {
          const cols = (row?.columns || []) as any[];
          if (Array.isArray(cols) && cols.length) setKanbanColumns(cols as any);
        })
        .catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar Agenda');
    } finally {
      setLoading(false);
    }
  }, [loadListas, loadCounts, loadTarefasForKey, listKey, viewMode, syncIntegrations, loadTimeline, loadAppearance]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      loadListas().catch(() => {});
      syncIntegrations(false).catch(() => {});
      loadCounts().catch(() => {});
      loadAppearance().catch(() => {});
      loadTimeline().catch(() => {});
      loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }).catch(() => {});
    }, 300);
  }, [listKey, loadListas, loadCounts, loadAppearance, loadTarefasForKey, loadTimeline, syncIntegrations, viewMode]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // troca de lista
  useEffect(() => {
    if (listKey === 'config') setMode('config');
    else if (mode === 'config') setMode('tarefas');
    setSelectedTarefaId(null);
    loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }).catch((err: any) =>
      setError(err?.message || 'Falha ao carregar tarefas')
    );
    // Recarregar timeline ao trocar de lista (garante calendario atualizado)
    loadTimeline().catch(() => {});
  }, [listKey]);

  // troca de view (kanban precisa das concluidas; calendario/schedule precisa da timeline)
  useEffect(() => {
    if (listKey === 'config') return;
    loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }).catch(() => {});
    // Ao trocar para visualizacoes de calendario/schedule, recarregar timeline
    if (['mes', 'semana', '3dias', 'dia'].includes(viewMode)) {
      loadTimeline().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // realtime: listas/tarefas/subtarefas/notas/config
  useEffect(() => {
    const ch = supabase
      .channel('agenda-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas_listas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas_subtarefas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_rapidas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacao_config' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_pagar' }, scheduleRefresh)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [scheduleRefresh]);

  // Ação rápida: registrar pagamento a partir de uma tarefa vinculada
  useEffect(() => {
    const onQuickPay = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { tarefaId?: string; contaId?: string } | undefined;
      const tarefaId = String(detail?.tarefaId || '');
      const contaId = String(detail?.contaId || '');
      if (!tarefaId || !contaId) return;

      setQuickPay({ tarefaId, contaId });
      setQuickPayLoading(true);
      try {
        const conta = await fetchContaPagarById(contaId);
        setQuickPayConta(conta as any);
      } catch (e: any) {
        setQuickPay(null);
        setQuickPayConta(null);
        setError(e?.message || 'Falha ao carregar conta para pagamento');
      } finally {
        setQuickPayLoading(false);
      }
    };

    window.addEventListener('agenda:quickpay', onQuickPay as EventListener);
    return () => window.removeEventListener('agenda:quickpay', onQuickPay as EventListener);
  }, []);

  // Ação rápida: abrir modal de vínculo (quando a tarefa ainda não tem vinculo_id)
  useEffect(() => {
    const onLinkConta = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { tarefaId?: string } | undefined;
      const tarefaId = String(detail?.tarefaId || '');
      if (!tarefaId) return;
      setSelectedTarefaId(tarefaId);
      // O painel de detalhes já tem o botão "Vincular a uma conta"
      // (isso só garante que o usuário caiu na tarefa certa).
    };
    window.addEventListener('agenda:linkconta', onLinkConta as EventListener);
    return () => window.removeEventListener('agenda:linkconta', onLinkConta as EventListener);
  }, []);

  // Atualização imediata (sem depender de Realtime): Configurações dispara evento após salvar.
  useEffect(() => {
    const onEvt = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as { preset?: string | null; url?: string | null } | undefined;
      if (!detail) return;
      if (typeof detail.url !== 'undefined') setAgendaBgUrl(detail.url || null);
      if (typeof detail.preset !== 'undefined') {
        const preset = (detail.preset || 'classic-dark') as AgendaBackgroundPresetId;
        const isValid = AGENDA_BG_PRESETS.some((p) => p.id === preset);
        setAgendaBgPreset(isValid ? preset : 'classic-dark');
      }
    };
    window.addEventListener('agenda:appearance', onEvt as any);
    return () => window.removeEventListener('agenda:appearance', onEvt as any);
  }, []);

  const onSelectLista = (next: ListKey) => {
    setSelectedDateISO(null);
    setListKey(next);
  };

  const onSelectDate = (iso: string) => {
    setSelectedDateISO(iso);
    if (viewMode === 'lista' || viewMode === 'kanban') setViewMode('mes');
  };

  const handleGoToToday = () => {
    const today = new Date().toISOString().split('T')[0];
    onSelectDate(today);
  };

  const selectedDateLabel = useMemo(() => {
    if (!selectedDateISO) return null;
    try {
      const d = parseISO(`${selectedDateISO}T00:00:00`);
      const base = format(d, "d 'de' MMMM", { locale: ptBR });
      return isToday(d) ? `${base} (Hoje)` : base;
    } catch {
      return selectedDateISO;
    }
  }, [selectedDateISO]);

  const tarefasDoDia = useMemo(() => {
    if (!selectedDateISO) return [];
    const start = startOfDay(parseISO(`${selectedDateISO}T00:00:00`)).toISOString();
    const end = startOfDay(addDays(parseISO(`${selectedDateISO}T00:00:00`), 1)).toISOString();

    const isCalendarMode = viewMode === 'mes' || ['dia', '3dias', 'semana'].includes(viewMode as any) || (viewMode as any) === 'calendario';
    const base = isCalendarMode ? tarefasTimeline : (listKey === SMART_MEUDIA ? [...tarefasHoje, ...tarefasAtrasadas] : tarefas);
    return base
      .filter((t) => !!t.vencimento_em && t.vencimento_em >= start && t.vencimento_em < end)
      .sort((a, b) => (a.vencimento_em || '').localeCompare(b.vencimento_em || ''));
  }, [selectedDateISO, tarefas, tarefasHoje, tarefasAtrasadas, tarefasTimeline, listKey, viewMode]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Usamos GRID para garantir "push" real do painel de detalhes (sem overlap),
          mesmo quando o Kanban tem min-width grande internamente. */}
      <div
        className={cn(
          'flex-1 overflow-hidden',
          isMobile 
            ? 'flex flex-col' 
            : (selectedTarefa ? 'grid grid-cols-[270px_minmax(0,1fr)_400px]' : 'grid grid-cols-[270px_minmax(0,1fr)]')
        )}
        style={{
          backgroundColor: '#0f1219',
          backgroundImage: agendaBgUrl
            ? `url(${agendaBgUrl})`
            : (AGENDA_BG_PRESETS.find((p) => p.id === agendaBgPreset) || AGENDA_BG_PRESETS[0]).backgroundImage,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {!isMobile && (
          <AgendaSidebarListas
            listasInteligentes={smartLists.map((l) => ({ ...l, _key: normalizeSmartKey(l.nome) }))}
            listas={regularLists.map((l) => ({ ...l, _key: (`list:${l.id}` as const) }))}
            activeKey={listKey}
            counts={counts}
            onSelect={onSelectLista}
            onOpenConfig={() => onSelectLista('config')}
            onCreateLista={openNovaLista}
            onEditLista={(l) => openEditarLista(l)}
            onDeleteLista={(l) => setConfirmDeleteLista(l)}
          />
        )}

        {/* Mobile Sidebar (Drawer real: overlay + swipe) */}
        {isMobile ? (
          <div
            className={cn(
              'fixed inset-0 z-[14000] transition-opacity',
              isMobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
          >
            <div
              className={cn(
                'absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity',
                isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'
              )}
              onClick={() => setIsMobileSidebarOpen(false)}
              role="button"
              aria-label="Fechar menu"
              tabIndex={-1}
            />

            <div
              className={cn(
                'absolute top-0 left-0 h-full w-[86%] max-w-[320px] bg-slate-950/95 border-r border-slate-800/70 shadow-2xl transition-transform duration-300',
                isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
              onTouchStart={(e) => {
                // swipe-to-close: detecta arrasto para a esquerda
                (window as any).__la_drawerStartX = e.touches?.[0]?.clientX ?? 0;
              }}
              onTouchEnd={(e) => {
                const startX = (window as any).__la_drawerStartX ?? 0;
                const endX = e.changedTouches?.[0]?.clientX ?? startX;
                const delta = endX - startX;
                if (delta < -60) setIsMobileSidebarOpen(false);
              }}
            >
              <AgendaSidebarListas
                listasInteligentes={smartLists.map((l) => ({ ...l, _key: normalizeSmartKey(l.nome) }))}
                listas={regularLists.map((l) => ({ ...l, _key: (`list:${l.id}` as const) }))}
                activeKey={listKey}
                counts={counts}
                isMobile
                onSelect={(key) => {
                  onSelectLista(key);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenConfig={() => {
                  onSelectLista('config');
                  setIsMobileSidebarOpen(false);
                }}
                onCreateLista={() => {
                  openNovaLista();
                  setIsMobileSidebarOpen(false);
                }}
                onEditLista={(l) => {
                  openEditarLista(l);
                  setIsMobileSidebarOpen(false);
                }}
                onDeleteLista={(l) => {
                  setConfirmDeleteLista(l);
                  setIsMobileSidebarOpen(false);
                }}
              />
            </div>
          </div>
        ) : null}

        {/* min-w-0 é essencial para que a área central "encolha" quando o painel de detalhes abrir,
            ao invés de manter o tamanho mínimo do Kanban e acabar ficando por baixo/overlap. */}
        <div className="min-w-0 flex flex-col overflow-hidden">
          <AgendaContent
            loading={loading}
            error={error}
            leftIcon={tituloIcon}
            accentColor={accentColor}
            title={tituloTopo}
            subtitle={subtituloTopo}
            mode={mode}
            viewMode={viewMode}
            setMode={setMode}
            setViewMode={setViewMode}
            listKey={listKey}
            listaAtiva={listaAtiva}
            listasAll={listas}
            tarefas={tarefas}
            tarefasHoje={tarefasHoje}
            tarefasAtrasadas={tarefasAtrasadas}
            tarefasTimeline={tarefasTimeline}
            tarefaSelecionadaId={selectedTarefaId}
            onSelectTarefa={(t) => setSelectedTarefaId(t?.id || null)}
            selectedDateISO={selectedDateISO}
            selectedDateLabel={selectedDateLabel}
            tarefasDoDia={tarefasDoDia}
            onSelectDate={onSelectDate}
            onGoToToday={handleGoToToday}
            onRefresh={() => {
              loadListas().catch(() => {});
              loadCounts().catch(() => {});
              loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }).catch(() => {});
            }}
            kanbanColumns={kanbanColumns}
            isMobile={isMobile}
            onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          />
        </div>

        {selectedTarefa ? (
          <div className={cn('hidden xl:flex border-l border-slate-800 min-w-0')}>
            <TarefaDetailPanel
              tarefa={selectedTarefa}
              listas={listas}
              onClose={() => setSelectedTarefaId(null)}
              onSaved={() => scheduleRefresh()}
              onDeleted={() => {
                setSelectedTarefaId(null);
                scheduleRefresh();
              }}
            />
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={novaListaOpen}
        onClose={() => {
          setNovaListaOpen(false);
          setNovaListaError(null);
          setListaEditando(null);
        }}
        title={listaEditando ? 'Editar Lista' : 'Nova Lista'}
        subtitle={listaEditando ? 'Ajuste nome, ícone e cor. Isso reflete em todo o sistema.' : 'Crie listas personalizadas para a Ana organizar o dia (RH, Financeiro, Pessoal, etc).'}
        className="max-w-4xl"
        footer={
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {novaListaError ? <Badge variant="danger">{novaListaError}</Badge> : null}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNovaListaOpen(false)}
                className="px-5 py-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-200 font-black hover:bg-slate-900/60 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveLista}
                disabled={novaListaSaving}
                className={cn(
                  'px-6 py-3 rounded-2xl font-black text-white transition-all shadow-lg active:scale-95',
                  novaListaSaving ? 'bg-slate-800 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20'
                )}
              >
                {novaListaSaving ? (listaEditando ? 'Salvando…' : 'Criando…') : (listaEditando ? 'Salvar' : 'Criar Lista')}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Nome</div>
            <input
              value={novaListaNome}
              onChange={(e) => setNovaListaNome(e.target.value)}
              placeholder="Ex.: Comercial, Contratos, Escola, Família…"
              className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Ícone</div>
              <div className="flex items-center gap-3">
                <input
                  value={novaListaIcone}
                  onChange={(e) => setNovaListaIcone(e.target.value)}
                  className="w-24 bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-black outline-none focus:ring-2 focus:ring-violet-500/50 text-center"
                  aria-label="Ícone (emoji)"
                />
                <div className="text-xs text-slate-500 font-bold">
                  Dica: cole qualquer emoji aqui, ou escolha abaixo.
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((ic) => (
                  <Tooltip key={ic} content={`Usar ${ic}`} side="top">
                    <button
                      type="button"
                      onClick={() => setNovaListaIcone(ic)}
                      className={cn(
                        'w-10 h-10 rounded-2xl border flex items-center justify-center transition-all',
                        novaListaIcone === ic
                          ? 'bg-violet-500/15 border-violet-500/25 text-white'
                          : 'bg-slate-900/30 border-slate-800 text-slate-300 hover:text-white hover:border-violet-500/20'
                      )}
                      aria-label={`Usar ${ic}`}
                    >
                      <span className="text-lg">{ic}</span>
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Cor</div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 font-black">Cores rápidas</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Escolha 1</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <Tooltip key={c} content={c} side="top">
                      <button
                        type="button"
                        onClick={() => setNovaListaCor(c)}
                        className={cn(
                          'w-9 h-9 rounded-full border transition-all',
                          novaListaCor?.toLowerCase?.() === c.toLowerCase()
                            ? 'border-white ring-2 ring-white/20'
                            : 'border-slate-800 hover:border-violet-500/25'
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Selecionar cor ${c}`}
                      />
                    </Tooltip>
                  ))}
                  <div className="w-px h-9 bg-slate-800 mx-1" />
                  <div className="flex items-center gap-2">
                    <Tooltip content="Cor personalizada" side="top">
                      <input
                        type="color"
                        value={novaListaCor}
                        onChange={(e) => setNovaListaCor(e.target.value)}
                        className="w-10 h-10 rounded-2xl border border-slate-700/60 bg-transparent"
                        aria-label="Cor personalizada"
                      />
                    </Tooltip>
                    <div className="text-xs text-slate-500 font-bold">Personalizada</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/10 px-4 py-3">
                  <div className="text-xs text-slate-500 font-black uppercase tracking-widest">Preview</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-lg">{novaListaIcone || '📌'}</span>
                    <span className="text-white font-black" style={{ color: novaListaCor || '#8b5cf6' }}>
                      {novaListaNome.trim() || 'Minha Lista'}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-bold mt-2">
                  Essa cor aparece como destaque no sistema.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Quick Pay Modal (cinematográfico) */}
      <PagarContaModal
        isOpen={!!quickPayConta}
        conta={quickPayConta}
        onClose={() => {
          setQuickPay(null);
          setQuickPayConta(null);
          setQuickPayLoading(false);
        }}
        onConfirm={async (input) => {
          if (!quickPay?.contaId || !quickPay?.tarefaId) return;
          await registrarPagamento(quickPay.contaId, input);
          await updateTarefa(quickPay.tarefaId, { status: 'concluida', data_conclusao: new Date().toISOString() } as any);
          setQuickPay(null);
          setQuickPayConta(null);
          // Refresh imediato: recarrega tudo para refletir pagamento no calendario/listas
          await Promise.all([
            loadCounts(),
            loadTimeline(),
            loadTarefasForKey(listKey, { includeConcluidas: viewMode === 'kanban' }),
          ]).catch(() => {});
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteLista}
        onClose={() => setConfirmDeleteLista(null)}
        onConfirm={handleConfirmDeleteLista}
        title="Excluir lista?"
        message={
          confirmDeleteLista
            ? `A lista “${confirmDeleteLista.nome}” será removida. As tarefas ligadas a ela ficarão sem lista (não serão apagadas).`
            : 'A lista será removida.'
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </div>
  );
};

