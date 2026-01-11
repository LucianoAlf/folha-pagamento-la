import React, { useMemo } from 'react';
import { Search, DollarSign } from 'lucide-react';
import { Badge, Card } from '../UI';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

export const ContasTable: React.FC<{
  contas: ContaPagar[];
  filtro: FiltroTab;
  onFiltroChange: (f: FiltroTab) => void;
  busca: string;
  onBuscaChange: (q: string) => void;
  onPagar: (conta: ContaPagar) => void;
}> = ({ contas, filtro, onFiltroChange, busca, onBuscaChange, onPagar }) => {
  const filtered = useMemo(() => {
    const q = (busca || '').trim().toLowerCase();
    const hojeISO = new Date().toISOString().split('T')[0];

    return contas.filter((c) => {
      if (q) {
        const inDesc = (c.descricao || '').toLowerCase().includes(q);
        const inCat = (c.categoria?.nome || '').toLowerCase().includes(q);
        if (!inDesc && !inCat) return false;
      }

      const statusVisual = getStatusVisual(c);
      if (filtro === 'hoje') return c.data_vencimento === hojeISO && c.status === 'pendente';
      if (filtro === 'vencidas') return statusVisual === 'vencida' && c.data_vencimento !== hojeISO;
      if (filtro === 'prox7') return statusVisual === 'urgente' && c.data_vencimento !== hojeISO;
      if (filtro === 'prox30') return statusVisual === 'pendente' && c.data_vencimento !== hojeISO;
      return true;
    });
  }, [contas, busca, filtro]);

  const badgeFor = (c: ContaPagar) => {
    const s = getStatusVisual(c);
    const hojeISO = new Date().toISOString().split('T')[0];

    if (s === 'pago') return <Badge variant="success">Pago</Badge>;
    if (c.data_vencimento === hojeISO) return <Badge variant="warning">Hoje</Badge>;
    if (s === 'vencida') return <Badge variant="danger">Vencida</Badge>;
    if (s === 'urgente') return <Badge variant="warning">Urgente</Badge>;
    return <Badge variant="info">Pendente</Badge>;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-lg font-black text-white">Contas a Pagar</div>
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-1">
            {(
              [
                { id: 'todas', label: 'Todas' },
                { id: 'hoje', label: 'Hoje' },
                { id: 'vencidas', label: 'Vencidas' },
                { id: 'prox7', label: 'Próx 7 dias' },
                { id: 'prox30', label: 'Próx 30 dias' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onFiltroChange(t.id)}
                className={[
                  'px-3 py-1.5 rounded-xl text-xs font-black transition-colors',
                  filtro === t.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-[360px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Buscar fornecedor ou categoria..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
      </div>

      <div className="border-t border-slate-800/70">
        <div className="grid grid-cols-12 px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 bg-slate-950/30">
          <div className="col-span-5">Descrição / Categoria</div>
          <div className="col-span-2">Vencimento</div>
          <div className="col-span-2 text-right">Valor</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Ações</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-400">Nenhuma conta encontrada.</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filtered.map((c) => (
              <div key={c.id} className="grid grid-cols-12 px-6 py-5 items-center bg-slate-900/10 hover:bg-slate-900/20 transition-colors">
                <div className="col-span-5 min-w-0">
                  <div className="text-white font-black truncate">{(c.categoria?.nome || '').toUpperCase()}</div>
                  <div className="text-xs text-slate-500 truncate">{c.descricao}</div>
                </div>
                <div className="col-span-2 text-sm font-bold text-slate-300">{c.data_vencimento}</div>
                <div className="col-span-2 text-right text-white font-black">{formatCurrency(Number(c.valor) || 0)}</div>
                <div className="col-span-1 flex justify-center">{badgeFor(c)}</div>
                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onPagar(c)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black shadow-lg shadow-violet-600/20"
                  >
                    <DollarSign size={14} />
                    Pagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

