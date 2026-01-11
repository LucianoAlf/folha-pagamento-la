import React, { useMemo } from 'react';
import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import { ContaPagar } from '../../types/contasPagar';
import { getStatusVisual } from '../../services/contasPagarService';
import { Tooltip } from '../UI';

type Props = {
  year: number;
  month: number; // 1-12
  contas: ContaPagar[];
  selectedDate?: string; // yyyy-mm-dd
  onSelectDate: (iso?: string) => void;
  onCreateForDate?: (iso: string) => void;
};

function toISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function ContasCalendar({ year, month, contas, selectedDate, onSelectDate, onCreateForDate }: Props) {
  const monthStart = useMemo(() => startOfMonth(new Date(year, month - 1, 1)), [year, month]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart]);

  const days = useMemo(() => {
    // 6 semanas (42 dias) para manter o layout estável
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [gridStart]);

  const statsByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        count: number;
        pagoTotal: number;
        pendenteTotal: number;
        vencidaTotal: number;
        status: 'pago' | 'pendente' | 'vencida' | 'nenhum';
      }
    >();
    for (const c of contas) {
      if (!c.data_vencimento) continue;
      const key = c.data_vencimento;
      const prev =
        map.get(key) || { total: 0, count: 0, pagoTotal: 0, pendenteTotal: 0, vencidaTotal: 0, status: 'nenhum' as const };
      const v = Number(c.valor) || 0;
      prev.total += v;
      prev.count += 1;

      if (c.status === 'pago') prev.pagoTotal += v;
      else {
        const visual = getStatusVisual(c);
        if (visual === 'vencida') prev.vencidaTotal += v;
        else prev.pendenteTotal += v;
      }

      // prioridade semáforo: vencida > pendente > pago
      if (prev.vencidaTotal > 0) prev.status = 'vencida';
      else if (prev.pendenteTotal > 0) prev.status = 'pendente';
      else if (prev.pagoTotal > 0) prev.status = 'pago';
      else prev.status = 'nenhum';
      map.set(key, prev);
    }
    return map;
  }, [contas]);

  const maxTotal = useMemo(() => {
    let m = 0;
    statsByDay.forEach((v) => {
      if (v.total > m) m = v.total;
    });
    return m;
  }, [statsByDay]);

  const weekDays = useMemo(() => {
    // DOM…SAB
    const labels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return labels;
  }, []);

  const monthLabel = useMemo(() => {
    return format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
  }, [monthStart]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-black text-white">{monthLabel}</div>
        {selectedDate ? (
          <button
            type="button"
            onClick={() => onSelectDate(undefined)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-200 transition-colors"
          >
            Limpar seleção
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((wd) => (
          <div key={wd} className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-2">
            {wd}
          </div>
        ))}

        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = isSameMonth(d, monthStart);
          const stats = statsByDay.get(iso);
          const isSelected = !!selectedDate && selectedDate === iso;

          const intensity = stats && maxTotal > 0 ? Math.min(1, stats.total / maxTotal) : 0;
          // Fundo volta a ser "heatmap" violeta (volume). Status fica nos indicadores (bolinhas).
          const bg =
            stats && stats.total > 0 ? `rgba(139,92,246,${0.08 + intensity * 0.22})` : 'transparent';

          const hasPago = (stats?.pagoTotal || 0) > 0;
          const hasPendente = (stats?.pendenteTotal || 0) > 0;
          const hasVencida = (stats?.vencidaTotal || 0) > 0;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                if (!inMonth) return;
                onSelectDate(iso);
              }}
              className={cn(
                'relative rounded-2xl border transition-all text-left p-3 h-[92px] overflow-hidden',
                inMonth ? 'border-slate-800 bg-slate-900/10 hover:bg-slate-900/20' : 'border-slate-900/10 bg-slate-950/10 opacity-40 cursor-default',
                isSelected && 'ring-2 ring-violet-500/60 border-violet-500/40 bg-violet-500/10'
              )}
              style={{ backgroundColor: bg }}
              aria-label={iso}
            >
              <div className="flex items-center justify-between">
                <div className={cn('text-xs font-black', inMonth ? 'text-slate-200' : 'text-slate-600')}>
                  {format(d, 'd')}
                </div>
                {stats && stats.count > 0 ? (
                  <div className="flex items-center gap-1">
                    {hasVencida ? <div className="w-2 h-2 rounded-full bg-rose-500" /> : null}
                    {hasPendente ? <div className="w-2 h-2 rounded-full bg-amber-400" /> : null}
                    {hasPago ? <div className="w-2 h-2 rounded-full bg-emerald-400" /> : null}
                  </div>
                ) : (
                  <div />
                )}
                {inMonth && onCreateForDate ? (
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity" />
                ) : null}
              </div>

              {stats && stats.count > 0 ? (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] font-black text-slate-200">
                    {stats.count} conta{stats.count > 1 ? 's' : ''}
                  </div>
                  <div className="text-[10px] font-black text-slate-100">{formatCurrency(stats.total)}</div>
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-slate-600 font-bold">—</div>
              )}

              {inMonth && onCreateForDate ? (
                <Tooltip content="Nova conta para este dia">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateForDate(iso);
                    }}
                    className="absolute bottom-2 right-2 w-8 h-8 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-violet-600/20 hover:border-violet-500/30 transition-all flex items-center justify-center"
                    aria-label="Nova conta para este dia"
                  >
                    <Plus size={14} />
                  </button>
                </Tooltip>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-[10px] text-slate-500 font-bold">
        * Fundo violeta = volume do dia (heatmap). Bolinhas: <span className="text-rose-300">Vencida</span> •{' '}
        <span className="text-amber-300">Pendente</span> • <span className="text-emerald-300">Pago</span>
      </div>
    </div>
  );
}

