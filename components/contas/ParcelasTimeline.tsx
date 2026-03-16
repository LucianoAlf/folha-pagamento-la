import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { fetchParcelasIrmas, getStatusVisual } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';

const formatDateShort = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

export const ParcelasTimeline: React.FC<{
  conta: ContaPagar;
  onPagar?: (c: ContaPagar) => void;
}> = ({ conta, onPagar }) => {
  const [parcelas, setParcelas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchParcelasIrmas(conta)
      .then((data) => { if (!cancelled) setParcelas(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conta.id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5 flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Carregando parcelas...
      </div>
    );
  }

  if (parcelas.length === 0) return null;

  const pagas = parcelas.filter((p) => p.status === 'pago');
  const pendentes = parcelas.filter((p) => p.status === 'pendente');
  const restante = pendentes.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          Parcelamento
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="text-emerald-400">{pagas.length}/{parcelas.length} pagas</span>
          {restante > 0 && (
            <span className="text-slate-400">Restante: <span className="text-white">{formatCurrency(restante)}</span></span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-800 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(pagas.length / parcelas.length) * 100}%` }}
        />
      </div>

      {/* Parcela list */}
      <div className="max-h-[240px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
        {parcelas.map((p) => {
          const isCurrent = p.id === conta.id;
          const sv = getStatusVisual(p);
          const isPago = p.status === 'pago';
          const isFinalizado = p.status === 'finalizado';
          const isVencida = sv === 'vencida';

          return (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors",
                isCurrent
                  ? "bg-violet-500/10 border border-violet-500/30"
                  : "hover:bg-slate-800/30"
              )}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {isPago ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : isFinalizado ? (
                  <CheckCircle2 size={14} className="text-slate-500" />
                ) : isVencida ? (
                  <AlertTriangle size={14} className="text-rose-400" />
                ) : (
                  <Clock size={14} className="text-slate-500" />
                )}
              </div>

              {/* Parcela number */}
              <span className={cn(
                "font-black w-8 shrink-0",
                isCurrent ? "text-violet-400" : "text-slate-500"
              )}>
                #{p.parcela_atual}
              </span>

              {/* Date */}
              <span className={cn(
                "font-bold w-16 shrink-0",
                isPago ? "text-slate-500" : isVencida ? "text-rose-400" : "text-slate-400"
              )}>
                {formatDateShort(p.data_vencimento)}
              </span>

              {/* Value */}
              <span className={cn(
                "font-bold flex-1 text-right",
                isPago ? "text-slate-500 line-through" : "text-white"
              )}>
                {formatCurrency(Number(p.valor) || 0)}
              </span>

              {/* Status badge */}
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0",
                isPago
                  ? "bg-emerald-500/10 text-emerald-400"
                  : isFinalizado
                  ? "bg-slate-700 text-slate-400"
                  : isVencida
                  ? "bg-rose-500/10 text-rose-400"
                  : "bg-slate-800 text-slate-400"
              )}>
                {isPago ? 'Pago' : isFinalizado ? 'Finalizado' : isVencida ? 'Vencida' : 'Pendente'}
              </span>

              {/* Quick pay button for pending */}
              {!isPago && !isFinalizado && onPagar && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPagar(p); }}
                  className="shrink-0 text-[9px] font-black text-violet-400 hover:text-violet-300 px-2 py-0.5 rounded-md hover:bg-violet-500/10 transition-colors"
                >
                  Pagar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
