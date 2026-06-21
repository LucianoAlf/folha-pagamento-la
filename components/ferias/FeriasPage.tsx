import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Users, History, Sparkles, AlertCircle, LineChart, BarChart3, FileText, TrendingUp } from 'lucide-react';
import { FeriasSummaryCards } from './FeriasSummaryCards';
import { FeriasColaboradorList } from './FeriasColaboradorList';
import { ProgramarFeriasModal } from './ProgramarFeriasModal';
import { EditarProgramacaoModal } from './EditarProgramacaoModal';
import { RegistrarPagamentoModal } from './RegistrarPagamentoModal';
import { FeriasProgramacoesList } from './FeriasProgramacoesList';
import { FeriasAiInsightsPanel } from './FeriasAiInsightsPanel';
import { AjustarPeriodosModal } from './AjustarPeriodosModal';
import { Button, ConfirmDialog } from '../UI';
import { cn } from '../CollaboratorComponents';
import { feriasService } from '../../services/feriasService';
import type {
  FeriasColaboradorStatus,
  FeriasColaboradorFiltros,
  FeriasProgramacao,
  FeriasPeriodoAquisitivo,
  FeriasHistoricoAcao,
} from '../../types';

type TabId = 'dashboard' | 'colaboradores' | 'programacoes' | 'historico' | 'insights';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
  premium?: boolean;
}

