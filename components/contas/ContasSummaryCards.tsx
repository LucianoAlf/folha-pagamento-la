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
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      <Card className="p-6 border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock size={18} className="animate-pulse" />
            </div>
            <div className="text-sm font-bold text-slate-200">Vencendo hoje</div>
          </div>
        </div>
        <div className="mt-4 text-xl sm:text-2xl lg:text-3xl font-black text-white truncate">{formatCurrency(vencendoHoje.total)}</div>
        <div className="mt-2 text-xs text-amber-400 font-bold">{vencendoHoje.count} contas para pagar agora</div>
      </Card>

      <Card className="p-6 border border-rose-500/20">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
            <div className="text-sm font-bold text-slate-300">Vencidas</div>
          </div>
        </div>
        <div className="mt-4 text-xl sm:text-2xl lg:text-3xl font-black text-white truncate">{formatCurrency(vencidas.total)}</div>
        <div className="mt-2 text-xs text-rose-400 font-bold">{vencidas.count} contas</div>
      </Card>

      <Card className="p-6 border border-amber-500/20">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Clock size={18} />
            </div>
            <div className="text-sm font-bold text-slate-300">Próximos 7 dias</div>
          </div>
        </div>
        <div className="mt-4 text-xl sm:text-2xl lg:text-3xl font-black text-white truncate">{formatCurrency(proximos7.total)}</div>
        <div className="mt-2 text-xs text-amber-400 font-bold">{proximos7.count} contas</div>
      </Card>

      <Card className="p-6 border border-slate-700/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div className="text-sm font-bold text-slate-300">Próximos 30 dias</div>
          </div>
        </div>
        <div className="mt-4 text-xl sm:text-2xl lg:text-3xl font-black text-white truncate">{formatCurrency(proximos30.total)}</div>
        <div className="mt-2 text-xs text-slate-400 font-bold">{proximos30.count} contas</div>
      </Card>
    </div>
  );
};

