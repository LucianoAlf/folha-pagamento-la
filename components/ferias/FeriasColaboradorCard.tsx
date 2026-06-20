import React from 'react';
import { User, Calendar, AlertCircle, Clock, CalendarCheck, Pencil } from 'lucide-react';
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
    <Card className="bg-surface/40 border border-base/50 shadow-sm hover:shadow-xl transition-all group overflow-hidden">
      {/* Header com Avatar e Info Básica */}
      <div className="p-4 border-b border-base/50 relative">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden shrink-0"
            style={{ backgroundColor: deptColor }}
          >
            {colaborador.colaborador_id === 2 || colaborador.nome?.includes('Ana Paula') ? (
              <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
            ) : colaborador.foto_url ? (
              <img src={colaborador.foto_url} alt={colaborador.nome} className="w-full h-full object-cover" />
            ) : (
              <User size={24} />
            )}
          </div>

          {/* Info Colaborador */}
          <div className="flex-1 min-w-0 pr-24">
            <h3 className="font-black text-primary truncate text-base">
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
                <span className="text-[10px] text-secondary font-bold uppercase truncate">
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
          <Calendar size={14} className="text-muted shrink-0" />
          <span className="text-secondary">Admissão:</span>
          <span className="text-secondary font-medium">
            {new Date(colaborador.data_admissao).toLocaleDateString('pt-BR')}
          </span>
        </div>

        {/* Saldo de Dias */}
        <div className="flex items-center gap-2 text-xs">
          <CalendarCheck size={14} className="text-success shrink-0" />
          <span className="text-secondary">Saldo disponível:</span>
          <span className="text-success font-bold">
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
                  ? 'text-danger'
                  : diasAteExpiracao && diasAteExpiracao <= 30
                  ? 'text-warning'
                  : 'text-info'
              }`}
            />
            <span className="text-secondary">
              Concessivo atual vence em:
            </span>
            <span
              className={`font-bold ${
                colaborador.tem_ferias_vencidas
                  ? 'text-danger'
                  : diasAteExpiracao && diasAteExpiracao <= 30
                  ? 'text-warning'
                  : 'text-info'
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
          <div className="flex items-start gap-2 p-2 rounded-lg bg-danger/10 border border-danger/30">
            <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="text-danger font-bold">CRÍTICO - Férias Vencidas</div>
              <div className="text-danger/70 text-[10px] mt-0.5">
                {colaborador.periodos_vencidos} período{colaborador.periodos_vencidos === 1 ? '' : 's'} vencido(s)
              </div>
              <div className="text-danger/70 text-[10px] mt-0.5">
                Multa: pagamento em DOBRO!
              </div>
            </div>
          </div>
        )}

        {/* Férias Programadas (se houver) */}
        {colaborador.ferias_programadas > 0 && colaborador.proximas_ferias_inicio && (
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-info/10 border border-info/30">
            <Calendar size={14} className="text-info shrink-0" />
            <div className="flex-1">
              <span className="text-secondary">Próximas férias:</span>
              <span className="text-info font-medium ml-1">
                {new Date(colaborador.proximas_ferias_inicio).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="p-3 border-t border-base/50 bg-surface/20 flex gap-2">
        <button
          onClick={() => onProgramarFerias(colaborador)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent/20 hover:bg-accent/30 border border-accent/30 rounded-xl text-accent hover:text-accent/80 text-xs font-bold transition-all active:scale-95"
        >
          <Calendar size={14} />
          Programar Férias
        </button>

        <Tooltip content="Ajustar Períodos">
          <button
            onClick={() => onVerHistorico(colaborador)}
            className="w-9 h-9 flex items-center justify-center bg-surface-2/60 hover:bg-surface-3/60 border border-strong/50 rounded-xl text-secondary hover:text-primary transition-all active:scale-95"
          >
            <Pencil size={14} />
          </button>
        </Tooltip>
      </div>
    </Card>
  );
};
