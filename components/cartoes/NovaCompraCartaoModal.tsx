import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Loader2,
  ReceiptText,
  RotateCcw,
  Split,
} from 'lucide-react';
import { Badge, Button, Card, CustomSelect, DatePicker, Modal } from '../UI';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import { previewCicloCartao, registrarLancamentoCartao } from '../../services/cartoesService';
import type {
  CartaoTipoTransacao,
  FinanceiroCartao,
  FinanceiroCartaoCiclo,
  FinanceiroCartaoLancamentoResponse,
} from '../../types/cartoes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useToast } from '../../hooks/useToast';

type ParcelamentoModo = 'avista' | 'parcelado';
type ValorModo = 'total' | 'parcela';

type CompraFormState = {
  cartao_id: string;
  data_compra: string;
  descricao: string;
  estabelecimento: string;
  tipo_transacao: CartaoTipoTransacao;
  parcelamento: ParcelamentoModo;
  total_parcelas: string;
  valor_modo: ValorModo;
  valor: string;
  observacoes: string;
  client_token: string;
};

type PreviewRow = {
  parcela: number;
  data_compra: string;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  valor: number | null;
};

const TIPO_OPTIONS: { value: CartaoTipoTransacao; label: string }[] = [
  { value: 'compra', label: 'Compra' },
  { value: 'estorno', label: 'Estorno' },
  { value: 'tarifa', label: 'Tarifa' },
  { value: 'anuidade', label: 'Anuidade' },
  { value: 'ajuste', label: 'Ajuste' },
];

const PARCELAMENTO_OPTIONS = [
  { value: 'avista', label: 'A vista (1x)' },
  { value: 'parcelado', label: 'Parcelado' },
];

const PARCELAS_OPTIONS = Array.from({ length: 47 }, (_, idx) => {
  const value = String(idx + 2);
  return { value, label: `${value}x` };
});

const VALOR_MODO_OPTIONS = [
  { value: 'total', label: 'Valor total da compra' },
  { value: 'parcela', label: 'Valor de cada parcela' },
];

function todaySaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function makeClientToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cartao-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseBRL(raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/\s/g, '')
    .replace(/^R\$\s?/i, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || null;
  return Number(cleaned) || null;
}

function formatBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const value = Number(digits) / 100;
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addMonthsClamped(dateOnly: string, months: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1, 12, 0, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(dateOnly?: string | null): string {
  const value = String(dateOnly || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '--';
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function formatCompetencia(dateOnly?: string | null): string {
  const value = String(dateOnly || '').slice(0, 10);
  if (!/^\d{4}-\d{2}/.test(value)) return '--';
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function empresaLabel(cartao?: FinanceiroCartao | null): string {
  return cartao?.empresa?.label_operacional || cartao?.empresa?.nome_fantasia || cartao?.empresa?.razao_social || 'Sem empresa';
}

function cartaoLabel(cartao: FinanceiroCartao): string {
  return `${cartao.apelido} · •••• ${cartao.final} · ${empresaLabel(cartao)}`;
}

function buildInitialForm(cartoes: FinanceiroCartao[], selectedCartaoId?: string | null): CompraFormState {
  const activeCards = cartoes.filter((cartao) => cartao.ativo);
  const selected = activeCards.find((cartao) => cartao.id === selectedCartaoId) || activeCards[0];
  return {
    cartao_id: selected?.id || '',
    data_compra: todaySaoPaulo(),
    descricao: '',
    estabelecimento: '',
    tipo_transacao: 'compra',
    parcelamento: 'avista',
    total_parcelas: '2',
    valor_modo: 'total',
    valor: '',
    observacoes: '',
    client_token: makeClientToken(),
  };
}

function parcelaValues(input: {
  valor: number | null;
  totalParcelas: number;
  valorModo: ValorModo;
  tipo: CartaoTipoTransacao;
}): Array<number | null> {
  const { valor, totalParcelas, valorModo, tipo } = input;
  if (!valor || valor <= 0) return Array.from({ length: totalParcelas }, () => null);

  if (valorModo === 'parcela') {
    const signed = tipo === 'estorno' ? -Math.abs(valor) : Math.abs(valor);
    return Array.from({ length: totalParcelas }, () => signed);
  }

  const total = Math.abs(valor);
  const base = roundMoney(total / totalParcelas);
  let partial = 0;
  return Array.from({ length: totalParcelas }, (_, idx) => {
    const amount = idx < totalParcelas - 1 ? base : roundMoney(total - partial);
    partial = roundMoney(partial + amount);
    return tipo === 'estorno' ? -Math.abs(amount) : amount;
  });
}

function resultMessage(result: FinanceiroCartaoLancamentoResponse): string {
  const parcelas = result.parcelas || [];
  const first = parcelas[0];
  const anyIdempotent = parcelas.some((parcela) => parcela.idempotent);
  const prefix = anyIdempotent ? 'Lancamento ja registrado' : 'Compra lancada';
  if (result.total_parcelas > 1) {
    const last = parcelas[parcelas.length - 1];
    return `${prefix} · ${result.total_parcelas} parcelas · ${formatCompetencia(first?.competencia)} a ${formatCompetencia(last?.competencia)}`;
  }
  return `${prefix} · fatura de ${formatCompetencia(first?.competencia)}`;
}

const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-1">
    {children}{required ? ' *' : ''}
  </label>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={cn(
      'w-full rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-secondary placeholder:text-muted',
      'focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 disabled:cursor-not-allowed',
      className
    )}
  />
);

const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
  <textarea
    {...props}
    className={cn(
      'w-full rounded-2xl border border-line bg-bg px-5 py-4 text-sm font-bold text-secondary placeholder:text-muted resize-none',
      'focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 disabled:cursor-not-allowed',
      className
    )}
  />
);

export const NovaCompraCartaoModal: React.FC<{
  open: boolean;
  cartoes: FinanceiroCartao[];
  selectedCartaoId?: string | null;
  onClose: () => void;
  onSuccess: (result: FinanceiroCartaoLancamentoResponse) => void | Promise<void>;
}> = ({ open, cartoes, selectedCartaoId, onClose, onSuccess }) => {
  const { run } = useAsyncAction();
  const toast = useToast();
  const [form, setForm] = useState<CompraFormState>(() => buildInitialForm(cartoes, selectedCartaoId));
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Array<FinanceiroCartaoCiclo & { data_compra: string }>>([]);

  const activeCards = useMemo(() => cartoes.filter((cartao) => cartao.ativo), [cartoes]);
  const selectedCartao = activeCards.find((cartao) => cartao.id === form.cartao_id) || null;
  const totalParcelas = form.tipo_transacao === 'compra' && form.parcelamento === 'parcelado'
    ? Math.min(48, Math.max(2, Number(form.total_parcelas || 2)))
    : 1;
  const valor = parseBRL(form.valor);
  const valorModo: ValorModo = form.tipo_transacao === 'compra' && form.parcelamento === 'parcelado' ? form.valor_modo : 'total';
  const values = useMemo(
    () => parcelaValues({ valor, totalParcelas, valorModo, tipo: form.tipo_transacao }),
    [valor, totalParcelas, valorModo, form.tipo_transacao]
  );
  const previewRows: PreviewRow[] = useMemo(
    () =>
      cycles.map((cycle, idx) => ({
        parcela: idx + 1,
        data_compra: cycle.data_compra,
        competencia: cycle.competencia,
        data_fechamento: cycle.data_fechamento,
        data_vencimento: cycle.data_vencimento,
        valor: values[idx] ?? null,
      })),
    [cycles, values]
  );
  const totalPreview = values.reduce((sum, item) => sum + (item || 0), 0);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(cartoes, selectedCartaoId));
    setCycles([]);
    setPreviewError(null);
  }, [open, cartoes, selectedCartaoId]);

  useEffect(() => {
    if (form.tipo_transacao !== 'compra' && (form.parcelamento !== 'avista' || form.total_parcelas !== '2' || form.valor_modo !== 'total')) {
      setForm((current) => ({ ...current, parcelamento: 'avista', total_parcelas: '2', valor_modo: 'total' }));
    }
  }, [form.tipo_transacao, form.parcelamento, form.total_parcelas, form.valor_modo]);

  useEffect(() => {
    if (!open || !form.cartao_id || !form.data_compra) {
      setCycles([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const dates = Array.from({ length: totalParcelas }, (_, idx) => addMonthsClamped(form.data_compra, idx));
        const rows = await Promise.all(
          dates.map(async (date) => ({
            ...(await previewCicloCartao(form.cartao_id, date)),
            data_compra: date,
          }))
        );
        if (!cancelled) setCycles(rows);
      } catch (err: any) {
        if (!cancelled) {
          setCycles([]);
          setPreviewError(err?.message || 'Nao foi possivel calcular a fatura da compra.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, form.cartao_id, form.data_compra, totalParcelas]);

  const cartaoOptions = activeCards.map((cartao) => ({ value: cartao.id, label: cartaoLabel(cartao), icon: CreditCard }));
  const canSubmit = Boolean(form.cartao_id && form.data_compra && form.descricao.trim() && valor && valor > 0 && form.client_token && !saving && !previewError);

  const submit = async () => {
    if (!canSubmit || !valor) return;
    setSaving(true);
    await run(
      async () => {
        const result = await registrarLancamentoCartao({
          cartao_id: form.cartao_id,
          data_compra: form.data_compra,
          descricao: form.descricao,
          estabelecimento: form.estabelecimento || null,
          tipo_transacao: form.tipo_transacao,
          total_parcelas: totalParcelas,
          valor_total: valorModo === 'total' ? valor : null,
          valor_parcela: valorModo === 'parcela' ? valor : null,
          client_token: form.client_token,
          observacoes: form.observacoes || null,
        });
        return result;
      },
      {
        error: 'Nao foi possivel lancar a compra no cartao.',
        onSuccess: async (result) => {
          toast.success(resultMessage(result));
          await onSuccess(result);
          onClose();
        },
      }
    );
    setSaving(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Nova compra"
      subtitle="Lance compras no cartão sem classificar agora. A fatura nasce pelo ciclo oficial do banco."
      size="xl"
      headerIcon={
        <div className="w-11 h-11 rounded-2xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center">
          <ReceiptText className="w-5 h-5" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} className="px-6">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Lançar compra
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-5">
          {activeCards.length === 0 ? (
            <Card className="p-5 border-warning/30 bg-warning/10">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
                <div>
                  <div className="font-black text-primary">Nenhum cartão ativo</div>
                  <div className="mt-1 text-sm font-bold text-secondary">
                    Desarquive ou cadastre um cartão ativo antes de lançar compras.
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          <div>
            <FieldLabel required>Cartão</FieldLabel>
            <CustomSelect
              value={form.cartao_id}
              onValueChange={(value) => setForm((current) => ({ ...current, cartao_id: value }))}
              options={cartaoOptions}
              placeholder="Selecione o cartão"
              icon={CreditCard}
              disabled={activeCards.length === 0}
            />
            {selectedCartao ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="purple">{empresaLabel(selectedCartao)}</Badge>
                <Badge variant="info">•••• {selectedCartao.final}</Badge>
                <Badge variant="default">{selectedCartao.bandeira || 'Sem bandeira'}</Badge>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Data da compra</FieldLabel>
              <DatePicker value={form.data_compra} onChange={(value) => setForm((current) => ({ ...current, data_compra: value || '' }))} />
            </div>
            <div>
              <FieldLabel required>Tipo</FieldLabel>
              <CustomSelect
                value={form.tipo_transacao}
                onValueChange={(value) => setForm((current) => ({ ...current, tipo_transacao: value as CartaoTipoTransacao }))}
                options={TIPO_OPTIONS}
                icon={RotateCcw}
              />
            </div>
          </div>

          {form.tipo_transacao === 'estorno' ? (
            <Card className="p-4 border-info/30 bg-info/10">
              <div className="flex gap-3 text-sm font-bold text-secondary">
                <RotateCcw className="w-5 h-5 text-info shrink-0" />
                <span>Estorno entra como crédito. Informe o valor positivo; a RPC aplica o sinal correto.</span>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Descrição</FieldLabel>
              <TextInput
                value={form.descricao}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
                placeholder="Ex.: Compra de instrumento"
              />
            </div>
            <div>
              <FieldLabel>Estabelecimento</FieldLabel>
              <TextInput
                value={form.estabelecimento}
                onChange={(event) => setForm((current) => ({ ...current, estabelecimento: event.target.value }))}
                placeholder="Ex.: Mercado Livre"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Parcelamento</FieldLabel>
              <CustomSelect
                value={form.tipo_transacao === 'compra' ? form.parcelamento : 'avista'}
                onValueChange={(value) => setForm((current) => ({ ...current, parcelamento: value as ParcelamentoModo }))}
                options={PARCELAMENTO_OPTIONS}
                icon={Split}
                disabled={form.tipo_transacao !== 'compra'}
              />
            </div>
            {form.tipo_transacao === 'compra' && form.parcelamento === 'parcelado' ? (
              <div>
                <FieldLabel>Quantidade de parcelas</FieldLabel>
                <CustomSelect
                  value={form.total_parcelas}
                  onValueChange={(value) => setForm((current) => ({ ...current, total_parcelas: value }))}
                  options={PARCELAS_OPTIONS}
                  icon={Split}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface-2/40 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Parcelas</div>
                <div className="mt-1 text-lg font-black text-primary">1x</div>
              </div>
            )}
          </div>

          {form.tipo_transacao === 'compra' && form.parcelamento === 'parcelado' ? (
            <div>
              <FieldLabel>Modo do valor</FieldLabel>
              <CustomSelect
                value={form.valor_modo}
                onValueChange={(value) => setForm((current) => ({ ...current, valor_modo: value as ValorModo }))}
                options={VALOR_MODO_OPTIONS}
              />
            </div>
          ) : null}

          <div>
            <FieldLabel required>{valorModo === 'parcela' ? 'Valor de cada parcela' : form.parcelamento === 'parcelado' ? 'Valor total da compra' : 'Valor'}</FieldLabel>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-black text-muted">R$</span>
              <TextInput
                value={form.valor}
                onChange={(event) => setForm((current) => ({ ...current, valor: formatBRLInput(event.target.value) }))}
                placeholder="0,00"
                inputMode="decimal"
                className="pl-12 text-lg"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Observações</FieldLabel>
            <TextArea
              rows={4}
              value={form.observacoes}
              onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
              placeholder="Contexto do lançamento, pedido da Rose/Ana ou referência da compra."
            />
          </div>

          <div className="rounded-2xl border border-line bg-surface-2/35 px-4 py-3 text-xs font-bold text-muted">
            Token desta abertura: <span className="font-mono text-secondary">{form.client_token.slice(0, 8)}...</span>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-info/15 border border-info/25 text-info flex items-center justify-center">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-primary">Preview da fatura</div>
                <div className="text-xs font-bold text-muted">Calculado pela RPC do ciclo</div>
              </div>
            </div>

            {previewLoading ? (
              <div className="mt-6 flex items-center gap-3 text-sm font-bold text-secondary">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                Calculando fatura...
              </div>
            ) : previewError ? (
              <div className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-bold text-danger">
                {previewError}
              </div>
            ) : previewRows.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-line bg-surface-2/35 p-4 text-sm font-bold text-secondary">
                Selecione cartão e data para ver onde a compra cai.
              </div>
            ) : previewRows.length === 1 ? (
              <div className="mt-5 rounded-2xl border border-line bg-surface-2/35 p-4">
                <div className="text-lg font-black text-primary">Fatura de {formatCompetencia(previewRows[0].competencia)}</div>
                <div className="mt-2 text-sm font-bold text-secondary">
                  Fecha {formatDateBR(previewRows[0].data_fechamento)} · vence {formatDateBR(previewRows[0].data_vencimento)}
                </div>
                <div className="mt-4 text-2xl font-black text-primary">
                  {previewRows[0].valor == null ? 'Informe o valor' : formatCurrency(previewRows[0].valor)}
                </div>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-line">
                <div className="max-h-[360px] overflow-y-auto">
                  {previewRows.map((row) => (
                    <div key={`${row.parcela}-${row.competencia}`} className="grid grid-cols-[54px_minmax(0,1fr)_auto] gap-3 border-b border-line last:border-b-0 px-3 py-3">
                      <div className="text-xs font-black text-accent">{row.parcela}/{totalParcelas}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-primary">Fatura {formatCompetencia(row.competencia)}</div>
                        <div className="text-[11px] font-bold text-muted">vence {formatDateBR(row.data_vencimento)}</div>
                      </div>
                      <div className="text-right text-sm font-black text-primary">
                        {row.valor == null ? '--' : formatCurrency(row.valor)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-surface-2/35">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Resumo</div>
            <div className="mt-3 space-y-2 text-sm font-bold text-secondary">
              <div className="flex justify-between gap-3">
                <span>Parcelas</span>
                <span className="text-primary">{totalParcelas}x</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Total previsto</span>
                <span className="text-primary">{valor ? formatCurrency(totalPreview) : '--'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Origem</span>
                <span className="text-primary">Web</span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-bg/45 p-3 text-xs font-bold text-muted">
              A compra nasce sem classificação. Plano, empresa e centro ficam para a etapa de classificação.
            </div>
          </Card>
        </div>
      </div>
    </Modal>
  );
};
