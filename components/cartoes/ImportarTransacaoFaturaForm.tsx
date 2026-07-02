import type React from 'react';
import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Loader2, Plus, ReceiptText, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CustomSelect, DatePicker, ToggleSwitch } from '../UI';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import { registrarTransacaoImportada } from '../../services/cartoesService';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useToast } from '../../hooks/useToast';
import { PlanoContaTreeSelect } from '../contas/PlanoContaTreeSelect';
import {
  buildTransacaoImportadaPayload,
  getCentroCustoIdDaEmpresa,
  getTransacaoImportadaClassificacaoState,
  validateTransacaoImportadaInput,
} from './cartoesFaturasSelectors';
import type {
  CartaoTipoTransacao,
  FinanceiroCartaoFatura,
  FinanceiroCartaoTransacaoImportadaPayload,
  FinanceiroCartaoTransacaoImportadaResponse,
} from '../../types/cartoes';
import type { FinanceiroEmpresa, PlanoConta } from '../../types/contasPagar';

type ImportFormState = {
  data_compra: string;
  descricao: string;
  estabelecimento: string;
  valor: string;
  tipo_transacao: CartaoTipoTransacao;
  is_parcela: boolean;
  parcela_atual: string;
  total_parcelas: string;
  observacoes: string;
  empresa_id: string;
  centro_custo_id: string;
  plano_conta_id: string;
};

const TIPO_OPTIONS: { value: CartaoTipoTransacao; label: string }[] = [
  { value: 'compra', label: 'Compra' },
  { value: 'estorno', label: 'Estorno' },
  { value: 'tarifa', label: 'Tarifa' },
  { value: 'anuidade', label: 'Anuidade' },
  { value: 'ajuste', label: 'Ajuste' },
];

const PARCELA_OPTIONS = Array.from({ length: 48 }, (_, idx) => {
  const value = String(idx + 1);
  return { value, label: value };
});

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

