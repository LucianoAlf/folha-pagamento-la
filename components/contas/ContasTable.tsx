import React, { useEffect, useMemo, useState } from 'react';
import { Search, DollarSign, Edit2, Bell, CheckCircle2, Trash2, CheckSquare, Bot } from 'lucide-react';
import { Badge, Card, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { ContaPagar, ContaPagarCodigoMes } from '../../types/contasPagar';
import { formatCurrency } from '../../services/api';
import { getCodigoMesBadge, getStatusVisual } from '../../services/contasPagarService';
import { ContaLembretesWhatsApp } from './ContaLembretesWhatsApp';
import { ParcelasTimeline } from './ParcelasTimeline';
import { formatDateBR, toDateOnly } from '../../utils/dateOnly';
import {
  formatContaCentroCustoLabel,
  formatContaPlanoCodigo,
  formatContaPlanoLabel,
  matchesContaPlanoCentroSearch,
} from './planoContasSelectors';

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
  codigosPorConta?: Record<string, ContaPagarCodigoMes>;
}> = ({ contas, filtro, onFiltroChange, busca, onBuscaChange, onPagar, onEditar, onExcluir, onFinalizar, selectedIds, onToggleSelect, onToggleSelectAll, codigosPorConta }) => {
  const hasSelection = !!selectedIds && !!onToggleSelect;
  const desktopGridClass = hasSelection
    ? "grid-cols-[40px_minmax(140px,1fr)_96px_102px_104px_228px]"
    : "grid-cols-[minmax(180px,1fr)_96px_102px_104px_228px]";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localBusca, setLocalBusca] = useState(busca);

  useEffect(() => { setLocalBusca(busca); }, [busca]);

  useEffect(() => {
    const timer = setTimeout(() => { if (localBusca !== busca) onBuscaChange(localBusca); }, 300);
    return () => clearTimeout(timer);
  }, [localBusca]);

  const filtered = useMemo(() => {
    const q = (busca || '').trim();
    const hojeISO = new Date().toISOString().split('T')[0];

    return contas.filter((c) => {
      if (q && !matchesContaPlanoCentroSearch(c, q)) return false;

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

  const codigoBadgeFor = (c: ContaPagar) => {
    const codigo = codigosPorConta?.[c.id];
    const badge = getCodigoMesBadge(c, codigo);
    const mariaBadge = codigo?.registrado_por_agente ? (() => {
      const agente = codigo.agente_nome || 'Maria';
      const confirmadoPor = codigo.confirmado_por_nome || codigo.coletado_por || 'confirmacao humana';
      const quando = codigo.registrado_em
        ? new Date(codigo.registrado_em).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
      const tooltip = quando
        ? `Registrado por ${agente} apos confirmacao de ${confirmadoPor} em ${quando}.`
        : `Registrado por ${agente} apos confirmacao de ${confirmadoPor}.`;

      return (
        <Tooltip content={tooltip}>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-accent/20 bg-accent/10 text-accent text-[9px] font-black uppercase">
            <Bot size={10} />
            Maria
          </span>
        </Tooltip>
      );
    })() : null;
    const wrap = (node: React.ReactNode) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {node}
        {mariaBadge}
      </div>
    );

    if (badge === 'coletado') {
      return wrap(<span className="inline-flex px-2 py-0.5 rounded-lg bg-success/10 text-success text-[9px] font-black uppercase">Coletado</span>);
    }
    if (badge === 'indisponivel') {
      return wrap(<span className="inline-flex px-2 py-0.5 rounded-lg bg-warning/10 text-warning text-[9px] font-black uppercase">Indisponível</span>);
    }
    if (badge === 'atualizar') {
      return wrap(
        <Tooltip content="Vence em até 7 dias e ainda não tem código/PIX do mês.">
          <span className="inline-flex px-2 py-0.5 rounded-lg bg-danger/10 text-danger text-[9px] font-black uppercase">
            Coletar
          </span>
        </Tooltip>
      );
    }
    return wrap(<span className="inline-flex px-2 py-0.5 rounded-lg bg-surface-2 text-muted text-[9px] font-black uppercase">Sem código</span>);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-lg font-black text-primary">Contas a Pagar</div>
          <div className="flex items-center gap-1 bg-surface/40 border border-line rounded-2xl p-1 w-full lg:w-auto">
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
                  filtro === t.id ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary'
                )}
              >
                <span className="lg:hidden">{t.mobile}</span>
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-[360px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={localBusca}
            onChange={(e) => setLocalBusca(e.target.value)}
            placeholder="Buscar fornecedor, plano ou centro..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-line bg-surface/30 text-sm font-bold text-secondary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      <div className="border-t border-line/70">
        {/* Desktop Header */}
        <div className={cn("hidden lg:grid px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted bg-bg/30", desktopGridClass)}>
          {hasSelection && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onToggleSelectAll?.(filtered.map((c) => c.id))}
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  filtered.length > 0 && filtered.every((c) => selectedIds!.has(c.id))
                    ? "bg-accent border-accent text-white"
                    : "border-line-strong hover:border-accent"
                )}
                aria-label="Selecionar todas"
              >
                {filtered.length > 0 && filtered.every((c) => selectedIds!.has(c.id)) && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </button>
            </div>
          )}
          <div>Conta / Plano</div>
          <div>Vencimento</div>
          <div className="text-right">Valor</div>
          <div className="text-center">Status</div>
          <div className="text-right">Ações</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-sm text-secondary text-center">Nenhuma conta encontrada.</div>
        ) : (
          <div className="divide-y divide-line/50">
            {filtered.map((c) => {
              const isOpen = expandedId === c.id;
              const statusVisual = getStatusVisual(c);
              const isVencida = statusVisual === 'vencida';
              const isHoje = c.data_vencimento === new Date().toISOString().split('T')[0];
              const planoLabel = formatContaPlanoLabel(c);
              const planoCodigo = formatContaPlanoCodigo(c);
              const planoNome = c.plano_conta?.nome || planoLabel;
              const hasPlanoConta = Boolean(c.plano_conta?.codigo && c.plano_conta?.nome);
              const centroLabel = formatContaCentroCustoLabel(c);

              return (
                <div key={c.id}>
                  {/* Desktop Row */}
                  <div
                    className={cn("hidden lg:grid px-6 py-5 items-center bg-surface/10 hover:bg-surface/20 transition-colors cursor-pointer", desktopGridClass, hasSelection && selectedIds!.has(c.id) && "bg-accent/5")}
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
                              ? "bg-accent border-accent text-white"
                              : "border-line-strong hover:border-accent"
                          )}
                          aria-label="Selecionar"
                        >
                          {selectedIds!.has(c.id) && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </button>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-primary font-black truncate">{c.descricao}</span>
                        {c.total_parcelas && c.parcela_atual && (
                          <span className="shrink-0 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">
                            Parcela {c.parcela_atual} de {c.total_parcelas}
                          </span>
                        )}
                        {c.tipo_lancamento === 'eventual' && (
                          <span className="shrink-0 text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded-md">
                            Eventual
                          </span>
                        )}
                        {c.tipo_lancamento === 'fatura_cartao' && (
                          <span className="shrink-0 text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded-md">
                            Fatura de cartão
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-secondary leading-snug">
                        {hasPlanoConta ? (
                          <>
                            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-black text-secondary leading-none">
                              {planoCodigo}
                            </span>
                            <span className="truncate">{planoNome}</span>
                          </>
                        ) : (
                          <span className="truncate">{planoLabel}</span>
                        )}
                        {centroLabel && (
                          <>
                            <span className="text-muted">&middot;</span>
                            <span className="text-muted">{centroLabel}</span>
                          </>
                        )}
                      </div>
                      {codigosPorConta && <div className="mt-1">{codigoBadgeFor(c)}</div>}
                    </div>
                    <div className="text-sm font-bold text-secondary">{formatDateBR(c.data_vencimento)}</div>
                    <div className="text-right text-primary font-bold">{formatCurrency(Number(c.valor) || 0)}</div>
                    <div className="flex justify-center">{badgeFor(c)}</div>
                    <div className="flex justify-end gap-1 pl-2 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <Tooltip content="Lembretes WhatsApp (por conta)">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : c.id)}
                          className="w-8 h-8 rounded-xl border border-line text-secondary hover:text-primary hover:bg-surface-2 transition-all flex items-center justify-center"
                          aria-label="Lembretes WhatsApp"
                        >
                          <Bell size={14} />
                        </button>
                      </Tooltip>
                      {c.status === 'pago' ? (
                        <div className="flex items-center gap-2 text-success font-black text-xs px-4 py-2">
                          <CheckCircle2 size={14} />
                          Liquidado
                        </div>
                      ) : c.status === 'finalizado' ? (
                        <div className="flex items-center gap-2 text-secondary font-black text-xs px-4 py-2">
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
                                className="w-8 h-8 rounded-xl border border-line text-secondary hover:text-success hover:bg-success/10 transition-all flex items-center justify-center"
                              >
                                <CheckSquare size={14} />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Editar valor/vencimento">
                            <button
                              type="button"
                              onClick={() => onEditar(c)}
                              className="w-8 h-8 rounded-xl border border-line text-secondary hover:text-primary hover:bg-surface-2 transition-all flex items-center justify-center"
                            >
                              <Edit2 size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Excluir lançamento">
                            <button
                              type="button"
                              onClick={() => onExcluir(c)}
                              className="w-8 h-8 rounded-xl border border-line text-secondary hover:text-danger hover:bg-danger/10 transition-all flex items-center justify-center"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                          <button
                            type="button"
                            onClick={() => onPagar(c)}
                            className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white text-xs font-black shadow-lg shadow-accent/20"
                          >
                            <DollarSign size={12} />
                            Pagar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobile Premium Card */}
                  <div
                    className={cn("lg:hidden px-4 py-3 bg-surface/10 active:bg-surface/30 transition-all border-b border-line/50 group", hasSelection && selectedIds!.has(c.id) && "bg-accent/5")}
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Top Info: Conta, plano, data e centro */}
                      <div className="flex items-start gap-3">
                        {hasSelection && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleSelect!(c.id); }}
                            className={cn(
                              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 mt-0.5",
                              selectedIds!.has(c.id)
                                ? "bg-accent border-accent text-white"
                                : "border-line-strong"
                            )}
                            aria-label="Selecionar"
                          >
                            {selectedIds!.has(c.id) && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-[15px] font-black text-primary leading-snug break-words">
                                {c.descricao}
                              </h4>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-secondary leading-snug">
                                {hasPlanoConta ? (
                                  <>
                                    <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-black text-secondary leading-none">
                                      {planoCodigo}
                                    </span>
                                    <span>{planoNome}</span>
                                  </>
                                ) : (
                                  <span>{planoLabel}</span>
                                )}
                                <span className="text-muted">&middot;</span>
                                <span className="text-muted">{centroLabel}</span>
                              </div>
                              {c.total_parcelas && c.parcela_atual && (
                                <div className="mt-1">
                                  <span className="inline-flex text-[10px] font-black text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">
                                    Parcela {c.parcela_atual} de {c.total_parcelas}
                                  </span>
                                </div>
                              )}
                              {c.tipo_lancamento === 'eventual' && (
                                <div className="mt-1">
                                  <span className="inline-flex text-[10px] font-black text-info bg-info/10 px-1.5 py-0.5 rounded-md">
                                    Eventual
                                  </span>
                                </div>
                              )}
                              {c.tipo_lancamento === 'fatura_cartao' && (
                                <div className="mt-1">
                                  <span className="inline-flex text-[10px] font-black text-info bg-info/10 px-1.5 py-0.5 rounded-md">
                                    Fatura de cartão
                                  </span>
                                </div>
                              )}
                              {codigosPorConta && <div className="mt-1">{codigoBadgeFor(c)}</div>}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-muted">
                                {formatDateBR(c.data_vencimento)}
                              </span>
                              {badgeFor(c)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Info: Valor e Acoes Diretas */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[17px] font-black text-primary leading-none shrink-0">
                          {formatCurrency(Number(c.valor) || 0)}
                        </div>

                        <div className="flex items-center gap-1.5 min-w-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setExpandedId(isOpen ? null : c.id)}
                            className={cn(
                              "w-8 h-8 rounded-xl border flex items-center justify-center transition-all active:scale-90",
                              isOpen ? "bg-accent border-accent/80 text-white" : "bg-surface/40 border-line text-secondary"
                            )}
                            aria-label="Lembretes WhatsApp"
                          >
                            <Bell size={14} />
                          </button>

                          <button
                            onClick={() => onEditar(c)}
                            className="w-8 h-8 rounded-xl bg-surface/40 border border-line text-secondary flex items-center justify-center active:scale-90 transition-all"
                            aria-label="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          
                          {c.status !== 'pago' && c.status !== 'finalizado' ? (
                            <>
                              {c.tipo_lancamento === 'parcelada' && (
                                <button
                                  onClick={() => onFinalizar(c)}
                                  className="w-8 h-8 rounded-xl bg-surface/40 border border-line text-secondary flex items-center justify-center active:scale-90 transition-all"
                                  aria-label="Finalizar"
                                >
                                  <CheckSquare size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => onExcluir(c)}
                                className="w-8 h-8 rounded-xl bg-surface/40 border border-line text-secondary flex items-center justify-center active:scale-90 transition-all"
                                aria-label="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                onClick={() => onPagar(c)}
                                className="h-8 px-3 rounded-xl bg-accent text-white text-[10px] font-black shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                <DollarSign size={12} />
                                Pagar
                              </button>
                            </>
                          ) : c.status === 'finalizado' ? (
                            <div className="h-8 px-3 rounded-xl bg-surface-2 text-secondary text-[10px] font-black border border-line-strong flex items-center gap-1.5">
                              <CheckSquare size={12} />
                              Finalizado
                            </div>
                          ) : (
                            <div className="h-8 px-3 rounded-xl bg-success/10 text-success text-[10px] font-black border border-success/20 flex items-center gap-1.5">
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
                    <div className="px-4 lg:px-6 pb-6 bg-bg/30 border-t border-line/50">
                      <div className="pt-5 grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-5">
                        {c.tipo_lancamento === 'parcelada' && c.total_parcelas ? (
                          <ParcelasTimeline conta={c} onPagar={onPagar} />
                        ) : (
                          <div className="rounded-2xl border border-line bg-surface/20 p-5 hidden lg:block">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Conta</div>
                            <div className="text-primary font-black mt-1">{c.descricao}</div>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-xl border border-line bg-bg/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Valor</div>
                                <div className="text-secondary font-black mt-1">{formatCurrency(Number(c.valor) || 0)}</div>
                              </div>
                              <div className="rounded-xl border border-line bg-bg/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Vencimento</div>
                                <div className="text-secondary font-black mt-1">{formatDateBR(c.data_vencimento)}</div>
                              </div>
                              <div className="rounded-xl border border-line bg-bg/25 p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Status</div>
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

