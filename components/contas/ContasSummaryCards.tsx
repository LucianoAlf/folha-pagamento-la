import React from 'react';
import { AlertTriangle, Clock, Calendar } from 'lucide-react';
import { Card } from '../UI';
import { formatCurrency } from '../../services/api';

export const ContasSummaryCards: React.FC<{
  vencendoHoje: { total: number; count: number };
  vencidas: { total: number; count: number };
  proximos7: { total: number; count: number };
  proximos30: { total: number; count: number };
}> = ({ vencendoHoje, vencidas, proximos7, proximos30 }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-2">
      <Card className="p-6 border border-warning/30 bg-warning/5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning flex items-center justify-center">
              <Clock size={18} className="animate-pulse" />
            </div>
            <div className="text-sm font-bold text-secondary">Vencendo hoje</div>
          </div>
        </div>
        <div className="mt-4 text-base md:text-2xl font-bold text-primary truncate">{formatCurrency(vencendoHoje.total)}</div>
        <div className="mt-2 text-xs text-warning font-bold">{vencendoHoje.count} contas para pagar agora</div>
      </Card>

      <Card className="p-6 border border-danger/20">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
            <div className="text-sm font-bold text-secondary">Vencidas</div>
          </div>
        </div>
        <div className="mt-4 text-base md:text-2xl font-bold text-primary truncate">{formatCurrency(vencidas.total)}</div>
        <div className="mt-2 text-xs text-danger font-bold">{vencidas.count} contas</div>
      </Card>

      <Card className="p-6 border border-warning/20">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center">
              <Clock size={18} />
            </div>
            <div className="text-sm font-bold text-secondary">Próximos 7 dias</div>
          </div>
        </div>
        <div className="mt-4 text-base md:text-2xl font-bold text-primary truncate">{formatCurrency(proximos7.total)}</div>
        <div className="mt-2 text-xs text-warning font-bold">{proximos7.count} contas</div>
      </Card>

      <Card className="p-6 border border-line-strong/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-2/60 text-secondary flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div className="text-sm font-bold text-secondary">Próximos 30 dias</div>
          </div>
        </div>
        <div className="mt-4 text-base md:text-2xl font-bold text-primary truncate">{formatCurrency(proximos30.total)}</div>
        <div className="mt-2 text-xs text-secondary font-bold">{proximos30.count} contas</div>
      </Card>
    </div>
  );
};

