import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Lightbulb, RefreshCw, Save, ShieldCheck } from 'lucide-react';

import type { CollaboratorDepartment } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';
import { saveFolhaRateio } from '../../services/folhaRateioService.ts';
import { Badge, Button, CustomSelect, Modal } from '../UI';
import {
  buildFolhaRateioDraft,
  buildFolhaRateioPayload,
  validateFolhaRateioDraft,
  type FolhaRateioDraft,
  type FolhaRateioDraftCategoria,
  type FolhaRateioPessoa,
  type RateioComponente,
} from './folhaRateioSelectors.ts';
import {
  applyFolhaRateioSuggestion,
  createFolhaRateioSaveLifecycle,
  folhaRateioSaveLifecycleReducer,
  formatBrlCents,
  getActiveRateioComponents,
  getCategoryDistributedNetCentavos,
  getComponentRemainingCentavos,
  getContaPagadoraLabel,
  getFolhaRateioSuggestion,
  getFolhaRateioTotals,
  getNetCentavos,
  getRateioUserErrorMessage,
  getRateioValidationCodeMessage,
  getRateioValidationMessage,
  parseBrlCents,
  updateInvalidRateioFields,
  updateFolhaRateioAnchor,
  updateFolhaRateioCell,
} from './folhaRateioModalModel.ts';

