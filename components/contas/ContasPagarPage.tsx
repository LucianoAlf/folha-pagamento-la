import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner, ErrorState, ConfirmDialog } from '../UI';
import { ContaPagar, CategoriaDespesa } from '../../types/contasPagar';
import {
  calcularResumo,
  calcularResumoAuditoria,
  fetchCategorias,
  fetchContasPagar,
  registrarPagamento,
  createContaPagar,
  updateContaPagar,
  upsertCategoria,
  deleteCategoria,
  deleteConta,
  deleteContasBatch,
  deleteParcelamento,
  getStatusVisual,
  finalizarParcelamento,
  updateFuturasRecorrentes,
  updateFuturasParceladas,
} from '../../services/contasPagarService';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../services/supabase';
import { ContasSummaryCards } from './ContasSummaryCards';
import { ContasTable } from './ContasTable';
import { NovaContaModal } from './NovaContaModal';
import { PagarContaModal } from './PagarContaModal';
import { CategoriaModal } from './CategoriaModal';
import { EditarContaModal } from './EditarContaModal';
import { ContaAuditCard } from './ContaAuditCard';
import { ContasCalendar } from './ContasCalendar';
import { ContasDoDiaModal } from './ContasDoDiaModal';
import { Badge, Card, CustomSelect, Tooltip, Modal } from '../UI';
import { formatCurrency } from '../../services/api';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useToast } from '../../hooks/useToast';
import {
  CheckCircle2,
  DollarSign,
  Info,
  TrendingUp,
  Clock,
  Lightbulb,
  Loader2,
  Plus,
  Filter,
  Edit2,
  Trash2,
  AlertTriangle,
  Percent,
  CreditCard,
  Tag,
  BarChart3,
  LineChart as LineChartIcon,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  Calendar,
  Sparkles,
  Brain,
  Bot,
  Bell,
  CheckSquare,
  X,
  FileText
} from 'lucide-react';
import { cn } from '../CollaboratorComponents';
import { KPICard, DistributionChart, EvolutionChart } from '../DashboardWidgets';

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

type ContasAuditoriaAiSeverity = 'alta' | 'media' | 'baixa';

type ContasAuditoriaAiAnomalia = {
  key: string;
  severidade: ContasAuditoriaAiSeverity;
  titulo: string;
  descricao: string;
  impacto_financeiro?: number;
  conta_id?: string | null;
  acao_sugerida?: string;
  pergunta_para_ana?: string;
};

type ContasAuditoriaAiJson = {
  resumo_executivo: string;
  pontos_de_atencao?: string[];
  anomalias?: ContasAuditoriaAiAnomalia[];
  recomendacoes_operacionais?: string[];
};

type ContasAuditoriaAiRow = {
  id: string;
  created_at: string;
  competencia_ym: string;
  unidade: string;
  input_hash: string;
  summary: string | null;
  response_json: ContasAuditoriaAiJson | null;
};

type ContasComparativoAiSeverity = 'alta' | 'media' | 'baixa';

type ContasComparativoAiInsight = {
  titulo: string;
  categoria: string;
  severidade: ContasComparativoAiSeverity;
  descricao: string;
  impacto_financeiro?: number;
  chave_referencia?: string | null;
};

type ContasComparativoAiJson = {
  analise_executiva: string;
  insights_detalhados?: ContasComparativoAiInsight[];
  recomendacoes?: string[];
};

type ContasComparativoAiRow = {
  id: string;
  created_at: string;
  competencia_ym: string;
  base_ym: string;
  unidade: string;
  input_hash: string;
  summary: string | null;
  response_json: ContasComparativoAiJson | null;
};

type ContasAnomaliaNotaStatus = 'pendente' | 'verificado';
type ContasAnomaliaNotaRow = {
  id: string;
  competencia_ym: string;
  unidade: string;
  anomaly_key: string;
  conta_id: string | null;
  nota: string;
  status: ContasAnomaliaNotaStatus;
  updated_at: string;
};

const COMPARATIVO_THRESHOLD = 20;

type ContasMode = 'dashboard' | 'visao-geral' | 'todas' | 'comparativo' | 'categorias';

const CONTAS_TABS: { id: ContasMode; label: string; icon: React.FC<any>; shortLabel: string }[] = [
  { id: 'dashboard', label: 'Resumo', icon: LineChartIcon, shortLabel: 'Dash' },
  { id: 'visao-geral', label: 'Contas a Pagar', icon: BarChart3, shortLabel: 'Contas' },
  { id: 'todas', label: 'Auditoria', icon: FileText, shortLabel: 'Audit.' },
  { id: 'comparativo', label: 'Comparativo', icon: TrendingUp, shortLabel: 'IA' },
  { id: 'categorias', label: 'Categorias', icon: Calendar, shortLabel: 'Categ.' },
];

const CONTAS_TITLES: Record<ContasMode, { title: string; subtitle: string }> = {
  'dashboard': { title: 'Gestão Mensal', subtitle: 'Selecione o mês de referência para lançamentos e conferência' },
  'visao-geral': { title: 'Gestão Mensal', subtitle: 'Acompanhamento de contas a pagar por competência' },
  'todas': { title: 'Auditoria Financeira', subtitle: 'Histórico completo de lançamentos e liquidações' },
  'comparativo': { title: 'IA Financeira', subtitle: 'Insights e anomalias detectadas por IA nas contas a pagar' },
  'categorias': { title: 'Categorias Financeiras', subtitle: 'Gerencie as classificações as categorias para o fluxo de caixa.' },
};

