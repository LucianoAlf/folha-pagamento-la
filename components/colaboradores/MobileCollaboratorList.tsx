import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, Edit2, UserX, Trash2 } from 'lucide-react';
import { Badge } from '../UI';
import { cn, DEPARTMENT_COLORS, DEPARTMENT_LABELS, STATUS_COLORS, STATUS_LABELS } from '../CollaboratorComponents';
import type { Colaborador } from '../../types';
import { formatCurrency } from '../../services/api';

const PAGE_SIZE = 20;

export const MobileCollaboratorList: React.FC<{
  items: Colaborador[];
  onEdit: (c: Colaborador) => void;
  onDelete: (c: Colaborador) => void;
  onToggleInactive: (c: Colaborador) => void;
}> = ({ items, onEdit, onDelete, onToggleInactive }) => {
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
    <div className="rounded-3xl border border-base/60 bg-bg/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-base/60 bg-bg/70">
        <div className="text-primary font-black">Colaboradores</div>
        <div className="text-xs text-muted font-bold mt-1">
          Exibindo {Math.min(visibleCount, items.length)} de {items.length}
        </div>
      </div>

      <div className="divide-y divide-base/60">
        {visibleItems.map((c) => {
          const deptColor = DEPARTMENT_COLORS[c.departamento];
          const deptLabel = DEPARTMENT_LABELS[c.departamento];

          const unidadeLabel = c.is_rateado
            ? 'RATEADO'
            : c.unidade_fixa
              ? String(c.unidade_fixa).toUpperCase()
              : null;

          return (
            <div
              key={c.id}
              className="w-full text-left px-5 py-4 hover:bg-surface/35 transition-colors select-none touch-manipulation"
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
                      <div className="font-black text-primary text-sm truncate">{c.nome}</div>
                      <div className="text-xs text-muted font-bold truncate mt-0.5 flex items-center gap-1.5">
                        {c.status === 'active' ? (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                          </span>
                        ) : (
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            c.status === 'inactive' ? "bg-danger" : "bg-warning"
                          )} />
                        )}
                        {c.funcao || 'Colaborador'}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-primary font-black text-sm">{formatCurrency(Number((c as any).salario_base) || 0)}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-lg border"
                        style={{ backgroundColor: `${deptColor}18`, color: deptColor, borderColor: `${deptColor}33` }}
                      >
                        {deptLabel}
                      </span>
                      {unidadeLabel ? (
                        <span className={cn(
                          'text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border',
                          'bg-surface/30 border-base text-secondary'
                        )}>
                          {unidadeLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1 -mr-1">
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        className="w-6 h-6 flex items-center justify-center bg-surface-2/60 border border-strong/50 rounded-lg text-secondary active:text-accent active:bg-surface-2 transition-all active:scale-90 touch-manipulation"
                        aria-label="Editar"
                      >
                        <Edit2 size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleInactive(c)}
                        className="w-6 h-6 flex items-center justify-center bg-surface-2/60 border border-strong/50 rounded-lg text-secondary active:text-warning active:bg-surface-2 transition-all active:scale-90 touch-manipulation"
                        aria-label={c.status === 'active' ? 'Inativar' : 'Reativar'}
                      >
                        <UserX size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(c)}
                        className="w-6 h-6 flex items-center justify-center bg-surface-2/60 border border-strong/50 rounded-lg text-secondary active:text-danger active:bg-surface-2 transition-all active:scale-90 touch-manipulation"
                        aria-label="Excluir"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted font-bold">Nenhum colaborador encontrado.</div>
        ) : null}
      </div>

      <div ref={sentinelRef} />

      {hasMore ? (
        <div className="px-5 py-4 border-t border-base/60 bg-bg/70 text-center text-xs text-muted font-bold">
          Carregando mais…
        </div>
      ) : null}
    </div>
  );
};

