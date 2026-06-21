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
  Briefcase,
  Clock,
} from 'lucide-react';
import { Button, Badge, CustomSelect } from '../UI';
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
      <div className="p-4 md:p-6 rounded-xl bg-gradient-to-br from-warning/10 to-accent/10 border border-warning/30">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-warning/20 border border-warning/30 flex items-center justify-center shrink-0">
            <Sparkles size={24} className="text-warning" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black text-primary">
              Insights de IA
            </h2>
            <p className="text-sm text-secondary mt-1">
              Análise inteligente para otimizar distribuição de férias e evitar multas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Período */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 px-1">
              Período de Referência
            </label>
            <CustomSelect
              value={periodoReferencia}
              onValueChange={setPeriodoReferencia}
              icon={Clock}
              options={[
                { value: '2025-Q1', label: 'Q1/2025 (Jan-Mar)' },
                { value: '2025-Q2', label: 'Q2/2025 (Abr-Jun)' },
                { value: '2025-Q3', label: 'Q3/2025 (Jul-Set)' },
                { value: '2025-Q4', label: 'Q4/2025 (Out-Dez)' },
                { value: '2026-Q1', label: 'Q1/2026 (Jan-Mar)' },
              ]}
              className="bg-bg/40 border-line/60"
            />
          </div>

          {/* Departamento */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 px-1">
              Departamento
            </label>
            <CustomSelect
              value={departamento}
              onValueChange={setDepartamento}
              icon={Briefcase}
              options={[
                { value: '', label: 'Todos' },
                { value: 'staff_rateado', label: 'Staff' },
                { value: 'equipe_operacional', label: 'Operacional' },
                { value: 'professores', label: 'Professores' },
              ]}
              className="bg-bg/40 border-line/60"
            />
          </div>

          {/* Botão Gerar */}
          <div className="flex items-end">
            <Button
              onClick={() => handleGerarAnalise(false)}
              disabled={isLoading}
              variant="primary"
              className="w-full !bg-gradient-to-r !from-warning !to-accent hover:!from-warning/90 hover:!to-accent/90 !py-3 font-black uppercase tracking-widest text-[11px]"
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
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>
              {isCached ? '📦 Cache' : '✨ Nova análise'} •{' '}
              {new Date(generatedAt).toLocaleString('pt-BR')}
            </span>
            {isCached && (
              <button
                onClick={() => handleGerarAnalise(true)}
                className="text-warning hover:text-warning/80 flex items-center gap-1"
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
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-danger">Erro</div>
            <div className="text-xs text-danger/70 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Conteúdo dos Insights */}
      {insights && (
        <div className="space-y-6">
          {/* Análise Executiva */}
          <div className="p-5 rounded-xl bg-surface/40 border border-line">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} className="text-accent" />
              <h3 className="text-sm font-black text-secondary">Análise Executiva</h3>
            </div>
            <p className="text-sm text-secondary leading-relaxed">
              {insights.analise_executiva}
            </p>
          </div>

          {/* Situações Críticas */}
          {insights.situacoes_criticas && insights.situacoes_criticas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-secondary flex items-center gap-2">
                <AlertTriangle size={18} className="text-danger" />
                Situações Críticas ({insights.situacoes_criticas.length})
              </h3>

              {insights.situacoes_criticas.map((situacao, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-surface/40 border border-line hover:border-line-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-secondary">
                          {situacao.colaborador_nome}
                        </span>
                        <Badge variant={getSeveridadeColor(situacao.severidade)}>
                          {situacao.severidade.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-secondary">{situacao.tipo}</div>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <div>{situacao.dias_saldo} dias</div>
                      <div>
                        até{' '}
                        {new Date(situacao.prazo_limite).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-secondary mb-1">Descrição:</div>
                    <div className="text-sm text-secondary">{situacao.descricao}</div>
                  </div>

                  <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
                    <div className="text-xs font-bold text-accent mb-1">
                      ⚡ Ação Imediata:
                    </div>
                    <div className="text-sm text-secondary">{situacao.acao_imediata}</div>
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
                <h3 className="text-sm font-black text-secondary flex items-center gap-2">
                  <Calendar size={18} className="text-accent" />
                  Sugestões de Distribuição ({insights.sugestoes_distribuicao.length})
                </h3>

                {insights.sugestoes_distribuicao.map((sugestao, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-surface/40 border border-line hover:border-line-strong transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-secondary">
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
                      <div className="flex items-center gap-2 text-secondary">
                        <Calendar size={14} className="text-accent" />
                        <span className="font-bold">
                          {new Date(
                            sugestao.periodo_sugerido_inicio
                          ).toLocaleDateString('pt-BR')}{' '}
                          a{' '}
                          {new Date(
                            sugestao.periodo_sugerido_fim
                          ).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-muted">
                          ({sugestao.dias_sugeridos} dias)
                        </span>
                      </div>

                      <div className="text-xs text-secondary leading-relaxed">
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
            <div className="p-5 rounded-xl bg-surface/40 border border-line">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-success" />
                <h3 className="text-sm font-black text-secondary">Impacto Financeiro</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
                  <div className="text-xs text-accent mb-1">Férias Programadas</div>
                  <div className="text-lg font-black text-primary">
                    R${' '}
                    {insights.impacto_financeiro.custo_ferias_programadas_estimado.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30">
                  <div className="text-xs text-danger mb-1">Multas Potenciais</div>
                  <div className="text-lg font-black text-primary">
                    R${' '}
                    {insights.impacto_financeiro.custo_multas_potenciais.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                  <div className="text-xs text-success mb-1">
                    Economia Planejamento
                  </div>
                  <div className="text-lg font-black text-primary">
                    R${' '}
                    {insights.impacto_financeiro.economia_planejamento.toLocaleString(
                      'pt-BR',
                      { minimumFractionDigits: 2 }
                    )}
                  </div>
                </div>
              </div>

              {insights.impacto_financeiro.observacoes && (
                <div className="text-xs text-secondary leading-relaxed">
                  {insights.impacto_financeiro.observacoes}
                </div>
              )}
            </div>
          )}

          {/* Distribuição por Departamento */}
          {insights.distribuicao_departamentos && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-secondary flex items-center gap-2">
                <Users size={18} className="text-info" />
                Distribuição por Departamento
              </h3>

              {Object.entries(insights.distribuicao_departamentos).map(
                ([dept, info]) => (
                  <div
                    key={dept}
                    className="p-4 rounded-xl bg-surface/40 border border-line"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-secondary capitalize">
                        {dept.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-muted">
                        {info.com_ferias_pendentes} de {info.total} com férias pendentes
                      </span>
                    </div>
                    <div className="text-xs text-secondary leading-relaxed">
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
              <div className="p-5 rounded-xl bg-surface/40 border border-line">
                <h3 className="text-sm font-black text-secondary mb-3">
                  📋 Recomendações Operacionais
                </h3>
                <ul className="space-y-2">
                  {insights.recomendacoes_operacionais.map((rec, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-secondary"
                    >
                      <CheckCircle size={14} className="text-success shrink-0 mt-0.5" />
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
          <div className="w-16 h-16 rounded-2xl bg-warning/20 border border-warning/30 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={32} className="text-warning" />
          </div>
          <h3 className="text-lg font-bold text-secondary mb-2">
            Gere Insights Inteligentes
          </h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Configure os filtros acima e clique em "Gerar Análise" para receber
            recomendações personalizadas baseadas em IA
          </p>
        </div>
      )}
    </div>
  );
};
