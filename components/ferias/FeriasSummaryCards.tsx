import React from 'react';
import { Users, AlertCircle, Clock, Calendar, CalendarDays } from 'lucide-react';
import { KPICard } from '../DashboardWidgets';
import type { FeriasColaboradorStatus } from '../../types';

interface FeriasSummaryCardsProps {
  colaboradores: FeriasColaboradorStatus[];
  isLoading?: boolean;
}

export const FeriasSummaryCards: React.FC<FeriasSummaryCardsProps> = ({
  colaboradores,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 md:h-28 rounded-xl bg-slate-800/30 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Calcular métricas
  const totalColaboradores = colaboradores.length;

  const feriasVencidas = colaboradores.filter((c) => c.tem_ferias_vencidas).length;

  const proximasVencer60d = colaboradores.filter((c) => {
    if (!c.proxima_expiracao || c.tem_ferias_vencidas) return false;
    const expiracao = new Date(c.proxima_expiracao);
    const hoje = new Date();
    const diffDias = Math.ceil((expiracao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias >= 0 && diffDias <= 60;
  }).length;

  const feriasProgramadas = colaboradores.reduce(
    (sum, c) => sum + (c.ferias_programadas || 0),
    0
  );

  const totalDiasPendentes = colaboradores.reduce(
    (sum, c) => sum + (c.total_dias_saldo || 0),
    0
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
      {/* Total Colaboradores CLT */}
      <KPICard
        icon={Users}
        label="Colaboradores CLT"
        value={totalColaboradores}
        variant="violet"
      />

      {/* Férias Vencidas (CRÍTICO) */}
      <KPICard
        icon={AlertCircle}
        label="Férias Vencidas"
        value={feriasVencidas}
        variant="rose"
        trend={feriasVencidas > 0 ? 'up' : undefined}
        trendValue={feriasVencidas > 0 ? 'CRÍTICO' : undefined}
        subvalue={feriasVencidas > 0 ? 'Multa em dobro!' : 'Tudo OK'}
      />

      {/* Próximas a Vencer (60 dias) */}
      <KPICard
        icon={Clock}
        label="Próximas a Vencer"
        value={proximasVencer60d}
        variant="amber"
        subvalue="Próximos 60 dias"
      />

      {/* Férias Programadas */}
      <KPICard
        icon={Calendar}
        label="Férias Programadas"
        value={feriasProgramadas}
        variant="cyan"
        subvalue="Próximos meses"
      />

      {/* Total Dias Pendentes */}
      <KPICard
        icon={CalendarDays}
        label="Dias Pendentes"
        value={totalDiasPendentes}
        variant="emerald"
        subvalue={`${Math.round(totalDiasPendentes / 30)} meses`}
      />
    </div>
  );
};