export const ContasPagarPage: React.FC<{
  initialMode?: ContasMode;
  competenciaYM?: string;
  onCompetenciaYMChange?: (ym: string) => void;
}> = ({ initialMode = 'dashboard', competenciaYM, onCompetenciaYMChange }) => {
  // ── Tab state interno (troca de aba não re-renderiza App.tsx) ──
  const [mode, setMode] = useState<ContasMode>(initialMode);

  // P1: tratamento de erro + feedback (toast) para mutações async
  const { run } = useAsyncAction();
  const { success: toastSuccess } = useToast();

  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroTab, setFiltroTab] = useState<FiltroTab>('todas');
  const [unidadeFiltro, setUnidadeFiltro] = useState<'todas' | 'cg' | 'rec' | 'bar'>('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('all');
  const [comportamentoFiltro, setComportamentoFiltro] = useState<'all' | 'fixo' | 'variavel'>('all');
  const [tipoFiltro, setTipoFiltro] = useState<'all' | 'unica' | 'parcelada' | 'recorrente'>('all');
  
  // Define o mês atual como padrão para evitar poluição visual de meses futuros
  const [competenciaFiltroInternal, setCompetenciaFiltroInternal] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const competenciaFiltro = competenciaYM ?? competenciaFiltroInternal;
  const setCompetenciaFiltro = onCompetenciaYMChange ?? setCompetenciaFiltroInternal;

  const [novaOpen, setNovaOpen] = useState(false);
  const [pagarConta, setPagarConta] = useState<ContaPagar | null>(null);
  const [editarConta, setEditarConta] = useState<ContaPagar | null>(null);
  const [contaParaExcluir, setContaParaExcluir] = useState<ContaPagar | null>(null);
  const [contaParaFinalizar, setContaParaFinalizar] = useState<ContaPagar | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaDespesa | null>(null);

  const [busca, setBusca] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Limpar seleção quando mudam filtros
  useEffect(() => { clearSelection(); }, [filtroTab, unidadeFiltro, competenciaFiltro, categoriaFiltro, tipoFiltro]);
  const [competenciaComparar, setCompetenciaComparar] = useState<string>(() => {
    const hoje = new Date();
    const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  });

  const unidadeTabs = useMemo(
    () =>
      [
        { id: 'todas', mobile: 'Todas', desktop: 'Consolidado' },
        { id: 'cg', mobile: 'CG', desktop: 'Campo Grande' },
        { id: 'rec', mobile: 'Recreio', desktop: 'Recreio' },
        { id: 'bar', mobile: 'Barra', desktop: 'Barra' },
      ] as const,
    []
  );

  // Mobile premium: bottom sheets (Refinar / Ações) com draft state
  const [contasMobileRefinarOpen, setContasMobileRefinarOpen] = useState(false);
  const [contasMobileAcoesOpen, setContasMobileAcoesOpen] = useState(false);

  const [draftCompetenciaYM, setDraftCompetenciaYM] = useState<string>('');
  const [draftCategoriaFiltro, setDraftCategoriaFiltro] = useState<string>('all');
  const [draftComportamentoFiltro, setDraftComportamentoFiltro] = useState<'all' | 'fixo' | 'variavel'>('all');
  const [draftTipoFiltro, setDraftTipoFiltro] = useState<'all' | 'unica' | 'parcelada' | 'recorrente'>('all');
  const [draftBusca, setDraftBusca] = useState<string>('');

  useEffect(() => {
    if (!contasMobileRefinarOpen) return;
    setDraftCompetenciaYM(competenciaFiltro);
    setDraftCategoriaFiltro(categoriaFiltro);
    setDraftComportamentoFiltro(comportamentoFiltro);
    setDraftTipoFiltro(tipoFiltro);
    setDraftBusca(busca);
  }, [contasMobileRefinarOpen, competenciaFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro, busca]);

  const contasActiveFiltersCount = useMemo(() => {
    let n = 0;
    if (categoriaFiltro !== 'all') n += 1;
    if (comportamentoFiltro !== 'all') n += 1;
    if (tipoFiltro !== 'all') n += 1;
    if ((busca || '').trim()) n += 1;
    return n;
  }, [categoriaFiltro, comportamentoFiltro, tipoFiltro, busca]);

  const contasActiveFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (categoriaFiltro !== 'all') {
      const cat = categorias.find((c) => c.id === categoriaFiltro);
      chips.push(`Categoria: ${cat?.nome || 'Selecionada'}`);
    }
    if (comportamentoFiltro !== 'all') {
      chips.push(`Custo: ${comportamentoFiltro === 'fixo' ? 'Fixo' : 'Variável'}`);
    }
    if (tipoFiltro !== 'all') {
      chips.push(
        `Tipo: ${
          tipoFiltro === 'unica' ? 'Única' : tipoFiltro === 'parcelada' ? 'Parc.' : 'Recorr.'
        }`
      );
    }
    if ((busca || '').trim()) {
      chips.push(`Busca: ${(busca || '').trim()}`);
    }
    return chips;
  }, [categoriaFiltro, categorias, comportamentoFiltro, tipoFiltro, busca]);

  const applyContasMobileFilters = useCallback(() => {
    const nextCompetencia = draftCompetenciaYM || competenciaFiltro;
    setCompetenciaFiltro(nextCompetencia);
    setCategoriaFiltro(draftCategoriaFiltro);
    setComportamentoFiltro(draftComportamentoFiltro);
    setTipoFiltro(draftTipoFiltro);
    setBusca(draftBusca);

    setContasMobileRefinarOpen(false);
  }, [
    draftCompetenciaYM,
    draftCategoriaFiltro,
    draftComportamentoFiltro,
    draftTipoFiltro,
    draftBusca,
    competenciaFiltro,
    setCompetenciaFiltro,
    setCategoriaFiltro,
    setComportamentoFiltro,
    setTipoFiltro,
    setBusca,
  ]);

  const clearContasMobileFilters = useCallback(() => {
    setDraftCategoriaFiltro('all');
    setDraftComportamentoFiltro('all');
    setDraftTipoFiltro('all');
    setDraftBusca('');
  }, []);

  // Notas e AI Insights
  const [notasAuditoria, setNotasAuditoria] = useState<string>('');
  const [notasAuditoriaLoading, setNotasAuditoriaLoading] = useState(false);
  const [notasAuditoriaSaved, setNotasAuditoriaSaved] = useState(false);

  const [notasComparativo, setNotasComparativo] = useState<string>('');
  const [notasComparativoLoading, setNotasComparativoLoading] = useState(false);
  const [notasComparativoSaved, setNotasComparativoSaved] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const [auditViewMode, setAuditViewMode] = useState<'cards' | 'lista'>(() => {
    try {
      const raw = localStorage.getItem('contas:auditViewMode');
      return raw === 'lista' ? 'lista' : 'cards';
    } catch {
      return 'cards';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('contas:auditViewMode', auditViewMode);
    } catch {}
  }, [auditViewMode]);

  const [auditAiOpen, setAuditAiOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('contas:auditAiOpen');
      return raw === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('contas:auditAiOpen', String(auditAiOpen));
    } catch {}
  }, [auditAiOpen]);

  const [auditAiLoading, setAuditAiLoading] = useState(false);
  const [auditAiError, setAuditAiError] = useState<string | null>(null);
  const [auditAiRow, setAuditAiRow] = useState<ContasAuditoriaAiRow | null>(null);
  const [auditAiCached, setAuditAiCached] = useState<boolean>(false);

  const [compAiLoading, setCompAiLoading] = useState(false);
  const [compAiError, setCompAiError] = useState<string | null>(null);
  const [compAiRow, setCompAiRow] = useState<ContasComparativoAiRow | null>(null);
  const [compAiCached, setCompAiCached] = useState<boolean>(false);
  const notasKeyRef = useRef<string | null>(null);
  const auditAiKeyRef = useRef<string | null>(null);
  const compAiKeyRef = useRef<string | null>(null);
  const anomaliaNotasKeyRef = useRef<string | null>(null);

  const [compAiOpen, setCompAiOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('contas:compAiOpen');
      if (raw === null) return true; // default aberto
      return raw === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('contas:compAiOpen', String(compAiOpen));
    } catch {}
  }, [compAiOpen]);

  const [anomaliaNotas, setAnomaliaNotas] = useState<Record<string, ContasAnomaliaNotaRow>>({});
  const [anotarOpen, setAnotarOpen] = useState(false);
  const [anotarKey, setAnotarKey] = useState<string | null>(null);
  const [anotarContaId, setAnotarContaId] = useState<string | null>(null);
  const [anotarTitulo, setAnotarTitulo] = useState<string>('');
  const [anotarStatus, setAnotarStatus] = useState<ContasAnomaliaNotaStatus>('pendente');
  const [anotarTexto, setAnotarTexto] = useState<string>('');
  const [anotarSaving, setAnotarSaving] = useState(false);
  const [anotarSaved, setAnotarSaved] = useState(false);

  // Visão operacional: Lista vs Calendário
  const [visaoOperacionalModo, setVisaoOperacionalModo] = useState<'lista' | 'calendario'>(() => {
    try {
      const raw = localStorage.getItem('contas:visaoOperacionalModo');
      return raw === 'calendario' ? 'calendario' : 'lista';
    } catch {
      return 'lista';
    }
  });
  const [calendarioDiaSelecionado, setCalendarioDiaSelecionado] = useState<string | undefined>(undefined);
  const [novaContaDefaults, setNovaContaDefaults] = useState<{ vencimento?: string; competenciaYM?: string } | null>(null);
  const [diaModalOpen, setDiaModalOpen] = useState(false);
  const [diaModalContaIdToDelete, setDiaModalContaIdToDelete] = useState<ContaPagar | null>(null);

  // Se a competência mudar (inclui mobile sheet), limpamos o dia selecionado no calendário
  useEffect(() => {
    setCalendarioDiaSelecionado(undefined);
  }, [competenciaFiltro]);

  const [confirmDeleteCategoria, setConfirmDeleteCategoria] = useState<{ id: string; nome: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('contas:visaoOperacionalModo', visaoOperacionalModo);
    } catch {}
  }, [visaoOperacionalModo]);

  // Carregar notas da competência selecionada (Auditoria/Comparativo com colunas separadas)
  useEffect(() => {
    async function loadNotas() {
      if (mode !== 'todas' && mode !== 'comparativo') return;
      if (!competenciaFiltro) return;
      const key = `${mode}|${competenciaFiltro}`;
      if (notasKeyRef.current === key) return;
      const [year, month] = competenciaFiltro.split('-').map(Number);
      
      const coluna = mode === 'comparativo' ? 'contas_comparativo_notas_rh' : 'contas_notas_rh';
      const { data, error } = await supabase
        .from('folhas_mensais')
        .select(coluna)
        .eq('ano', year)
        .eq('mes', month)
        .single();

      if (!error && data) {
        if (mode === 'comparativo') setNotasComparativo((data as any).contas_comparativo_notas_rh || '');
        else setNotasAuditoria((data as any).contas_notas_rh || '');
      } else {
        if (mode === 'comparativo') setNotasComparativo('');
        else setNotasAuditoria('');
      }
      notasKeyRef.current = key;
    }
    void loadNotas();
  }, [mode, competenciaFiltro]);

  const saveNotas = async () => {
    if (!competenciaFiltro) return;
    const isComp = mode === 'comparativo';
    if (isComp) {
      setNotasComparativoLoading(true);
      setNotasComparativoSaved(false);
    } else {
      setNotasAuditoriaLoading(true);
      setNotasAuditoriaSaved(false);
    }
    
    const [year, month] = competenciaFiltro.split('-').map(Number);
    
    // Tenta dar update ou insert (upsert não funciona bem com ano/mes se não for PK)
    // Na verdade folhas_mensais tem id como PK. Vamos buscar o id primeiro.
    const { data: folha } = await supabase
      .from('folhas_mensais')
      .select('id')
      .eq('ano', year)
      .eq('mes', month)
      .single();

    if (folha) {
      await supabase
        .from('folhas_mensais')
        .update(isComp ? { contas_comparativo_notas_rh: notasComparativo } : { contas_notas_rh: notasAuditoria })
        .eq('id', folha.id);
    } else {
      await supabase
        .from('folhas_mensais')
        .insert([
          isComp
            ? { ano: year, mes: month, contas_comparativo_notas_rh: notasComparativo, status: 'rascunho' }
            : { ano: year, mes: month, contas_notas_rh: notasAuditoria, status: 'rascunho' },
        ]);
    }
    
    if (isComp) {
      setNotasComparativoLoading(false);
      setNotasComparativoSaved(true);
      setTimeout(() => setNotasComparativoSaved(false), 3000);
    } else {
      setNotasAuditoriaLoading(false);
      setNotasAuditoriaSaved(true);
      setTimeout(() => setNotasAuditoriaSaved(false), 3000);
    }
  };

  const loadAnomaliaNotas = useCallback(async (force = false) => {
    if (mode !== 'todas' || !auditAiOpen) return;
    const key = `${competenciaFiltro}|${unidadeFiltro}`;
    if (!force && anomaliaNotasKeyRef.current === key) return;
    const { data, error } = await supabase
      .from('contas_anomalia_notas')
      .select('id,competencia_ym,unidade,anomaly_key,conta_id,nota,status,updated_at')
      .eq('competencia_ym', competenciaFiltro)
      .eq('unidade', unidadeFiltro)
      .order('updated_at', { ascending: false });
    if (error) return;
    const map: Record<string, ContasAnomaliaNotaRow> = {};
    (data || []).forEach((r: any) => {
      map[String(r.anomaly_key)] = r as ContasAnomaliaNotaRow;
    });
    setAnomaliaNotas(map);
    anomaliaNotasKeyRef.current = key;
  }, [mode, auditAiOpen, competenciaFiltro, unidadeFiltro]);

  /**
   * Helper para chamar Edge Function com autenticação robusta.
   * Tenta primeiro com supabase.functions.invoke() (método recomendado).
   * Se falhar com 401, tenta com fetch direto incluindo o token explicitamente.
   */
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} demorou além do esperado. Tente atualizar.`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const invokeEdgeFunction = async (functionName: string, params: any, timeoutMs = 12_000) => {
    // Sempre tentar renovar/validar a sessão antes (evita token expirado)
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const token = refreshData?.session?.access_token;

    if (refreshError || !token) {
      console.error('❌ Falha ao refreshSession():', refreshError);
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }

    // Garante que o FunctionsClient está com o auth atualizado
    try {
      // @supabase/functions-js suporta setAuth(token)
      supabase.functions.setAuth(token);
    } catch {
      // ignore (defensivo: versões antigas podem não expor)
    }

    try {
      const { data, error, response } = await withTimeout(
        supabase.functions.invoke(functionName, {
          body: params,
          // redundante, mas garante header mesmo se setAuth falhar por versão
          headers: { Authorization: `Bearer ${token}` },
        } as any),
        timeoutMs,
        `A função ${functionName}`
      );
      
      if (error) {
        const status =
          (response as any)?.status ??
          (error as any)?.context?.status ??
          (error as any)?.status;

        // Se não for 401, lançar erro imediatamente
        if (status !== 401) throw error;

        // Se for 401, tentar método alternativo
      } else {
        return data;
      }
    } catch (err: any) {
      const status =
        (err as any)?.context?.status ??
        (err as any)?.status;

      if (status !== 401) throw err;
    }

    // Método 2: Fetch direto com token explícito (fallback)
    const response = await withTimeout(
      fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Supabase Edge Functions espera apikey (anon key) e Authorization em vários cenários
          apikey: SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      }),
      timeoutMs,
      `A função ${functionName}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status}: ${errorText || 'Falha na requisição'}`);
    }

    const result = await response.json();
    return result;
  };


  const loadAuditAi = useCallback(
    async (force = false) => {
      if (mode !== 'todas' || !auditAiOpen) return;
      const key = `${competenciaFiltro}|${unidadeFiltro}|${categoriaFiltro}|${comportamentoFiltro}|${tipoFiltro}`;
      if (!force && auditAiKeyRef.current === key) return;
      setAuditAiLoading(true);
      setAuditAiError(null);
      try {
        // Verificar sessão explicitamente antes de chamar a Edge Function
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !sessionData?.session) {
          throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
        }

        const params = {
          competenciaYM: competenciaFiltro,
          unidade: unidadeFiltro,
          categoriaId: categoriaFiltro,
          comportamento: comportamentoFiltro,
          tipo: tipoFiltro,
          force,
        };

        // Usar helper robusto que tenta 2 métodos
        const data = await invokeEdgeFunction('ai-contas-auditoria', params);
        const auditData = data as ContasAuditoriaAiRow & { cached?: boolean };
        setAuditAiCached(!!auditData?.cached);
        setAuditAiRow(auditData);
        auditAiKeyRef.current = key;
      } catch (e: any) {
        setAuditAiRow(null);
        setAuditAiCached(false);
        setAuditAiError(e?.message || 'Falha ao gerar análise');
      } finally {
        setAuditAiLoading(false);
      }
    },
    [mode, auditAiOpen, competenciaFiltro, unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro]
  );

  const loadComparativoAi = useCallback(
    async (force = false) => {
      if (mode !== 'comparativo' || !compAiOpen) return;
      const key = `${competenciaFiltro}|${competenciaComparar}|${unidadeFiltro}|${categoriaFiltro}|${comportamentoFiltro}|${tipoFiltro}`;
      if (!force && compAiKeyRef.current === key) return;
      setCompAiLoading(true);
      setCompAiError(null);
      try {
        const params = {
          competenciaYM: competenciaFiltro,
          baseYM: competenciaComparar,
          unidade: unidadeFiltro,
          categoriaId: categoriaFiltro,
          comportamento: comportamentoFiltro,
          tipo: tipoFiltro,
          force,
        };

        const data = await invokeEdgeFunction('ai-contas-comparativo', params, 20_000);
        const row = data as ContasComparativoAiRow & { cached?: boolean };
        setCompAiCached(!!(row as any)?.cached);
        setCompAiRow(row);
        compAiKeyRef.current = key;
      } catch (e: any) {
        setCompAiRow(null);
        setCompAiCached(false);
        setCompAiError(e?.message || 'Falha ao gerar insights');
      } finally {
        setCompAiLoading(false);
      }
    },
    [mode, compAiOpen, competenciaFiltro, competenciaComparar, unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro]
  );

  useEffect(() => {
    if (mode !== 'comparativo' || !compAiOpen) return;
    const timer = setTimeout(() => {
      void loadComparativoAi(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [mode, compAiOpen, competenciaFiltro, competenciaComparar, unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro, loadComparativoAi]);

  useEffect(() => {
    if (mode !== 'todas' || !auditAiOpen) return;
    void loadAuditAi(false);
    void loadAnomaliaNotas();
  }, [mode, auditAiOpen, competenciaFiltro, unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro, loadAuditAi, loadAnomaliaNotas]);

  const openAnotar = useCallback(
    (a: ContasAuditoriaAiAnomalia) => {
      const existing = anomaliaNotas[a.key];
      setAnotarKey(a.key);
      setAnotarContaId((a.conta_id as any) || null);
      setAnotarTitulo(a.titulo || 'Anomalia');
      setAnotarStatus(existing?.status || 'pendente');
      setAnotarTexto(existing?.nota || '');
      setAnotarSaved(false);
      setAnotarOpen(true);
    },
    [anomaliaNotas]
  );

  const saveAnomaliaNota = useCallback(async () => {
    if (!anotarKey) return;
    setAnotarSaving(true);
    setAnotarSaved(false);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;
      const payload = {
        competencia_ym: competenciaFiltro,
        unidade: unidadeFiltro,
        anomaly_key: anotarKey,
        conta_id: anotarContaId || null,
        nota: anotarTexto || '',
        status: anotarStatus,
        created_by: userId,
      };

      const { error } = await supabase
        .from('contas_anomalia_notas')
        .upsert(payload as any, { onConflict: 'competencia_ym,unidade,anomaly_key' });
      if (error) throw error;

      await loadAnomaliaNotas(true);
      setAnotarSaved(true);
      setTimeout(() => setAnotarSaved(false), 2000);
    } catch (e) {
      // non-blocking UI; show inline error? keep simple for now
      console.error('Erro ao salvar nota de anomalia', e);
    } finally {
      setAnotarSaving(false);
    }
  }, [anotarKey, anotarContaId, anotarTexto, anotarStatus, competenciaFiltro, unidadeFiltro, loadAnomaliaNotas]);

  const matchesCompetencia = useCallback(
    (c: ContaPagar) => {
      if (!c.competencia) return false;
      const [y, m] = c.competencia.split('-');
      return `${y}-${m}` === competenciaFiltro;
    },
    [competenciaFiltro]
  );

  const matchesCommonFilters = useCallback(
    (c: ContaPagar) => {
      if (unidadeFiltro !== 'todas' && c.unidade !== unidadeFiltro && c.unidade !== 'todas') return false;
      if (categoriaFiltro !== 'all' && c.categoria_id !== categoriaFiltro) return false;
      if (comportamentoFiltro !== 'all' && c.categoria?.tipo_custo !== comportamentoFiltro) return false;
      if (tipoFiltro !== 'all' && c.tipo_lancamento !== tipoFiltro) return false;

      const q = (busca || '').trim().toLowerCase();
      if (q) {
        const inDesc = (c.descricao || '').toLowerCase().includes(q);
        const inCat = (c.categoria?.nome || '').toLowerCase().includes(q);
        if (!inDesc && !inCat) return false;
      }

      return true;
    },
    [unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro, busca]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, rows] = await Promise.all([fetchCategorias(), fetchContasPagar()]);
      setCategorias(cats);
      setContas(rows);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar contas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime: auto-refresh on changes (debounced to avoid cascading refetches)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refetch(); }, 500);
    };
    const channel = supabase
      .channel('contas-pagar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_pagar' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_despesa' }, debouncedRefetch)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const formatCompetenciaLabel = useCallback((ym: string) => {
    const [y, m] = (ym || '').split('-');
    if (!y || !m) return ym;
    const date = new Date(Number(y), Number(m) - 1, 1);
    const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    return label.replace('.', '').replace(' ', '/').toUpperCase();
  }, []);

  const competenciaOptions = useMemo(() => {
    const opts = new Set<string>();
    contas.forEach(c => {
      if (c.competencia) {
        const [y, m] = c.competencia.split('-');
        opts.add(`${y}-${m}`);
      }
    });
    
    const hoje = new Date();
    const cur = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    opts.add(cur);
    
    const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const nxt = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}`;
    opts.add(nxt);

    return Array.from(opts)
      .sort((a, b) => a.localeCompare(b))
      .map(v => {
        const [y, m] = v.split('-');
        const date = new Date(Number(y), Number(m) - 1, 1);
        const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return { 
          value: v, 
          label: label.charAt(0).toUpperCase() + label.slice(1)
        };
      });
  }, [contas]);

  const matchesCompetenciaComparar = useCallback(
    (c: ContaPagar) => {
      if (!c.competencia) return false;
      const [y, m] = c.competencia.split('-');
      return `${y}-${m}` === competenciaComparar;
    },
    [competenciaComparar]
  );

  // Para dashboard/comparativo: filtros comuns sem "busca" (busca é só UX de tabela)
  const matchesCommonFiltersNoSearch = useCallback(
    (c: ContaPagar) => {
      if (unidadeFiltro !== 'todas' && c.unidade !== unidadeFiltro && c.unidade !== 'todas') return false;
      if (categoriaFiltro !== 'all' && c.categoria_id !== categoriaFiltro) return false;
      if (comportamentoFiltro !== 'all' && c.categoria?.tipo_custo !== comportamentoFiltro) return false;
      if (tipoFiltro !== 'all' && c.tipo_lancamento !== tipoFiltro) return false;
      return true;
    },
    [unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro]
  );

  // (Dashboard) Mantemos filtros comuns no resumo; a distribuição por unidade foi removida para evitar redundância.

  // Filtro para "Todas as Contas" (Auditoria) - Respeita estritamente o mês
  const contasAudit = useMemo(() => {
    return contas.filter(c => {
      if (!matchesCommonFilters(c)) return false;
      return matchesCompetencia(c);
    });
  }, [contas, matchesCommonFilters, matchesCompetencia]);

  // Filtro para "Visão Geral" (Urgência) - Respeita o mês selecionado, mas SEMPRE mostra contas VENCIDAS
  // e também mostra o que vence nos próximos 30 dias (independente do mês) para evitar surpresas.
  const contasVisaoGeral = useMemo(() => {
    return contas.filter(c => {
      if (!matchesCommonFilters(c)) return false;

      const statusVisual = getStatusVisual(c);
      const isVencida = statusVisual === 'vencida';
      
      if (c.status === 'pendente') {
        if (isVencida) return true;
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const venc = new Date(`${c.data_vencimento}T00:00:00`);
        venc.setHours(0, 0, 0, 0);
        const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias >= 0 && diffDias <= 30) return true;
      }

      return matchesCompetencia(c);
    });
  }, [contas, matchesCommonFilters, matchesCompetencia]);

  const resumoFiltrado = useMemo(() => calcularResumo(contasVisaoGeral), [contasVisaoGeral]);
  const resumoAuditoriaFiltrado = useMemo(() => calcularResumoAuditoria(contasAudit), [contasAudit]);

  // Tabela da Visão Geral:
  // - "Todas" => somente contas do mês selecionado
  // - outros filtros (Hoje/Vencidas/Próx 7/Próx 30) => busca no universo (multi-mês), evitando surpresa de mês futuro em "Todas"
  const contasPendentesBase = useMemo(() => {
    return contas.filter((c) => c.status !== 'cancelado' && c.status !== 'finalizado' && c.status !== 'pago' && matchesCommonFilters(c));
  }, [contas, matchesCommonFilters]);

  const contasPendentesMes = useMemo(() => {
    return contasPendentesBase.filter(matchesCompetencia);
  }, [contasPendentesBase, matchesCompetencia]);

  const contasParaTabelaVisaoGeral = useMemo(() => {
    return filtroTab === 'todas' ? contasPendentesMes : contasPendentesBase;
  }, [filtroTab, contasPendentesMes, contasPendentesBase]);

  const contasParaCalendario = useMemo(() => {
    // calendário: mostra contas do mês (competência) — pendentes e pagas, para visão geral.
    return contas.filter((c) => c.status !== 'cancelado' && c.status !== 'finalizado' && matchesCommonFiltersNoSearch(c) && matchesCompetencia(c));
  }, [contas, matchesCommonFiltersNoSearch, matchesCompetencia]);

  const contasParaListaOperacional = useMemo(() => {
    // A lista continua sendo a lista padrão; o detalhe do dia é no modal.
    return contasParaTabelaVisaoGeral;
  }, [visaoOperacionalModo, calendarioDiaSelecionado, contasParaTabelaVisaoGeral]);

  // ── Dashboard: memoizar computações pesadas ──
  const dashboardData = useMemo(() => {
    const [cy, cm] = competenciaFiltro.split('-');
    const prevDate = new Date(Number(cy), Number(cm) - 2, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const activeContas = contas.filter((c) => c.status !== 'cancelado' && c.status !== 'finalizado' && matchesCommonFiltersNoSearch(c));
    const contasMes = activeContas.filter(matchesCompetencia);
    const contasPrev = activeContas.filter((c) => {
      if (!c.competencia) return false;
      const [y, m] = c.competencia.split('-');
      return `${y}-${m}` === prevYM;
    });

    const totalMes = contasMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const totalPrev = contasPrev.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    const calcTrend = (curr: number, prev: number) => {
      const diff = curr - prev;
      const perc = prev > 0 ? (diff / prev) * 100 : 0;
      return { trend: perc > 0 ? 'up' as const : 'down' as const, value: `${Math.abs(perc).toFixed(1)}%` };
    };

    const totalTrend = calcTrend(totalMes, totalPrev);
    const lancTrend = calcTrend(contasMes.length, contasPrev.length);

    const pendentesMes = contasMes.filter((c) => c.status === 'pendente');
    const pagasMes = contasMes.filter((c) => c.status === 'pago');
    const totalPendenteMes = pendentesMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const totalPagoMes = pagasMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    const hojeISO = new Date().toISOString().split('T')[0];
    const vencendoHoje = pendentesMes.filter((c) => c.data_vencimento === hojeISO);
    const totalVencendoHoje = vencendoHoje.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    // Distribuição por categoria (Top 6 + Outros)
    const catMap = new Map<string, number>();
    contasMes.forEach((c) => {
      const key = c.categoria?.nome || 'Sem categoria';
      catMap.set(key, (catMap.get(key) || 0) + (Number(c.valor) || 0));
    });
    const sorted = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
    const palette = ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#94a3b8'];
    const catRows: Array<[string, number]> = [...top, ...(rest > 0 ? [['Outros', rest] as [string, number]] : [])];
    const categoryData = catRows.map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }));

    // Evolução (JAN → DEZ do ano) — só pagos
    const months: string[] = [];
    for (let month = 1; month <= 12; month++) {
      months.push(`${cy}-${String(month).padStart(2, '0')}`);
    }
    const evolutionData = months.map((ym) => {
      const rows = activeContas.filter((c) => {
        if (!c.competencia) return false;
        const [y, m] = c.competencia.split('-');
        return `${y}-${m}` === ym;
      });
      const totalPago = rows.filter((r) => r.status === 'pago').reduce((s, r) => s + (Number(r.valor) || 0), 0);
      return { periodo: formatCompetenciaLabel(ym), total: totalPago };
    });

    // Anomalias (Alertas)
    const THRESHOLD = COMPARATIVO_THRESHOLD;
    const normalizeKey = (s: string) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const keyFor = (c: ContaPagar) => `${c.unidade || 'todas'}|${c.categoria_id || 'sem_categoria'}|${normalizeKey(c.descricao || '')}`;

    const prevMap = new Map<string, number>();
    contasPrev.forEach(c => prevMap.set(keyFor(c), (prevMap.get(keyFor(c)) || 0) + (Number(c.valor) || 0)));

    const currMap = new Map<string, { total: number, sample: ContaPagar }>();
    contasMes.forEach(c => {
      const k = keyFor(c);
      const v = (currMap.get(k)?.total || 0) + (Number(c.valor) || 0);
      currMap.set(k, { total: v, sample: c });
    });

    const anomalies: any[] = [];
    currMap.forEach((data, k) => {
      const prevVal = prevMap.get(k) || 0;
      if (prevVal > 0) {
        const diff = data.total - prevVal;
        const p = (diff / prevVal) * 100;
        if (Math.abs(p) >= THRESHOLD) {
          anomalies.push({
            title: `Variação de ${p.toFixed(0)}% em ${data.sample.descricao}`,
            description: `${data.sample.categoria?.nome || 'Conta'} na unidade ${(data.sample.unidade || 'Matriz').toUpperCase()}`,
            variant: p > 0 ? 'rose' : 'emerald'
          });
        }
      }
    });

    return {
      contasMes, totalMes, totalPrev, totalTrend, lancTrend,
      pendentesMes, pagasMes, totalPendenteMes, totalPagoMes,
      vencendoHoje, totalVencendoHoje, categoryData, evolutionData, anomalies,
    };
  }, [contas, competenciaFiltro, matchesCommonFiltersNoSearch, matchesCompetencia, formatCompetenciaLabel]);

  // ── Comparativo: memoizar computações pesadas ──
  const comparativoData = useMemo(() => {
    const normalizeKey = (s: string) =>
      (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

    const keyFor = (c: ContaPagar) => {
      const unidade = (c.unidade || 'todas') as string;
      const cat = c.categoria_id || 'sem_categoria';
      const desc = normalizeKey(c.descricao || '');
      return `${unidade}|${cat}|${desc}`;
    };

    const base = contas.filter((c) => c.status !== 'cancelado' && c.status !== 'finalizado' && matchesCommonFiltersNoSearch(c));
    const prevRows = base.filter(matchesCompetenciaComparar);
    const currRows = base.filter(matchesCompetencia);

    const sumByKey = (rows: ContaPagar[]) => {
      const map = new Map<string, { total: number; sample: ContaPagar }>();
      rows.forEach((c) => {
        const k = keyFor(c);
        const v = Number(c.valor) || 0;
        const prev = map.get(k);
        if (prev) prev.total += v;
        else map.set(k, { total: v, sample: c });
      });
      return map;
    };

    const prevMap = sumByKey(prevRows);
    const currMap = sumByKey(currRows);

    const keys = new Set<string>([...Array.from(prevMap.keys()), ...Array.from(currMap.keys())]);
    const variations = Array.from(keys).map((k) => {
      const prev = prevMap.get(k)?.total || 0;
      const curr = currMap.get(k)?.total || 0;
      const sample = currMap.get(k)?.sample || prevMap.get(k)?.sample;
      const diff = curr - prev;
      const perc = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
      const status = prev === 0 && curr > 0 ? 'NOVO' : curr === 0 && prev > 0 ? 'SAIU' : 'RECORRENTE';
      return { key: k, unidade: (sample?.unidade || 'todas') as string, categoria: sample?.categoria?.nome || 'Sem categoria', descricao: sample?.descricao || '', prev, curr, diff, perc, status };
    });

    const totalPrev = variations.reduce((s, v) => s + v.prev, 0);
    const totalCurr = variations.reduce((s, v) => s + v.curr, 0);
    const totalDiff = totalCurr - totalPrev;
    const totalPerc = totalPrev > 0 ? (totalDiff / totalPrev) * 100 : 0;

    const anomalies = variations
      .filter((v) => v.status === 'RECORRENTE' && Math.abs(v.perc) >= COMPARATIVO_THRESHOLD && v.prev > 0 && v.curr > 0)
      .sort((a, b) => Math.abs(b.perc) - Math.abs(a.perc));

    return { variations, totalPrev, totalCurr, totalDiff, totalPerc, anomalies };
  }, [contas, matchesCommonFiltersNoSearch, matchesCompetenciaComparar, matchesCompetencia]);

  // ── Shell: header + tab bar (renderizado UMA vez, sem re-render do App.tsx) ──
  const { title: tabTitle, subtitle: tabSubtitle } = CONTAS_TITLES[mode];
  const tabBarIdx = CONTAS_TABS.findIndex(t => t.id === mode);

  const renderWithShell = (content: React.ReactNode) => (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-white">{tabTitle}</h2>
          <p className="text-sm text-slate-500 font-bold mt-1">{tabSubtitle}</p>
        </div>
      </div>

      {/* Desktop Tab Bar */}
      <div className="hidden lg:block border-b border-slate-800/60 bg-slate-900/20 backdrop-blur-sm mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-px scrollbar-hide px-0">
          {CONTAS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                'relative flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap group',
                mode === tab.id ? 'text-violet-400' : 'text-slate-500 hover:text-slate-200'
              )}
            >
              <tab.icon size={16} className={cn('transition-colors', mode === tab.id ? 'text-violet-400' : 'text-slate-600 group-hover:text-slate-400')} />
              {tab.label}
              {mode === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="lg:hidden mb-6">
        <div className="relative flex bg-[#0f172a] p-1 rounded-xl border border-slate-800/50 shadow-inner overflow-hidden">
          <div
            className="absolute top-1.5 bottom-1.5 transition-all duration-500 bg-slate-800/80 rounded-lg border border-slate-700/30 shadow-lg"
            style={{
              width: `calc(${100 / CONTAS_TABS.length}% - 10px)`,
              left: `calc(${(tabBarIdx * 100) / CONTAS_TABS.length}% + 5px)`,
            }}
          />
          {CONTAS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                'relative z-10 flex-1 py-3 font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap text-[10px]',
                mode === tab.id ? 'text-violet-400 scale-[1.02]' : 'text-slate-500 hover:text-slate-200'
              )}
            >
              {tab.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {content}
    </>
  );

  if (loading) return renderWithShell(<LoadingSpinner />);
  if (error) return renderWithShell(<ErrorState message={error} onRetry={refetch} />);

  if (mode === 'dashboard') {
    const {
      totalMes, totalTrend, totalPendenteMes, pendentesMes, totalPagoMes, pagasMes,
      totalVencendoHoje, vencendoHoje, categoryData, evolutionData, anomalies,
    } = dashboardData;

    return renderWithShell(
      <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
        {/* Mobile: Controles (unidade + ações) — rollback */}
        <div className="lg:hidden flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {unidadeTabs.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  unidadeFiltro === u.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                {u.mobile}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Tooltip content="Configurações de Notificações" side="top">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
                  } catch {
                    // ignore
                  }
                }}
                className="flex-none px-4 py-3 rounded-2xl bg-slate-900/50 border border-slate-800/70 text-slate-200 font-black hover:bg-slate-900/70 transition-all active:scale-[0.98]"
                aria-label="Notificações"
              >
                <Bell size={16} className="text-violet-300" />
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={() => {
                setNovaContaDefaults(null);
                setNovaOpen(true);
              }}
              className="flex-1 px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Nova Conta
            </button>
          </div>
        </div>

        {/* Desktop: manter layout atual */}
        <div className="hidden lg:flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {unidadeTabs.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  unidadeFiltro === u.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                <span className="lg:hidden">{u.mobile}</span>
                <span className="hidden lg:inline">{u.desktop}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Mês de Referência</div>
              <CustomSelect
                value={competenciaFiltro}
                onValueChange={setCompetenciaFiltro}
                className="min-w-[200px]"
                options={competenciaOptions}
              />
            </div>
            <Tooltip content="Configurações de Notificações" side="top">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
                  } catch {
                    // ignore
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-3.5 rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-200 font-black hover:bg-slate-900/45 hover:border-violet-500/30 transition-all active:scale-[0.98]"
              >
                <Bell size={16} className="text-violet-300" />
                Notificações
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={() => setNovaOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              Nova Conta
            </button>
          </div>
        </div>

        {/* Barra de Alertas (Estilo Folha) */}
        {anomalies.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="w-full flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl hover:bg-amber-500/15 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className="text-amber-500 font-black flex items-center gap-2">
                    {anomalies.length} Alertas Detectados
                  </div>
                  <div className="text-amber-500/70 text-xs font-bold">Revise as variações bruscas antes de fechar o mês</div>
                </div>
              </div>
              <ChevronDown className={cn("text-amber-500 transition-transform duration-300", alertsOpen && "rotate-180")} />
            </button>
            
            {alertsOpen && (
              <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                {anomalies.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-800 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full", a.variant === 'rose' ? "bg-rose-500" : "bg-emerald-500")}></div>
                      <div>
                        <div className="text-sm font-bold text-white">{a.title}</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{a.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dashboard (Resumo) — KPIs essenciais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
          <KPICard
            icon={DollarSign}
            label="Total (mês)"
            value={formatCurrency(totalMes)}
            trend={totalTrend.trend}
            trendValue={totalTrend.value}
            variant="cyan"
          />
          <KPICard
            icon={DollarSign}
            label="Pendente (mês)"
            value={formatCurrency(totalPendenteMes)}
            subvalue={`${pendentesMes.length} em aberto`}
            variant="violet"
          />
          <KPICard
            icon={AlertTriangle}
            label="Vencendo Hoje"
            value={formatCurrency(totalVencendoHoje)}
            subvalue={`${vencendoHoje.length} contas`}
            variant="amber"
          />
          <KPICard
            icon={CheckCircle2}
            label="Total Pago (mês)"
            value={formatCurrency(totalPagoMes)}
            subvalue={`${pagasMes.length} liquidadas`}
            variant="emerald"
          />
        </div>

        {/* Gráficos (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
              <Tag size={20} className="text-violet-400" />
              Distribuição por Categoria
            </h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="shrink-0">
                <DistributionChart
                  data={categoryData}
                  totalValue={formatCurrency(totalMes).replace('R$', '').trim()}
                  totalLabel="Total"
                />
              </div>
              <div className="flex-1 w-full space-y-4">
                {categoryData.map((cat, idx) => {
                  const percent = totalMes > 0 ? (cat.value / totalMes) * 100 : 0;
                  return (
                    <div key={`${cat.name}-${idx}`} className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        <div className="min-w-0">
                          <div className="text-slate-200 font-bold text-sm truncate">{cat.name}</div>
                          <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{percent.toFixed(0)}%</div>
                        </div>
                      </div>
                      <div className="text-white font-black text-sm">{formatCurrency(cat.value)}</div>
                    </div>
                  );
                })}
                {categoryData.length === 0 && <div className="text-sm text-slate-500 font-bold">Nenhuma categoria no período.</div>}
              </div>
            </div>
          </Card>

          <Card className="p-6 flex flex-col">
            <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
              <LineChartIcon size={20} className="text-cyan-400" />
              Evolução Histórica (só pagos)
            </h3>
            <div className="h-[360px]">
              <EvolutionChart data={evolutionData} />
            </div>
          </Card>
        </div>

        <NovaContaModal
          isOpen={novaOpen}
          categorias={categorias}
          onClose={() => setNovaOpen(false)}
          onConfirm={(payload, options) =>
            run(
              async () => {
                await createContaPagar(payload, options);
                setNovaOpen(false);
                await refetch();
              },
              { success: 'Conta criada.', error: 'Não foi possível criar a conta.' }
            )
          }
        />
      </div>
    );
  }

  if (mode === 'comparativo') {
    const { variations, totalPrev, totalCurr, totalDiff, totalPerc, anomalies } = comparativoData;

    return renderWithShell(
      <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {unidadeTabs.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  unidadeFiltro === u.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                <span className="lg:hidden">{u.mobile}</span>
                <span className="hidden lg:inline">{u.desktop}</span>
              </button>
            ))}
          </div>

          <div className="hidden lg:flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mês atual</div>
              <CustomSelect value={competenciaFiltro} onValueChange={setCompetenciaFiltro} className="min-w-[180px]" options={competenciaOptions} />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Base comparativa</div>
              <CustomSelect value={competenciaComparar} onValueChange={setCompetenciaComparar} className="min-w-[180px]" options={competenciaOptions} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          <KPICard
            icon={TrendingUp}
            label={`Total ${formatCompetenciaLabel(competenciaComparar)}`}
            value={formatCurrency(totalPrev)}
            variant="default"
          />
          <KPICard
            icon={TrendingUp}
            label={`Total ${formatCompetenciaLabel(competenciaFiltro)}`}
            value={formatCurrency(totalCurr)}
            variant="violet"
          />
          <KPICard
            icon={Percent}
            label="Variação"
            value={`${totalPerc >= 0 ? '+' : ''}${totalPerc.toFixed(1)}%`}
            trend={totalDiff >= 0 ? 'up' : 'down'}
            trendValue={formatCurrency(totalDiff)}
            variant={totalDiff >= 0 ? 'rose' : 'emerald'}
          />
          <KPICard
            icon={AlertTriangle}
            label="Alertas (≥ 20%)"
            value={anomalies.length}
            variant="amber"
          />
        </div>

        {/* Insights e Notas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-700 flex items-start justify-between gap-4 bg-slate-800/20">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Bot size={16} className="text-cyan-400" />
                  <h3 className="text-lg font-semibold text-white">Comparativo Inteligente</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Análise automática de sazonalidade e padrões de variação.
                  {compAiCached ? <span className="ml-2 text-slate-600">(cache)</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => loadComparativoAi(true)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors border border-slate-700"
                  disabled={compAiLoading}
                >
                  {compAiLoading ? 'Analisando...' : 'Atualizar'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompAiOpen((v) => !v)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-900/30 transition-all"
                  aria-label={compAiOpen ? 'Colapsar seção IA' : 'Expandir seção IA'}
                >
                  <ChevronDown className={cn('transition-transform', compAiOpen && 'rotate-180')} size={22} />
                </button>
              </div>
            </div>

            {compAiOpen ? <div className="p-6 flex-1">
              {compAiError ? (
                <div className="text-sm text-rose-300 bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex items-center gap-3">
                  <AlertTriangle size={18} />
                  {compAiError}
                </div>
              ) : compAiLoading && !compAiRow ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-4">
                  <div className="relative">
                    <Loader2 className="animate-spin text-cyan-400" size={32} />
                    <Sparkles className="absolute -top-1 -right-1 text-amber-400 animate-pulse" size={12} />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-slate-200 block">Analisando Padrões...</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                      Cruzando variações e memória organizacional
                    </span>
                  </div>
                </div>
              ) : compAiRow ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* --- Section 1: Executive Summary --- */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-4 bg-cyan-500 rounded-full"></div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Resumo Executivo</h4>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/30 rounded-3xl p-6 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-violet-500"></div>
                      <p className="text-slate-200 leading-relaxed text-sm md:text-base font-medium italic">
                        {compAiRow.summary || compAiRow.response_json?.analise_executiva}
                      </p>
                    </div>
                  </section>

                  {/* --- Section 2: Detailed Highlights --- */}
                  {compAiRow?.response_json?.insights_detalhados?.length ? (
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1.5 h-4 bg-violet-500 rounded-full"></div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ocorrências e Padrões</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {compAiRow.response_json.insights_detalhados.map((ins: any, idx: number) => {
                          const cat = String(ins.categoria || 'variacao').toLowerCase();
                          const iconMap: Record<string, any> = {
                            variacao: { icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
                            'novos/removidos': { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                            categoria: { icon: Tag, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
                            unidade: { icon: BarChart3, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                            recorrentes: { icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
                            pagamentos: { icon: CreditCard, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                            default: { icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                          };
                          const config = iconMap[cat] || iconMap.default;
                          const Icon = config.icon;

                          return (
                            <div key={idx} className={`group p-5 rounded-2xl bg-slate-800/20 border ${config.border} hover:bg-slate-800/40 transition-all duration-300`}>
                              <div className="flex items-start gap-4">
                                <div className={`p-2.5 rounded-xl ${config.bg} ${config.color} shadow-inner`}>
                                  <Icon size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <h5 className="text-sm font-bold text-white tracking-tight">{ins.titulo}</h5>
                                    {typeof ins.impacto_financeiro === 'number' ? (
                                      <span className={`text-[10px] font-mono font-bold ${ins.impacto_financeiro > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {ins.impacto_financeiro > 0 ? '+' : ''}{formatCurrency(Number(ins.impacto_financeiro) || 0)}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300">
                                    {ins.descricao}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {/* --- Section 3: Action Recommendations --- */}
                  {compAiRow?.response_json?.recomendacoes?.length ? (
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Sugestões de Ajuste</h4>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-3">
                        {compAiRow.response_json.recomendacoes.map((rec: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></div>
                            <p className="text-xs text-slate-300 leading-snug">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center">
                    <Sparkles size={24} className="text-slate-700" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-medium">Insights não gerados</span>
                    <p className="text-[10px] text-slate-600 mt-1 max-w-[200px]">
                      Clique em atualizar para processar as variações deste mês.
                    </p>
                  </div>
                </div>
              )}
            </div> : null}
          </Card>

          {/* Notas / Sugestão da Ana (mesma semântica da Folha) */}
          <Card className="overflow-hidden flex flex-col border-violet-500/20 shadow-violet-500/5">
            <div className="p-6 border-b border-slate-700 bg-violet-500/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 p-0.5 border border-violet-500/20 overflow-hidden shrink-0 shadow-lg">
                <img
                  src="/Avatar_Ana.png"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Ana&background=8b5cf6&color=fff';
                  }}
                  alt="Ana RH"
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">Sugestão da Ana</h3>
                <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">Financeiro</p>
              </div>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-4">
              <div className="flex-1 relative">
                <textarea
                  value={notasComparativo}
                  onChange={(e) => setNotasComparativo(e.target.value)}
                  onBlur={saveNotas}
                  placeholder="Ana, registre aqui suas percepções sobre o fechamento do financeiro..."
                  className="w-full h-full min-h-[160px] bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40 transition-all resize-none placeholder:text-slate-600"
                  spellCheck={false}
                  disabled={notasComparativoLoading}
                />

                {notasComparativoLoading && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] text-violet-400 font-bold bg-slate-900 px-2 py-1 rounded-lg">
                    <Loader2 size={10} className="animate-spin" />
                    SALVANDO...
                  </div>
                )}
                {notasComparativoSaved && !notasComparativoLoading && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-slate-900 px-2 py-1 rounded-lg">
                    <CheckCircle2 size={10} />
                    SALVO NA NUVEM
                  </div>
                )}
              </div>

              <p className="text-[10px] text-slate-500 text-center">
                Suas notas ajudam a treinar a IA para reconhecer padrões futuros.
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/70 flex items-center justify-between bg-slate-900/20">
            <h3 className="text-white font-black">Detalhamento das Variações</h3>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ordenado por relevância</div>
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/30 border-b border-slate-800/70 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-6 py-3">Item / Unidade</th>
                  <th className="px-2 py-3 text-right">{formatCompetenciaLabel(competenciaComparar)}</th>
                  <th className="px-2 py-3 text-right">{formatCompetenciaLabel(competenciaFiltro)}</th>
                  <th className="px-2 py-3 text-right">Diferença</th>
                  <th className="px-6 py-3 text-right">Variação %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {variations
                  .sort((a, b) => {
                    const aScore = a.status === 'NOVO' || a.status === 'SAIU' ? 9999 : Math.abs(a.perc);
                    const bScore = b.status === 'NOVO' || b.status === 'SAIU' ? 9999 : Math.abs(b.perc);
                    return bScore - aScore;
                  })
                  .slice(0, 50)
                  .map((v) => (
                    <tr key={v.key} className="hover:bg-slate-900/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-white font-black">{(v.categoria || '').toUpperCase()}</div>
                        <div className="text-xs text-slate-500">{v.descricao}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50 uppercase">
                            {(v.unidade || 'todas').toUpperCase()}
                          </span>
                          {v.status !== 'RECORRENTE' && (
                            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border uppercase", 
                              v.status === 'NOVO' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20")}>
                              {v.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-4 text-right font-mono text-slate-400">{v.prev ? formatCurrency(v.prev) : '-'}</td>
                      <td className="px-2 py-4 text-right font-mono text-slate-200">{v.curr ? formatCurrency(v.curr) : '-'}</td>
                      <td className={cn('px-2 py-4 text-right font-mono', v.diff >= 0 ? 'text-rose-300' : 'text-emerald-300')}>
                        {v.diff > 0 ? '+' : ''}{v.diff !== 0 ? formatCurrency(v.diff) : '-'}
                      </td>
                      <td className={cn('px-6 py-4 text-right font-black', 
                        v.status !== 'RECORRENTE' ? 'text-white' : 
                        Math.abs(v.perc) >= COMPARATIVO_THRESHOLD ? (v.perc > 0 ? 'text-rose-400' : 'text-emerald-400') : 'text-slate-400')}>
                        <div className="flex items-center justify-end gap-1">
                          {v.status === 'RECORRENTE' && Math.abs(v.perc) >= COMPARATIVO_THRESHOLD && (
                            v.perc > 0 ? <TrendingUp size={12} className="text-rose-400" /> : <TrendingUp size={12} className="text-emerald-400 rotate-180" />
                          )}
                          {v.status === 'NOVO' ? '+100%' : v.status === 'SAIU' ? '-100%' : `${v.perc >= 0 ? '+' : ''}${v.perc.toFixed(1)}%`}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden divide-y divide-slate-800/50">
            {variations
              .sort((a, b) => {
                const aScore = a.status === 'NOVO' || a.status === 'SAIU' ? 9999 : Math.abs(a.perc);
                const bScore = b.status === 'NOVO' || b.status === 'SAIU' ? 9999 : Math.abs(b.perc);
                return bScore - aScore;
              })
              .slice(0, 50)
              .map((v) => (
                <div key={v.key} className="p-4 bg-slate-900/10 hover:bg-slate-900/20 transition-colors active:scale-[0.99]">
                  {/* Header: Nome e Badges */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-white uppercase truncate">{(v.categoria || '').toUpperCase()}</h4>
                      <p className="text-[10px] text-slate-500 font-bold truncate">{v.descricao}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <span className="text-[9px] font-black text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50 uppercase">
                        {(v.unidade || 'todas').toUpperCase()}
                      </span>
                      {v.status !== 'RECORRENTE' && (
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border uppercase", 
                          v.status === 'NOVO' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20")}>
                          {v.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comparativo: De / Para */}
                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-800/40">
                    <div>
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1">{formatCompetenciaLabel(competenciaComparar)}</span>
                      <span className="text-sm font-bold text-slate-400 font-mono">{v.prev ? formatCurrency(v.prev) : '-'}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1">{formatCompetenciaLabel(competenciaFiltro)}</span>
                      <span className="text-sm font-black text-white font-mono">{v.curr ? formatCurrency(v.curr) : '-'}</span>
                    </div>
                  </div>

                  {/* Resultado: Variação */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Diferença</span>
                      <span className={cn('text-xs font-mono font-bold', v.diff >= 0 ? 'text-rose-300' : 'text-emerald-300')}>
                        {v.diff > 0 ? '+' : ''}{v.diff !== 0 ? formatCurrency(v.diff) : '-'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-0.5">Variação</span>
                      <div className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg font-black text-xs', 
                        v.status !== 'RECORRENTE' ? 'bg-slate-800 text-white' : 
                        Math.abs(v.perc) >= COMPARATIVO_THRESHOLD ? (v.perc > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400') : 'bg-slate-800/50 text-slate-400')}>
                        {v.status === 'RECORRENTE' && Math.abs(v.perc) >= COMPARATIVO_THRESHOLD && (
                          v.perc > 0 ? <TrendingUp size={14} /> : <TrendingUp size={14} className="rotate-180" />
                        )}
                        {v.status === 'NOVO' ? '+100%' : v.status === 'SAIU' ? '-100%' : `${v.perc >= 0 ? '+' : ''}${v.perc.toFixed(1)}%`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    );
  }

  if (mode === 'categorias') {
    return renderWithShell(
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <button
            type="button"
            onClick={() => {
              setEditingCategoria(null);
              setCategoriaModalOpen(true);
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-4 sm:py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black shadow-lg shadow-rose-600/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            Nova Categoria
          </button>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-4">
          {categorias.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-2xl border border-slate-800 bg-slate-900/20 p-5 flex items-center justify-between hover:border-rose-500/30 hover:bg-rose-500/5 hover:shadow-[0_0_20px_rgba(225,29,72,0.05)] transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-slate-800 group-hover:border-rose-500/30 transition-colors"
                  style={{ backgroundColor: `${c.cor}10` }}
                >
                  <span className="text-2xl">{c.icone}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-white font-black truncate">{c.nome}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                      {c.tipo_custo || 'VARIÁVEL'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações: Lápis e Lixeira */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip content="Editar Categoria">
                  <button
                    onClick={() => {
                      setEditingCategoria(c);
                      setCategoriaModalOpen(true);
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                </Tooltip>
                <Tooltip content="Excluir Categoria">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setConfirmDeleteCategoria({ id: c.id, nome: c.nome });
                    }}
                    className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile Premium List */}
        <div className="md:hidden flex flex-col bg-slate-900/10 rounded-3xl border border-slate-800/50 overflow-hidden">
          {categorias.map((c, idx) => (
            <div
              key={c.id}
              onClick={() => {
                setEditingCategoria(c);
                setCategoriaModalOpen(true);
              }}
              className={cn(
                "flex items-center justify-between p-4 active:bg-slate-800/40 transition-colors cursor-pointer",
                idx !== categorias.length - 1 && "border-b border-slate-800/40"
              )}
            >
              <div className="flex items-center gap-4">
                {/* Ícone Estilo Banco Digital */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 shadow-inner"
                  style={{ backgroundColor: `${c.cor}15`, border: `1px solid ${c.cor}25` }}
                >
                  {c.icone}
                </div>
                
                <div className="min-w-0">
                  <div className="text-sm font-black text-white">{c.nome}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider",
                      c.tipo_custo === 'fixo' ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"
                    )}>
                      {c.tipo_custo || 'VARIÁVEL'}
                    </span>
                  </div>
                </div>
              </div>

              <ChevronRight size={18} className="text-slate-600" />
            </div>
          ))}
        </div>

        <CategoriaModal
          isOpen={categoriaModalOpen}
          initialData={editingCategoria}
          onClose={() => setCategoriaModalOpen(false)}
          onConfirm={(payload) =>
            run(
              async () => {
                await upsertCategoria(payload);
                await refetch();
              },
              { success: 'Categoria salva.', error: 'Não foi possível salvar a categoria.' }
            )
          }
          onDelete={async (id) => {
            const cat = categorias.find((c) => c.id === id);
            setConfirmDeleteCategoria({ id, nome: cat?.nome || 'Categoria' });
          }}
        />

        {confirmDeleteCategoria && (
          <ConfirmDialog
            isOpen={!!confirmDeleteCategoria}
            onClose={() => setConfirmDeleteCategoria(null)}
            onConfirm={() => {
              const target = confirmDeleteCategoria;
              if (!target) return;
              setConfirmDeleteCategoria(null);
              return run(
                async () => {
                  await deleteCategoria(target.id);
                  await refetch();
                },
                { success: 'Categoria excluída.', error: 'Não foi possível excluir a categoria.' }
              );
            }}
            title="Confirmar Exclusão"
            message={`Tem certeza que deseja excluir a categoria \"${confirmDeleteCategoria.nome}\"?`}
            confirmLabel="Excluir"
            variant="danger"
          />
        )}
      </div>
    );
  }

  if (mode === 'todas') {
    const auditRows = contasAudit.filter((c) => c.status !== 'cancelado' && c.status !== 'finalizado');
    const auditCount = auditRows.length;
    return renderWithShell(
      <div className="w-full">
        {/* MOBILE: Controles Simplificados (Unidades + Visão) */}
        <div className="lg:hidden flex flex-col gap-3 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {unidadeTabs.map((u) => (
              <button
                key={u.id}
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  unidadeFiltro === u.id 
                    ? "bg-slate-800 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                )}
              >
                {u.mobile}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'cards', label: 'Cards', icon: LayoutGrid },
              { id: 'lista', label: 'Lista', icon: List },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAuditViewMode(t.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95',
                  auditViewMode === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* DESKTOP: Layout Original Validado */}
        <div className="hidden lg:flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
              {unidadeTabs.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setUnidadeFiltro(u.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all",
                    unidadeFiltro === u.id 
                      ? "bg-slate-800 text-white shadow-sm" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                  )}
                >
                  <span className="hidden lg:inline">{u.desktop}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
              {[
                { id: 'cards', label: 'Cards', icon: LayoutGrid },
                { id: 'lista', label: 'Lista', icon: List },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAuditViewMode(t.id as any)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all',
                    auditViewMode === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                  )}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Período</div>
              <CustomSelect
                value={competenciaFiltro}
                onValueChange={setCompetenciaFiltro}
                className="min-w-[200px]"
                options={competenciaOptions}
              />
            </div>
            
            <button
              type="button"
              onClick={() => {
                setNovaContaDefaults(null);
                setNovaOpen(true);
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              Nova Conta
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-8 bg-slate-900/20 p-4 rounded-3xl border border-slate-800/60">
          <div className="flex items-center gap-2 text-slate-500 mr-2">
            <Filter size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">Refinar</span>
          </div>

          <div className="w-full sm:w-48">
            <CustomSelect
              value={categoriaFiltro}
              onValueChange={setCategoriaFiltro}
              options={[
                { value: 'all', label: 'Todas Categorias' },
                ...categorias.map(c => ({ value: c.id, label: c.nome }))
              ]}
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'fixo', label: 'Fixo' },
              { id: 'variavel', label: 'Variável' },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => setComportamentoFiltro(b.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  comportamentoFiltro === b.id 
                    ? "bg-slate-800 text-white" 
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
            {[
              { id: 'all', label: 'Tipos' },
              { id: 'unica', label: 'Única' },
              { id: 'parcelada', label: 'Parc.' },
              { id: 'recorrente', label: 'Recorr.' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTipoFiltro(t.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  tipoFiltro === t.id 
                    ? "bg-slate-800 text-white" 
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição ou categoria..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950/40 text-[11px] font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
            />
          </div>
        </div>

        {/* Resumo do Período (hierarquia executiva) */}
        <div className="mb-8">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Resumo do Período</div>
              <div className="text-xs text-slate-400 font-bold mt-1">Visão executiva baseada nos filtros aplicados</div>
            </div>
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{auditCount} lançamentos</div>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 border-t border-slate-800/60">
              {/* Linha 1 (mobile): Total + Pago | Linha 2 (mobile): Pendente (full) */}
              <div className="p-5 border-b border-r border-slate-800/60 sm:border-b-0 sm:border-r">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <TrendingUp size={12} />
                  Total do Período
                </div>
                <div className="mt-2 text-base md:text-2xl font-bold text-white">{formatCurrency(resumoAuditoriaFiltrado.totalGeral.total)}</div>
                <div className="mt-1 text-[11px] text-slate-500 font-bold">Baseado nos filtros</div>
              </div>

              <div className="p-5 border-b border-slate-800/60 sm:border-b-0 sm:border-r">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  Total Pago
                </div>
                <div className="mt-2 text-base md:text-2xl font-bold text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPago.total)}</div>
                <div className="mt-1 text-[11px] text-emerald-400 font-black">{resumoAuditoriaFiltrado.totalPago.count} contas liquidadas</div>
              </div>

              <div className="p-5 col-span-2 border-slate-800/60 sm:col-span-1 text-center sm:text-left flex flex-col items-center sm:items-start">
                <div className="flex items-center justify-center sm:justify-start gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <DollarSign size={12} className="text-violet-400" />
                  Pendente no Período
                </div>
                <div className="mt-2 text-base md:text-2xl font-bold text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPendente.total)}</div>
                <div className="mt-1 text-[11px] text-violet-400 font-black">{resumoAuditoriaFiltrado.totalPendente.count} em aberto</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Lançamentos do Período (itens) */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-xl font-black text-white">Lançamentos do Período</div>
            <div className="text-xs text-slate-500 font-bold mt-1">
              Detalhamento para conferência e auditoria
            </div>
          </div>
        </div>

        {auditViewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {auditRows.map((conta) => (
              <ContaAuditCard
                key={conta.id}
                conta={conta}
                onPagar={(c) => setPagarConta(c)}
                onEditar={(c) => setEditarConta(c)}
                selected={selectedIds.has(conta.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
            {auditRows.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-500 font-bold">
                Nenhum lançamento encontrado para os filtros aplicados.
              </div>
            )}
          </div>
        ) : (
          <ContasTable
            contas={auditRows}
            filtro={filtroTab}
            onFiltroChange={setFiltroTab}
            busca={busca}
            onBuscaChange={setBusca}
            onPagar={(c) => setPagarConta(c)}
            onEditar={(c) => setEditarConta(c)}
            onExcluir={(c) => setContaParaExcluir(c)}
            onFinalizar={(c) => setContaParaFinalizar(c)}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        )}

        {/* Análise (IA) — Opção A: no fim, colapsável */}
        <div className="mt-10">
          <Card className="p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setAuditAiOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 bg-slate-900/20 hover:bg-slate-900/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-violet-300 flex items-center justify-center">
                  <Brain size={20} />
                </div>
                <div className="text-left">
                  <div className="text-white font-black">Análise Inteligente</div>
                  <div className="text-xs text-slate-500 font-bold">
                    Insights automáticos para apoiar a auditoria (sem redundância com o Comparativo)
                  </div>
                </div>
              </div>
              <span className="shrink-0 -mr-2 flex items-center justify-center w-11 h-11 rounded-xl hover:bg-slate-900/30 transition-colors">
                <ChevronDown className={cn('text-slate-300 transition-transform', auditAiOpen && 'rotate-180')} size={22} />
              </span>
            </button>

            {auditAiOpen && (
              <div className="p-6 border-t border-slate-800/60 space-y-6">
                {/* Notas da Ana (Auditoria do mês) */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Observações da Ana (Auditoria)</div>
                  <textarea
                    value={notasAuditoria}
                    onChange={(e) => setNotasAuditoria(e.target.value)}
                    onBlur={saveNotas}
                    placeholder="Contexto do mês (ex.: reajustes confirmados, contas pontuais, acordos, etc.)"
                    className="w-full min-h-[110px] resize-none bg-slate-950/40 border border-slate-800/60 rounded-2xl px-4 py-3 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    spellCheck={false}
                    disabled={notasAuditoriaLoading}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-bold">
                      * Salva automaticamente ao sair do campo
                    </div>
                    <div className="flex items-center gap-3">
                      {notasAuditoriaLoading ? (
                        <div className="text-[10px] text-violet-400 font-black flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin" />
                          SALVANDO...
                        </div>
                      ) : notasAuditoriaSaved ? (
                        <div className="text-[10px] text-emerald-400 font-black flex items-center gap-2">
                          <CheckCircle2 size={12} />
                          SALVO
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Ações IA */}
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                    Geração de Insights
                    {auditAiCached ? <span className="ml-2 text-slate-600">(cache)</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadAuditAi(true)}
                    disabled={auditAiLoading}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60 transition-all"
                  >
                    {auditAiLoading ? 'Atualizando...' : 'Atualizar IA'}
                  </button>
                </div>

                {/* Conteúdo IA */}
                {auditAiLoading && !auditAiRow ? (
                  <div className="py-10 flex items-center justify-center text-slate-400 font-bold">
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Gerando análise...
                  </div>
                ) : auditAiError ? (
                  <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm font-bold">
                    {auditAiError}
                  </div>
                ) : auditAiRow ? (
                  <div className="space-y-5">
                    <div className="p-5 rounded-2xl border border-slate-800/60 bg-slate-950/30">
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Resumo Executivo</div>
                      <div className="text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-line">
                        {auditAiRow.summary || auditAiRow.response_json?.resumo_executivo}
                      </div>
                    </div>

                    {!!auditAiRow.response_json?.pontos_de_atencao?.length && (
                      <div className="p-5 rounded-2xl border border-slate-800/60 bg-slate-950/30">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Pontos de Atenção</div>
                        <ul className="space-y-2">
                          {auditAiRow.response_json.pontos_de_atencao.map((p, idx) => (
                            <li key={idx} className="text-sm text-slate-300 font-bold">
                              - {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="p-5 rounded-2xl border border-slate-800/60 bg-slate-950/30">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Anomalias do mês</div>
                        <div className="text-[10px] text-slate-600 font-black">
                          {(auditAiRow.response_json?.anomalias?.length || 0)} itens
                        </div>
                      </div>

                      {auditAiRow.response_json?.anomalias?.length ? (
                        <div className="space-y-3">
                          {auditAiRow.response_json.anomalias.map((a) => {
                            const n = anomaliaNotas[a.key];
                            const sev =
                              a.severidade === 'alta'
                                ? 'danger'
                                : a.severidade === 'media'
                                  ? 'warning'
                                  : 'info';
                            return (
                              <div key={a.key} className="p-4 rounded-2xl border border-slate-800/60 bg-slate-900/10">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={sev as any}>
                                        {a.severidade === 'alta' ? 'Alta' : a.severidade === 'media' ? 'Média' : 'Baixa'}
                                      </Badge>
                                      {n?.status === 'verificado' ? (
                                        <Badge variant="success">Verificado</Badge>
                                      ) : n?.nota ? (
                                        <Badge variant="info">Anotado</Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 text-white font-black">{a.titulo}</div>
                                    <div className="mt-1 text-sm text-slate-300 font-medium leading-relaxed">{a.descricao}</div>
                                    {typeof a.impacto_financeiro === 'number' ? (
                                      <div className="mt-2 text-[11px] text-slate-400 font-black">
                                        Impacto estimado: <span className="text-slate-200">{formatCurrency(a.impacto_financeiro)}</span>
                                      </div>
                                    ) : null}

                                    {n?.nota ? (
                                      <div className="mt-3 text-[12px] text-slate-200 font-bold bg-slate-950/40 border border-slate-800/60 rounded-xl px-3 py-2">
                                        <span className="text-slate-500 font-black mr-2">Nota:</span>
                                        {n.nota.length > 140 ? `${n.nota.slice(0, 140)}...` : n.nota}
                                      </div>
                                    ) : null}

                                    {/* Mobile: ação abaixo para não espremer o texto */}
                                    <div className="mt-3 lg:hidden">
                                      <button
                                        type="button"
                                        onClick={() => openAnotar(a)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900/30 text-slate-200 text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.99]"
                                      >
                                        Anotar
                                      </button>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => openAnotar(a)}
                                    className="hidden lg:inline-flex shrink-0 px-4 py-2 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900/30 text-slate-200 text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Anotar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500 font-bold py-6">Nenhuma anomalia relevante encontrada para os filtros atuais.</div>
                      )}
                    </div>

                    {!!auditAiRow.response_json?.recomendacoes_operacionais?.length && (
                      <div className="p-5 rounded-2xl border border-slate-800/60 bg-slate-950/30">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Recomendações</div>
                        <ul className="space-y-2">
                          {auditAiRow.response_json.recomendacoes_operacionais.map((r, idx) => (
                            <li key={idx} className="text-sm text-slate-300 font-bold">
                              - {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 font-bold py-6">Abra este painel para gerar a análise do mês.</div>
                )}
              </div>
            )}
          </Card>
        </div>

        <NovaContaModal
          isOpen={novaOpen}
          categorias={categorias}
          onClose={() => setNovaOpen(false)}
          onConfirm={(payload, options) =>
            run(
              async () => {
                await createContaPagar(payload, options);
                setNovaOpen(false);
                await refetch();
              },
              { success: 'Conta criada.', error: 'Não foi possível criar a conta.' }
            )
          }
        />

        <PagarContaModal
          isOpen={!!pagarConta}
          conta={pagarConta}
          onClose={() => setPagarConta(null)}
          onConfirm={(input) => {
            if (!pagarConta) return;
            const id = pagarConta.id;
            return run(
              async () => {
                await registrarPagamento(id, input);
                await refetch();
              },
              {
                success: 'Pagamento registrado.',
                error: 'Não foi possível registrar o pagamento.',
                onSuccess: () => setPagarConta(null),
              }
            );
          }}
        />

        <EditarContaModal
          isOpen={!!editarConta}
          conta={editarConta}
          categorias={categorias}
          onClose={() => setEditarConta(null)}
          onConfirm={(patch, aplicarAFuturos) => {
            if (!editarConta) return;
            const conta = editarConta;
            return run(
              async () => {
                await updateContaPagar(conta.id, patch);

                if (aplicarAFuturos && conta.tipo_lancamento === 'recorrente') {
                  await updateFuturasRecorrentes(conta, patch);
                }
                if (aplicarAFuturos && conta.tipo_lancamento === 'parcelada') {
                  await updateFuturasParceladas(conta, patch);
                }

                await refetch();
              },
              {
                success: 'Conta atualizada.',
                error: 'Não foi possível atualizar a conta.',
                onSuccess: () => setEditarConta(null),
              }
            );
          }}
        />

        <Modal
          isOpen={anotarOpen}
          onClose={() => setAnotarOpen(false)}
          title="ANOTAR ANOMALIA"
          subtitle={anotarTitulo ? `Contexto e decisão para: ${anotarTitulo}` : undefined}
          className="max-w-2xl"
          headerClassName="bg-violet-600 border-violet-500"
          footer={
            <div className="flex items-center justify-between gap-4 w-full">
              <button
                type="button"
                onClick={() => setAnotarOpen(false)}
                className="px-6 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-300 font-black hover:bg-slate-900/50 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={saveAnomaliaNota}
                disabled={anotarSaving}
                className="px-10 py-4 rounded-[2rem] bg-violet-600 hover:bg-violet-500 text-white font-black shadow-xl shadow-violet-600/20 disabled:opacity-50 transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center gap-2"
              >
                {anotarSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Salvar
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Status</div>
              <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
                {([
                  { id: 'pendente', label: 'Pendente' },
                  { id: 'verificado', label: 'Verificado' },
                ] as const).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setAnotarStatus(s.id)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-black transition-all',
                      anotarStatus === s.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Nota da Ana</div>
              <textarea
                value={anotarTexto}
                onChange={(e) => setAnotarTexto(e.target.value)}
                placeholder="Ex.: confirmado reajuste com fornecedor; conta duplicada removida; valor correto é X; etc."
                className="w-full min-h-[140px] resize-none bg-slate-950/40 border border-slate-800/60 rounded-2xl px-4 py-3 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                spellCheck={false}
              />
              <div className="mt-2 flex items-center justify-end">
                {anotarSaved ? (
                  <div className="text-[10px] text-emerald-400 font-black flex items-center gap-2">
                    <CheckCircle2 size={12} />
                    SALVO
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return renderWithShell(
    <div className="w-full">
      {/* Mobile: Command Bar (premium) */}
      <div className="lg:hidden sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 bg-[#060814]/70 backdrop-blur-xl border-b border-white/5 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
          {unidadeTabs.map((u) => (
            <button
              key={u.id}
              onClick={() => setUnidadeFiltro(u.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black transition-all",
                unidadeFiltro === u.id
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              )}
            >
              {u.mobile}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
          {[
            { id: 'lista', label: 'Lista', icon: List },
            { id: 'calendario', label: 'Calendário', icon: Calendar },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setVisaoOperacionalModo(t.id as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all',
                visaoOperacionalModo === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setContasMobileRefinarOpen(true)}
            className="flex-none px-4 py-3 rounded-2xl bg-slate-900/50 border border-slate-800/70 text-white font-black inline-flex items-center gap-2 active:scale-[0.98]"
            aria-label="Filtros"
          >
            <Filter size={16} className="text-violet-300" />
            {contasActiveFiltersCount > 0 ? (
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-violet-500/15 text-violet-200 border border-violet-500/20">
                {contasActiveFiltersCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
              } catch {
                // ignore
              }
            }}
            className="flex-none px-4 py-3 rounded-2xl bg-slate-900/50 border border-slate-800/70 text-slate-200 font-black hover:bg-slate-900/70 transition-all active:scale-[0.98]"
            aria-label="Notificações"
          >
            <Bell size={16} className="text-violet-300" />
          </button>

          <button
            type="button"
            onClick={() => {
              setNovaContaDefaults(null);
              setNovaOpen(true);
            }}
            className="flex-1 px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Nova Conta
          </button>
        </div>

        {contasActiveFilterChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {contasActiveFilterChips.slice(0, 4).map((c) => (
              <span
                key={c}
                className="max-w-full truncate px-3 py-1.5 rounded-full bg-slate-950/40 border border-slate-800/60 text-[10px] font-black text-slate-300"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Desktop: manter layout atual */}
      <div className="hidden lg:flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {unidadeTabs.map((u) => (
              <button
                key={u.id}
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  unidadeFiltro === u.id 
                    ? "bg-slate-800 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                )}
              >
                <span className="hidden lg:inline">{u.desktop}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'lista', label: 'Lista', icon: List },
              { id: 'calendario', label: 'Calendário', icon: Calendar },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setVisaoOperacionalModo(t.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all',
                  visaoOperacionalModo === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Competência</div>
            <CustomSelect
              value={competenciaFiltro}
              onValueChange={(v) => {
                setCompetenciaFiltro(v);
                setCalendarioDiaSelecionado(undefined);
              }}
              className="min-w-[200px]"
              options={competenciaOptions}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setNovaContaDefaults(null);
              setNovaOpen(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            Nova Conta
          </button>
        </div>
      </div>

      <div className="hidden lg:flex flex-wrap items-center gap-4 mb-8 bg-slate-900/20 p-4 rounded-3xl border border-slate-800/60">
        <div className="flex items-center gap-2 text-slate-500 mr-2">
          <Filter size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider">Refinar</span>
        </div>

        <div className="w-full sm:w-48">
          <CustomSelect
            value={categoriaFiltro}
            onValueChange={setCategoriaFiltro}
            options={[
              { value: 'all', label: 'Todas Categorias' },
              ...categorias.map(c => ({ value: c.id, label: c.nome }))
            ]}
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'fixo', label: 'Fixo' },
            { id: 'variavel', label: 'Variável' },
          ].map(b => (
            <button
              key={b.id}
              onClick={() => setComportamentoFiltro(b.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                comportamentoFiltro === b.id 
                  ? "bg-slate-800 text-white" 
                  : "text-slate-600 hover:text-slate-400"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
          {[
            { id: 'all', label: 'Tipos' },
            { id: 'unica', label: 'Única' },
            { id: 'parcelada', label: 'Parc.' },
            { id: 'recorrente', label: 'Recorr.' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTipoFiltro(t.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                tipoFiltro === t.id 
                  ? "bg-slate-800 text-white" 
                  : "text-slate-600 hover:text-slate-400"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ContasSummaryCards
        vencendoHoje={resumoFiltrado.vencendoHoje}
        vencidas={resumoFiltrado.vencidas}
        proximos7={resumoFiltrado.proximos7}
        proximos30={resumoFiltrado.proximos30}
      />

      {/* Mobile: Bottom Sheets (premium) */}
      <Modal
        isOpen={contasMobileRefinarOpen}
        onClose={() => setContasMobileRefinarOpen(false)}
        title="Filtros"
        subtitle="Competência e refinamentos"
        position="bottom"
        className="max-w-none"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={clearContasMobileFilters}
              className="flex-1 px-6 py-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-black transition-all active:scale-95"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={applyContasMobileFilters}
              className="flex-1 px-6 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all shadow-lg shadow-violet-600/20 active:scale-95"
            >
              Aplicar
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Competência</div>
            <CustomSelect
              value={draftCompetenciaYM || competenciaFiltro}
              onValueChange={(v) => setDraftCompetenciaYM(v)}
              options={competenciaOptions}
            />
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Categoria</div>
            <CustomSelect
              value={draftCategoriaFiltro}
              onValueChange={(v) => setDraftCategoriaFiltro(v)}
              options={[
                { value: 'all', label: 'Todas Categorias' },
                ...categorias.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">Custo</div>
            <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-2xl p-1">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'fixo', label: 'Fixo' },
                { id: 'variavel', label: 'Variável' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setDraftComportamentoFiltro(b.id as any)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all',
                    draftComportamentoFiltro === b.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-400'
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">Tipos</div>
            <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-2xl p-1">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'unica', label: 'Única' },
                { id: 'parcelada', label: 'Parc.' },
                { id: 'recorrente', label: 'Recorr.' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDraftTipoFiltro(t.id as any)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all',
                    draftTipoFiltro === t.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-400'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Busca</div>
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={draftBusca}
                onChange={(e) => setDraftBusca(e.target.value)}
                placeholder="Buscar por descrição ou categoria…"
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-800 bg-slate-950/40 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={contasMobileAcoesOpen}
        onClose={() => setContasMobileAcoesOpen(false)}
        title="Ações"
        subtitle="Operações rápidas"
        position="bottom"
        className="max-w-none"
      >
        <div className="space-y-3">
          <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.22em] px-1">Criação</div>
          <button
            type="button"
            onClick={() => {
              setContasMobileAcoesOpen(false);
              setNovaContaDefaults(null);
              setNovaOpen(true);
            }}
            className="w-full inline-flex items-center justify-between px-5 py-4 rounded-3xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-3">
              <Plus size={16} />
              Nova Conta
            </span>
            <ChevronDown size={16} className="opacity-0" />
          </button>

          <div className="mt-4 text-[10px] text-slate-500 font-black uppercase tracking-[0.22em] px-1">Configurações</div>
          <button
            type="button"
            onClick={() => {
              setContasMobileAcoesOpen(false);
              try {
                window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
              } catch {
                // ignore
              }
            }}
            className="w-full inline-flex items-center justify-between px-5 py-4 rounded-3xl bg-slate-900/50 border border-slate-800/70 text-slate-200 font-black hover:bg-slate-900/70 transition-all active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-3">
              <Bell size={16} className="text-violet-300" />
              Notificações
            </span>
            <ChevronDown size={16} className="opacity-0" />
          </button>
        </div>
      </Modal>

      {visaoOperacionalModo === 'calendario' && (
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="hidden lg:block text-white font-black">Calendário do mês</div>
              {calendarioDiaSelecionado ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Selecionado: {calendarioDiaSelecionado.split('-').reverse().join('/')}
                </div>
              ) : (
                <div className="hidden lg:block text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Clique em um dia para filtrar a lista
                </div>
              )}
            </div>

            {(() => {
              const [yy, mm] = competenciaFiltro.split('-').map(Number);
              return (
                <ContasCalendar
                  year={yy}
                  month={mm}
                  contas={contasParaCalendario}
                  selectedDate={calendarioDiaSelecionado}
                  onSelectDate={(iso) => {
                    setCalendarioDiaSelecionado(iso);
                    if (iso) setDiaModalOpen(true);
                  }}
                  onCreateForDate={(iso) => {
                    setNovaContaDefaults({ vencimento: iso, competenciaYM: competenciaFiltro });
                    setNovaOpen(true);
                  }}
                />
              );
            })()}
          </Card>
        </div>
      )}

      {visaoOperacionalModo === 'lista' && (
        <div className="mt-6">
          <ContasTable
            contas={contasParaListaOperacional}
            filtro={filtroTab}
            onFiltroChange={setFiltroTab}
            busca={busca}
            onBuscaChange={setBusca}
            onPagar={(c) => setPagarConta(c)}
            onEditar={(c) => setEditarConta(c)}
            onExcluir={(c) => setContaParaExcluir(c)}
            onFinalizar={(c) => setContaParaFinalizar(c)}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </div>
      )}

      <NovaContaModal
        isOpen={novaOpen}
        categorias={categorias}
        onClose={() => setNovaOpen(false)}
        onConfirm={(payload, options) =>
          run(
            async () => {
              await createContaPagar(payload, options);
              setNovaOpen(false);
              setNovaContaDefaults(null);
              await refetch();
            },
            { success: 'Conta criada.', error: 'Não foi possível criar a conta.' }
          )
        }
        defaultVencimento={novaContaDefaults?.vencimento}
        defaultCompetenciaYM={novaContaDefaults?.competenciaYM}
      />

      <ContasDoDiaModal
        isOpen={diaModalOpen && !!calendarioDiaSelecionado}
        dateISO={calendarioDiaSelecionado || ''}
        contas={calendarioDiaSelecionado ? contasParaCalendario.filter((c) => c.data_vencimento === calendarioDiaSelecionado) : []}
        onClose={() => setDiaModalOpen(false)}
        onPagar={(c) => {
          setDiaModalOpen(false);
          setPagarConta(c);
        }}
        onEditar={(c) => {
          setDiaModalOpen(false);
          setEditarConta(c);
        }}
        onExcluir={(c) => {
          setDiaModalContaIdToDelete(c);
        }}
        onNovaConta={(iso) => {
          setNovaContaDefaults({ vencimento: iso, competenciaYM: competenciaFiltro });
          setDiaModalOpen(false);
          setNovaOpen(true);
        }}
      />

      {diaModalContaIdToDelete && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 bg-rose-500/10 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Excluir conta</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                {diaModalContaIdToDelete.tipo_lancamento === 'parcelada' && diaModalContaIdToDelete.total_parcelas
                  ? `"${diaModalContaIdToDelete.descricao.split(' (')[0]}" é um parcelamento com ${diaModalContaIdToDelete.total_parcelas} parcelas. O que deseja fazer?`
                  : `Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.`}
              </p>
              <div className="flex flex-col gap-3">
                {diaModalContaIdToDelete.tipo_lancamento === 'parcelada' && diaModalContaIdToDelete.total_parcelas ? (
                  <>
                    <button
                      onClick={() => {
                        const conta = diaModalContaIdToDelete;
                        if (!conta) return;
                        setDiaModalContaIdToDelete(null);
                        run(
                          async () => {
                            await deleteParcelamento(conta);
                            await refetch();
                          },
                          { success: 'Parcelamento excluído.', error: 'Não foi possível excluir o parcelamento.' }
                        );
                      }}
                      className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                    >
                      Excluir todo o parcelamento ({diaModalContaIdToDelete.total_parcelas} parcelas)
                    </button>
                    <button
                      onClick={() => {
                        const conta = diaModalContaIdToDelete;
                        if (!conta) return;
                        setDiaModalContaIdToDelete(null);
                        run(
                          async () => {
                            await deleteConta(conta.id);
                            await refetch();
                          },
                          { success: 'Parcela excluída.', error: 'Não foi possível excluir a parcela.' }
                        );
                      }}
                      className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-slate-600 hover:bg-slate-500 transition-all active:scale-95"
                    >
                      Excluir somente esta parcela
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      const conta = diaModalContaIdToDelete;
                      if (!conta) return;
                      setDiaModalContaIdToDelete(null);
                      run(
                        async () => {
                          await deleteConta(conta.id);
                          await refetch();
                        },
                        { success: 'Lançamento excluído.', error: 'Não foi possível excluir o lançamento.' }
                      );
                    }}
                    className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                  >
                    Excluir
                  </button>
                )}
                <button
                  onClick={() => setDiaModalContaIdToDelete(null)}
                  className="w-full px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PagarContaModal
        isOpen={!!pagarConta}
        conta={pagarConta}
        onClose={() => setPagarConta(null)}
        onConfirm={(input) => {
          if (!pagarConta) return;
          const id = pagarConta.id;
          return run(
            async () => {
              await registrarPagamento(id, input);
              await refetch();
            },
            {
              success: 'Pagamento registrado.',
              error: 'Não foi possível registrar o pagamento.',
              onSuccess: () => setPagarConta(null),
            }
          );
        }}
      />

      <EditarContaModal
        isOpen={!!editarConta}
        conta={editarConta}
        categorias={categorias}
        onClose={() => setEditarConta(null)}
        onConfirm={(patch, aplicarAFuturos) => {
          if (!editarConta) return;
          const conta = editarConta;
          return run(
            async () => {
              // 1. Atualiza a conta atual
              await updateContaPagar(conta.id, patch);

              // 2. Se for recorrente e o usuário escolheu aplicar a futuros, atualiza os próximos meses
              if (aplicarAFuturos && conta.tipo_lancamento === 'recorrente') {
                await updateFuturasRecorrentes(conta, patch);
              }

              // 3. Se for parcelada e o usuário escolheu aplicar a todas, atualiza parcelas pendentes
              if (aplicarAFuturos && conta.tipo_lancamento === 'parcelada') {
                await updateFuturasParceladas(conta, patch);
              }

              await refetch();
            },
            {
              success: 'Conta atualizada.',
              error: 'Não foi possível atualizar a conta.',
              onSuccess: () => setEditarConta(null),
            }
          );
        }}
      />

      {!!contaParaExcluir && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 bg-rose-500/10 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Excluir lançamento</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                {contaParaExcluir.tipo_lancamento === 'parcelada' && contaParaExcluir.total_parcelas
                  ? `"${contaParaExcluir.descricao.split(' (')[0]}" é um parcelamento com ${contaParaExcluir.total_parcelas} parcelas. O que deseja fazer?`
                  : `Tem certeza que deseja excluir "${contaParaExcluir.descricao}"? Esta ação não pode ser desfeita.`}
              </p>
              <div className="flex flex-col gap-3">
                {contaParaExcluir.tipo_lancamento === 'parcelada' && contaParaExcluir.total_parcelas ? (
                  <>
                    <button
                      onClick={() => {
                        const conta = contaParaExcluir;
                        if (!conta) return;
                        setContaParaExcluir(null);
                        run(
                          async () => {
                            const removidos = await deleteParcelamento(conta);
                            await refetch();
                            return removidos;
                          },
                          {
                            error: 'Não foi possível excluir o parcelamento.',
                            onSuccess: (removidos) =>
                              toastSuccess(
                                `${removidos} parcela${removidos !== 1 ? 's' : ''} excluída${removidos !== 1 ? 's' : ''}.`
                              ),
                          }
                        );
                      }}
                      className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                    >
                      Excluir todo o parcelamento ({contaParaExcluir.total_parcelas} parcelas)
                    </button>
                    <button
                      onClick={() => {
                        const conta = contaParaExcluir;
                        if (!conta) return;
                        setContaParaExcluir(null);
                        run(
                          async () => {
                            await deleteConta(conta.id);
                            await refetch();
                          },
                          { success: 'Parcela excluída.', error: 'Não foi possível excluir a parcela.' }
                        );
                      }}
                      className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-slate-600 hover:bg-slate-500 transition-all active:scale-95"
                    >
                      Excluir somente esta parcela
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      const conta = contaParaExcluir;
                      if (!conta) return;
                      setContaParaExcluir(null);
                      run(
                        async () => {
                          await deleteConta(conta.id);
                          await refetch();
                        },
                        { success: 'Lançamento excluído.', error: 'Não foi possível excluir o lançamento.' }
                      );
                    }}
                    className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                  >
                    Excluir
                  </button>
                )}
                <button
                  onClick={() => setContaParaExcluir(null)}
                  className="w-full px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra flutuante de seleção em lote */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[12000] flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/40 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <CheckSquare size={18} className="text-violet-400 shrink-0" />
          <span className="text-white font-bold text-sm whitespace-nowrap">
            {selectedIds.size} {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}
          </span>
          <button
            onClick={clearSelection}
            className="ml-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
          >
            Limpar
          </button>
          <button
            onClick={() => setBatchDeleteOpen(true)}
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-lg shadow-rose-600/20"
          >
            <span className="flex items-center gap-1.5"><Trash2 size={13} /> Excluir</span>
          </button>
        </div>
      )}

      {/* Dialog de confirmação exclusão em lote */}
      {batchDeleteOpen && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 bg-rose-500/10 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Excluir em lote</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                Tem certeza que deseja excluir <strong className="text-white">{selectedIds.size}</strong> {selectedIds.size === 1 ? 'conta' : 'contas'}? Esta ação não pode ser desfeita.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    const ids = Array.from(selectedIds);
                    setBatchDeleteOpen(false);
                    clearSelection();
                    run(
                      async () => {
                        const removidos = await deleteContasBatch(ids);
                        await refetch();
                        return removidos;
                      },
                      {
                        error: 'Não foi possível excluir as contas selecionadas.',
                        onSuccess: (removidos) =>
                          toastSuccess(
                            `${removidos} conta${removidos !== 1 ? 's' : ''} excluída${removidos !== 1 ? 's' : ''}.`
                          ),
                      }
                    );
                  }}
                  className="w-full px-6 py-3.5 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                >
                  Excluir {selectedIds.size} {selectedIds.size === 1 ? 'conta' : 'contas'}
                </button>
                <button
                  onClick={() => setBatchDeleteOpen(false)}
                  className="w-full px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!contaParaFinalizar}
        onClose={() => setContaParaFinalizar(null)}
        onConfirm={() => {
          const conta = contaParaFinalizar;
          if (!conta) return;
          return run(
            async () => {
              await finalizarParcelamento(conta);
              await refetch();
            },
            {
              success: 'Parcelamento finalizado.',
              error: 'Não foi possível finalizar o parcelamento.',
              onSuccess: () => setContaParaFinalizar(null),
            }
          );
        }}
        title="Finalizar parcelamento"
        message={
          contaParaFinalizar?.tipo_lancamento === 'parcelada'
            ? `Deseja marcar esta e todas as parcelas futuras de "${contaParaFinalizar?.descricao.split(' (')[0]}" como finalizadas? Elas não aparecerão mais como pendentes.`
            : `Deseja marcar "${contaParaFinalizar?.descricao}" como finalizada?`
        }
        confirmLabel="Finalizar"
        variant="primary"
      />
    </div>
  );
};
