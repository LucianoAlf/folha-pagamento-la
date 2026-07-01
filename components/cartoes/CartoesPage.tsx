import React, { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Archive,
  Building2,
  CreditCard,
  Edit2,
  Landmark,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, CustomSelect, ErrorState, LoadingSpinner, Modal, ToggleSwitch } from '../UI';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import { arquivarCartao, fetchCartoesDashboard, salvarCartao } from '../../services/cartoesService';
import type { CentroCusto, FinanceiroContaBancaria, FinanceiroEmpresa } from '../../types/contasPagar';
import type { CartaoTitularidadeTipo, FinanceiroCartao, FinanceiroCartaoPayload } from '../../types/cartoes';
import { useAsyncAction } from '../../hooks/useAsyncAction';

type CartaoFormState = {
  cartao_id?: string;
  apelido: string;
  final: string;
  titularidade_tipo: CartaoTitularidadeTipo;
  titular: string;
  bandeira: string;
  empresa_id: string;
  conta_pagadora_id: string;
  centro_custo_id: string;
  dia_fechamento: string;
  dia_vencimento: string;
  limite: string;
  observacoes: string;
};

const EMPTY_FORM: CartaoFormState = {
  apelido: '',
  final: '',
  titularidade_tipo: 'pj',
  titular: '',
  bandeira: '',
  empresa_id: '',
  conta_pagadora_id: '',
  centro_custo_id: '',
  dia_fechamento: '',
  dia_vencimento: '',
  limite: '',
  observacoes: '',
};

const DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => {
  const value = String(idx + 1);
  return { value, label: value.padStart(2, '0') };
});

const TITULARIDADE_OPTIONS = [
  { value: 'pj', label: 'PJ (empresa)' },
  { value: 'pf', label: 'PF (pessoa física)' },
];

const BANDEIRA_OPTIONS = [
  { value: '', label: 'Não informado' },
  { value: 'Visa', label: 'Visa' },
  { value: 'Mastercard', label: 'Mastercard' },
  { value: 'Elo', label: 'Elo' },
  { value: 'Amex', label: 'American Express' },
  { value: 'Hipercard', label: 'Hipercard' },
  { value: 'Outro', label: 'Outro' },
];

const TONE_CLASSES = [
  'bg-accent/15 text-accent border-accent/25',
  'bg-info/15 text-info border-info/25',
  'bg-success/15 text-success border-success/25',
  'bg-warning/15 text-warning border-warning/25',
];

function parseBRL(raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/\s/g, '')
    .replace(/^R\$\s?/i, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || null;
  return Number(cleaned) || null;
}

function formatBRLInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeFinal(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

function empresaLabel(empresa?: FinanceiroEmpresa | null): string {
  return empresa?.label_operacional || empresa?.nome_fantasia || empresa?.razao_social || 'Sem empresa';
}

function contaLabel(conta?: FinanceiroContaBancaria | null): string {
  if (!conta) return 'Sem conta pagadora';
  return [conta.apelido, conta.banco, conta.conta ? `cc ${conta.conta}` : null].filter(Boolean).join(' · ');
}

function cartaoToForm(cartao: FinanceiroCartao): CartaoFormState {
  return {
    cartao_id: cartao.id,
    apelido: cartao.apelido || '',
    final: sanitizeFinal(cartao.final || ''),
    titularidade_tipo: cartao.titularidade_tipo || 'pj',
    titular: cartao.titular || '',
    bandeira: cartao.bandeira || '',
    empresa_id: cartao.empresa_id || '',
    conta_pagadora_id: cartao.conta_pagadora_id || '',
    centro_custo_id: cartao.centro_custo_id || '',
    dia_fechamento: cartao.dia_fechamento ? String(cartao.dia_fechamento) : '',
    dia_vencimento: cartao.dia_vencimento ? String(cartao.dia_vencimento) : '',
    limite: formatBRLInput(cartao.limite),
    observacoes: cartao.observacoes || '',
  };
}

function formToPayload(form: CartaoFormState): FinanceiroCartaoPayload {
  const payload: FinanceiroCartaoPayload = {
    apelido: form.apelido.trim(),
    final: sanitizeFinal(form.final),
    titularidade_tipo: form.titularidade_tipo,
    titular: form.titular.trim() || null,
    bandeira: form.bandeira || null,
    empresa_id: form.empresa_id || null,
    conta_pagadora_id: form.conta_pagadora_id || null,
    centro_custo_id: form.centro_custo_id || null,
    dia_fechamento: form.dia_fechamento ? Number(form.dia_fechamento) : null,
    dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
    limite: parseBRL(form.limite),
    observacoes: form.observacoes.trim() || null,
  };
  if (form.cartao_id) payload.cartao_id = form.cartao_id;
  return payload;
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

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  variant?: 'accent' | 'info' | 'success' | 'warning';
}> = ({ title, value, subtitle, icon: Icon, variant = 'accent' }) => {
  const tone =
    variant === 'info'
      ? 'bg-info/15 text-info border-info/25'
      : variant === 'success'
        ? 'bg-success/15 text-success border-success/25'
        : variant === 'warning'
          ? 'bg-warning/15 text-warning border-warning/25'
          : 'bg-accent/15 text-accent border-accent/25';

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className={cn('w-11 h-11 rounded-2xl border flex items-center justify-center', tone)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-muted">{title}</div>
      <div className="mt-2 text-2xl md:text-3xl font-black text-primary tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-bold text-secondary">{subtitle}</div>
    </Card>
  );
};

const CartaoDialog: React.FC<{
  open: boolean;
  form: CartaoFormState;
  saving: boolean;
  empresas: FinanceiroEmpresa[];
  contasBancarias: FinanceiroContaBancaria[];
  centrosCusto: CentroCusto[];
  onClose: () => void;
  onChange: (next: CartaoFormState) => void;
  onSubmit: () => void;
}> = ({ open, form, saving, empresas, contasBancarias, centrosCusto, onClose, onChange, onSubmit }) => {
  const selectedEmpresa = empresas.find((empresa) => empresa.id === form.empresa_id) || null;
  const contasFiltradas = form.empresa_id
    ? contasBancarias.filter((conta) => conta.empresa_id === form.empresa_id)
    : contasBancarias;
  const centrosFiltrados = selectedEmpresa?.unidade_id
    ? centrosCusto.filter((centro) => centro.id === selectedEmpresa.unidade_id)
    : centrosCusto;

  const empresaOptions = [
    { value: '', label: 'Sem empresa' },
    ...empresas.map((empresa) => ({ value: empresa.id, label: empresaLabel(empresa) })),
  ];
  const contaOptions = [
    { value: '', label: 'Sem conta pagadora' },
    ...contasFiltradas.map((conta) => ({ value: conta.id, label: contaLabel(conta) })),
  ];
  const centroOptions = [
    { value: '', label: 'Sem centro de custo' },
    ...centrosFiltrados.map((centro) => ({ value: centro.id, label: `${centro.nome} (${centro.codigo.toUpperCase()})` })),
  ];

  useEffect(() => {
    if (!open) return;
    if (form.empresa_id && form.conta_pagadora_id && !contasFiltradas.some((conta) => conta.id === form.conta_pagadora_id)) {
      onChange({ ...form, conta_pagadora_id: '' });
      return;
    }
    if (form.empresa_id && selectedEmpresa?.unidade_id && form.centro_custo_id !== selectedEmpresa.unidade_id) {
      onChange({ ...form, centro_custo_id: selectedEmpresa.unidade_id });
    }
  }, [open, form, contasFiltradas, selectedEmpresa, onChange]);

  const requiredOk = form.apelido.trim() && sanitizeFinal(form.final).length === 4 && form.titularidade_tipo;
  const title = form.cartao_id ? 'Editar cartão' : 'Novo cartão';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      subtitle="Cadastre apenas os 4 dígitos finais. A ativação fica na ação Arquivar/Desarquivar."
      size="xl"
      headerIcon={<div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center"><CreditCard className="w-5 h-5" /></div>}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={onSubmit} disabled={saving || !requiredOk} className="px-6">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Salvar cartão
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <FieldLabel required>Apelido</FieldLabel>
          <TextInput
            value={form.apelido}
            onChange={(e) => onChange({ ...form, apelido: e.target.value })}
            placeholder="Ex.: Visa Kids CG"
            autoFocus
          />
        </div>

        <div>
          <FieldLabel required>Final do cartão</FieldLabel>
          <TextInput
            value={form.final}
            onChange={(e) => onChange({ ...form, final: sanitizeFinal(e.target.value) })}
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
          />
        </div>

        <div>
          <FieldLabel required>Titularidade</FieldLabel>
          <CustomSelect
            value={form.titularidade_tipo}
            onValueChange={(value) => onChange({ ...form, titularidade_tipo: value as CartaoTitularidadeTipo })}
            options={TITULARIDADE_OPTIONS}
          />
        </div>

        <div>
          <FieldLabel>Titular</FieldLabel>
          <TextInput
            value={form.titular}
            onChange={(e) => onChange({ ...form, titular: e.target.value })}
            placeholder="Nome impresso ou responsável"
          />
        </div>

        <div>
          <FieldLabel>Bandeira</FieldLabel>
          <CustomSelect
            value={form.bandeira}
            onValueChange={(value) => onChange({ ...form, bandeira: value })}
            options={BANDEIRA_OPTIONS}
          />
        </div>

        <div>
          <FieldLabel>Empresa</FieldLabel>
          <CustomSelect
            value={form.empresa_id}
            onValueChange={(value) => {
              const empresa = empresas.find((item) => item.id === value);
              onChange({
                ...form,
                empresa_id: value,
                conta_pagadora_id: '',
                centro_custo_id: empresa?.unidade_id || '',
              });
            }}
            options={empresaOptions}
          />
        </div>

        <div>
          <FieldLabel>Conta pagadora</FieldLabel>
          <CustomSelect
            value={form.conta_pagadora_id}
            onValueChange={(value) => onChange({ ...form, conta_pagadora_id: value })}
            options={contaOptions}
          />
        </div>

        <div>
          <FieldLabel>Centro de custo</FieldLabel>
          <CustomSelect
            value={form.centro_custo_id}
            onValueChange={(value) => onChange({ ...form, centro_custo_id: value })}
            options={centroOptions}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Fechamento</FieldLabel>
            <CustomSelect
              value={form.dia_fechamento}
              onValueChange={(value) => onChange({ ...form, dia_fechamento: value })}
              options={[{ value: '', label: 'Sem dia' }, ...DAY_OPTIONS]}
            />
          </div>
          <div>
            <FieldLabel>Vencimento</FieldLabel>
            <CustomSelect
              value={form.dia_vencimento}
              onValueChange={(value) => onChange({ ...form, dia_vencimento: value })}
              options={[{ value: '', label: 'Sem dia' }, ...DAY_OPTIONS]}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Limite</FieldLabel>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-black text-muted">R$</span>
            <TextInput
              value={form.limite}
              onChange={(e) => onChange({ ...form, limite: e.target.value })}
              onBlur={() => onChange({ ...form, limite: formatBRLInput(parseBRL(form.limite)) })}
              inputMode="decimal"
              placeholder="0,00"
              className="pl-12"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <FieldLabel>Observações</FieldLabel>
          <TextArea
            rows={4}
            value={form.observacoes}
            onChange={(e) => onChange({ ...form, observacoes: e.target.value })}
            placeholder="Uso operacional, particularidades da fatura ou responsável."
          />
        </div>
      </div>
    </Modal>
  );
};

const CartaoCard: React.FC<{
  cartao: FinanceiroCartao;
  toneClass: string;
  onEdit: (cartao: FinanceiroCartao) => void;
  onArchive: (cartao: FinanceiroCartao) => void;
}> = ({ cartao, toneClass, onEdit, onArchive }) => {
  const limite = cartao.limite == null ? null : Number(cartao.limite || 0);
  const usado = Number(cartao.valor_usado || 0);
  const usage = limite && limite > 0 ? Math.min(100, Math.max(0, (usado / limite) * 100)) : 0;
  const empresa = empresaLabel(cartao.empresa);
  const centro = cartao.centro_custo?.nome || cartao.empresa?.unidade?.nome || 'Sem centro';

  return (
    <Card className={cn('p-5 md:p-6 transition-all', !cartao.ativo && 'opacity-55 grayscale')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-black text-primary truncate">{cartao.apelido}</div>
            <Badge variant={cartao.ativo ? 'success' : 'default'}>{cartao.ativo ? 'Ativo' : 'Arquivado'}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-secondary">
            <span className="font-mono text-primary tracking-[0.2em]">•••• {cartao.final}</span>
            <span className="text-muted">·</span>
            <span>{cartao.bandeira || 'Sem bandeira'}</span>
          </div>
        </div>

        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="w-10 h-10 rounded-2xl border border-line bg-surface/40 text-secondary hover:text-primary hover:bg-surface-2 transition-all flex items-center justify-center"
              aria-label="Ações do cartão"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={8}
              className="la-popover-content z-[99999] min-w-48 rounded-2xl border border-line bg-surface p-2 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => onEdit(cartao)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-surface-2 hover:text-primary transition-all"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => onArchive(cartao)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-surface-2 hover:text-primary transition-all"
              >
                {cartao.ativo ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                {cartao.ativo ? 'Arquivar' : 'Desarquivar'}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black', toneClass)}>
          <Building2 className="w-3.5 h-3.5" />
          {empresa}
        </span>
        <Badge variant="purple">{cartao.titularidade_tipo.toUpperCase()}</Badge>
        <Badge variant="info">{centro}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface-2/45 px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Fecha</div>
          <div className="mt-1 text-lg font-black text-primary">{cartao.dia_fechamento ? `Dia ${cartao.dia_fechamento}` : 'Sem dia'}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2/45 px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Vence</div>
          <div className="mt-1 text-lg font-black text-primary">{cartao.dia_vencimento ? `Dia ${cartao.dia_vencimento}` : 'Sem dia'}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Limite</div>
            <div className="mt-1 text-xl font-black text-primary">{limite == null ? 'Sem limite' : formatCurrency(limite)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Usado</div>
            <div className="mt-1 text-sm font-black text-secondary">{formatCurrency(usado)}</div>
          </div>
        </div>
        {limite != null ? (
          <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden border border-line">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${usage}%` }} />
          </div>
        ) : (
          <div className="mt-3 text-xs font-bold text-muted">Limite livre ou ainda não cadastrado.</div>
        )}
      </div>

      {cartao.observacoes ? (
        <div className="mt-5 rounded-2xl border border-line bg-bg/45 px-4 py-3 text-xs font-bold text-secondary">
          {cartao.observacoes}
        </div>
      ) : null}
    </Card>
  );
};

export const CartoesPage: React.FC = () => {
  const { run } = useAsyncAction();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartoes, setCartoes] = useState<FinanceiroCartao[]>([]);
  const [empresas, setEmpresas] = useState<FinanceiroEmpresa[]>([]);
  const [contasBancarias, setContasBancarias] = useState<FinanceiroContaBancaria[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CartaoFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<FinanceiroCartao | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCartoesDashboard();
      setCartoes(data.cartoes);
      setEmpresas(data.empresas);
      setContasBancarias(data.contasBancarias);
      setCentrosCusto(data.centrosCusto);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar cartões.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeCards = useMemo(() => cartoes.filter((cartao) => cartao.ativo), [cartoes]);
  const filteredCards = useMemo(
    () =>
      cartoes.filter((cartao) => {
        if (!showArchived && !cartao.ativo) return false;
        if (empresaFiltro !== 'all' && cartao.empresa_id !== empresaFiltro) return false;
        return true;
      }),
    [cartoes, empresaFiltro, showArchived]
  );

  const stats = useMemo(() => {
    const limiteTotal = activeCards.reduce((sum, cartao) => sum + (cartao.limite == null ? 0 : Number(cartao.limite || 0)), 0);
    const usado = activeCards.reduce((sum, cartao) => sum + Number(cartao.valor_usado || 0), 0);
    return {
      limiteTotal,
      usado,
      disponivel: Math.max(0, limiteTotal - usado),
      ativos: activeCards.length,
      semLimite: activeCards.filter((cartao) => cartao.limite == null).length,
    };
  }, [activeCards]);

  const toneByEmpresa = useMemo(() => {
    const map = new Map<string, string>();
    empresas.forEach((empresa, idx) => {
      map.set(empresa.id, TONE_CLASSES[idx % TONE_CLASSES.length]);
    });
    return map;
  }, [empresas]);

  const empresaOptions = [
    { value: 'all', label: 'Todas as empresas' },
    ...empresas.map((empresa) => ({ value: empresa.id, label: empresaLabel(empresa) })),
  ];

  const openCreate = () => {
    const firstEmpresa = empresas[0];
    setForm({
      ...EMPTY_FORM,
      empresa_id: firstEmpresa?.id || '',
      centro_custo_id: firstEmpresa?.unidade_id || '',
    });
    setDialogOpen(true);
  };

  const openEdit = (cartao: FinanceiroCartao) => {
    setForm(cartaoToForm(cartao));
    setDialogOpen(true);
  };

  const submit = async () => {
    const payload = formToPayload(form);
    if (!payload.apelido || payload.final.length !== 4 || !payload.titularidade_tipo) return;
    setSaving(true);
    await run(
      async () => {
        await salvarCartao(payload);
        await load();
      },
      {
        success: form.cartao_id ? 'Cartão atualizado.' : 'Cartão criado.',
        error: 'Não foi possível salvar o cartão.',
        onSuccess: () => setDialogOpen(false),
      }
    );
    setSaving(false);
  };

  const confirmArchive = async () => {
    const cartao = confirming;
    if (!cartao) return;
    await run(
      async () => {
        await arquivarCartao({ cartao_id: cartao.id, ativo: !cartao.ativo });
        await load();
      },
      {
        success: cartao.ativo ? 'Cartão arquivado.' : 'Cartão desarquivado.',
        error: cartao.ativo ? 'Não foi possível arquivar o cartão.' : 'Não foi possível desarquivar o cartão.',
      }
    );
    setConfirming(null);
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            <WalletCards className="w-4 h-4" />
            Cartões corporativos
          </div>
          <h2 className="mt-2 text-2xl md:text-3xl font-black text-primary tracking-tight">Cartões</h2>
          <p className="mt-1 text-sm font-bold text-muted max-w-2xl">
            Cadastre cartões por empresa e mantenha o caminho fiscal pronto para faturas e compras nas próximas fatias.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate} className="self-start lg:self-auto px-5">
          <Plus className="w-4 h-4" />
          Novo cartão
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Limite total" value={formatCurrency(stats.limiteTotal)} subtitle={`${stats.semLimite} cartão(ões) sem limite cadastrado`} icon={CreditCard} />
        <StatCard title="Limite usado" value={formatCurrency(stats.usado)} subtitle="Faturas abertas ou fechadas aguardando baixa" icon={Landmark} variant="warning" />
        <StatCard title="Disponível" value={formatCurrency(stats.disponivel)} subtitle="Total menos uso atual" icon={ShieldCheck} variant="success" />
        <StatCard title="Cartões ativos" value={String(stats.ativos)} subtitle={`${cartoes.length - stats.ativos} arquivado(s)`} icon={WalletCards} variant="info" />
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,320px)_auto] gap-3">
            <CustomSelect value={empresaFiltro} onValueChange={setEmpresaFiltro} options={empresaOptions} icon={Building2} />
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-3">
              <div>
                <div className="text-sm font-black text-primary">Mostrar arquivados</div>
                <div className="text-[11px] font-bold text-muted">Exibe cartões fora de operação esmaecidos.</div>
              </div>
              <ToggleSwitch checked={showArchived} onCheckedChange={setShowArchived} variant="violet" ariaLabel="Mostrar cartões arquivados" />
            </div>
          </div>
          <div className="text-xs font-bold text-muted">
            {filteredCards.length} cartão(ões) exibidos · {empresas.length} empresa(s)
          </div>
        </div>
      </Card>

      {filteredCards.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-3xl bg-surface-2 border border-line flex items-center justify-center text-muted">
            <CreditCard className="w-7 h-7" />
          </div>
          <div className="mt-4 text-lg font-black text-primary">Nenhum cartão encontrado</div>
          <div className="mt-2 text-sm font-bold text-muted">Ajuste os filtros ou cadastre o primeiro cartão operacional.</div>
          <Button variant="primary" onClick={openCreate} className="mt-5">
            <Plus className="w-4 h-4" />
            Novo cartão
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredCards.map((cartao) => (
            <CartaoCard
              key={cartao.id}
              cartao={cartao}
              toneClass={cartao.empresa_id ? toneByEmpresa.get(cartao.empresa_id) || TONE_CLASSES[0] : 'bg-surface-2 text-secondary border-line'}
              onEdit={openEdit}
              onArchive={setConfirming}
            />
          ))}
        </div>
      )}

      <CartaoDialog
        open={dialogOpen}
        form={form}
        saving={saving}
        empresas={empresas}
        contasBancarias={contasBancarias}
        centrosCusto={centrosCusto}
        onClose={() => setDialogOpen(false)}
        onChange={setForm}
        onSubmit={submit}
      />

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={confirmArchive}
        variant={confirming?.ativo ? 'danger' : 'primary'}
        title={confirming?.ativo ? 'Arquivar cartão' : 'Desarquivar cartão'}
        message={
          confirming?.ativo
            ? `Arquivar ${confirming?.apelido || 'este cartão'} remove ele da operação diária, mas preserva histórico e auditoria.`
            : `Desarquivar ${confirming?.apelido || 'este cartão'} devolve ele para a operação diária.`
        }
        confirmLabel={confirming?.ativo ? 'Arquivar' : 'Desarquivar'}
      />
    </div>
  );
};