export const FeriasPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [colaboradores, setColaboradores] = useState<FeriasColaboradorStatus[]>([]);
  const [programacoes, setProgramacoes] = useState<FeriasProgramacao[]>([]);
  const [historico, setHistorico] = useState<FeriasHistoricoAcao[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [filtros, setFiltros] = useState<FeriasColaboradorFiltros>({
    ordenacao: 'proxima_expiracao',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalProgramarOpen, setModalProgramarOpen] = useState(false);
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false);
  const [modalAjustarPeriodosOpen, setModalAjustarPeriodosOpen] = useState(false);
  const [confirmCancelarOpen, setConfirmCancelarOpen] = useState(false);
  const [colaboradorSelecionado, setColaboradorSelecionado] =
    useState<FeriasColaboradorStatus | null>(null);
  const [colaboradorAjusteSelecionado, setColaboradorAjusteSelecionado] =
    useState<FeriasColaboradorStatus | null>(null);
  const [programacaoSelecionada, setProgramacaoSelecionada] =
    useState<FeriasProgramacao | null>(null);
  const [periodoSelecionado, setPeriodoSelecionado] =
    useState<FeriasPeriodoAquisitivo | null>(null);

  // Detectar mobile
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Buscar status de colaboradores
      const [colaboradoresData, programacoesData] = await Promise.all([
        feriasService.fetchColaboradoresStatus(filtros),
        feriasService.fetchProgramacoes({
          status: ['programado', 'aprovado', 'em_gozo'],
        }),
      ]);

      setColaboradores(colaboradoresData);
      setProgramacoes(programacoesData);
    } catch (err: any) {
      console.error('Erro ao carregar dados de férias:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [filtros]);

  // Recarregar quando filtros mudarem (ordenacao/busca etc)
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carregar historico sob demanda (aba)
  useEffect(() => {
    if (activeTab !== 'historico') return;
    if (historicoLoading) return;
    if (historico.length > 0) return;

    let isMounted = true;

    (async () => {
      try {
        setHistoricoLoading(true);
        const rows = await feriasService.fetchHistorico({ limit: 200 });
        if (isMounted) {
          setHistorico(rows);
        }
      } catch (err: any) {
        console.error('Erro ao carregar historico:', err);
        if (isMounted) {
          setError(err?.message || 'Erro ao carregar historico');
        }
      } finally {
        if (isMounted) {
          setHistoricoLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeTab]); // Removido historico.length e historicoLoading das dependências para evitar loop

  // Handlers
  const handleProgramarFerias = (colaborador: FeriasColaboradorStatus) => {
    setColaboradorSelecionado(colaborador);
    setModalProgramarOpen(true);
  };

  const handleVerHistorico = (colaborador: FeriasColaboradorStatus) => {
    // Hoje o maior gargalo operacional é ajustar períodos antigos (gozados/vendidos/status).
    // Então o botão "Ver" vira um atalho para o ajuste dos períodos aquisitivos.
    setColaboradorAjusteSelecionado(colaborador);
    setModalAjustarPeriodosOpen(true);
  };

  const handleModalSuccess = () => {
    loadData(); // Recarregar dados após programar férias
  };

  const handleEditarProgramacao = async (
    programacao: FeriasProgramacao,
    colaborador: FeriasColaboradorStatus
  ) => {
    // Buscar período aquisitivo
    try {
      const periodos = await feriasService.fetchPeriodosAquisitivos(
        colaborador.colaborador_id
      );
      const periodo = periodos.find((p) => p.id === programacao.periodo_aquisitivo_id);

      if (periodo) {
        setProgramacaoSelecionada(programacao);
        setPeriodoSelecionado(periodo);
        setColaboradorSelecionado(colaborador);
        setModalEditarOpen(true);
      }
    } catch (err) {
      console.error('Erro ao buscar período:', err);
      setError('Erro ao carregar dados do período aquisitivo');
    }
  };

  const handleRegistrarPagamento = (
    programacao: FeriasProgramacao,
    colaborador: FeriasColaboradorStatus
  ) => {
    setProgramacaoSelecionada(programacao);
    setColaboradorSelecionado(colaborador);
    setModalPagamentoOpen(true);
  };

  const handleCancelarProgramacao = (programacao: FeriasProgramacao) => {
    setProgramacaoSelecionada(programacao);
    setConfirmCancelarOpen(true);
  };

  const handleConfirmarCancelamento = async () => {
    if (!programacaoSelecionada) return;

    try {
      await feriasService.cancelProgramacao(programacaoSelecionada.id!);
      setConfirmCancelarOpen(false);
      setProgramacaoSelecionada(null);
      loadData();
    } catch (err: any) {
      console.error('Erro ao cancelar programação:', err);
      setError(err.message || 'Erro ao cancelar programação');
    }
  };

  // Tabs configuration
  const tabs: Tab[] = useMemo(() => {
    const feriasVencidas = colaboradores.filter((c) => c.tem_ferias_vencidas).length;

    return [
      {
        id: 'dashboard',
        label: 'Resumo',
        icon: LineChart,
        badge: feriasVencidas > 0 ? feriasVencidas : undefined,
      },
      {
        id: 'colaboradores',
        label: 'Colaboradores',
        icon: Users,
      },
      {
        id: 'programacoes',
        label: 'Programações',
        icon: Calendar,
        badge: programacoes.length > 0 ? programacoes.length : undefined,
      },
      {
        id: 'historico',
        label: 'Histórico',
        icon: History,
      },
      {
        id: 'insights',
        label: 'Insights IA',
        icon: Sparkles,
        premium: true,
      },
    ];
  }, [colaboradores, programacoes]);

  const getShortLabel = (id: TabId) => {
    switch (id) {
      case 'dashboard': return 'Resumo';
      case 'colaboradores': return 'Colabs';
      case 'programacoes': return 'Progs';
      case 'historico': return 'Hist';
      case 'insights': return 'IA';
      default: return '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="px-4 md:px-6 pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-primary flex items-center gap-3">
              <Calendar className="text-accent" size={28} />
              {activeTab === 'dashboard' ? 'Férias CLT' :
               activeTab === 'colaboradores' ? 'Colaboradores CLT' :
               activeTab === 'programacoes' ? 'Programações de Férias' :
               activeTab === 'historico' ? 'Histórico de Férias' :
               activeTab === 'insights' ? 'IA de Férias' :
               'Férias CLT'}
            </h1>
            <p className="text-sm text-muted font-bold mt-1">
              {activeTab === 'dashboard' ? 'Gestão completa de férias de colaboradores CLT' :
               activeTab === 'colaboradores' ? 'Gerencie o status e períodos aquisitivos dos colaboradores' :
               activeTab === 'programacoes' ? 'Acompanhe as férias programadas e em gozo' :
               activeTab === 'historico' ? 'Histórico completo de férias e auditoria' :
               activeTab === 'insights' ? 'Insights inteligentes e previsões sobre férias' :
               'Gestão completa de férias de colaboradores CLT'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Botões de sincronização removidos - o banco de dados processa automaticamente */}
          </div>
        </div>

        {/* Tabs */}
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Desktop Tabs (MusiClass Style) */}
          <div className="hidden lg:block border-b border-line/60 bg-surface/20 backdrop-blur-sm">
            <div className="flex items-center gap-1 overflow-x-auto pb-px scrollbar-hide px-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap group",
                    activeTab === tab.id
                      ? "text-accent"
                      : "text-muted hover:text-primary"
                  )}
                >
                  <tab.icon size={16} className={cn(
                    "transition-colors",
                    activeTab === tab.id ? "text-accent" : "text-muted group-hover:text-secondary"
                  )} />
                  {tab.label}
                  {tab.premium && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30 ml-1">
                      PRO
                    </span>
                  )}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] px-1 rounded-full bg-danger/20 text-danger border border-danger/30 ml-1">
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Tabs (Cockpit Premium Style) */}
          <div className="lg:hidden mb-6">
            <div className="relative flex bg-surface p-1 rounded-xl border border-line/50 shadow-inner overflow-hidden">
              {/* Indicador Deslizante (Sliding Background) */}
              <div
                className="absolute top-1.5 bottom-1.5 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) bg-surface-2/80 rounded-lg border border-line-strong/30 shadow-lg"
                style={{
                  width: `calc(${100 / Math.max(tabs.length, 1)}% - 10px)`,
                  left: `calc(${(tabs.findIndex(t => t.id === activeTab) * 100) / Math.max(tabs.length, 1)}% + 5px)`,
                }}
              />
              
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative z-10 flex-1 py-3 font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap",
                    tabs.length >= 5 ? "text-[10px]" : "text-[11px]",
                    activeTab === tab.id
                      ? "text-accent scale-[1.02]"
                      : "text-muted hover:text-primary"
                  )}
                >
                  {getShortLabel(tab.id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2">
            <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-bold text-danger">Erro</div>
              <div className="text-xs text-danger/70 mt-0.5">{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-danger hover:text-danger/80 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <FeriasSummaryCards colaboradores={colaboradores} isLoading={isLoading} />

            {/* Alertas Críticos */}
            {!isLoading && colaboradores.some((c) => c.tem_ferias_vencidas) && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/30">
                <div className="flex items-start gap-3 mb-3">
                  <AlertCircle size={20} className="text-danger shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-danger">
                      🚨 Férias Vencidas - Ação Imediata Necessária
                    </h3>
                    <p className="text-xs text-danger/70 mt-1">
                      Os colaboradores abaixo possuem férias vencidas e devem ser pagas em
                      DOBRO. Programe as férias urgentemente para evitar multas.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {colaboradores
                    .filter((c) => c.tem_ferias_vencidas)
                    .map((c) => (
                      <div
                        key={c.colaborador_id}
                        className="p-3 rounded-lg bg-surface/40 border border-danger/20 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-bold text-secondary">{c.nome}</div>
                          <div className="text-xs text-secondary">
                            {c.total_dias_saldo} dias pendentes •{' '}
                            {c.periodos_vencidos} período{c.periodos_vencidos === 1 ? '' : 's'} vencido
                            {c.proxima_expiracao
                              ? ` • Concessivo atual vence em ${new Date(c.proxima_expiracao).toLocaleDateString(
                                  'pt-BR'
                                )}`
                              : ''}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleProgramarFerias(c)}
                          variant="primary"
                          className="!text-xs !py-1.5 !px-3"
                        >
                          Programar Agora
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Lista de Colaboradores (com filtros) */}
            <div>
              <h2 className="text-lg font-bold text-secondary mb-3">
                Todos os Colaboradores CLT
              </h2>
              <FeriasColaboradorList
                colaboradores={colaboradores}
                filtros={filtros}
                onFiltrosChange={setFiltros}
                onProgramarFerias={handleProgramarFerias}
                onVerHistorico={handleVerHistorico}
                isLoading={isLoading}
                isMobile={isMobile}
              />
            </div>
          </div>
        )}

        {activeTab === 'colaboradores' && (
          <div>
            <h2 className="text-lg font-bold text-secondary mb-4">
              Gerenciar Colaboradores CLT
            </h2>
            <FeriasColaboradorList
              colaboradores={colaboradores}
              filtros={filtros}
              onFiltrosChange={setFiltros}
              onProgramarFerias={handleProgramarFerias}
              onVerHistorico={handleVerHistorico}
              isLoading={isLoading}
              isMobile={isMobile}
            />
          </div>
        )}

        {activeTab === 'programacoes' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-secondary">
                Férias Programadas
              </h2>
              <p className="text-xs text-secondary mt-1">
                Visualize e gerencie todas as programações de férias
              </p>
            </div>
            <FeriasProgramacoesList
              programacoes={programacoes}
              colaboradores={colaboradores}
              onEditar={handleEditarProgramacao}
              onCancelar={handleCancelarProgramacao}
              onRegistrarPagamento={handleRegistrarPagamento}
              isLoading={isLoading}
            />
          </div>
        )}

        {activeTab === 'historico' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-secondary">Histórico e Auditoria</h2>
              <p className="text-xs text-secondary mt-1">
                Registro de acoes (programacao, aprovacao, pagamentos, cancelamentos)
              </p>
            </div>

            {historicoLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-surface-2/30 border border-line animate-pulse"
                  />
                ))}
              </div>
            ) : historico.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-2/50 flex items-center justify-center mb-4">
                  <History size={32} className="text-muted" />
                </div>
                <h3 className="text-lg font-bold text-secondary mb-1">
                  Nenhuma acao registrada
                </h3>
                <p className="text-sm text-muted">
                  Quando voce programar/editar/pagar ferias, as acoes aparecem aqui
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {historico.map((h) => (
                  <div
                    key={h.id}
                    className="p-4 rounded-xl bg-surface/40 border border-line hover:border-line-strong transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-sm font-bold text-secondary">
                          {h.acao}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {h.created_at
                            ? new Date(h.created_at).toLocaleString('pt-BR')
                            : ''}
                          {h.colaborador_id ? ` • Colaborador ID ${h.colaborador_id}` : ''}
                          {h.entidade_tipo ? ` • ${h.entidade_tipo}` : ''}
                        </div>
                        {h.observacao && (
                          <div className="text-xs text-secondary mt-2">
                            {h.observacao}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-muted font-bold">
                        {h.entidade_id ? String(h.entidade_id).slice(0, 8) : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <FeriasAiInsightsPanel
            colaboradores={colaboradores}
            onProgramarFerias={handleProgramarFerias}
          />
        )}
      </div>

      {/* Modal de Programação */}
      {colaboradorSelecionado && (
        <ProgramarFeriasModal
          isOpen={modalProgramarOpen}
          onClose={() => setModalProgramarOpen(false)}
          colaborador={colaboradorSelecionado}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Modal de Edição */}
      {programacaoSelecionada && periodoSelecionado && (
        <EditarProgramacaoModal
          isOpen={modalEditarOpen}
          onClose={() => {
            setModalEditarOpen(false);
            setProgramacaoSelecionada(null);
            setPeriodoSelecionado(null);
          }}
          programacao={programacaoSelecionada}
          periodo={periodoSelecionado}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Modal de Pagamento */}
      {programacaoSelecionada && colaboradorSelecionado && (
        <RegistrarPagamentoModal
          isOpen={modalPagamentoOpen}
          onClose={() => {
            setModalPagamentoOpen(false);
            setProgramacaoSelecionada(null);
          }}
          programacao={programacaoSelecionada}
          colaborador={colaboradorSelecionado}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Confirmação de Cancelamento */}
      {programacaoSelecionada && (
        <ConfirmDialog
          isOpen={confirmCancelarOpen}
          onClose={() => {
            setConfirmCancelarOpen(false);
            setProgramacaoSelecionada(null);
          }}
          onConfirm={handleConfirmarCancelamento}
          title="Cancelar Programação de Férias"
          message={`Tem certeza que deseja cancelar a programação de férias de ${
            new Date(programacaoSelecionada.data_inicio).toLocaleDateString('pt-BR')
          } a ${new Date(programacaoSelecionada.data_fim).toLocaleDateString('pt-BR')}?`}
          confirmLabel="Sim, Cancelar"
          cancelLabel="Não, Manter"
          variant="danger"
        />
      )}

      {/* Ajuste de Períodos Aquisitivos */}
      {colaboradorAjusteSelecionado && (
        <AjustarPeriodosModal
          isOpen={modalAjustarPeriodosOpen}
          onClose={() => {
            setModalAjustarPeriodosOpen(false);
            setColaboradorAjusteSelecionado(null);
          }}
          colaborador={colaboradorAjusteSelecionado}
          onSuccess={() => {
            // Recarrega agregados/alertas após ajuste de períodos.
            loadData();
          }}
        />
      )}
    </div>
  );
};
