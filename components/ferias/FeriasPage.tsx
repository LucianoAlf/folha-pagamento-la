import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Calendar, Users, History, Sparkles, AlertCircle } from 'lucide-react';
import { FeriasSummaryCards } from './FeriasSummaryCards';
import { FeriasColaboradorList } from './FeriasColaboradorList';
import { ProgramarFeriasModal } from './ProgramarFeriasModal';
import { EditarProgramacaoModal } from './EditarProgramacaoModal';
import { RegistrarPagamentoModal } from './RegistrarPagamentoModal';
import { FeriasProgramacoesList } from './FeriasProgramacoesList';
import { FeriasAiInsightsPanel } from './FeriasAiInsightsPanel';
import { Button, ConfirmDialog } from '../UI';
import { feriasService } from '../../services/feriasService';
import type {
  FeriasColaboradorStatus,
  FeriasColaboradorFiltros,
  FeriasProgramacao,
  FeriasPeriodoAquisitivo,
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
  const [filtros, setFiltros] = useState<FeriasColaboradorFiltros>({
    ordenacao: 'proxima_expiracao',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalProgramarOpen, setModalProgramarOpen] = useState(false);
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false);
  const [confirmCancelarOpen, setConfirmCancelarOpen] = useState(false);
  const [colaboradorSelecionado, setColaboradorSelecionado] =
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

  // Carregar dados iniciais
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

  // Calcular períodos automaticamente
  const handleCalcularPeriodos = async () => {
    try {
      setIsCalculating(true);
      setError(null);

      const result = await feriasService.calcularPeriodos();

      if (result.success) {
        alert(
          `✅ ${result.periodosGerados} período(s) calculado(s) para ${result.colaboradoresProcessados} colaborador(es) CLT`
        );
        // Recarregar dados
        await loadData();
      }
    } catch (err: any) {
      console.error('Erro ao calcular períodos:', err);
      setError(err.message || 'Erro ao calcular períodos');
    } finally {
      setIsCalculating(false);
    }
  };

  // Handlers
  const handleProgramarFerias = (colaborador: FeriasColaboradorStatus) => {
    setColaboradorSelecionado(colaborador);
    setModalProgramarOpen(true);
  };

  const handleVerHistorico = (colaborador: FeriasColaboradorStatus) => {
    // TODO: Abrir modal de histórico
    console.log('Ver histórico de:', colaborador);
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
        label: 'Dashboard',
        icon: Calendar,
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-6 py-4 md:py-5 border-b border-slate-800/50 bg-slate-950/30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-100 flex items-center gap-2">
              <Calendar size={24} className="text-violet-400" />
              Férias CLT
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-0.5">
              Gestão completa de férias de colaboradores CLT
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={loadData}
              disabled={isLoading}
              className="!px-3 !py-2 text-xs md:text-sm"
              variant="outline"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Atualizar</span>
            </Button>

            <Button
              onClick={handleCalcularPeriodos}
              disabled={isCalculating || isLoading}
              className="!px-3 !py-2 text-xs md:text-sm"
              variant="primary"
            >
              <Calendar size={14} className={isCalculating ? 'animate-pulse' : ''} />
              <span className="hidden md:inline">
                {isCalculating ? 'Calculando...' : 'Calcular Períodos'}
              </span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                shrink-0 flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all
                ${
                  activeTab === tab.id
                    ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:text-slate-300 hover:border-slate-700'
                }
              `}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
              {tab.premium && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  PRO
                </span>
              )}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] px-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-bold text-rose-400">Erro</div>
              <div className="text-xs text-rose-300/70 mt-0.5">{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-300 text-xs"
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
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <div className="flex items-start gap-3 mb-3">
                  <AlertCircle size={20} className="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-rose-400">
                      🚨 Férias Vencidas - Ação Imediata Necessária
                    </h3>
                    <p className="text-xs text-rose-300/70 mt-1">
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
                        className="p-3 rounded-lg bg-slate-900/40 border border-rose-500/20 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-200">{c.nome}</div>
                          <div className="text-xs text-slate-400">
                            {c.total_dias_saldo} dias pendentes •{' '}
                            {c.proxima_expiracao &&
                              `Venceu em ${new Date(c.proxima_expiracao).toLocaleDateString(
                                'pt-BR'
                              )}`}
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
              <h2 className="text-lg font-bold text-slate-200 mb-3">
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
            <h2 className="text-lg font-bold text-slate-200 mb-4">
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
              <h2 className="text-lg font-bold text-slate-200">
                Férias Programadas
              </h2>
              <p className="text-xs text-slate-400 mt-1">
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
          <div className="text-center py-12">
            <History size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-300 mb-2">Histórico</h3>
            <p className="text-sm text-slate-500">
              Histórico de férias e auditoria em desenvolvimento
            </p>
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
          confirmText="Sim, Cancelar"
          cancelText="Não, Manter"
          variant="danger"
        />
      )}
    </div>
  );
};