function makeIdExterno(faturaId: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual-${faturaId}-${suffix}`;
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

function buildInitialState(): ImportFormState {
  return {
    data_compra: todaySaoPaulo(),
    descricao: '',
    estabelecimento: '',
    valor: '',
    tipo_transacao: 'compra',
    is_parcela: false,
    parcela_atual: '1',
    total_parcelas: '2',
    observacoes: '',
    empresa_id: '',
    centro_custo_id: '',
    plano_conta_id: '',
  };
}

const empresaLabel = (empresa?: FinanceiroEmpresa | null) =>
  empresa?.label_operacional || empresa?.nome_fantasia || empresa?.razao_social || 'Sem empresa';

export const ImportarTransacaoFaturaForm: React.FC<{
  fatura: FinanceiroCartaoFatura;
  empresas: FinanceiroEmpresa[];
  planos: PlanoConta[];
  onCancel: () => void;
  onSuccess: (
    result: FinanceiroCartaoTransacaoImportadaResponse,
    payload: FinanceiroCartaoTransacaoImportadaPayload
  ) => void | Promise<void>;
}> = ({ fatura, empresas, planos, onCancel, onSuccess }) => {
  const { run } = useAsyncAction();
  const toast = useToast();
  const [form, setForm] = useState<ImportFormState>(() => buildInitialState());
  const [idExterno, setIdExterno] = useState(() => makeIdExterno(fatura.id));
  const [saving, setSaving] = useState(false);

  const valor = parseBRL(form.valor);
  const selectedEmpresa = useMemo(
    () => empresas.find((empresa) => empresa.id === form.empresa_id) || null,
    [empresas, form.empresa_id]
  );
  const selectedPlano = useMemo(
    () => planos.find((plano) => plano.id === form.plano_conta_id) || null,
    [form.plano_conta_id, planos]
  );
  const selectedCentroNome = selectedEmpresa?.unidade?.nome || 'Centro fixado pela empresa';
  const empresaOptions = useMemo(
    () => [
      { value: '', label: 'Deixar pendente' },
      ...empresas
        .filter((empresa) => empresa.ativo !== false)
        .map((empresa) => ({ value: empresa.id, label: empresaLabel(empresa) })),
    ],
    [empresas]
  );
  const input = useMemo(
    () => ({
      fatura_id: fatura.id,
      descricao: form.descricao,
      data_compra: form.data_compra,
      valor,
      tipo_transacao: form.tipo_transacao,
      estabelecimento: form.estabelecimento,
      observacoes: form.observacoes,
      is_parcela: form.is_parcela,
      parcela_atual: form.is_parcela ? Number(form.parcela_atual) : null,
      total_parcelas: form.is_parcela ? Number(form.total_parcelas) : null,
      empresa_id: form.empresa_id,
      centro_custo_id: form.centro_custo_id,
      plano_conta_id: form.plano_conta_id,
      plano_conta: selectedPlano,
    }),
    [form, fatura.id, selectedPlano, valor]
  );
  const classificacaoState = getTransacaoImportadaClassificacaoState(input);
  const isClassificacaoConfirmada = classificacaoState === 'confirmada';
  const validation = validateTransacaoImportadaInput(input);
  const canSubmit = !saving && !validation;

  const resetKeepDate = () => {
    setForm((current) => ({
      ...buildInitialState(),
      data_compra: current.data_compra,
    }));
    setIdExterno(makeIdExterno(fatura.id));
  };

  const setEmpresa = (empresaId: string) => {
    setForm((current) => ({
      ...current,
      empresa_id: empresaId,
      centro_custo_id: getCentroCustoIdDaEmpresa(empresas, empresaId),
    }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    const payload = buildTransacaoImportadaPayload(input, idExterno);
    setSaving(true);
    await run(
      async () => registrarTransacaoImportada(payload),
      {
        error: 'Nao foi possivel adicionar a transacao na fatura.',
        onSuccess: async (result) => {
          if (result.possivel_duplicata) {
            toast.info('Transacao adicionada, mas parece duplicada. Confira antes de prosseguir.');
          } else if (result.idempotent) {
            toast.info('Transacao ja registrada anteriormente.');
          } else {
            toast.success('Transacao adicionada a fatura.');
          }
          await onSuccess(result, payload);
          resetKeepDate();
        },
      }
    );
    setSaving(false);
  };

  return (
    <Card className="p-4 md:p-5 border border-line-strong bg-surface shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center shrink-0">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-black text-primary">Adicionar transacao manual</div>
            <div className="mt-1 text-sm font-bold text-secondary">
              Use para completar o extrato real desta fatura. Voce pode classificar agora ou deixar pendente.
            </div>
          </div>
        </div>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>

      {form.tipo_transacao === 'estorno' ? (
        <div className="mb-5 rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-sm font-bold text-secondary flex gap-3">
          <RotateCcw className="w-5 h-5 text-info shrink-0" />
          <span>Estorno entra como credito. Digite o valor positivo; o sistema registra essa transacao abatendo o total da fatura.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div>
          <FieldLabel required>Data</FieldLabel>
          <DatePicker value={form.data_compra} onChange={(value) => setForm((current) => ({ ...current, data_compra: value || '' }))} />
        </div>
        <div className="xl:col-span-2">
          <FieldLabel required>Descricao</FieldLabel>
          <TextInput
            value={form.descricao}
            onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
            placeholder="Ex.: OpenAI"
          />
        </div>
        <div>
          <FieldLabel>Estabelecimento</FieldLabel>
          <TextInput
            value={form.estabelecimento}
            onChange={(event) => setForm((current) => ({ ...current, estabelecimento: event.target.value }))}
            placeholder="Ex.: OpenAI"
          />
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

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1fr)] gap-4">
        <div>
          <FieldLabel required>Valor</FieldLabel>
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

        <div className="rounded-2xl border border-line bg-bg px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">E parcela?</div>
              <div className="mt-1 text-sm font-bold text-secondary">
                Marque quando estiver registrando uma parcela do extrato, como 2 de 6.
              </div>
            </div>
            <ToggleSwitch
              checked={form.is_parcela}
              onCheckedChange={(next) => setForm((current) => ({ ...current, is_parcela: next }))}
              variant="violet"
              ariaLabel="Marcar como parcela"
            />
          </div>
        </div>
      </div>

      {form.is_parcela ? (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-[160px_160px_minmax(0,1fr)] gap-4 items-end">
          <div>
            <FieldLabel>Parcela atual</FieldLabel>
            <CustomSelect
              value={form.parcela_atual}
              onValueChange={(value) => setForm((current) => ({ ...current, parcela_atual: value }))}
              options={PARCELA_OPTIONS}
            />
          </div>
          <div>
            <FieldLabel>Total parcelas</FieldLabel>
            <CustomSelect
              value={form.total_parcelas}
              onValueChange={(value) => setForm((current) => ({ ...current, total_parcelas: value }))}
              options={PARCELA_OPTIONS.slice(1)}
            />
          </div>
          <div className="rounded-2xl border border-line bg-bg/55 px-4 py-3 text-sm font-bold text-secondary">
            Vai entrar como <span className="text-primary">{form.parcela_atual} de {form.total_parcelas}</span> na fatura atual.
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <FieldLabel>Observacoes</FieldLabel>
        <TextArea
          rows={3}
          value={form.observacoes}
          onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
          placeholder="Referencia do extrato, comentario da Rose/Ana ou contexto da importacao."
        />
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface-2/55 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-2xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted">
                Classificacao fiscal opcional
              </div>
              <div className="mt-1 text-sm font-bold text-secondary">
                Preencha empresa e plano para ja confirmar. Deixe em branco para adicionar como pendente.
              </div>
            </div>
          </div>
          <Badge variant={isClassificacaoConfirmada ? 'success' : classificacaoState === 'parcial' ? 'warning' : 'default'}>
            {isClassificacaoConfirmada ? 'Nasce confirmada' : classificacaoState === 'parcial' ? 'Completar classificacao' : 'Nasce pendente'}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1fr)] gap-3">
          <div>
            <FieldLabel>Empresa</FieldLabel>
            <CustomSelect
              value={form.empresa_id}
              onValueChange={setEmpresa}
              options={empresaOptions}
              icon={Building2}
              disabled={saving}
            />
            <div className="mt-2 rounded-xl border border-line bg-surface px-3 py-2">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Centro fixado</div>
              <div className="mt-1 text-xs font-black text-secondary">
                {form.empresa_id ? selectedCentroNome : 'Escolha uma empresa para fixar o centro.'}
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Plano de contas</FieldLabel>
            <PlanoContaTreeSelect
              planos={planos}
              value={form.plano_conta_id}
              onValueChange={(planoId) => setForm((current) => ({ ...current, plano_conta_id: planoId }))}
              placeholder="Buscar folha de saida por codigo ou nome..."
              disabled={saving}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={isClassificacaoConfirmada ? 'success' : 'default'}>
            {isClassificacaoConfirmada ? 'Nasce confirmada' : 'Nasce pendente'}
          </Badge>
          <Badge variant="info">Importacao manual</Badge>
          {valor ? <Badge variant={form.tipo_transacao === 'estorno' ? 'success' : 'purple'}>{formatCurrency(form.tipo_transacao === 'estorno' ? -Math.abs(valor) : Math.abs(valor))}</Badge> : null}
        </div>
        <Button variant="primary" onClick={submit} disabled={!canSubmit} className="md:min-w-[210px]">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isClassificacaoConfirmada ? 'Adicionar e classificar' : 'Adicionar como pendente'}
        </Button>
      </div>

      {validation ? (
        <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs font-bold">{validation}</div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-success flex gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs font-bold">
            {isClassificacaoConfirmada
              ? 'Pronto para adicionar com classificacao confirmada.'
              : 'Pronto para adicionar como pendente.'}
          </div>
        </div>
      )}
    </Card>
  );
};
