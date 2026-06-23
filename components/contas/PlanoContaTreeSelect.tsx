import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowLeft, Check, ChevronDown, ChevronRight, GitBranch, Search } from 'lucide-react';
import { CentroCusto, PlanoConta, PlanoContaMaisUsado } from '../../types/contasPagar';
import { cn } from '../CollaboratorComponents';
import {
  centroCustoToUnidade,
  filterSelectablePlanos,
  formatPlanoContaLabel,
  getPlanoContaParentName,
  isPlanoContaSelecionavel,
  resolvePlanosMaisUsados,
} from './planoContasSelectors';

type PlanoContaTreeSelectProps = {
  planos: PlanoConta[];
  maisUsados?: PlanoContaMaisUsado[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
};

type CentroCustoSelectProps = {
  centros: CentroCusto[];
  value: string;
  onValueChange: (centroId: string, unidade: ReturnType<typeof centroCustoToUnidade>) => void;
  invalid?: boolean;
  disabled?: boolean;
};

type PlanoContaOption = {
  plano: PlanoConta;
  total?: number;
};

function ancestorIdsFor(plano: PlanoConta, byId: Map<string, PlanoConta>): string[] {
  const ids: string[] = [];
  let current = plano.parent_id ? byId.get(plano.parent_id) : undefined;
  while (current) {
    ids.unshift(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return ids;
}

export const PlanoContaTreeSelect: React.FC<PlanoContaTreeSelectProps> = ({
  planos,
  maisUsados = [],
  value,
  onValueChange,
  placeholder = 'Buscar por código ou nome…',
  invalid = false,
  disabled = false,
}) => {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'tree'>('search');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelWidth, setPanelWidth] = useState<number | undefined>();

  const { byId, childrenByParent, selectableIds, visibleTreeIds, topLevelIds } = useMemo(() => {
    const active = planos.filter((p) => p.ativo);
    const idMap = new Map(active.map((p) => [p.id, p]));
    const selectable = active.filter(isPlanoContaSelecionavel);
    const selectableSet = new Set(selectable.map((p) => p.id));
    const visibleSet = new Set<string>();

    selectable.forEach((leaf) => {
      visibleSet.add(leaf.id);
      ancestorIdsFor(leaf, idMap).forEach((id) => visibleSet.add(id));
    });

    const children = new Map<string, PlanoConta[]>();
    active
      .filter((p) => visibleSet.has(p.id))
      .forEach((p) => {
        const key = p.parent_id || 'root';
        const list = children.get(key) || [];
        list.push(p);
        children.set(key, list);
      });

    children.forEach((list) => {
      list.sort((a, b) => {
        if (a.ordem !== b.ordem) return a.ordem - b.ordem;
        return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
      });
    });

    return {
      byId: idMap,
      childrenByParent: children,
      selectableIds: selectableSet,
      visibleTreeIds: visibleSet,
      topLevelIds: (children.get('root') || []).map((p) => p.id),
    };
  }, [planos]);

  const selected = value ? byId.get(value) : undefined;
  const normalizedQuery = query.trim();
  const parentMap = useMemo(() => new Map(planos.map((p) => [p.id, p])), [planos]);

  const filteredOptions = useMemo<PlanoContaOption[]>(
    () => filterSelectablePlanos(planos, normalizedQuery).map((plano) => ({ plano })),
    [normalizedQuery, planos]
  );

  const usedOptions = useMemo<PlanoContaOption[]>(
    () => resolvePlanosMaisUsados(planos, maisUsados).map((item) => ({ plano: item.plano, total: item.total })),
    [maisUsados, planos]
  );

  const currentOptions = normalizedQuery ? filteredOptions : usedOptions;

  useEffect(() => {
    if (open) return;
    setQuery(selected ? formatPlanoContaLabel(selected) : '');
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    setMode('search');
    setActiveIndex(0);
    setExpanded((prev) => {
      const next = new Set(prev);
      topLevelIds.forEach((id) => next.add(id));
      if (selected) {
        ancestorIdsFor(selected, byId).forEach((id) => next.add(id));
      }
      return next;
    });
  }, [byId, open, selected, topLevelIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, currentOptions.length]);

  useEffect(() => {
    if (!open) return;
    const updateWidth = () => {
      setPanelWidth(fieldRef.current?.getBoundingClientRect().width);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [open]);

  const selectPlano = (plano: PlanoConta) => {
    if (!selectableIds.has(plano.id)) return;
    onValueChange(plano.id);
    setQuery(formatPlanoContaLabel(plano));
    setOpen(false);
    setMode('search');
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (mode !== 'search') return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => Math.min(idx + 1, Math.max(currentOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => Math.max(idx - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && currentOptions[activeIndex]) {
      event.preventDefault();
      selectPlano(currentOptions[activeIndex].plano);
    }
  };

  const renderOption = (option: PlanoContaOption, index: number) => {
    const plano = option.plano;
    const isSelected = value === plano.id;
    const isActive = index === activeIndex;
    const parentName = getPlanoContaParentName(plano, parentMap);

    return (
      <button
        key={plano.id}
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectPlano(plano)}
        className={cn(
          'w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition-all',
          isActive || isSelected ? 'bg-accent/10 text-primary' : 'text-secondary hover:bg-surface-2 hover:text-primary'
        )}
      >
        <span className="rounded-lg border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] leading-none text-primary">
          {plano.codigo}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-primary">{plano.nome}</span>
          <span className="mt-0.5 block truncate text-[11px] font-bold text-secondary">{parentName || 'Plano de saída'}</span>
        </span>
        {isSelected && <Check size={15} className="text-accent shrink-0" />}
      </button>
    );
  };

  const renderNode = (plano: PlanoConta, depth = 0): React.ReactNode => {
    if (!visibleTreeIds.has(plano.id)) return null;
    const children = childrenByParent.get(plano.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(plano.id);
    const isSelectable = selectableIds.has(plano.id);
    const isSelected = value === plano.id;

    return (
      <div key={plano.id}>
        <button
          type="button"
          onClick={() => {
            if (isSelectable) {
              selectPlano(plano);
              return;
            }
            if (hasChildren) toggleExpanded(plano.id);
          }}
          className={cn(
            'w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all',
            isSelectable ? 'hover:bg-accent/10 text-secondary hover:text-primary' : 'text-muted cursor-default',
            isSelected && 'bg-accent/15 text-primary'
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <span
              className="shrink-0 w-5 h-5 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-muted"
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded(plano.id);
              }}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          ) : (
            <span className="shrink-0 w-5 h-5" />
          )}
          <span className={cn('min-w-0 flex-1 truncate', isSelectable ? 'font-bold' : 'font-black uppercase text-[10px]')}>
            {formatPlanoContaLabel(plano)}
          </span>
          {isSelected && <Check size={14} className="text-accent shrink-0" />}
        </button>
        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={fieldRef} className={cn('relative', disabled && 'opacity-60')}>
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            onFocus={(event) => {
              setOpen(true);
              event.currentTarget.select();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setMode('search');
              setOpen(true);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholder}
            className={cn(
              'w-full min-h-[52px] rounded-2xl border bg-bg pl-11 pr-4 py-3 text-sm font-bold text-primary placeholder:text-muted transition-all focus:outline-none focus:ring-2',
              invalid ? 'border-danger/60 focus:ring-danger/40' : 'border-line focus:ring-accent/40 hover:bg-surface-2',
              disabled && 'cursor-not-allowed'
            )}
            role="combobox"
            aria-expanded={open}
            aria-controls="plano-conta-options"
            aria-autocomplete="list"
          />
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={6}
          avoidCollisions
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            inputRef.current?.focus();
          }}
          onInteractOutside={() => setOpen(false)}
          className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] animate-in fade-in zoom-in-95 duration-150"
          style={{ width: panelWidth }}
        >
          {mode === 'search' ? (
            <div id="plano-conta-options" role="listbox" className="max-h-[300px] overflow-hidden">
              <div className="px-4 py-3 text-[11px] font-black text-secondary">
                {normalizedQuery ? 'Resultados' : 'Mais usados'}
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                {currentOptions.length ? (
                  currentOptions.map(renderOption)
                ) : (
                  <div className="px-4 py-8 text-center text-sm font-bold text-muted">
                    {normalizedQuery ? 'Nenhuma folha encontrada.' : 'Nenhuma conta usada ainda.'}
                  </div>
                )}
              </div>
              <div className="border-t border-line bg-surface">
                <button
                  type="button"
                  onClick={() => setMode('tree')}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-xs font-black text-secondary transition-all hover:bg-surface-2 hover:text-primary"
                >
                  <GitBranch size={14} className="text-muted" />
                  Ver árvore completa
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('search');
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black text-secondary hover:bg-surface-2 hover:text-primary"
                >
                  <ArrowLeft size={14} />
                  Voltar
                </button>
                <div className="truncate text-[11px] font-black text-muted">Árvore completa</div>
              </div>
              <div className="max-h-[250px] overflow-y-auto p-2">
                {(childrenByParent.get('root') || []).map((plano) => renderNode(plano))}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export const CentroCustoSelect: React.FC<CentroCustoSelectProps> = ({
  centros,
  value,
  onValueChange,
  invalid = false,
  disabled = false,
}) => {
  const selected = centros.find((c) => c.id === value);

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-2', disabled && 'opacity-60 pointer-events-none')}>
      {centros.map((centro) => {
        const isSelected = centro.id === value;
        const unidade = centroCustoToUnidade(centro);
        return (
          <button
            key={centro.id}
            type="button"
            onClick={() => onValueChange(centro.id, unidade)}
            className={cn(
              'min-h-[52px] rounded-2xl border px-4 py-3 text-left transition-all',
              isSelected
                ? 'border-accent/60 bg-accent/10 text-primary shadow-sm'
                : 'border-line bg-surface/30 text-secondary hover:bg-surface-2/50 hover:text-primary',
              invalid && !selected && 'border-danger/60'
            )}
          >
            <div className="text-sm font-black">{centro.nome}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{centro.codigo}</div>
          </button>
        );
      })}
    </div>
  );
};
