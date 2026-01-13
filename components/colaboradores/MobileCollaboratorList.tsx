import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, User } from 'lucide-react';
import { Badge } from '../UI';
import { cn, DEPARTMENT_COLORS, DEPARTMENT_LABELS, STATUS_COLORS, STATUS_LABELS } from '../CollaboratorComponents';
import type { Colaborador } from '../../types';
import { formatCurrency } from '../../services/api';

const PAGE_SIZE = 20;

export const MobileCollaboratorList: React.FC<{
  items: Colaborador[];
  onOpen: (c: Colaborador) => void;
}> = ({ items, onOpen }) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sempre que filtros mudarem (items), voltamos ao início para evitar "scroll fantasma".
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, items.length));
        }
      },
      { root: null, rootMargin: '240px' }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, items.length]);

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/70">
        <div className="text-white font-black">Colaboradores</div>
        <div className="text-xs text-slate-500 font-bold mt-1">
          Exibindo {Math.min(visibleCount, items.length)} de {items.length}
        </div>
      </div>

      <div className="divide-y divide-slate-800/60">
        {visibleItems.map((c) => {
          const deptColor = DEPARTMENT_COLORS[c.departamento];
          const statusVariant = STATUS_COLORS[c.status];
          const deptLabel = DEPARTMENT_LABELS[c.departamento];
          const statusLabel = STATUS_LABELS[c.status];

          const unidadeLabel = c.is_rateado
            ? 'RATEADO'
            : c.unidade_fixa
              ? `UNIDADE ${String(c.unidade_fixa).toUpperCase()}`
              : null;

          const open = (source: 'row' | 'chevron') => {
            // #region agent log (debug)
            fetch('http://127.0.0.1:7243/ingest/7dcc2162-a403-4482-b403-ed930a18b5ac', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'H1',
                location: 'MobileCollaboratorList.tsx:open',
                message: 'open() invoked from UI interaction',
                data: { collaboratorId: (c as any)?.id, source },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion agent log (debug)

            onOpen(c);
          };

          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                open('row');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  open('row');
                }
              }}
              className="w-full text-left px-5 py-4 hover:bg-slate-900/35 active:bg-slate-900/50 transition-colors cursor-pointer select-none touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden shrink-0"
                  style={{ backgroundColor: deptColor }}
                >
                  {c.id === 2 || c.nome?.includes('Ana Paula') ? (
                    <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
                  ) : c.foto_url ? (
                    <img src={c.foto_url} alt={c.nome} className="w-full h-full object-cover" />
                  ) : (
                    <User size={20} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-black text-slate-100 truncate">{c.nome}</div>
                        <Badge variant={statusVariant} className="rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest">
                          {statusLabel}
                        </Badge>
                      </div>
                      {c.funcao ? <div className="text-xs text-slate-500 font-bold truncate mt-0.5">{c.funcao}</div> : null}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-slate-100 font-black text-sm">{formatCurrency(Number((c as any).salario_base) || 0)}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border"
                        style={{ backgroundColor: `${deptColor}18`, color: deptColor, borderColor: `${deptColor}33` }}
                      >
                        {deptLabel}
                      </span>
                      {unidadeLabel ? (
                        <span className={cn(
                          'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border',
                          'bg-slate-900/30 border-slate-800 text-slate-400'
                        )}>
                          {unidadeLabel}
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        open('chevron');
                      }}
                      className="w-10 h-10 -mr-2 rounded-2xl border border-transparent hover:border-slate-800 hover:bg-slate-900/30 active:bg-slate-900/45 flex items-center justify-center text-slate-500 hover:text-slate-200 transition-all touch-manipulation"
                      aria-label="Abrir detalhes"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 font-bold">Nenhum colaborador encontrado.</div>
        ) : null}
      </div>

      <div ref={sentinelRef} />

      {hasMore ? (
        <div className="px-5 py-4 border-t border-slate-800/60 bg-slate-950/70 text-center text-xs text-slate-500 font-bold">
          Carregando mais…
        </div>
      ) : null}
    </div>
  );
};

