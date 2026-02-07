import React, { useMemo } from 'react';
import {
  Calendar,
  DollarSign,
  Edit3,
  X,
  CheckCircle,
  Clock,
  User,
  AlertCircle,
} from 'lucide-react';
import { Button, Badge } from '../UI';
import {
  FERIAS_PROGRAMACAO_STATUS_LABELS,
  FERIAS_PROGRAMACAO_STATUS_COLORS,
} from '../../types/ferias';
import type {
  FeriasProgramacao,
  FeriasColaboradorStatus,
  FeriasProgramacaoStatus,
} from '../../types';

interface FeriasProgramacoesListProps {
  programacoes: FeriasProgramacao[];
  colaboradores: FeriasColaboradorStatus[];
  onEditar: (programacao: FeriasProgramacao, colaborador: FeriasColaboradorStatus) => void;
  onCancelar: (programacao: FeriasProgramacao) => void;
  onRegistrarPagamento: (
    programacao: FeriasProgramacao,
    colaborador: FeriasColaboradorStatus
  ) => void;
  isLoading?: boolean;
}

export const FeriasProgramacoesList: React.FC<FeriasProgramacoesListProps> = ({
  programacoes,
  colaboradores,
  onEditar,
  onCancelar,
  onRegistrarPagamento,
  isLoading = false,
}) => {
  // Map colaborador ID para colaborador
  const colaboradoresMap = useMemo(() => {
    const map = new Map<number, FeriasColaboradorStatus>();
    colaboradores.forEach((c) => map.set(c.colaborador_id, c));
    return map;
  }, [colaboradores]);

  // Ordenar programações por data de início (próximas primeiro)
  const programacoesOrdenadas = useMemo(() => {
    return [...programacoes].sort((a, b) => {
      const dateA = new Date(a.data_inicio).getTime();
      const dateB = new Date(b.data_inicio).getTime();
      return dateA - dateB;
    });
  }, [programacoes]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-slate-800/30 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (programacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
          <Calendar size={32} className="text-slate-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-300 mb-1">
          Nenhuma programação encontrada
        </h3>
        <p className="text-sm text-slate-500">
          Programe férias para colaboradores CLT para visualizá-las aqui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {programacoesOrdenadas.map((prog) => {
        const colaborador = colaboradoresMap.get(prog.colaborador_id);
        if (!colaborador) return null;

        const dataInicio = new Date(prog.data_inicio);
        const dataFim = new Date(prog.data_fim);
        const dataLimitePagamento = new Date(prog.data_limite_pagamento);
        const hoje = new Date();

        const podeEditar =
          prog.status === 'programado' || prog.status === 'aprovado';
        const podeCancelar =
          prog.status === 'programado' || prog.status === 'aprovado';
        const podeRegistrarPagamento =
          (prog.status === 'aprovado' || prog.status === 'em_gozo') &&
          !prog.pagamento_efetuado;

        const statusColor =
          FERIAS_PROGRAMACAO_STATUS_COLORS[prog.status as FeriasProgramacaoStatus] ||
          'default';
        const statusLabel =
          FERIAS_PROGRAMACAO_STATUS_LABELS[prog.status as FeriasProgramacaoStatus] ||
          prog.status;

        const estaAtrasado =
          !prog.pagamento_efetuado && hoje > dataLimitePagamento;

        return (
          <div
            key={prog.id}
            className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Info Principal */}
              <div className="flex-1 space-y-3">
                {/* Header: Colaborador + Status */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-200">
                      {colaborador.nome}
                    </span>
                  </div>
                  <Badge variant={statusColor}>{statusLabel}</Badge>
                  {prog.vendeu_abono && (
                    <Badge variant="info">
                      {prog.dias_abono} dias vendidos
                    </Badge>
                  )}
                </div>

                {/* Datas */}
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-violet-400" />
                  <span className="text-sm text-slate-300">
                    {dataInicio.toLocaleDateString('pt-BR')} a{' '}
                    {dataFim.toLocaleDateString('pt-BR')}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({prog.dias_corridos} dias corridos • {prog.dias_uteis} dias
                    úteis)
                  </span>
                </div>

                {/* Pagamento */}
                <div className="flex items-start gap-2">
                  {prog.pagamento_efetuado ? (
                    <>
                      <CheckCircle size={14} className="text-emerald-400 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-emerald-400">
                          Pagamento Efetuado
                        </span>
                        <div className="text-xs text-slate-400">
                          {prog.data_pagamento &&
                            `Em ${new Date(
                              prog.data_pagamento
                            ).toLocaleDateString('pt-BR')}`}
                          {prog.valor_pagamento &&
                            ` • R$ ${prog.valor_pagamento.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Clock
                        size={14}
                        className={`${
                          estaAtrasado ? 'text-rose-400' : 'text-amber-400'
                        } mt-0.5`}
                      />
                      <div>
                        <span
                          className={`text-xs font-bold ${
                            estaAtrasado ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {estaAtrasado
                            ? '🚨 Pagamento Atrasado!'
                            : 'Aguardando Pagamento'}
                        </span>
                        <div className="text-xs text-slate-400">
                          Prazo: até {dataLimitePagamento.toLocaleDateString('pt-BR')}
                          {estaAtrasado && ' (vencido)'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Observações */}
                {prog.observacoes && (
                  <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700">
                    <div className="text-xs text-slate-400">
                      💬 {prog.observacoes}
                    </div>
                  </div>
                )}

                {/* Alerta de Pagamento Atrasado */}
                {estaAtrasado && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
                    <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-300/70">
                      O prazo de pagamento venceu. Registre o pagamento ou verifique
                      se houve atraso.
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col gap-2 shrink-0">
                {podeEditar && (
                  <Button
                    onClick={() => onEditar(prog, colaborador)}
                    variant="outline"
                    className="!text-xs !py-1.5 !px-3 whitespace-nowrap"
                  >
                    <Edit3 size={12} />
                    <span className="hidden md:inline">Editar</span>
                  </Button>
                )}

                {podeRegistrarPagamento && (
                  <Button
                    onClick={() => onRegistrarPagamento(prog, colaborador)}
                    variant="primary"
                    className="!text-xs !py-1.5 !px-3 whitespace-nowrap"
                  >
                    <DollarSign size={12} />
                    <span className="hidden md:inline">Pagar</span>
                  </Button>
                )}

                {podeCancelar && (
                  <Button
                    onClick={() => onCancelar(prog)}
                    variant="danger"
                    className="!text-xs !py-1.5 !px-3 whitespace-nowrap"
                  >
                    <X size={12} />
                    <span className="hidden md:inline">Cancelar</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
