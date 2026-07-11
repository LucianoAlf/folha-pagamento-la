import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, WalletCards } from 'lucide-react';

import type { Lancamento } from '../../types.ts';
import type { FolhaContaPagadora, FolhaRateioPreflight } from '../../types/folhaRateio.ts';
import { formatCurrency } from '../../services/api.ts';
import {
  fetchFolhaContasPagadoras,
  fetchFolhaRateioPreflight,
} from '../../services/folhaRateioService.ts';
import { useToast } from '../../hooks/useToast.tsx';
import { Badge, Button, Card, ErrorState, LoadingSpinner } from '../UI';
import { FolhaRateioContasModal } from './FolhaRateioContasModal.tsx';
import { getRateioUserErrorMessage } from './folhaRateioModalModel.ts';
import {
  buildFolhaRateioPessoas,
} from './folhaRateioSelectors.ts';
import {
  createFolhaRateioPanelSelection,
  deriveFolhaRateioProgress,
  filterFolhaRateioPessoas,
  folhaRateioPanelSelectionReducer,
  selectFolhaLancamentos,
  type FolhaRateioFiltro,
} from './folhaRateioPanelModel.ts';

export type FolhaRateioContasPanelProps = {
  folhaId: number;
  lancamentos: Lancamento[];
  onLancamentosChanged: () => Promise<void>;
  refreshToken?: number;
};

const CATEGORIA_LABELS = {
  staff_rateado: 'Staff',
  equipe_operacional: 'Operacional',
  professores: 'Professor',
} as const;

const STATUS_CONFIG = {
  a_conciliar: { label: 'A conciliar', variant: 'danger' },
  parcial: { label: 'Parcial', variant: 'warning' },
  conciliado: { label: 'Conciliado', variant: 'success' },
} as const;

function formatCentavos(value: number): string {
  return formatCurrency(value / 100);
}

function errorMessage(error: unknown): string {
  return getRateioUserErrorMessage(
    error,
    'Nao foi possivel carregar a conciliacao por conta pagadora.',
  );
}

