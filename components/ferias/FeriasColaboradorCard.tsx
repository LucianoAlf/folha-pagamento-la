import React from 'react';
import { User, Calendar, AlertCircle, Clock, CalendarCheck, ChevronRight } from 'lucide-react';
import { Card, Badge, Tooltip } from '../UI';
import type { FeriasColaboradorStatus } from '../../types';
import {
  FERIAS_STATUS_GERAL_LABELS,
  FERIAS_STATUS_GERAL_COLORS,
} from '../../types/ferias';

const DEPARTMENT_COLORS: Record<string, string> = {
  staff_rateado: '#8b5cf6',
  equipe_operacional: '#f59e0b',
  professores: '#10b981',
};

const DEPARTMENT_LABELS: Record<string, string> = {
  staff_rateado: 'Staff',
  equipe_operacional: 'Operacional',
  professores: 'Professor',
};

interface FeriasColaboradorCardProps {
  colaborador: FeriasColaboradorStatus;
  onProgramarFerias: (colaborador: FeriasColaboradorStatus) => void;
  onVerHistorico: (colaborador: FeriasColaboradorStatus) => void;
  isMobile?: boolean;
}

export const FeriasColaboradorCard: React.FC<FeriasColaboradorCardProps> = ({
  colaborador,
  onProgramarFerias,
  onVerHistorico,
  isMobile = false,
}) => {
  const deptColor = DEPARTMENT_COLORS[colaborador.departamento] || '#64748b';
  const statusColor = FERIAS_STATUS_GERAL_COLORS[colaborador.status_ferias];

  // Calcular dias até próxima expiração
  const diasAteExpiracao = colaborador.proxima_expiracao
    ? Math.ceil(
        (new Date(colaborador.proxima_expiracao).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <Card className="bg-[#0f172a]/40 border border-slate-800/50 shadow-sm hover:shadow-xl transition-all group overflow-hidden">
      {/* Header com Avatar e Info Básica */}
      <div className="p-4 border-b border-slate-800/50 relative">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden shrink-0"
            style={{ backgroundColor: deptColor }}
          >
            {colaborador.id === 2 || colaborador.nome?.includes('Ana Paula') ? (
              <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
            ) : colaborador.foto_url ? (
              <img src={colaborador.foto_url} alt={colaborador.nome} className="w-full h-full object-cover" />
            ) : (
              <User size={24} />
            )}
          </div>

          {/* Info Colaborador */}
          <div className="flex-1 min-w-0 pr-24">
            <h3 className="font-black text-slate-100 truncate text-base">
              {colaborador.nome}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg"
                style={{ backgroundColor: `${deptColor}20`, color: deptColor }}
              >
                {DEPARTMENT_LABELS[colaborador.departamento] || colaborador.departamento}
              </span>
              {colaborador.funcao && (
                <span className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  • {colaborador.funcao}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge (Top Right) */}
        <div className="absolute right-3 top-4">
          <Badge variant={statusColor as any}>
            {FERIAS_STATUS_GERAL_LABELS[colaborador.status_ferias]}
          </Badge>
        </div>
      </div>

      {/* Body com Informações de Férias */}
      <div className="p-4 space-y-3">
        {/* Data de Admissão */}
        <div className="flex items-center gap-2 text-xs">
          <Calendar size={14} className="text-slate-500 shrink-0" />
          <span className="text-slate-400">Admissão:</span>
          <span className="text-slate-300 font-medium">
            {new Date(colaborador.data_admissao).toLocaleDateString('pt-BR')}
          </span>
        </div>

        {/* Saldo de Dias */}
        <div className="flex items-center gap-2 text-xs">
          <CalendarCheck size={14} className="text-emerald-500 shrink-0" />
          <span className="text-slate-400">Saldo disponível:</span>
          <span className="text-emerald-400 font-bold">
            {colaborador.total_dias_saldo || 0} dias
          </span>
        </div>

        {/* Próxima Expiração (se houver) */}
        {colaborador.proxima_expiracao && (
          <div className="flex items-center gap-2 text-xs">
            <Clock
              size={14}
              className={`shrink-0 ${
                colaborador.tem_ferias_vencidas
                  ? 'text-rose-500'
                  : diasAteExpiracao && diasAteExpiracao <= 30
                  ? 'text-amber-500'
                  : 'text-cyan-500'
              }`}
            />
            <span className="text-slate-400">
              {colaborador.tem_ferias_vencidas ? 'Venceu em:' : 'Vence em:'}
            </span>
            <span
              className={`font-bold ${
                colaborador.tem_ferias_vencidas
                  ? 'text-rose-400'
                  : diasAteExpiracao && diasAteExpiracao <= 30
                  ? 'text-amber-400'
                  : 'text-cyan-400'
              }`}
            >
              {new Date(colaborador.proxima_expiracao).toLocaleDateString('pt-BR')}
              {diasAteExpiracao !== null &&
                !colaborador.tem_ferias_vencidas &&
                ` (${diasAteExpiracao}d)`}
            </span>
          </div>
        )}

        {/* Alerta Crítico (Férias Vencidas) */}
        {colaborador.tem_ferias_vencidas && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="text-rose-400 font-bold">CRÍTICO - Férias Vencidas</div>
              <div className="text-rose-300/70 text-[10px] mt-0.5">
                Multa: pagamento em DOBRO!
              </div>
            </div>
          </div>
        )}

        {/* Férias Programadas (se houver) */}
        {colaborador.ferias_programadas > 0 && colaborador.proximas_ferias_inicio && (
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
            <Calendar size={14} className="text-cyan-400 shrink-0" />
            <div className="flex-1">
              <span className="text-slate-400">Próximas férias:</span>
              <span className="text-cyan-400 font-medium ml-1">
                {new Date(colaborador.proximas_ferias_inicio).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="p-3 border-t border-slate-800/50 bg-slate-900/20 flex gap-2">
        <button
          onClick={() => onProgramarFerias(colaborador)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-xl text-violet-400 hover:text-violet-300 text-xs font-bold transition-all active:scale-95"
        >
          <Calendar size={14} />
          Programar Férias
        </button>

        <Tooltip content="Ver Histórico">
          <button
            onClick={() => onVerHistorico(colaborador)}
            className="w-9 h-9 flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl text-slate-400 hover:text-slate-300 transition-all active:scale-95"
          >
            <ChevronRight size={14} />
          </button>
        </Tooltip>
      </div>
    </Card>
  );
};
