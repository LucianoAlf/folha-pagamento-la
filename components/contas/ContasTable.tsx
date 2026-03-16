import React, { useEffect, useMemo, useState } from 'react';
import { Search, DollarSign, Edit2, Bell, CheckCircle2, Trash2, CheckSquare } from 'lucide-react';
import { Badge, Card, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { ContaPagar } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getStatusVisual } from '../../services/contasPagarService';
import { ContaLembretesWhatsApp } from './ContaLembretesWhatsApp';
import { ParcelasTimeline } from './ParcelasTimeline';

// Helper simples para formatar data ISO (YYYY-MM-DD) para BR (DD/MM/YYYY)
const formatDateBR = (isoDate: string) => {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

export const ContasTable: React.FC<{
  contas: ContaPagar[];
  filtro: FiltroTab;
  onFiltroChange: (f: FiltroTab) => void;
  busca: string;
  onBuscaChange: (q: string) => void;
  onPagar: (conta: ContaPagar) => void;
  onEditar: (conta: ContaPagar) => void;
  onExcluir: (conta: ContaPagar) => void;
  onFinalizar: (conta: ContaPagar) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (ids: string[]) => void;
}> = ({ contas, filtro, onFiltroChange, busca, onBuscaChange, onPagar, onEditar, onExcluir, onFinalizar, selectedIds, onToggleSelect, onToggleSelectAll }) => {
  const hasSelection = !!selectedIds && !!onToggleSelect;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localBusca, setLocalBusca] = useState(busca);

  useEffect(() => { setLocalBusca(busca); }, [busca]);

  useEffect(() => {
    const timer = setTimeout(() => { if (localBusca !== busca) onBuscaChange(localBusca); }, 300);
    return () => clearTimeout(timer);
  }, [localBusca]);

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
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const venc = new Date(`${c.data_vencimento}T00:00:00`);
      venc.setHours(0, 0, 0, 0);
      const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

      if (filtro === 'hoje') return c.data_vencimento === hojeISO && c.status === 'pendente';
      if (filtro === 'vencidas') return statusVisual === 'vencida' && c.data_vencimento !== hojeISO;
      if (filtro === 'prox7') return diffDias > 0 && diffDias <= 7 && c.status === 'pendente';
      if (filtro === 'prox30') return diffDias > 0 && diffDias <= 30 && c.status === 'pendente';
      return true;
    });
  }, [contas, busca, filtro]);

  const badgeFor = (c: ContaPagar) => {
    const s = getStatusVisual(c);
    const hojeISO = new Date().toISOString().split('T')[0];

    if (c.status === 'pago') return <Badge variant="success">Pago</Badge>;
    if (c.status === 'finalizado') return <Badge variant="default">Finalizado</Badge>;
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
          <div className="flex items-center gap-1 bg-slate-900/40 border border-slate-800 rounded-2xl p-1 w-full lg:w-auto">
            {(
              [
                { id: 'todas', label: 'Todas', mobile: 'Todas' },
                { id: 'hoje', label: 'Hoje', mobile: 'Hoje' },
                { id: 'vencidas', label: 'Vencidas', mobile: 'Venc.' },
                { id: 'prox7', label: 'Próx 7 dias', mobile: '7D' },
                { id: 'prox30', label: 'Próx 30 dias', mobile: '30D' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onFiltroChange(t.id)}
                className={cn(
                  'flex-1 lg:flex-none px-2 lg:px-3 py-1.5 rounded-xl text-[10px] lg:text-xs font-black transition-colors whitespace-nowrap text-center',
                  filtro === t.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <span className="lg:hidden">{t.mobile}</span>
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-[360px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={localBusca}
            onChange={(e) => setLocalBusca(e.target.value)}
            placeholder="Buscar fornecedor ou categoria..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/30 text-sm font-bold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
      </div>

      <div className="border-t border-slate-800/70">
        {/* Desktop Header */}
        <div className={cn("hidden lg:grid px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 bg-slate-950/30", hasSelection ? "grid-cols-[40px_repeat(12,minmax(0,1fr))]" : "grid-cols-12")}>
          {hasSelection && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onToggleSelectAll?.(filtered.map((c) => c.id))}
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  filtered.length > 0 && filtered.every((c) => selectedIds!.has(c.id))
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "border-slate-600 hover:border-violet-400"
                )}
                aria-label="Selecionar todas"
              >
                {filtered.length > 0 && filtered.every((c) => selectedIds!.has(c.id)) && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </button>
            </div>
          )}
          <div className="col-span-5">Descrição / Categoria</div>
          <div className="col-span-2">Vencimento</div>
          <div className="col-span-2 text-right">Valor</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Ações</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-400 text-center">Nenhuma conta encontrada.</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filtered.map((c) => {
              const isOpen = expandedId === c.id;
              const statusVisual = getStatusVisual(c);
              const isVencida = statusVisual === 'vencida';
              const isHoje = c.data_vencimento === new Date().toISOString().split('T')[0];

              return (
                <div key={c.id}>
                  {/* Desktop Row */}
                  <div
                    className={cn("hidden lg:grid px-6 py-5 items-center bg-slate-900/10 hover:bg-slate-900/20 transition-colors cursor-pointer", hasSelection ? "grid-cols-[40px_repeat(12,minmax(0,1fr))]" : "grid-cols-12", hasSelection && selectedIds!.has(c.id) && "bg-violet-500/5")}
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setExpandedId(isOpen ? null : c.id);
                    }}
                    aria-expanded={isOpen}
                  >
                    {hasSelection && (
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleSelect!(c.id)}
                          className={cn(
                            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                            selectedIds!.has(c.id)
                              ? "bg-violet-600 border-violet-500 text-white"
                              : "border-slate-600 hover:border-violet-400"
                          )}
                          aria-label="Selecionar"
                        >
                          {selectedIds!.has(c.id) && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </button>
                      </div>
                    )}
                    <div className="col-span-5 min-w-0">
                      <div className="text-white font-black truncate">
                        {(c.categoria?.nome || '').toUpperCase()}
                        {c.total_parcelas && c.parcela_atual && (
                          <span className="ml-2 text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-md">
                            Parcela {c.parcela_atual} de {c.total_parcelas}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{c.descricao}</div>
                    </div>
                    <div className="col-span-2 text-sm font-bold text-slate-300">{formatDateBR(c.data_vencimento)}</div>
                    <div className="col-span-2 text-right text-white font-bold">{formatCurrency(Number(c.valor) || 0)}</div>
                    <div className="col-span-1 flex justify-center">{badgeFor(c)}</div>
                    <div className="col-span-2 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Tooltip content="Lembretes WhatsApp (por conta)">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : c.id)}
                          className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                          aria-label="Lembretes WhatsApp"
                        >
                          <Bell size={14} />
                        </button>
                      </Tooltip>
                      {c.status === 'pago' ? (
                        <div className="flex items-center gap-2 text-emerald-400 font-black text-xs px-4 py-2">
                          <CheckCircle2 size={14} />
                          Liquidado
                        </div>
                      ) : c.status === 'finalizado' ? (
                        <div className="flex items-center gap-2 text-slate-400 font-black text-xs px-4 py-2">
                          <CheckSquare size={14} />
                          Finalizado
                        </div>
                      ) : (
                        <>
                          {c.tipo_lancamento === 'parcelada' && (
                            <Tooltip content="Finalizar (encerrar parcelamento)">
                              <button
                                type="button"
                                onClick={() => onFinalizar(c)}
                                className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              >
                                <CheckSquare size={14} />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Editar valor/vencimento">
                            <button
                              type="button"
                              onClick={() => onEditar(c)}
                              className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                            >
                              <Edit2 size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Excluir lançamento">
                            <button
                              type="button"
                              onClick={() => onExcluir(c)}
                              className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                          <button
                            type="button"
                            onClick={() => onPagar(c)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black shadow-lg shadow-violet-600/20"
                          >
                            <DollarSign size={14} />
                            Pagar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobile Premium Card */}
                  <div
                    className={cn("lg:hidden p-4 bg-slate-900/10 active:bg-slate-900/30 transition-all border-b border-slate-800/50 group", hasSelection && selectedIds!.has(c.id) && "bg-violet-500/5")}
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Top Info: Categoria, Data e Unidade */}
                      <div className="flex items-start justify-between gap-2">
                        {hasSelection && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleSelect!(c.id); }}
                            className={cn(
                              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 mt-0.5",
                              selectedIds!.has(c.id)
                                ? "bg-violet-600 border-violet-500 text-white"
                                : "border-slate-600"
                            )}
                            aria-label="Selecionar"
                          >
                            {selectedIds!.has(c.id) && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-md",
                              c.status === 'pago' ? "bg-emerald-500/10 text-emerald-400" :
                              isVencida ? "bg-rose-500/10 text-rose-400" :
                              isHoje ? "bg-amber-500/10 text-amber-400" :
                              "bg-slate-800 text-slate-400"
                            )}>
                              {(c.categoria?.nome || 'Sem categoria').toUpperCase()}
                            </span>
                            {c.total_parcelas && c.parcela_atual && (
                              <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-md">
                                Parcela {c.parcela_atual} de {c.total_parcelas}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-slate-500">
                              {formatDateBR(c.data_vencimento)}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-slate-100 truncate">
                            {c.descricao}
                          </h4>
                          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                            {(c.unidade || 'todas').toUpperCase()}
                          </div>
                        </div>
                        {badgeFor(c)}
                      </div>

                      {/* Bottom Info: Valor e Ações Diretas */}
                      <div className="flex items-center justify-between gap-1 mt-1">
                        <div className="text-base font-bold text-white leading-none shrink-0">
                          {formatCurrency(Number(c.valor) || 0)}
                        </div>

                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setExpandedId(isOpen ? null : c.id)}
                            className={cn(
                              "w-9 h-9 rounded-xl border flex items-center justify-center transition-all active:scale-90",
                              isOpen ? "bg-violet-500 border-violet-400 text-white" : "bg-slate-900/40 border-slate-800 text-slate-400"
                            )}
                            aria-label="Lembretes WhatsApp"
                          >
                            <Bell size={14} />
                          </button>

                          <button
                            onClick={() => onEditar(c)}
                            className="w-9 h-9 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 flex items-center justify-center active:scale-90 transition-all"
                            aria-label="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          
                          {c.status !== 'pago' && c.status !== 'finalizado' ? (
                            <>
                              {c.tipo_lancamento === 'parcelada' && (
                                <button
                                  onClick={() => onFinalizar(c)}
                                  className="w-9 h-9 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 flex items-center justify-center active:scale-90 transition-all"
                                  aria-label="Finalizar"
                                >
                                  <CheckSquare size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => onExcluir(c)}
                                className="w-9 h-9 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 flex items-center justify-center active:scale-90 transition-all"
                                aria-label="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                onClick={() => onPagar(c)}
                                className="h-9 px-3 rounded-xl bg-violet-600 text-white text-[10px] font-black shadow-lg shadow-violet-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                <DollarSign size={12} />
                                Pagar
                              </button>
                            </>
                          ) : c.status === 'finalizado' ? (
                            <div className="h-9 px-3 rounded-xl bg-slate-800 text-slate-400 text-[10px] font-black border border-slate-700 flex items-center gap-1.5">
                              <CheckSquare size={12} />
                              Finalizado
                            </div>
                          ) : (
                            <div className="h-9 px-3 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/20 flex items-center gap-1.5">
                              <CheckCircle2 size={12} />
                              Liquidado
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content (Details & WhatsApp - Desktop/Mobile shared logic but styled accordingly) */}
                  {isOpen && (
                    <div className="px-4 lg:px-6 pb-6 bg-slate-950/30 border-t border-slate-800/50">
                      <div className="pt-5 grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-5">
                        {c.tipo_lancamento === 'parcelada' && c.total_parcelas ? (
                          <ParcelasTimeline conta={c} onPagar={onPagar} />
                        ) : (
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5 hidden lg:block">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Conta</div>
                            <div className="text-white font-black mt-1">{c.descricao}</div>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Valor</div>
                                <div className="text-slate-100 font-black mt-1">{formatCurrency(Number(c.valor) || 0)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Vencimento</div>
                                <div className="text-slate-100 font-black mt-1">{formatDateBR(c.data_vencimento)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</div>
                                <div className="mt-1">{badgeFor(c)}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        <ContaLembretesWhatsApp contaId={c.id} dense />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