export const FolhaRateioContasPanel: React.FC<FolhaRateioContasPanelProps> = ({
  folhaId,
  lancamentos,
  onLancamentosChanged,
  refreshToken = 0,
}) => {
  const { success: toastSuccess } = useToast();
  const [contas, setContas] = useState<FolhaContaPagadora[]>([]);
  const [preflight, setPreflight] = useState<FolhaRateioPreflight | null>(null);
  const [loadedFolhaId, setLoadedFolhaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FolhaRateioFiltro>('todos');
  const [selectionLifecycle, dispatchSelectionLifecycle] = useReducer(
    folhaRateioPanelSelectionReducer,
    folhaId,
    createFolhaRateioPanelSelection,
  );
  const [pendingRefreshError, setPendingRefreshError] = useState<string | null>(null);
  const selectionMatchesFolha = selectionLifecycle.folhaId === folhaId;
  const editingPessoa = selectionMatchesFolha ? selectionLifecycle.selectedPessoa : null;
  const pendingRefreshPessoaId = selectionMatchesFolha
    ? selectionLifecycle.pendingRefreshPessoaId
    : null;
  const refreshingPessoaId = selectionMatchesFolha
    ? selectionLifecycle.refreshingPessoaId
    : null;

  const refreshResources = async () => {
    const [nextContas, nextPreflight] = await Promise.all([
      fetchFolhaContasPagadoras(),
      fetchFolhaRateioPreflight(folhaId),
    ]);
    setContas(nextContas);
    setPreflight(nextPreflight);
    setLoadedFolhaId(folhaId);
    setError(null);
  };

  const handleSaved = async () => {
    try {
      await onLancamentosChanged();
      await refreshResources();
      dispatchSelectionLifecycle({ type: 'refresh_succeeded', folhaId });
      setPendingRefreshError(null);
      toastSuccess('Divisao por conta atualizada.');
    } catch (cause) {
      if (editingPessoa) {
        dispatchSelectionLifecycle({
          type: 'refresh_failed',
          folhaId,
          colaboradorId: editingPessoa.colaboradorId,
        });
      }
      setPendingRefreshError(errorMessage(cause));
      throw cause;
    }
  };

  const retryPendingRefresh = async (colaboradorId: number) => {
    if (pendingRefreshPessoaId !== colaboradorId || refreshingPessoaId !== null) return;
    dispatchSelectionLifecycle({ type: 'retry_refresh', folhaId, colaboradorId });
    setPendingRefreshError(null);
    try {
      await onLancamentosChanged();
      await refreshResources();
      dispatchSelectionLifecycle({ type: 'refresh_succeeded', folhaId });
      toastSuccess('Dados da divisao atualizados.');
    } catch (cause) {
      dispatchSelectionLifecycle({ type: 'refresh_failed', folhaId, colaboradorId });
      setPendingRefreshError(errorMessage(cause));
    }
  };

  useEffect(() => {
    dispatchSelectionLifecycle({ type: 'folha_changed', folhaId });
    setPendingRefreshError(null);
  }, [folhaId]);

  useEffect(() => {
    let cancelled = false;
    const preserveCurrent = loadedFolhaId === folhaId && preflight !== null;

    if (!preserveCurrent) {
      setLoading(true);
      setError(null);
      setLoadedFolhaId(null);
      setPreflight(null);
    }

    void Promise.all([
      fetchFolhaContasPagadoras(),
      fetchFolhaRateioPreflight(folhaId),
    ])
      .then(([nextContas, nextPreflight]) => {
        if (cancelled) return;
        setContas(nextContas);
        setPreflight(nextPreflight);
        setLoadedFolhaId(folhaId);
        dispatchSelectionLifecycle({ type: 'clear_pending_refresh', folhaId });
        setPendingRefreshError(null);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(errorMessage(cause));
        setLoadedFolhaId(folhaId);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folhaId, refreshToken, reloadKey]);

  const folhaLancamentos = useMemo(
    () => selectFolhaLancamentos(lancamentos, folhaId),
    [folhaId, lancamentos],
  );

  const pessoas = useMemo(
    () => buildFolhaRateioPessoas(folhaLancamentos, contas),
    [contas, folhaLancamentos],
  );

  const pessoasVisiveis = useMemo(
    () => filterFolhaRateioPessoas(pessoas, search, filtro),
    [filtro, pessoas, search],
  );

  if (loading || loadedFolhaId !== folhaId) return <LoadingSpinner />;

  if (error || !preflight) {
    return (
      <ErrorState
        message={error || 'Nao foi possivel carregar a conciliacao por conta pagadora.'}
        onRetry={() => setReloadKey((current) => current + 1)}
      />
    );
  }

  const progress = deriveFolhaRateioProgress(preflight);

  return (
    <>
      <section className="min-w-0 space-y-4" aria-label="Conciliacao por conta pagadora">
      <Card className="overflow-hidden border border-line bg-surface">
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted">Progresso da conciliacao</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-bold text-primary">{progress.reconciled}</span>
                <span className="text-sm text-secondary">de {progress.total} pessoas conciliadas</span>
              </div>
            </div>
            <Badge variant={preflight.pronto ? 'success' : 'warning'}>
              {preflight.pronto ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {preflight.pronto ? 'Pronto para concluir' : 'Ainda nao esta pronto'}
            </Badge>
          </div>

          <div>
            <div
              className="h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="Pessoas conciliadas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.percent)}
            >
              <div
                className={`h-full rounded-full ${preflight.pronto ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Pendentes</p>
                <p className="mt-0.5 text-sm font-semibold text-primary">{progress.pending}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Total</p>
                <p className="mt-0.5 text-sm font-semibold text-primary">{progress.total}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-muted">Diferenca</p>
                <p className={`mt-0.5 text-sm font-semibold ${preflight.diferenca === 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(preflight.diferenca)}
                </p>
              </div>
            </div>
          </div>

          {progress.diagnostics.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {progress.diagnostics.map((item) => (
                <Badge key={item.key} variant="danger">
                  {item.label}: {item.value}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {pessoas.length === 0 ? (
        <Card className="border border-line bg-surface p-8 text-center">
          <WalletCards className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-primary">Folha sem lancamentos</h3>
          <p className="mt-1 text-sm text-secondary">Nao ha pessoas para conciliar nesta folha.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">Buscar por nome ou funcao</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou funcao"
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-primary outline-none placeholder:text-muted focus:border-line-strong focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <div
              className="grid grid-cols-2 rounded-lg border border-line bg-surface-2 p-1"
              role="group"
              aria-label="Filtrar pessoas"
            >
              {([
                ['todos', 'Todos'],
                ['pendentes', 'Pendentes'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFiltro(value)}
                  aria-pressed={filtro === value}
                  className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                    filtro === value
                      ? 'bg-surface text-primary'
                      : 'text-muted hover:text-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {pessoasVisiveis.length === 0 ? (
            <div className="border-y border-line py-10 text-center">
              <p className="text-sm font-semibold text-primary">Nenhum resultado encontrado</p>
              <p className="mt-1 text-sm text-secondary">Revise a busca ou o filtro selecionado.</p>
            </div>
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {pessoasVisiveis.map((pessoa) => {
                const status = STATUS_CONFIG[pessoa.status];
                const refreshPending = pendingRefreshPessoaId === pessoa.colaboradorId;
                const refreshingPessoa = refreshingPessoaId === pessoa.colaboradorId;
                return (
                  <article key={pessoa.colaboradorId} className="min-w-0 py-4">
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="min-w-0 break-words text-sm font-semibold text-primary">
                            {pessoa.nome}
                          </h3>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <p className="mt-1 break-words text-xs text-secondary">
                          {pessoa.funcao || 'Funcao nao informada'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {pessoa.categorias.map((categoria) => (
                            <span
                              key={categoria.categoria}
                              className="rounded-md border border-line bg-bg px-2 py-1 text-xs text-secondary"
                            >
                              {CATEGORIA_LABELS[categoria.categoria]}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="min-w-0 flex-[1.4]">
                        <p className="text-xs font-medium text-muted">Contas pagadoras</p>
                        <div className="mt-1.5 flex min-w-0 flex-wrap gap-2">
                          {pessoa.contas.length > 0 ? pessoa.contas.map((conta) => (
                            <span
                              key={conta.contaId}
                              className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs"
                              title={`${conta.empresa} - ${conta.nome}`}
                            >
                              <span className="min-w-0 truncate text-secondary">
                                {conta.empresa} / {conta.nome}
                              </span>
                              <span className="shrink-0 font-semibold text-primary">
                                {formatCentavos(conta.totalCentavos)}
                              </span>
                            </span>
                          )) : (
                            <span className="text-xs text-danger">Sem conta pagadora</span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line pt-3 lg:w-48 lg:flex-col lg:items-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                        <div className="lg:text-right">
                          <p className="text-xs text-muted">Total consolidado</p>
                          <p className="mt-0.5 text-base font-bold text-primary">
                            {formatCentavos(pessoa.totalCentavos)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={refreshingPessoa}
                          className="min-h-9 px-3 py-2 text-xs"
                          onClick={() => {
                            if (refreshPending) {
                              void retryPendingRefresh(pessoa.colaboradorId);
                              return;
                            }
                            dispatchSelectionLifecycle({ type: 'select', pessoa });
                          }}
                        >
                          {refreshPending ? (
                            <>
                              <RefreshCw className={`h-4 w-4 ${refreshingPessoa ? 'animate-spin' : ''}`} aria-hidden="true" />
                              {refreshingPessoa ? 'Atualizando' : 'Tentar atualizar'}
                            </>
                          ) : 'Ajustar divisao'}
                        </Button>
                        {refreshPending && pendingRefreshError ? (
                          <p className="max-w-48 text-right text-xs text-danger" role="alert">
                            {pendingRefreshError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      </section>
      <FolhaRateioContasModal
        isOpen={editingPessoa !== null}
        pessoa={editingPessoa}
        contas={contas}
        onClose={() => dispatchSelectionLifecycle({ type: 'close_selection' })}
        onSaved={handleSaved}
      />
    </>
  );
};
