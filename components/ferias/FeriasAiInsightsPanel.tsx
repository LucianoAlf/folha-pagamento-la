import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  Users,
  CheckCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button, Badge } from '../UI';
import { feriasService } from '../../services/feriasService';
import type { FeriasAiInsightsJson, FeriasColaboradorStatus } from '../../types';

interface FeriasAiInsightsPanelProps {
  colaboradores: FeriasColaboradorStatus[];
  onProgramarFerias: (colaborador: FeriasColaboradorStatus) => void;
}

export const FeriasAiInsightsPanel: React.FC<FeriasAiInsightsPanelProps> = ({
  colaboradores,
  onProgramarFerias,
}) => {
  const [insights, setInsights] = useState<FeriasAiInsightsJson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [periodoReferencia, setPeriodoReferencia] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-Q${Math.ceil((hoje.getMonth() + 1) / 3)}`;
  });
  const [departamento, setDepartamento] = useState<string>('');

  const handleGerarAnalise = async (force = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await feriasService.gerarInsightsIA({
        periodoReferencia,
        departamento: departamento || undefined,
        force,
      });

      setInsights(result.data);
      setGeneratedAt(result.generatedAt);
      setIsCached(result.cached);
    } catch (err: any) {
      console.error('Erro ao gerar insights:', err);
      setError(err.message || 'Erro ao gerar análise de IA');
    } finally {
      setIsLoading(false);
    }
  };

  const getSeveridadeColor = (severidade: string) => {
    switch (severidade) {
      case 'critica':
        return 'danger';
      case 'alta':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'alta':
        return 'danger';
      case 'media':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getPeriodoIdealEmoji = (periodo: string) => {
    switch (periodo) {
      case 'ferias_fim_ano':
        return '🎄';
      case 'carnaval':
        return '🎭';
      case 'julho':
        return '❄️';
      default:
        return '📅';
    }
  };

  const getPeriodoIdealLabel = (periodo: string) => {
    switch (periodo) {
      case 'ferias_fim_ano':
        return 'Fim de Ano';
      case 'carnaval':
        return 'Carnaval';
      case 'julho':
        return 'Julho';
      default:
        return 'Outro';
    }
  };

  const handleAceitarSugestao = (sugestao: any) => {
    const colaborador = colaboradores.find(
      (c) => c.colaborador_id === sugestao.colaborador_id
    );
    if (colaborador) {
      onProgramarFerias(colaborador);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Filtros */}
      <div className="p-4 md:p-6 rounded-xl bg-gradient-to-br from-amber-500/10 to-violet-500/10 border border-amber-500/30">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Sparkles size={24} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              Insights de IA
              <Badge variant="warning">PREMIUM</Badge>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Análise inteligente para otimizar distribuição de férias e evitar multas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Período */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">
              Período de Referência
            </label>
            <select
              value={periodoReferencia}
              onChange={(e) => setPeriodoReferencia(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
            >
              <option value="2025-Q1">Q1/2025 (Jan-Mar)</option>
              <option value="2025-Q2">Q2/2025 (Abr-Jun)</option>
              <option value="2025-Q3">Q3/2025 (Jul-Set)</option>
              <option value="2025-Q4">Q4/2025 (Out-Dez)</option>
              <option value="2026-Q1">Q1/2026 (Jan-Mar)</option>
            </select>
          </div>

          {/* Departamento */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">
              Departamento
            </label>
            <select
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
            >
              <option value="">Todos</option>
              <option value="staff_rateado">Staff</option>
              <option value="equipe_operacional">Operacional</option>
              <option value="professores">Professores</option>
            </select>
          </div>

          {/* Botão Gerar */}
          <div className="flex items-end">
            <Button
              onClick={() => handleGerarAnalise(false)}
              disabled={isLoading}
              variant="primary"
              className="w-full !bg-gradient-to-r !from-amber-500 !to-violet-500 hover:!from-amber-600 hover:!to-violet-600"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Gerar Análise
                </>
              )}
            </Button>
          </div>
        </div>

        {generatedAt && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {isCached ? '📦 Cache' : '✨ Nova análise'} •{' '}
              {new Date(generatedAt).toLocaleString('pt-BR')}
            </span>
            {isCached && (
              <button
                onClick={() => handleGerarAnalise(true)}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                <RefreshCw size={12} />
                Forçar Atualização
              </button>
            )}
          </div>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
          <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-rose-400">Erro</div>
            <div className="text-xs text-rose-300/70 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Conteúdo dos Insights */}
      {insights && (
        <div className="space-y-6">
          {/* Análise Executiva */}
          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} className="text-violet-400" />
              <h3 className="text-sm font-black text-slate-200">Análise Executiva</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {insights.analise_executiva}
            </p>
          </div>

          {/* Situações Críticas */}
          {insights.situacoes_criticas && insights.situacoes_criticas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-400" />
                Situações Críticas ({insights.situacoes_criticas.length})
              </h3>

              {insights.situacoes_criticas.map((situacao, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-200">
                          {situacao.colaborador_nome}
                        </span>
                        <Badge variant={getSeveridadeColor(situacao.severidade)}>
                          {situacao.severidade.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400">{situacao.tipo}</div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{situacao.dias_saldo} dias</div>
                      <div>
                        até{' '}
                        {new Date(situacao.prazo_limite).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-slate-400 mb-1">Descrição:</div>
                    <div className="text-sm text-slate-300">{situacao.descricao}</div>
                  </div>

                  <div className="p-3 rounded-lg bg-violet-600/10 border border-violet-500/30">
                    <div className="text-xs font-bold text-violet-400 mb-1">
                      ⚡ Ação Imediata:
                    </div>
                    <div className="text-sm text-slate-300">{situacao.acao_imediata}</div>
                  </div>

                  <Button
                    onClick={() => {
                      const colab = colaboradores.find(
                        (c) => c.colaborador_id === situacao.colaborador_id
                      );
                      if (colab) onProgramarFerias(colab);
                    }}
                    variant="primary"
                    className="!text-xs !py-1.5 !px-3 mt-3"
                  >
                    Programar Agora
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Sugestões de Distribuição */}
          {insights.sugestoes_distribuicao &&
            insights.sugestoes_distribuicao.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                  <Calendar size={18} className="text-violet-400" />
                  Sugestões de Distribuição ({insights.sugestoes_distribuicao.length})
                </h3>

                {insights.sugestoes_distribuicao.map((sugestao, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-slate-200">
                            {sugestao.colaborador_nome}
                          </span>
                          <Badge variant={getPrioridadeColor(sugestao.prioridade)}>
                            {sugestao.prioridade}
                          </Badge>
                          <Badge variant="info">
                            {getPeriodoIdealEmoji(sugestao.periodo_ideal)}{' '}
                            {getPeriodoIdealLabel(sugestao.periodo_ideal)}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Calendar size={14} className="text-violet-400" />
                        <span className="font-bold">
                          {new Date(
                            sugestao.periodo_sugerido_inicio
                          ).toLocaleDateString('pt-BR')}{' '}
                          a{' '}
                          {new Date(
                            sugestao.periodo_sugerido_fim
                          ).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-slate-500">
                          ({sugestao.dias_sugeridos} dias)
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 leading-relaxed">
                        {sugestao.justificativa}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleAceitarSugestao(sugestao)}
                      variant="outline"
                      className="!text-xs !py-1.5 !px-3"
                    >
                      <CheckCircle size={12} />
                      Aceitar Sugestão
                    </Button>
                  </div>
                ))}
              </div>
            )}

          {/* Impacto Financeiro */}
          {insights.impacto_financeiro && (
            <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-emerald-400" />
                <h3 className="text-sm font-black text-slate-200">Impacto Financeiro</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-violet-600/10 border border-violet-500/30">
                  <div className="text-xs text-violet-400 mb-1">Férias Programadas</div>
                  <div className="text-lg font-black text-slate-100">
                    R${' '}
                    {insights.impacto_financeiro.custo_ferias_programadas_estimado.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-rose-600/10 border border-rose-500/30">
                  <div className="text-xs text-rose-400 mb-1">Multas Potenciais</div>
                  <div className="text-lg font-black text-slate-100">
                    R${' '}
                    {insights.impacto_financeiro.custo_multas_potenciais.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-600/10 border border-emerald-500/30">
                  <div className="text-xs text-emerald-400 mb-1">
                    Economia Planejamento
                  </div>
                  <div className="text-lg font-black text-slate-100">
                    R${' '}
                    {insights.impacto_financeiro.economia_planejamento.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>
              </div>

              {insights.impacto_financeiro.observacoes && (
                <div className="text-xs text-slate-400 leading-relaxed">
                  {insights.impacto_financeiro.observacoes}
                </div>
              )}
            </div>
          )}

          {/* Distribuição por Departamento */}
          {insights.distribuicao_departamentos && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                <Users size={18} className="text-cyan-400" />
                Distribuição por Departamento
              </h3>

              {Object.entries(insights.distribuicao_departamentos).map(
                ([dept, info]) => (
                  <div
                    key={dept}
                    className="p-4 rounded-xl bg-slate-900/40 border border-slate-800"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-200 capitalize">
                        {dept.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-slate-500">
                        {info.com_ferias_pendentes} de {info.total} com férias pendentes
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed">
                      💡 {info.sugestao}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Recomendações Operacionais */}
          {insights.recomendacoes_operacionais &&
            insights.recomendacoes_operacionais.length > 0 && (
              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
                <h3 className="text-sm font-black text-slate-200 mb-3">
                  📋 Recomendações Operacionais
                </h3>
                <ul className="space-y-2">
                  {insights.recomendacoes_operacionais.map((rec, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-slate-300"
                    >
                      <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      {/* Estado Vazio */}
      {!insights && !isLoading && !error && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={32} className="text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-300 mb-2">
            Gere Insights Inteligentes
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Configure os filtros acima e clique em "Gerar Análise" para receber
            recomendações personalizadas baseadas em IA
          </p>
        </div>
      )}
    </div>
  );
};
