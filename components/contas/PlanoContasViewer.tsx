import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, ListTree, Loader2, Search } from 'lucide-react';
import { fetchPlanoContas } from '../../services/contasPagarService';
import type { PlanoConta } from '../../types/contasPagar';
import { cn } from '../CollaboratorComponents';
import {
  buildPlanoContaViewerTree,
  type PlanoContaViewerTreeNode,
} from './planoContasSelectors';

type TipoCustoPlano = 'fixo' | 'variavel' | null;

function resolveTipoCusto(plano: PlanoConta): TipoCustoPlano {
  if (plano.tipo_custo === 'fixo' || plano.tipo_custo === 'variavel') return plano.tipo_custo;
  if (plano.codigo.startsWith('5')) return 'fixo';
  if (plano.codigo.startsWith('4')) return 'variavel';
  return null;
}

function tipoCustoBadge(tipoCusto: TipoCustoPlano) {
  if (tipoCusto === 'fixo') {
    return 'bg-info/15 text-info border-info/25';
  }
  if (tipoCusto === 'variavel') {
    return 'bg-warning/15 text-warning border-warning/25';
  }
  return '';
}

function tipoCustoLabel(tipoCusto: TipoCustoPlano) {
  if (tipoCusto === 'fixo') return 'Fixo';
  if (tipoCusto === 'variavel') return 'Variável';
  return '';
}

type PlanoContaRowProps = {
  node: PlanoContaViewerTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
};

const PlanoContaRow: React.FC<PlanoContaRowProps> = ({ node, depth, expandedIds, onToggle }) => {
  const { plano, children } = node;
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(plano.id);
  const tipoCusto = resolveTipoCusto(plano);
  const badgeLabel = tipoCustoLabel(tipoCusto);

  return (
    <div>
      <div
        className={cn(
          'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line/45 px-3 py-2.5 transition-colors',
          'hover:bg-surface-2/35',
          plano.nivel <= 1 && 'bg-surface/35',
          plano.nivel === 2 && 'bg-surface/20'
        )}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(plano.id)}
              aria-label={expanded ? `Recolher ${plano.codigo}` : `Expandir ${plano.codigo}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface/60 text-muted transition-colors hover:border-accent/35 hover:text-primary"
            >
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : (
            <div className="h-7 w-7 shrink-0" />
          )}

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-md border border-line bg-surface-2/55 px-2 py-0.5 font-mono text-[11px] font-black text-secondary">
                {plano.codigo}
              </span>
              <span
                className={cn(
                  'truncate font-black text-primary',
                  plano.nivel <= 1 ? 'text-sm sm:text-base' : 'text-sm'
                )}
              >
                {plano.nome}
              </span>
            </div>
          </div>
        </div>

        {badgeLabel ? (
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider',
              tipoCustoBadge(tipoCusto)
            )}
          >
            {badgeLabel}
          </span>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <div>
          {children.map((child) => (
            <PlanoContaRow
              key={child.plano.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const PlanoContasViewer: React.FC = () => {
  const [planos, setPlanos] = useState<PlanoConta[]>([]);
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPlanoContas();
        if (!cancelled) setPlanos(data.filter((plano) => plano.natureza === 'saida'));
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Não foi possível carregar o plano de contas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo(() => buildPlanoContaViewerTree(planos, query), [planos, query]);
  const defaultExpandedKey = useMemo(
    () => Array.from(tree.defaultExpandedIds).sort().join('|'),
    [tree.defaultExpandedIds]
  );

  useEffect(() => {
    setExpandedIds(new Set(tree.defaultExpandedIds));
  }, [defaultExpandedKey]);

  const totalFolhas = useMemo(
    () => planos.filter((plano) => plano.nivel >= 3).length,
    [planos]
  );

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-line bg-surface/35">
        <div className="flex items-center gap-3 text-sm font-black text-secondary">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Carregando plano de contas
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-danger/20 bg-danger/5 p-5 text-sm font-bold text-danger">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-line bg-surface/45 shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line/60 bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
            <ListTree size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-primary">Plano de Contas Emusys</div>
            <div className="mt-0.5 text-xs font-bold text-muted">
              {planos.length} nós de saída · {totalFolhas} folhas
            </div>
          </div>
        </div>

        <label className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar código ou nome..."
            className="h-11 w-full rounded-2xl border border-line bg-bg pl-10 pr-4 text-sm font-bold text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/35"
          />
        </label>
      </div>

      {tree.roots.length === 0 ? (
        <div className="flex min-h-[220px] items-center justify-center p-6">
          <div className="flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface/35 p-4 text-sm font-bold text-secondary">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            Nenhuma conta de saída encontrada para o filtro atual.
          </div>
        </div>
      ) : (
        <div className="max-h-[68vh] overflow-auto">
          {tree.roots.map((node) => (
            <PlanoContaRow
              key={node.plano.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};
