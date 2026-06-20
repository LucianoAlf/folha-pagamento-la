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
      <div className="rounded-2xl border border-base bg-surface/20 p-5 flex items-center justify-center gap-2 text-muted text-sm">
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
    <div className="rounded-2xl border border-base bg-surface/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
          Parcelamento
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="text-success">{pagas.length}/{parcelas.length} pagas</span>
          {restante > 0 && (
            <span className="text-secondary">Restante: <span className="text-primary">{formatCurrency(restante)}</span></span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-surface-2 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
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
                  ? "bg-accent/10 border border-accent/30"
                  : "hover:bg-surface-2/30"
              )}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {isPago ? (
                  <CheckCircle2 size={14} className="text-success" />
                ) : isFinalizado ? (
                  <CheckCircle2 size={14} className="text-muted" />
                ) : isVencida ? (
                  <AlertTriangle size={14} className="text-danger" />
                ) : (
                  <Clock size={14} className="text-muted" />
                )}
              </div>

              {/* Parcela number */}
              <span className={cn(
                "font-black w-8 shrink-0",
                isCurrent ? "text-accent" : "text-muted"
              )}>
                #{p.parcela_atual}
              </span>

              {/* Date */}
              <span className={cn(
                "font-bold w-16 shrink-0",
                isPago ? "text-muted" : isVencida ? "text-danger" : "text-secondary"
              )}>
                {formatDateShort(p.data_vencimento)}
              </span>

              {/* Value */}
              <span className={cn(
                "font-bold flex-1 text-right",
                isPago ? "text-muted line-through" : "text-primary"
              )}>
                {formatCurrency(Number(p.valor) || 0)}
              </span>

              {/* Status badge */}
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0",
                isPago
                  ? "bg-success/10 text-success"
                  : isFinalizado
                  ? "bg-surface-3 text-secondary"
                  : isVencida
                  ? "bg-danger/10 text-danger"
                  : "bg-surface-2 text-secondary"
              )}>
                {isPago ? 'Pago' : isFinalizado ? 'Finalizado' : isVencida ? 'Vencida' : 'Pendente'}
              </span>

              {/* Quick pay button for pending */}
              {!isPago && !isFinalizado && onPagar && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPagar(p); }}
                  className="shrink-0 text-[9px] font-black text-accent hover:text-accent/80 px-2 py-0.5 rounded-md hover:bg-accent/10 transition-colors"
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