export type FolhaRateioContasModalProps = {
  isOpen: boolean;
  pessoa: FolhaRateioPessoa | null;
  contas: FolhaContaPagadora[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const CATEGORIA_LABELS: Record<CollaboratorDepartment, string> = {
  staff_rateado: 'Staff',
  equipe_operacional: 'Operacional',
  professores: 'Professor',
};

const COMPONENTE_LABELS: Record<RateioComponente, string> = {
  salario: 'Salario',
  bonus: 'Bonus',
  comissao: 'Comissao',
  reembolso: 'Reembolso',
  passagem: 'Passagem',
  inss: 'INSS',
  descontos: 'Descontos',
};

function MoneyInput({
  fieldId,
  value,
  label,
  disabled,
  onChange,
  onTextChange,
}: {
  fieldId: string;
  value: number;
  label: string;
  disabled: boolean;
  onChange: (centavos: number) => void;
  onTextChange: (fieldId: string, rawValue: string) => void;
}) {
  const focused = useRef(false);
  const [text, setText] = useState(() => formatBrlCents(value));

  useEffect(() => {
    if (!focused.current) setText(formatBrlCents(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-label={label}
      aria-invalid={parseBrlCents(text) === null}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        const formatted = formatBrlCents(value);
        setText(formatted);
        onTextChange(fieldId, formatted);
      }}
      onChange={(event) => {
        setText(event.target.value);
        onTextChange(fieldId, event.target.value);
        const parsed = parseBrlCents(event.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      className="h-10 w-full rounded-md border border-line bg-bg px-2 text-right text-sm font-semibold text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function Remaining({ value }: { value: number }) {
  const complete = value === 0;
  return (
    <span role="status" aria-live="polite">
      <Badge variant={complete ? 'success' : 'danger'} className="whitespace-nowrap">
        {complete ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
        Restante {formatBrlCents(value)}
      </Badge>
    </span>
  );
}

function CategoryHeader({
  draft,
  categoria,
  disabled,
  onApplySuggestion,
}: {
  draft: FolhaRateioDraft;
  categoria: FolhaRateioDraftCategoria;
  disabled: boolean;
  onApplySuggestion: (contaId: string) => void;
}) {
  const suggestion = getFolhaRateioSuggestion(draft, categoria.categoria);
  const currentAccounts = draft.contas.filter((conta) =>
    getNetCentavos(categoria.porConta[conta.id]) !== 0);

  return (
    <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-base font-bold text-primary">
            {CATEGORIA_LABELS[categoria.categoria]}
          </h3>
          <span className="text-sm font-semibold text-secondary">
            {formatBrlCents(getNetCentavos(categoria.totais))}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {currentAccounts.length > 0 ? currentAccounts.map((conta) => (
            <span
              key={conta.id}
              className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-secondary"
            >
              {getContaPagadoraLabel(conta)}: {formatBrlCents(getNetCentavos(categoria.porConta[conta.id]))}
            </span>
          )) : (
            <span className="text-xs text-muted">Ainda sem distribuicao</span>
          )}
        </div>
      </div>

      {suggestion ? (
        <Button
          variant="outline"
          disabled={disabled}
          className="min-h-9 shrink-0 px-3 py-2 text-xs"
          onClick={() => onApplySuggestion(suggestion.contaId)}
        >
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          Aplicar sugestao {suggestion.unidade === 'rec' ? 'Recreio' : 'Barra'}
        </Button>
      ) : null}
    </div>
  );
}

function DesktopMatrix({
  draft,
  categoria,
  disabled,
  onCellChange,
  onFieldTextChange,
}: {
  draft: FolhaRateioDraft;
  categoria: FolhaRateioDraftCategoria;
  disabled: boolean;
  onCellChange: (contaId: string, componente: RateioComponente, value: number) => void;
  onFieldTextChange: (fieldId: string, rawValue: string) => void;
}) {
  const componentesAtivos = getActiveRateioComponents(categoria);
  const requiresScroll = draft.contas.length > 4;
  return (
    <div className="hidden lg:block">
      <div className="max-w-full overflow-x-auto">
        <table
          className={`w-full border-collapse text-left ${requiresScroll ? '' : 'table-fixed'}`}
          style={requiresScroll ? { minWidth: 280 + (draft.contas.length * 180) } : undefined}
        >
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="w-36 px-2 py-3 font-semibold">Componente</th>
              {draft.contas.map((conta) => (
                <th key={conta.id} className="px-2 py-3 font-semibold">
                  <span className="block truncate" title={getContaPagadoraLabel(conta)}>
                    {getContaPagadoraLabel(conta)}
                  </span>
                </th>
              ))}
              <th className="w-32 px-2 py-3 text-right font-semibold">Total original</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {componentesAtivos.map((componente) => {
              const restanteCentavos = getComponentRemainingCentavos(categoria, componente);
              return (
                <tr key={componente}>
                  <th className="px-2 py-3 align-middle">
                    <span className="block text-sm font-semibold text-primary">
                      {COMPONENTE_LABELS[componente]}
                    </span>
                    <Remaining value={restanteCentavos} />
                  </th>
                  {draft.contas.map((conta) => (
                    <td key={conta.id} className="px-2 py-2">
                      <MoneyInput
                        fieldId={`${categoria.categoria}:${conta.id}:${componente}`}
                        value={categoria.porConta[conta.id][componente]}
                        disabled={disabled}
                        label={`${COMPONENTE_LABELS[componente]}, ${getContaPagadoraLabel(conta)}, ${CATEGORIA_LABELS[categoria.categoria]}`}
                        onChange={(value) => onCellChange(conta.id, componente, value)}
                        onTextChange={onFieldTextChange}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right text-sm font-bold text-primary">
                    {formatBrlCents(categoria.totais[componente])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileAccounts({
  draft,
  categoria,
  disabled,
  onCellChange,
  onFieldTextChange,
}: {
  draft: FolhaRateioDraft;
  categoria: FolhaRateioDraftCategoria;
  disabled: boolean;
  onCellChange: (contaId: string, componente: RateioComponente, value: number) => void;
  onFieldTextChange: (fieldId: string, rawValue: string) => void;
}) {
  const componentesAtivos = getActiveRateioComponents(categoria);
  return (
    <div className="space-y-5 lg:hidden">
      {draft.contas.map((conta) => (
        <section key={conta.id} className="border-b border-line pb-5 last:border-b-0 last:pb-0">
          <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
            <h4 className="min-w-0 break-words text-sm font-bold text-primary">
              {getContaPagadoraLabel(conta)}
            </h4>
            <span className="shrink-0 text-sm font-semibold text-secondary">
              {formatBrlCents(getNetCentavos(categoria.porConta[conta.id]))}
            </span>
          </div>
          <div className="space-y-3">
            {componentesAtivos.map((componente) => {
              const restanteCentavos = getComponentRemainingCentavos(categoria, componente);
              return (
                <label key={componente} className="block">
                  <span className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-secondary">
                      {COMPONENTE_LABELS[componente]}
                    </span>
                    <Remaining value={restanteCentavos} />
                  </span>
                  <MoneyInput
                    fieldId={`${categoria.categoria}:${conta.id}:${componente}`}
                    value={categoria.porConta[conta.id][componente]}
                    disabled={disabled}
                    label={`${COMPONENTE_LABELS[componente]}, ${getContaPagadoraLabel(conta)}, ${CATEGORIA_LABELS[categoria.categoria]}`}
                    onChange={(value) => onCellChange(conta.id, componente, value)}
                    onTextChange={onFieldTextChange}
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export const FolhaRateioContasModal: React.FC<FolhaRateioContasModalProps> = ({
  isOpen,
  pessoa,
  contas,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState<FolhaRateioDraft | null>(null);
  const [saveLifecycle, dispatchSaveLifecycle] = useReducer(
    folhaRateioSaveLifecycleReducer,
    undefined,
    createFolhaRateioSaveLifecycle,
  );
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const openedPessoaId = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && pessoa) {
      const openingPessoa = openedPessoaId.current !== pessoa.colaboradorId;
      if (openingPessoa || saveLifecycle.phase === 'editing') {
        setDraft(buildFolhaRateioDraft(pessoa.lancamentos, contas));
        setError(null);
        setInvalidFields(new Set());
      }
      if (openingPessoa) {
        openedPessoaId.current = pessoa.colaboradorId;
        dispatchSaveLifecycle({ type: 'reset' });
      }
      return;
    }
    openedPessoaId.current = null;
    setDraft(null);
  }, [isOpen, pessoa, contas]);

  const validation = useMemo(
    () => draft ? validateFolhaRateioDraft(draft) : null,
    [draft],
  );
  const totals = useMemo(
    () => draft ? getFolhaRateioTotals(draft) : null,
    [draft],
  );
  const validationMessage = useMemo(
    () => validation ? getRateioValidationMessage(validation) : null,
    [validation],
  );
  const saving = saveLifecycle.phase === 'saving';
  const refreshing = saveLifecycle.phase === 'refreshing';
  const savedRemotely = saveLifecycle.phase === 'refreshing'
    || saveLifecycle.phase === 'refresh_pending'
    || saveLifecycle.phase === 'completed';
  const disabled = saving || refreshing || savedRemotely;
  const hasInvalidFields = invalidFields.size > 0;

  const handleFieldTextChange = (fieldId: string, rawValue: string) => {
    setInvalidFields((current) => updateInvalidRateioFields(current, fieldId, rawValue));
  };

  const retryRefresh = async () => {
    if (saveLifecycle.phase !== 'refresh_pending') return;
    dispatchSaveLifecycle({ type: 'retry_refresh' });
    setError(null);
    try {
      await onSaved();
      dispatchSaveLifecycle({ type: 'refresh_succeeded' });
    } catch (cause) {
      const message = getRateioUserErrorMessage(
        cause,
        'Nao foi possivel atualizar os dados. Tente novamente.',
      );
      setError(`A divisao continua salva, mas a tela nao atualizou. ${message}`);
      dispatchSaveLifecycle({ type: 'refresh_failed' });
    }
  };

  const handleSave = async () => {
    if (
      !draft
      || !validation?.valid
      || invalidFields.size > 0
      || saveLifecycle.phase !== 'editing'
    ) return;
    dispatchSaveLifecycle({ type: 'submit' });
    setError(null);
    try {
      await saveFolhaRateio({
        folhaId: draft.folhaId,
        colaboradorId: draft.colaboradorId,
        fatias: buildFolhaRateioPayload(draft),
      });
      dispatchSaveLifecycle({ type: 'remote_saved' });
      try {
        await onSaved();
        dispatchSaveLifecycle({ type: 'refresh_succeeded' });
      } catch (cause) {
        const message = getRateioUserErrorMessage(
          cause,
          'Nao foi possivel atualizar os dados. Tente novamente.',
        );
        setError(`A divisao foi salva, mas a tela nao atualizou. ${message}`);
        dispatchSaveLifecycle({ type: 'refresh_failed' });
      }
    } catch (cause) {
      setError(getRateioUserErrorMessage(
        cause,
        'Nao foi possivel salvar a divisao. Tente novamente.',
      ));
      dispatchSaveLifecycle({ type: 'save_failed' });
    }
  };

  if (!draft || !pessoa || !validation || !totals) return null;

  const footer = (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted">Total da pessoa</p>
          <p className="mt-1 break-words text-sm font-bold text-primary sm:text-base">
            {formatBrlCents(totals.sourceNetCentavos)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">Total distribuido</p>
          <p className="mt-1 break-words text-sm font-bold text-primary sm:text-base">
            {formatBrlCents(totals.distributedNetCentavos)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted">Diferenca</p>
          <p className={`mt-1 break-words text-sm font-bold sm:text-base ${totals.differenceCentavos === 0 ? 'text-success' : 'text-danger'}`}>
            {formatBrlCents(totals.differenceCentavos)}
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : hasInvalidFields || validationMessage ? (
        <p className="text-xs text-danger" role="status" aria-live="polite">
          {hasInvalidFields
            ? 'Revise os campos monetarios incompletos ou invalidos.'
            : validationMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={saving || refreshing} onClick={onClose}>
          {savedRemotely ? 'Fechar' : 'Cancelar'}
        </Button>
        {savedRemotely ? (
          <Button variant="primary" disabled={refreshing} onClick={() => void retryRefresh()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Atualizando' : 'Tentar atualizar'}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={saving || hasInvalidFields || !validation.valid}
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando' : 'Salvar divisao'}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving && !refreshing) onClose();
      }}
      title={`Dividir pagamento de ${pessoa.nome}`}
      subtitle={`Total consolidado ${formatBrlCents(pessoa.totalCentavos)}. Edicao somente desta folha mensal.`}
      className="max-w-[min(96vw,88rem)] rounded-lg"
      overlayClassName="folha-rateio-modal-overlay"
      footer={footer}
    >
      <div className="space-y-8">
        {savedRemotely ? (
          <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-secondary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-bold text-primary">Divisao salva</p>
              <p className="mt-1">A gravacao foi concluida. Falta apenas atualizar os dados exibidos.</p>
            </div>
          </div>
        ) : null}

        {draft.categorias.map((categoria) => {
          const protegidos = draft.protegidos.filter(
            (item) => item.categoria === categoria.categoria,
          );
          const anchorProblems = validation.problemas.filter((problem) =>
            problem.categoria === categoria.categoria
            && (
              problem.codigo === 'ancora_ausente'
              || problem.codigo === 'ancora_protegida_duplicada'
              || problem.codigo === 'ancora_sem_valores'
            ));
          return (
            <section key={categoria.categoria} className="space-y-5 border-b border-line pb-8 last:border-b-0 last:pb-0">
              <CategoryHeader
                draft={draft}
                categoria={categoria}
                disabled={disabled}
                onApplySuggestion={(contaId) => {
                  setDraft((current) => current
                    ? applyFolhaRateioSuggestion(current, categoria.categoria, contaId)
                    : current);
                }}
              />

              <DesktopMatrix
                draft={draft}
                categoria={categoria}
                disabled={disabled}
                onCellChange={(contaId, componente, value) => {
                  setDraft((current) => current
                    ? updateFolhaRateioCell(current, categoria.categoria, contaId, componente, value)
                    : current);
                }}
                onFieldTextChange={handleFieldTextChange}
              />
              <MobileAccounts
                draft={draft}
                categoria={categoria}
                disabled={disabled}
                onCellChange={(contaId, componente, value) => {
                  setDraft((current) => current
                    ? updateFolhaRateioCell(current, categoria.categoria, contaId, componente, value)
                    : current);
                }}
                onFieldTextChange={handleFieldTextChange}
              />

              <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                <span className="text-secondary">Subtotal distribuido</span>
                <span className="font-bold text-primary">
                  {formatBrlCents(getCategoryDistributedNetCentavos(categoria))}
                </span>
              </div>

              {protegidos.length > 0 ? (
                <div className="space-y-3 border-t border-line pt-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                    <h4 className="text-sm font-bold text-primary">Detalhes preservados</h4>
                  </div>
                  {protegidos.map((protegido) => (
                    <div key={protegido.lancamentoId} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary">
                          {CATEGORIA_LABELS[protegido.categoria]}
                        </p>
                        <p className="mt-0.5 break-words text-xs text-secondary">
                          {protegido.label}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted">
                          Manter detalhes desta fatia em
                        </p>
                        <CustomSelect
                          value={draft.ancoras[protegido.lancamentoId] || ''}
                          disabled={disabled}
                          placeholder="Escolha uma conta"
                          onValueChange={(contaId) => {
                            setDraft((current) => current
                              ? updateFolhaRateioAnchor(current, protegido.lancamentoId, contaId)
                              : current);
                          }}
                          options={[
                            { value: '', label: 'Escolha uma conta' },
                            ...draft.contas.map((conta) => ({
                              value: conta.id,
                              label: getContaPagadoraLabel(conta),
                            })),
                          ]}
                          className="rounded-md"
                        />
                      </div>
                    </div>
                  ))}
                  {anchorProblems.map((problem, index) => (
                    <p
                      key={`${problem.codigo}-${problem.lancamentoId || problem.contaId || index}`}
                      className="flex items-start gap-2 text-xs font-semibold text-danger"
                      role="alert"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{getRateioValidationCodeMessage(problem.codigo)}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </Modal>
  );
};
