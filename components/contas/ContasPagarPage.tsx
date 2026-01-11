import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getStatusVisual,
} from '../../services/contasPagarService';
import { supabase } from '../../services/supabase';
import { ContasSummaryCards } from './ContasSummaryCards';
import { ContasTable } from './ContasTable';
import { NovaContaModal } from './NovaContaModal';
import { PagarContaModal } from './PagarContaModal';
import { CategoriaModal } from './CategoriaModal';
import { EditarContaModal } from './EditarContaModal';
import { ContaAuditCard } from './ContaAuditCard';
import { ContasCalendar } from './ContasCalendar';
import { ContasDoDiaModal } from './ContasDoDiaModal';
import { Badge, Card, CustomSelect, Tooltip } from '../UI';
import { formatCurrency } from '../../services/api';
import { 
  CheckCircle2, 
  DollarSign, 
  Info, 
  TrendingUp, 
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
  LayoutGrid,
  List,
  Search
} from 'lucide-react';
import { cn } from '../CollaboratorComponents';
import { KPICard, DistributionChart, EvolutionChart } from '../DashboardWidgets';

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

export const ContasPagarPage: React.FC<{
  mode?: 'dashboard' | 'visao-geral' | 'todas' | 'comparativo' | 'categorias';
}> = ({ mode = 'visao-geral' }) => {
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
  const [competenciaFiltro, setCompetenciaFiltro] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });

  const [novaOpen, setNovaOpen] = useState(false);
  const [pagarConta, setPagarConta] = useState<ContaPagar | null>(null);
  const [editarConta, setEditarConta] = useState<ContaPagar | null>(null);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaDespesa | null>(null);

  const [busca, setBusca] = useState('');
  const [competenciaComparar, setCompetenciaComparar] = useState<string>(() => {
    const hoje = new Date();
    const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  });

  // Notas e AI Insights
  const [notasRH, setNotasRH] = useState<string>('');
  const [notasRHLoading, setNotasRHLoading] = useState(false);
  const [notasRHSaved, setNotasRHSaved] = useState(false);
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

  useEffect(() => {
    try {
      localStorage.setItem('contas:visaoOperacionalModo', visaoOperacionalModo);
    } catch {}
  }, [visaoOperacionalModo]);

  // Carregar notas da competência selecionada
  useEffect(() => {
    async function loadNotas() {
      if (!competenciaFiltro) return;
      const [year, month] = competenciaFiltro.split('-').map(Number);
      
      const { data, error } = await supabase
        .from('folhas_mensais')
        .select('contas_notas_rh')
        .eq('ano', year)
        .eq('mes', month)
        .single();

      if (!error && data) {
        setNotasRH(data.contas_notas_rh || '');
      } else {
        setNotasRH('');
      }
    }
    void loadNotas();
  }, [competenciaFiltro]);

  const saveNotas = async () => {
    if (!competenciaFiltro) return;
    setNotasRHLoading(true);
    setNotasRHSaved(false);
    
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
        .update({ contas_notas_rh: notasRH })
        .eq('id', folha.id);
    } else {
      await supabase
        .from('folhas_mensais')
        .insert([{ ano: year, mes: month, contas_notas_rh: notasRH, status: 'rascunho' }]);
    }
    
    setNotasRHLoading(false);
    setNotasRHSaved(true);
    setTimeout(() => setNotasRHSaved(false), 3000);
  };

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

  // Realtime: auto-refresh on changes
  useEffect(() => {
    const channel = supabase
      .channel('contas-pagar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_pagar' }, () => {
        void refetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_despesa' }, () => {
        void refetch();
      })
      .subscribe();

    return () => {
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
    return contas.filter((c) => c.status !== 'cancelado' && c.status !== 'pago' && matchesCommonFilters(c));
  }, [contas, matchesCommonFilters]);

  const contasPendentesMes = useMemo(() => {
    return contasPendentesBase.filter(matchesCompetencia);
  }, [contasPendentesBase, matchesCompetencia]);

  const contasParaTabelaVisaoGeral = useMemo(() => {
    return filtroTab === 'todas' ? contasPendentesMes : contasPendentesBase;
  }, [filtroTab, contasPendentesMes, contasPendentesBase]);

  const contasParaCalendario = useMemo(() => {
    // calendário: mostra contas do mês (competência) — pendentes e pagas, para visão geral.
    return contas.filter((c) => c.status !== 'cancelado' && matchesCommonFiltersNoSearch(c) && matchesCompetencia(c));
  }, [contas, matchesCommonFiltersNoSearch, matchesCompetencia]);

  const contasParaListaOperacional = useMemo(() => {
    // A lista continua sendo a lista padrão; o detalhe do dia é no modal.
    return contasParaTabelaVisaoGeral;
  }, [visaoOperacionalModo, calendarioDiaSelecionado, contasParaTabelaVisaoGeral]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  if (mode === 'dashboard') {
    const [cy, cm] = competenciaFiltro.split('-');
    const prevDate = new Date(Number(cy), Number(cm) - 2, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    
    const contasMes = contas.filter((c) => c.status !== 'cancelado' && matchesCommonFiltersNoSearch(c) && matchesCompetencia(c));
    const contasPrev = contas.filter((c) => c.status !== 'cancelado' && matchesCommonFiltersNoSearch(c) && (() => {
      if (!c.competencia) return false;
      const [y, m] = c.competencia.split('-');
      return `${y}-${m}` === prevYM;
    })());

    const totalMes = contasMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const totalPrev = contasPrev.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    
    const calcTrend = (curr: number, prev: number) => {
      const diff = curr - prev;
      const perc = prev > 0 ? (diff / prev) * 100 : 0;
      return {
        trend: perc > 0 ? 'up' as const : 'down' as const,
        value: `${Math.abs(perc).toFixed(1)}%`
      };
    };

    const totalTrend = calcTrend(totalMes, totalPrev);
    const lancTrend = calcTrend(contasMes.length, contasPrev.length);

    // KPIs operacionais (os 7 cards do plano original)
    const pendentesMes = contasMes.filter((c) => c.status === 'pendente');
    const pagasMes = contasMes.filter((c) => c.status === 'pago');
    const totalPendenteMes = pendentesMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const totalPagoMes = pagasMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    const hojeISO = new Date().toISOString().split('T')[0];
    const vencendoHoje = pendentesMes.filter((c) => c.data_vencimento === hojeISO);
    const totalVencendoHoje = vencendoHoje.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    // Distribuição por categoria (Top 6 + Outros)
    const categoryData = (() => {
      const map = new Map<string, number>();
      contasMes.forEach((c) => {
        const key = c.categoria?.nome || 'Sem categoria';
        map.set(key, (map.get(key) || 0) + (Number(c.valor) || 0));
      });
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, 6);
      const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);

      const palette = ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#94a3b8'];
      const rows: Array<[string, number]> = [...top, ...(rest > 0 ? [['Outros', rest] as [string, number]] : [])];
      return rows.map(([name, value], i) => ({
        name,
        value,
        color: palette[i % palette.length],
      }));
    })();

    // Evolução (JAN → DEZ do ano) — ENTRA SOMENTE O QUE ESTÁ PAGO.
    // Assim, janeiro (pago) aparece e os meses seguintes caem para 0 (mesmo que existam pendentes/recorrências).
    const evolutionData = (() => {
      const months: string[] = [];
      for (let month = 1; month <= 12; month++) {
        months.push(`${cy}-${String(month).padStart(2, '0')}`);
      }
      return months.map((ym) => {
        const rows = contas.filter((c) => c.status !== 'cancelado' && matchesCommonFiltersNoSearch(c) && (() => {
          if (!c.competencia) return false;
          const [y, m] = c.competencia.split('-');
          return `${y}-${m}` === ym;
        })());
        const totalPago = rows
          .filter((r) => r.status === 'pago')
          .reduce((s, r) => s + (Number(r.valor) || 0), 0);
        return { 
          periodo: formatCompetenciaLabel(ym), 
          total: totalPago
        };
      });
    })();

    // Anomalias (Alertas)
    const THRESHOLD = 20;
    const anomalies = (() => {
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

      const list: any[] = [];
      currMap.forEach((data, k) => {
        const prevVal = prevMap.get(k) || 0;
        if (prevVal > 0) {
          const diff = data.total - prevVal;
          const p = (diff / prevVal) * 100;
          if (Math.abs(p) >= THRESHOLD) {
            list.push({
              title: `Variação de ${p.toFixed(0)}% em ${data.sample.descricao}`,
              description: `${data.sample.categoria?.nome || 'Conta'} na unidade ${(data.sample.unidade || 'Matriz').toUpperCase()}`,
              variant: p > 0 ? 'rose' : 'emerald'
            });
          }
        }
      });
      return list;
    })();

    return (
      <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'todas', label: 'Consolidado' },
              { id: 'cg', label: 'Campo Grande' },
              { id: 'rec', label: 'Recreio' },
              { id: 'bar', label: 'Barra' },
            ].map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  unidadeFiltro === u.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                {u.label}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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
          onConfirm={async (payload) => {
            await createContaPagar(payload);
            setNovaOpen(false);
            await refetch();
          }}
        />
      </div>
    );
  }

  if (mode === 'comparativo') {
    // ... (logic remains same)

    return (
      <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'todas', label: 'Consolidado' },
              { id: 'cg', label: 'Campo Grande' },
              { id: 'rec', label: 'Recreio' },
              { id: 'bar', label: 'Barra' },
            ].map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  unidadeFiltro === u.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          <Card className="p-6 lg:col-span-2">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
              <Info size={20} className="text-violet-400" />
              Insights do Analista IA
            </h3>
            <div className="space-y-4 h-40 overflow-y-auto pr-2 custom-scrollbar">
              {anomalies.length > 0 ? (
                anomalies.map((v, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("mt-1 w-2 h-2 rounded-full", v.perc > 0 ? "bg-rose-500" : "bg-emerald-500")}></div>
                    <div>
                      <div className="font-bold text-white text-sm">Variação em {v.descricao}</div>
                      <div className="text-slate-400 text-xs">
                        Houve uma oscilação de {Math.abs(v.perc).toFixed(1)}% na unidade {(v.unidade || 'Matriz').toUpperCase()}. 
                        De {formatCurrency(v.prev)} para {formatCurrency(v.curr)}.
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                  <CheckCircle2 size={32} className="mb-2 opacity-20" />
                  <p className="text-sm font-bold">Nenhuma anomalia crítica detectada neste período.</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
              <img src="/Avatar_Ana.png" alt="Ana" className="w-5 h-5 rounded-full" />
              Notas da Gestão
            </h3>
            <div className="relative">
              <textarea
                value={notasRH}
                onChange={(e) => setNotasRH(e.target.value)}
                onBlur={saveNotas}
                placeholder="Digite aqui observações sobre o financeiro deste mês..."
                className="w-full h-40 bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40 resize-none transition-all"
                spellCheck={false}
              />
              {notasRHLoading && (
                <div className="absolute right-3 top-3 text-[10px] text-violet-400 font-bold flex items-center gap-1">
                  <div className="w-2 h-2 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                  SALVANDO...
                </div>
              )}
              {notasRHSaved && (
                <div className="absolute right-3 top-3 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  SALVO
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/70 flex items-center justify-between bg-slate-900/20">
            <h3 className="text-white font-black">Detalhamento das Variações</h3>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ordenado por relevância</div>
          </div>

          <div className="overflow-x-auto">
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
                        Math.abs(v.perc) >= THRESHOLD ? (v.perc > 0 ? 'text-rose-400' : 'text-emerald-400') : 'text-slate-400')}>
                        <div className="flex items-center justify-end gap-1">
                          {v.status === 'RECORRENTE' && Math.abs(v.perc) >= THRESHOLD && (
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
        </Card>
      </div>
    );
  }

  if (mode === 'categorias') {
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <div>
            <h2 className="text-2xl font-black text-white">Plano de Contas</h2>
            <p className="text-sm text-slate-500 font-bold mt-1">Gestão estratégica de categorias e classificação financeira</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingCategoria(null);
              setCategoriaModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black shadow-lg shadow-rose-600/20 transition-all"
          >
            <Plus size={16} />
            Nova Categoria
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                      if (window.confirm(`Excluir a categoria "${c.nome}"?`)) {
                        await deleteCategoria(c.id);
                        await refetch();
                      }
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

        <CategoriaModal
          isOpen={categoriaModalOpen}
          initialData={editingCategoria}
          onClose={() => setCategoriaModalOpen(false)}
          onConfirm={async (payload) => {
            await upsertCategoria(payload);
            await refetch();
          }}
          onDelete={async (id) => {
            await deleteCategoria(id);
            await refetch();
          }}
        />
      </div>
    );
  }

  if (mode === 'todas') {
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
              {[
                { id: 'todas', label: 'Consolidado' },
                { id: 'cg', label: 'Campo Grande' },
                { id: 'rec', label: 'Recreio' },
                { id: 'bar', label: 'Barra' },
              ].map((u) => (
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
                  {u.label}
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
            <div className="flex items-center gap-3">
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
              onClick={() => setNovaOpen(true)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Pago</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPago.total)}</div>
            <div className="mt-1 text-xs text-emerald-400 font-bold">{resumoAuditoriaFiltrado.totalPago.count} contas liquidadas</div>
          </Card>

          <Card className="p-6 border border-violet-500/20 bg-violet-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Pendente no Período</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPendente.total)}</div>
            <div className="mt-1 text-xs text-violet-400 font-bold">{resumoAuditoriaFiltrado.totalPendente.count} em aberto</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <TrendingUp size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total do Período</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalGeral.total)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Baseado nos filtros</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <Info size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Ticket Médio</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.ticketMedio)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Por lançamento</div>
          </Card>
        </div>

        {auditViewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {contasAudit.filter(c => c.status !== 'cancelado').map((conta) => (
              <ContaAuditCard
                key={conta.id}
                conta={conta}
                onPagar={(c) => setPagarConta(c)}
                onEditar={(c) => setEditarConta(c)}
              />
            ))}
            {contasAudit.filter(c => c.status !== 'cancelado').length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-500 font-bold">
                Nenhum lançamento encontrado para os filtros aplicados.
              </div>
            )}
          </div>
        ) : (
          <ContasTable
            contas={contasAudit.filter(c => c.status !== 'cancelado')}
            filtro={filtroTab}
            onFiltroChange={setFiltroTab}
            busca={busca}
            onBuscaChange={setBusca}
            onPagar={(c) => setPagarConta(c)}
            onEditar={(c) => setEditarConta(c)}
          />
        )}

        <NovaContaModal
          isOpen={novaOpen}
          categorias={categorias}
          onClose={() => setNovaOpen(false)}
          onConfirm={async (payload) => {
            await createContaPagar(payload);
            setNovaOpen(false);
            await refetch();
          }}
        />

        <PagarContaModal
          isOpen={!!pagarConta}
          conta={pagarConta}
          onClose={() => setPagarConta(null)}
          onConfirm={async (input) => {
            if (!pagarConta) return;
            await registrarPagamento(pagarConta.id, input);
            setPagarConta(null);
            await refetch();
          }}
        />

        <EditarContaModal
          isOpen={!!editarConta}
          conta={editarConta}
          onClose={() => setEditarConta(null)}
          onConfirm={async (patch) => {
            if (!editarConta) return;
            await updateContaPagar(editarConta.id, patch);
            setEditarConta(null);
            await refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl">
            {[
              { id: 'lista', label: 'Lista' },
              { id: 'calendario', label: 'Calendário' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setVisaoOperacionalModo(t.id as any)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black transition-all',
                  visaoOperacionalModo === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'todas', label: 'Consolidado' },
              { id: 'cg', label: 'Campo Grande' },
              { id: 'rec', label: 'Recreio' },
              { id: 'bar', label: 'Barra' },
            ].map((u) => (
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
                {u.label}
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
      </div>

      <ContasSummaryCards
        vencendoHoje={resumoFiltrado.vencendoHoje}
        vencidas={resumoFiltrado.vencidas}
        proximos7={resumoFiltrado.proximos7}
        proximos30={resumoFiltrado.proximos30}
      />

      {visaoOperacionalModo === 'calendario' && (
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-black">Calendário do mês</div>
              {calendarioDiaSelecionado ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Selecionado: {calendarioDiaSelecionado.split('-').reverse().join('/')}
                </div>
              ) : (
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
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

      <div className="mt-6">
        <ContasTable
          contas={contasParaListaOperacional}
          filtro={filtroTab}
          onFiltroChange={setFiltroTab}
          busca={busca}
          onBuscaChange={setBusca}
          onPagar={(c) => setPagarConta(c)}
          onEditar={(c) => setEditarConta(c)}
        />
      </div>

      <NovaContaModal
        isOpen={novaOpen}
        categorias={categorias}
        onClose={() => setNovaOpen(false)}
        onConfirm={async (payload) => {
          await createContaPagar(payload);
          setNovaOpen(false);
          setNovaContaDefaults(null);
          await refetch();
        }}
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
        <ConfirmDialog
          isOpen={!!diaModalContaIdToDelete}
          onClose={() => setDiaModalContaIdToDelete(null)}
          onConfirm={async () => {
            const c = diaModalContaIdToDelete;
            if (!c) return;
            setDiaModalContaIdToDelete(null);
            await deleteConta(c.id);
            await refetch();
          }}
          title="Excluir conta"
          message="Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita."
          confirmText="Excluir"
          variant="danger"
        />
      )}

      <PagarContaModal
        isOpen={!!pagarConta}
        conta={pagarConta}
        onClose={() => setPagarConta(null)}
        onConfirm={async (input) => {
          if (!pagarConta) return;
          await registrarPagamento(pagarConta.id, input);
          setPagarConta(null);
          await refetch();
        }}
      />

      <EditarContaModal
        isOpen={!!editarConta}
        conta={editarConta}
        onClose={() => setEditarConta(null)}
        onConfirm={async (patch) => {
          if (!editarConta) return;
          await updateContaPagar(editarConta.id, patch);
          setEditarConta(null);
          await refetch();
        }}
      />
    </div>
  );
};
