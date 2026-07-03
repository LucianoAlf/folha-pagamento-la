import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Filter,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Undo2,
  WalletCards,
} from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../UI';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import {
  classificarTransacaoCartao,
  fecharFaturaCartao,
  fetchCartoesFaturas,
  reabrirFaturaCartao,
} from '../../services/cartoesService';
import { PlanoContaTreeSelect } from '../contas/PlanoContaTreeSelect';
import { MariaActionBadge } from '../MariaActionBadge';
import { ImportarTransacaoFaturaForm } from './ImportarTransacaoFaturaForm';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import {
  attachClassificacaoResumo,
  buildFaturasResumo,
  filterAndSortFaturas,
  getFaturaAcaoFechamento,
  getFaturaPendenciasClassificacao,
  getCentroCustoIdDaEmpresa,
  getCompetenciasOptions,
  getTransacoesDaFatura,
  hasAutoriaMaria,
  isFaturaImportacaoManualDisponivel,
  isCartaoFiscalCompletoParaFechar,
  isFaturaClassificacaoBloqueada,
} from './cartoesFaturasSelectors';
import type {
  FinanceiroCartaoClassificacaoPayload,
  FinanceiroCartaoFaturaFecharResponse,
  FinanceiroCartaoFaturaReabrirResponse,
  FinanceiroCartao,
  FinanceiroCartaoFatura,
  FinanceiroCartaoTransacao,
  FinanceiroCartaoTransacaoImportadaPayload,
  FinanceiroCartaoTransacaoImportadaResponse,
} from '../../types/cartoes';
import type { FinanceiroEmpresa, PlanoConta } from '../../types/contasPagar';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'aberta', label: 'Abertas' },
  { value: 'fechada', label: 'Fechadas' },
  { value: 'paga', label: 'Pagas' },
  { value: 'cancelada', label: 'Canceladas' },
];

const statusLabel = (status?: string | null) => {
  if (status === 'aberta') return 'Aberta';
  if (status === 'fechada') return 'Fechada';
  if (status === 'paga') return 'Paga';
  if (status === 'cancelada') return 'Cancelada';
  return status || 'Sem status';
};

const statusVariant = (status?: string | null): React.ComponentProps<typeof Badge>['variant'] => {
  if (status === 'aberta') return 'info';
  if (status === 'fechada') return 'warning';
  if (status === 'paga') return 'success';
  if (status === 'cancelada') return 'danger';
  return 'default';
};

const classificacaoLabel = (status?: string | null) => {
  if (status === 'confirmada') return 'Confirmada';
  if (status === 'sugerida') return 'Sugerida';
  return 'Pendente';
};

const classificacaoVariant = (status?: string | null): React.ComponentProps<typeof Badge>['variant'] => {
  if (status === 'confirmada') return 'success';
  if (status === 'sugerida') return 'warning';
  return 'default';
};

const tipoLabel = (tipo?: string | null) => {
  if (tipo === 'compra') return 'Compra';
  if (tipo === 'estorno') return 'Estorno';
  if (tipo === 'tarifa') return 'Tarifa';
  if (tipo === 'anuidade') return 'Anuidade';
  if (tipo === 'ajuste') return 'Ajuste';
  return tipo || 'Transacao';
};

const formatDateBR = (date?: string | null) => {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 'Sem data';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const formatCompetencia = (date?: string | null) => {
  const m = String(date || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return 'Sem competencia';
  const month = MONTHS[Math.max(0, Math.min(11, Number(m[2]) - 1))] || m[2];
  return `${month}/${m[1]}`;
};

const empresaLabel = (empresa?: FinanceiroEmpresa | null) =>
  empresa?.label_operacional || empresa?.nome_fantasia || empresa?.razao_social || 'Sem empresa';

const cartaoLabel = (cartao?: FinanceiroCartao | null) => {
  if (!cartao) return 'Cartao nao encontrado';
  return `${cartao.apelido} · •••• ${cartao.final}`;
};

const planoLabel = (transacao: FinanceiroCartaoTransacao) => {
  if (!transacao.plano_conta) return 'Sem plano';
  return `${transacao.plano_conta.codigo} ${transacao.plano_conta.nome}`;
};

const grupoPlanoLabel = (grupo?: string | null) => {
  if (grupo === 'custo_variavel') return 'Custo variavel';
  if (grupo === 'despesa_fixa') return 'Despesa fixa';
  if (grupo === 'investimento') return 'Investimento';
  if (grupo === 'nao_operacional') return 'Nao operacional';
  return 'Plano de saida';
};

const getInitialCartaoId = (explicit?: string | null) => {
  if (explicit) return explicit;
  try {
    return new URLSearchParams(window.location.search || '').get('cartaoId') || 'all';
  } catch {
    return 'all';
  }
};

const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2 px-1">
    {children}{required ? ' *' : ''}
  </label>
);

const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
  <textarea
    {...props}
    className={cn(
      'w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm font-bold text-secondary placeholder:text-muted resize-none',
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
      <div className={cn('w-11 h-11 rounded-2xl border flex items-center justify-center', tone)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-muted">{title}</div>
      <div className="mt-2 text-2xl md:text-3xl font-black text-primary tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-bold text-secondary">{subtitle}</div>
    </Card>
  );
};

const ClassificacaoProgress: React.FC<{ fatura: FinanceiroCartaoFatura; compact?: boolean }> = ({ fatura, compact }) => {
  const resumo = fatura.classificacao || {
    total: 0,
    confirmadas: 0,
    sugeridas: 0,
    pendentes: 0,
    percentualConfirmado: 0,
  };
  const pendencias = resumo.sugeridas + resumo.pendentes;

  return (
    <div className={cn('rounded-2xl border border-line bg-surface-2/45', compact ? 'px-3 py-2' : 'px-4 py-3')}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Classificacao</span>
        <span className="text-xs font-black text-primary">{resumo.percentualConfirmado}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-bg border border-line overflow-hidden">
        <div className="h-full bg-success rounded-full" style={{ width: `${resumo.percentualConfirmado}%` }} />
      </div>
      <div className="mt-2 text-xs font-bold text-secondary">
        {resumo.confirmadas}/{resumo.total} classificadas
        {pendencias > 0 ? ` · ${pendencias} pendentes` : ''}
      </div>
    </div>
  );
};

const FaturaCard: React.FC<{
  fatura: FinanceiroCartaoFatura;
  onOpen: (fatura: FinanceiroCartaoFatura) => void;
}> = ({ fatura, onOpen }) => {
  const empresa = empresaLabel(fatura.cartao?.empresa);
  const totalTransacoes = fatura.classificacao?.total || 0;
  const pendencias = getFaturaPendenciasClassificacao(fatura);

  return (
    <Card className="p-5 md:p-6 bg-surface/90 border border-line-strong/60 shadow-[var(--shadow-card)] transition-all hover:border-line-strong hover:bg-surface">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.8fr)_minmax(180px,0.5fr)_auto] gap-5 items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(fatura.status)}>{statusLabel(fatura.status)}</Badge>
            {fatura.status === 'fechada' && pendencias > 0 ? <Badge variant="warning">DRE incompleto</Badge> : null}
            {fatura.conta_pagar_id ? <Badge variant="purple">→ conta a pagar</Badge> : null}
          </div>
          <div className="mt-3 text-xl font-black text-primary truncate">{formatCompetencia(fatura.competencia)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-secondary">
            <span>{cartaoLabel(fatura.cartao)}</span>
            <span className="text-muted">·</span>
            <span>{empresa}</span>
          </div>
          <div className="mt-3 text-xs font-bold text-muted">
            {totalTransacoes} {totalTransacoes === 1 ? 'transacao' : 'transacoes'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface-2/45 px-4 py-3">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Fecha</div>
            <div className="mt-1 text-sm font-black text-primary">{formatDateBR(fatura.data_fechamento)}</div>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/45 px-4 py-3">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Vence</div>
            <div className="mt-1 text-sm font-black text-primary">{formatDateBR(fatura.data_vencimento)}</div>
          </div>
        </div>

        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Valor total</div>
          <div className="mt-1 text-2xl font-black text-primary">{formatCurrency(Number(fatura.valor_total || 0))}</div>
        </div>

        <div className="flex flex-col sm:flex-row xl:flex-col gap-3 xl:items-stretch">
          <ClassificacaoProgress fatura={fatura} compact />
          <Button variant="outline" onClick={() => onOpen(fatura)} className="shrink-0">
            <FileText className="w-4 h-4" />
            Detalhes
          </Button>
        </div>
      </div>
    </Card>
  );
};

type TransacaoClassificacaoForm = {
  empresa_id: string;
  centro_custo_id: string;
  plano_conta_id: string;
  motivo: string;
};

function buildInitialClassificacaoForm(
  transacao: FinanceiroCartaoTransacao,
  fatura: FinanceiroCartaoFatura,
  empresas: FinanceiroEmpresa[]
): TransacaoClassificacaoForm {
  const empresaId = transacao.empresa_id || fatura.cartao?.empresa_id || '';
  return {
    empresa_id: empresaId,
    centro_custo_id: transacao.centro_custo_id || getCentroCustoIdDaEmpresa(empresas, empresaId),
    plano_conta_id: transacao.plano_conta_id || '',
    motivo: '',
  };
}

const TransacaoRow: React.FC<{
  transacao: FinanceiroCartaoTransacao;
  fatura: FinanceiroCartaoFatura;
  empresas: FinanceiroEmpresa[];
  planos: PlanoConta[];
  saving: boolean;
  onClassificar: (payload: FinanceiroCartaoClassificacaoPayload) => Promise<void>;
}> = ({ transacao, fatura, empresas, planos, saving, onClassificar }) => {
  const [form, setForm] = useState<TransacaoClassificacaoForm>(() =>
    buildInitialClassificacaoForm(transacao, fatura, empresas)
  );
  const valor = Number(transacao.valor || 0);
  const isCredit = valor < 0 || transacao.tipo_transacao === 'estorno';
  const parcela =
    transacao.total_parcelas && transacao.total_parcelas > 1
      ? `${transacao.parcela_atual || 1}/${transacao.total_parcelas}`
      : null;
  const hasTriad =
    transacao.classificacao_status === 'confirmada' &&
    (transacao.plano_conta || transacao.empresa || transacao.centro_custo);
  const bloqueada = isFaturaClassificacaoBloqueada(fatura);
  const reclassificacaoGerencial = fatura.status === 'fechada' || fatura.status === 'paga';
  const selectedEmpresa = empresas.find((empresa) => empresa.id === form.empresa_id) || null;
  const selectedCentroNome = selectedEmpresa?.unidade?.nome || transacao.centro_custo?.nome || 'Centro fixado pela empresa';
  const confirmDisabled = bloqueada || saving || !form.empresa_id || !form.centro_custo_id || !form.plano_conta_id;
  const empresaOptions = [
    { value: '', label: 'Escolha a empresa' },
    ...empresas
      .filter((empresa) => empresa.ativo !== false)
      .map((empresa) => ({ value: empresa.id, label: empresaLabel(empresa) })),
  ];
  const selectedPlano = planos.find((plano) => plano.id === form.plano_conta_id) || transacao.plano_conta || null;

  useEffect(() => {
    setForm(buildInitialClassificacaoForm(transacao, fatura, empresas));
  }, [empresas, fatura, transacao]);

  const setEmpresa = (empresaId: string) => {
    setForm((current) => ({
      ...current,
      empresa_id: empresaId,
      centro_custo_id: getCentroCustoIdDaEmpresa(empresas, empresaId),
    }));
  };

  return (
    <div className="rounded-2xl border border-line bg-bg/45 p-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={classificacaoVariant(transacao.classificacao_status)}>
              {classificacaoLabel(transacao.classificacao_status)}
            </Badge>
            {hasAutoriaMaria(transacao, 'classificacao') ? (
              <MariaActionBadge tooltip="Classificacao registrada pela Maria via WhatsApp." />
            ) : null}
            <Badge variant="default">{tipoLabel(transacao.tipo_transacao)}</Badge>
            {parcela ? <Badge variant="purple">Parcela {parcela}</Badge> : null}
            {hasAutoriaMaria(transacao, 'lancamento') ? (
              <MariaActionBadge tooltip="Lancamento registrado pela Maria via WhatsApp." />
            ) : null}
          </div>
          <div className="mt-3 text-base font-black text-primary truncate">{transacao.descricao}</div>
          <div className="mt-1 text-sm font-bold text-secondary">
            {[transacao.estabelecimento, formatDateBR(transacao.data_compra)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className={cn('text-xl font-black shrink-0', isCredit ? 'text-success' : 'text-primary')}>
          {isCredit ? '- ' : '+ '}
          {formatCurrency(Math.abs(valor))}
        </div>
      </div>

      {hasTriad ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Plano</div>
            <div className="mt-1 text-xs font-black text-secondary">{planoLabel(transacao)}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Empresa</div>
            <div className="mt-1 text-xs font-black text-secondary">{empresaLabel(transacao.empresa)}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Centro</div>
            <div className="mt-1 text-xs font-black text-secondary">{transacao.centro_custo?.nome || 'Sem centro'}</div>
          </div>
        </div>
      ) : null}

      {transacao.observacoes ? (
        <div className="mt-4 text-xs font-bold text-muted">{transacao.observacoes}</div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-line bg-surface/65 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted">Classificacao fiscal</div>
            <div className="mt-1 text-sm font-bold text-secondary">
              {bloqueada
                ? 'Fatura cancelada nao permite classificacao.'
                : reclassificacaoGerencial
                  ? 'Reclassificacao gerencial permitida pelo backend.'
                  : 'Confirme plano, empresa e centro para alimentar o DRE.'}
            </div>
          </div>
          {selectedPlano ? (
            <Badge variant="info">{grupoPlanoLabel(selectedPlano.grupo_plano)}</Badge>
          ) : null}
        </div>

        <div className={cn('mt-4 grid grid-cols-1 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1fr)] gap-3', bloqueada && 'opacity-60')}>
          <div>
            <FieldLabel required>Empresa</FieldLabel>
            <CustomSelect
              value={form.empresa_id}
              onValueChange={setEmpresa}
              options={empresaOptions}
              icon={Building2}
              disabled={bloqueada || saving}
            />
            <div className="mt-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Centro fixado</div>
              <div className="mt-1 text-xs font-black text-secondary">{selectedCentroNome}</div>
            </div>
          </div>

          <div>
            <FieldLabel required>Plano de contas</FieldLabel>
            <PlanoContaTreeSelect
              planos={planos}
              value={form.plano_conta_id}
              onValueChange={(planoId) => setForm((current) => ({ ...current, plano_conta_id: planoId }))}
              placeholder="Buscar folha de saida por codigo ou nome..."
              disabled={bloqueada || saving}
            />
          </div>

          <div className="lg:col-span-2">
            <FieldLabel>Motivo</FieldLabel>
            <TextArea
              rows={2}
              value={form.motivo}
              onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
              placeholder="Ex.: classificacao conferida pela Rose."
              disabled={bloqueada || saving}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            disabled={bloqueada || saving || transacao.classificacao_status === 'pendente'}
            onClick={() =>
              onClassificar({
                transacao_id: transacao.id,
                classificacao_status: 'pendente',
                motivo: form.motivo || 'Reaberta pelo app web.',
              })
            }
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Voltar para pendente
          </Button>
          <Button
            variant="primary"
            disabled={confirmDisabled}
            onClick={() =>
              onClassificar({
                transacao_id: transacao.id,
                classificacao_status: 'confirmada',
                empresa_id: form.empresa_id,
                centro_custo_id: form.centro_custo_id,
                plano_conta_id: form.plano_conta_id,
                motivo: form.motivo || 'Classificacao confirmada pelo app web.',
              })
            }
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Confirmar classificacao
          </Button>
        </div>
      </div>
    </div>
  );
};

type FaturasCartaoPageProps = {
  embedded?: boolean;
  initialCartaoId?: string | null;
};

type FaturaFechamentoAction = 'fechar' | 'reabrir';

type FaturaActionFeedback = {
  faturaId: string;
  title: string;
  message: string;
  variant: 'success' | 'warning' | 'info';
};

type ImportacaoManualFeedback = {
  faturaId: string;
  title: string;
  message: string;
  variant: 'success' | 'warning' | 'info';
};

export const FaturasCartaoPage: React.FC<FaturasCartaoPageProps> = ({ embedded = false, initialCartaoId }) => {
  const { run } = useAsyncAction();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartoes, setCartoes] = useState<FinanceiroCartao[]>([]);
  const [empresas, setEmpresas] = useState<FinanceiroEmpresa[]>([]);
  const [planos, setPlanos] = useState<PlanoConta[]>([]);
  const [faturas, setFaturas] = useState<FinanceiroCartaoFatura[]>([]);
  const [transacoes, setTransacoes] = useState<FinanceiroCartaoTransacao[]>([]);
  const [cartaoFiltro, setCartaoFiltro] = useState(() => getInitialCartaoId(initialCartaoId));
  const [empresaFiltro, setEmpresaFiltro] = useState('all');
  const [statusFiltro, setStatusFiltro] = useState('all');
  const [competenciaFiltro, setCompetenciaFiltro] = useState('all');
  const [selectedFaturaId, setSelectedFaturaId] = useState<string | null>(null);
  const [savingTransacaoId, setSavingTransacaoId] = useState<string | null>(null);
  const [savingFaturaId, setSavingFaturaId] = useState<string | null>(null);
  const [pendingFaturaAction, setPendingFaturaAction] = useState<FaturaFechamentoAction | null>(null);
  const [faturaFeedback, setFaturaFeedback] = useState<FaturaActionFeedback | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importacaoFeedback, setImportacaoFeedback] = useState<ImportacaoManualFeedback | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCartoesFaturas();
      setCartoes(data.cartoes);
      setEmpresas(data.empresas);
      setPlanos(data.planos);
      setFaturas(data.faturas);
      setTransacoes(data.transacoes);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar faturas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (initialCartaoId !== undefined) {
      setCartaoFiltro(initialCartaoId || 'all');
    }
  }, [initialCartaoId]);

  const enrichedFaturas = useMemo(() => attachClassificacaoResumo(faturas, transacoes), [faturas, transacoes]);

  const competencias = useMemo(() => getCompetenciasOptions(enrichedFaturas), [enrichedFaturas]);

  const faturasFiltradas = useMemo(
    () =>
      filterAndSortFaturas(enrichedFaturas, {
        cartaoId: cartaoFiltro,
        empresaId: empresaFiltro,
        status: statusFiltro,
        competencia: competenciaFiltro,
      }),
    [cartaoFiltro, competenciaFiltro, empresaFiltro, enrichedFaturas, statusFiltro]
  );

  const resumo = useMemo(() => buildFaturasResumo(faturasFiltradas), [faturasFiltradas]);
  const selectedFatura = enrichedFaturas.find((fatura) => fatura.id === selectedFaturaId) || null;
  const transacoesSelecionadas = useMemo(
    () => (selectedFatura ? getTransacoesDaFatura(transacoes, selectedFatura.id) : []),
    [selectedFatura, transacoes]
  );
  const selectedFaturaAction = selectedFatura ? getFaturaAcaoFechamento(selectedFatura) : null;
  const selectedFaturaImportacaoDisponivel = selectedFatura ? isFaturaImportacaoManualDisponivel(selectedFatura) : false;
  const selectedFaturaPendencias = selectedFatura ? getFaturaPendenciasClassificacao(selectedFatura) : 0;
  const selectedCartaoFiscalCompleto = selectedFatura ? isCartaoFiscalCompletoParaFechar(selectedFatura) : false;
  const selectedFaturaSaving = selectedFatura ? savingFaturaId === selectedFatura.id : false;

  const classificacaoGeral = useMemo(() => {
    const total = faturasFiltradas.reduce((sum, fatura) => sum + (fatura.classificacao?.total || 0), 0);
    const confirmadas = faturasFiltradas.reduce((sum, fatura) => sum + (fatura.classificacao?.confirmadas || 0), 0);
    const pendentes = total - confirmadas;
    return {
      total,
      confirmadas,
      pendentes,
      percent: total > 0 ? Math.round((confirmadas / total) * 100) : 0,
    };
  }, [faturasFiltradas]);

  const cartaoOptions = [
    { value: 'all', label: 'Todos os cartoes' },
    ...cartoes.map((cartao) => ({
      value: cartao.id,
      label: `${cartao.apelido} · •••• ${cartao.final}`,
    })),
  ];

  const empresaOptions = [
    { value: 'all', label: 'Todas as empresas' },
    ...empresas.map((empresa) => ({ value: empresa.id, label: empresaLabel(empresa) })),
  ];

  const competenciaOptions = [
    { value: 'all', label: 'Todas as competencias' },
    ...competencias.map((competencia) => ({
      value: competencia,
      label: formatCompetencia(`${competencia}-01`),
    })),
  ];

  const faturaActionDialogTitle =
    pendingFaturaAction === 'fechar' ? 'Fechar fatura' : 'Reabrir fatura';
  const faturaActionDialogMessage =
    pendingFaturaAction === 'fechar'
      ? selectedFaturaPendencias > 0
        ? `Esta fatura tem ${selectedFaturaPendencias} ${selectedFaturaPendencias === 1 ? 'transacao nao confirmada' : 'transacoes nao confirmadas'}. Ao fechar, o DRE fica incompleto ate voce reclassificar. Fechar mesmo assim?`
        : 'Fechar esta fatura vai gerar uma conta a pagar com o valor total e vencimento da fatura. Confirmar?'
      : 'Reabrir vai CANCELAR a conta a pagar gerada por este fechamento. Confirmar?';

  const handleClassificar = async (payload: FinanceiroCartaoClassificacaoPayload) => {
    setSavingTransacaoId(payload.transacao_id);
    await run(
      async () => {
        await classificarTransacaoCartao(payload);
        await load();
      },
      {
        success:
          payload.classificacao_status === 'confirmada'
            ? 'Classificacao confirmada.'
            : 'Transacao voltou para pendente.',
        error: 'Nao foi possivel atualizar a classificacao.',
      }
    );
    setSavingTransacaoId(null);
  };

  const handleFaturaAction = async (action: FaturaFechamentoAction) => {
    if (!selectedFatura) return;
    if (action === 'fechar' && !selectedCartaoFiscalCompleto) {
      setFaturaFeedback({
        faturaId: selectedFatura.id,
        title: 'Cadastro do cartao incompleto',
        message: 'Complete empresa, conta pagadora e centro no cadastro do cartao antes de fechar a fatura.',
        variant: 'warning',
      });
      return;
    }

    const faturaId = selectedFatura.id;
    setSavingFaturaId(faturaId);
    const result = await run<FinanceiroCartaoFaturaFecharResponse | FinanceiroCartaoFaturaReabrirResponse>(
      async () => {
        const response = action === 'fechar'
          ? await fecharFaturaCartao(faturaId)
          : await reabrirFaturaCartao(faturaId);
        await load();
        return response;
      },
      {
        success: action === 'fechar' ? 'Fatura fechada.' : 'Fatura reaberta.',
        error: action === 'fechar' ? 'Nao foi possivel fechar a fatura.' : 'Nao foi possivel reabrir a fatura.',
      }
    );

    if (result) {
      if (action === 'fechar') {
        const response = result as FinanceiroCartaoFaturaFecharResponse;
        setFaturaFeedback({
          faturaId,
          title: 'Conta a pagar gerada',
          message: `${formatCurrency(Number(response.valor_total || selectedFatura.valor_total || 0))} com vencimento em ${formatDateBR(selectedFatura.data_vencimento)}. Conta vinculada: ${response.conta_pagar_id || 'ja existente'}.`,
          variant: response.classificacao?.dre_incompleto ? 'warning' : 'success',
        });
      } else {
        setFaturaFeedback({
          faturaId,
          title: 'Fatura reaberta',
          message: 'A conta a pagar gerada por este fechamento foi cancelada e o vinculo saiu da fatura.',
          variant: 'info',
        });
      }
    }

    setSavingFaturaId(null);
    setPendingFaturaAction(null);
  };

  const handleTransacaoImportada = async (
    result: FinanceiroCartaoTransacaoImportadaResponse,
    payload: FinanceiroCartaoTransacaoImportadaPayload
  ) => {
    if (!selectedFatura) return;

    const faturaId = selectedFatura.id;
    await load();
    setShowImportForm(false);

    if (result.possivel_duplicata) {
      setImportacaoFeedback({
        faturaId,
        title: 'Possivel duplicata',
        message: 'Essa transacao parece duplicada de outra ja existente nesta fatura. Confira antes de prosseguir.',
        variant: 'warning',
      });
      return;
    }

    setImportacaoFeedback({
      faturaId,
      title: result.idempotent ? 'Transacao ja registrada' : 'Transacao adicionada',
      message: `${payload.descricao} entrou como pendente em ${formatCurrency(Number(payload.valor || 0))}.`,
      variant: result.idempotent ? 'info' : 'success',
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {!embedded ? (
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-muted">
              <ReceiptText className="w-4 h-4 text-accent" />
              Cartoes
            </div>
            <h2 className="mt-2 text-3xl font-black text-primary tracking-tight">Faturas</h2>
            <p className="mt-2 text-sm font-bold text-secondary max-w-2xl">
              Visao das faturas e classificacao fiscal das transacoes que ja nasceram no modulo de cartoes.
            </p>
          </div>
          <Badge variant="purple" className="w-fit">Lista read-only · detalhe classifica</Badge>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total em aberto"
          value={formatCurrency(resumo.totalAberto)}
          subtitle={`${resumo.porStatus.aberta} fatura(s) aberta(s)`}
          icon={WalletCards}
          variant="accent"
        />
        <StatCard
          title="Proxima fatura"
          value={resumo.proximaFatura ? formatDateBR(resumo.proximaFatura.data_vencimento) : 'Sem vencimento'}
          subtitle={resumo.proximaFatura ? cartaoLabel(resumo.proximaFatura.cartao) : 'Nenhuma fatura aberta'}
          icon={CalendarClock}
          variant="info"
        />
        <StatCard
          title="Status"
          value={`${resumo.porStatus.fechada} fechadas`}
          subtitle={`${resumo.porStatus.paga} pagas · ${resumo.porStatus.cancelada} canceladas`}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Classificacao"
          value={`${classificacaoGeral.percent}%`}
          subtitle={`${classificacaoGeral.confirmadas}/${classificacaoGeral.total} confirmadas · ${classificacaoGeral.pendentes} pendentes`}
          icon={Filter}
          variant={classificacaoGeral.pendentes > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card className="p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <CustomSelect value={cartaoFiltro} onValueChange={setCartaoFiltro} options={cartaoOptions} icon={CreditCard} />
          <CustomSelect value={empresaFiltro} onValueChange={setEmpresaFiltro} options={empresaOptions} icon={Building2} />
          <CustomSelect value={statusFiltro} onValueChange={setStatusFiltro} options={STATUS_OPTIONS} icon={CheckCircle2} />
          <CustomSelect value={competenciaFiltro} onValueChange={setCompetenciaFiltro} options={competenciaOptions} icon={CalendarClock} />
        </div>
      </Card>

      {faturasFiltradas.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line mx-auto flex items-center justify-center text-muted">
            <FileText className="w-6 h-6" />
          </div>
          <div className="mt-4 text-lg font-black text-primary">Nenhuma fatura encontrada</div>
          <div className="mt-2 text-sm font-bold text-secondary">
            Este filtro ainda nao tem faturas. Os outros cartoes aparecem aqui quando as compras forem lancadas.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {faturasFiltradas.map((fatura) => (
            <FaturaCard
              key={fatura.id}
              fatura={fatura}
              onOpen={(next) => {
                setFaturaFeedback(null);
                setImportacaoFeedback(null);
                setShowImportForm(false);
                setSelectedFaturaId(next.id);
              }}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedFatura}
        onClose={() => {
          setSelectedFaturaId(null);
          setPendingFaturaAction(null);
          setFaturaFeedback(null);
          setImportacaoFeedback(null);
          setShowImportForm(false);
        }}
        title={selectedFatura ? `Fatura ${formatCompetencia(selectedFatura.competencia)}` : 'Detalhe da fatura'}
        subtitle={selectedFatura ? cartaoLabel(selectedFatura.cartao) : undefined}
        size="xl"
        headerIcon={<FileText className="w-5 h-5 text-accent" />}
      >
        {selectedFatura ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.7fr)] gap-4">
              <Card className="p-5 bg-surface-2/35">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(selectedFatura.status)}>{statusLabel(selectedFatura.status)}</Badge>
                  <Badge variant="info">{empresaLabel(selectedFatura.cartao?.empresa)}</Badge>
                  {selectedFatura.conta_pagar_id ? <Badge variant="purple">→ conta a pagar</Badge> : null}
                </div>
                <div className="mt-4 text-3xl font-black text-primary">{formatCurrency(Number(selectedFatura.valor_total || 0))}</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-line bg-bg/55 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Fechamento</div>
                    <div className="mt-1 text-sm font-black text-primary">{formatDateBR(selectedFatura.data_fechamento)}</div>
                  </div>
                  <div className="rounded-2xl border border-line bg-bg/55 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted">Vencimento</div>
                    <div className="mt-1 text-sm font-black text-primary">{formatDateBR(selectedFatura.data_vencimento)}</div>
                  </div>
                </div>
              </Card>

              <div className="space-y-3">
                <ClassificacaoProgress fatura={selectedFatura} />
                {(selectedFatura.classificacao?.pendentes || 0) + (selectedFatura.classificacao?.sugeridas || 0) > 0 ? (
                  <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning flex gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-black">DRE incompleto</div>
                      <div className="text-xs font-bold mt-1">
                        Existem transacoes sem classificacao confirmada nesta fatura.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <Card className="p-4 md:p-5 border border-line-strong bg-surface shadow-sm">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div className="min-w-0 flex gap-4">
                  <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-accent/12 border border-accent/25 text-accent items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="purple">Fechamento</Badge>
                      {selectedFatura.conta_pagar_id ? <Badge variant="info">Conta a pagar vinculada</Badge> : null}
                      {selectedFatura.status === 'fechada' && selectedFaturaPendencias > 0 ? (
                        <Badge variant="warning">DRE incompleto</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 text-base font-black text-primary">
                      {selectedFatura.status === 'aberta'
                        ? 'Fechar fatura e gerar conta a pagar'
                        : selectedFatura.status === 'fechada'
                          ? 'Fatura fechada e vinculada ao Contas a Pagar'
                          : 'Fatura sem acao de fechamento'}
                    </div>
                    <div className="mt-1 text-sm font-bold text-secondary leading-relaxed max-w-3xl">
                      {selectedFatura.status === 'aberta'
                        ? 'Ao fechar, o sistema cria a conta no Contas a Pagar com valor, vencimento e dados fiscais do cartao.'
                        : selectedFatura.status === 'fechada'
                          ? 'Ao reabrir, a conta a pagar gerada por este fechamento sera cancelada.'
                          : 'Faturas pagas ou canceladas ficam apenas para consulta nesta etapa.'}
                    </div>
                    {selectedFatura.status === 'aberta' && !selectedCartaoFiscalCompleto ? (
                      <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning flex gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs font-bold">
                          Complete empresa, conta pagadora e centro no cadastro do cartao antes de fechar a fatura.
                        </div>
                      </div>
                    ) : null}
                    {faturaFeedback?.faturaId === selectedFatura.id ? (
                      <div
                        className={cn(
                          'mt-3 rounded-2xl border px-4 py-3 text-sm font-bold',
                          faturaFeedback.variant === 'success' && 'border-success/30 bg-success/10 text-success',
                          faturaFeedback.variant === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
                          faturaFeedback.variant === 'info' && 'border-info/30 bg-info/10 text-info'
                        )}
                      >
                        <div className="font-black">{faturaFeedback.title}</div>
                        <div className="mt-1">{faturaFeedback.message}</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedFaturaAction ? (
                  <Button
                    variant={selectedFaturaAction === 'reabrir' ? 'outline' : 'primary'}
                    disabled={
                      selectedFaturaSaving ||
                      (selectedFaturaAction === 'fechar' && !selectedCartaoFiscalCompleto)
                    }
                    onClick={() => setPendingFaturaAction(selectedFaturaAction)}
                    className="w-full xl:w-auto xl:min-w-[170px] whitespace-nowrap"
                  >
                    {selectedFaturaSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedFaturaAction === 'fechar' ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    {selectedFaturaAction === 'fechar' ? 'Fechar fatura' : 'Reabrir fatura'}
                  </Button>
                ) : null}
              </div>
            </Card>

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted">Transacoes</div>
                  <div className="text-sm font-bold text-secondary">
                    {transacoesSelecionadas.length} item(ns) desta fatura
                  </div>
                </div>
                {selectedFaturaImportacaoDisponivel ? (
                  <Button
                    variant={showImportForm ? 'outline' : 'primary'}
                    onClick={() => {
                      setImportacaoFeedback(null);
                      setShowImportForm((current) => !current);
                    }}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {showImportForm ? 'Ocultar form' : 'Adicionar transacao'}
                  </Button>
                ) : (
                  <Badge variant="default">Reabra para importar</Badge>
                )}
              </div>

              {importacaoFeedback?.faturaId === selectedFatura.id ? (
                <div
                  className={cn(
                    'mb-4 rounded-2xl border px-4 py-3 text-sm font-bold',
                    importacaoFeedback.variant === 'success' && 'border-success/30 bg-success/10 text-success',
                    importacaoFeedback.variant === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
                    importacaoFeedback.variant === 'info' && 'border-info/30 bg-info/10 text-info'
                  )}
                >
                  <div className="font-black">{importacaoFeedback.title}</div>
                  <div className="mt-1">{importacaoFeedback.message}</div>
                </div>
              ) : null}

              {selectedFaturaImportacaoDisponivel && showImportForm ? (
                <div className="mb-4">
                  <ImportarTransacaoFaturaForm
                    fatura={selectedFatura}
                    empresas={empresas}
                    planos={planos}
                    onCancel={() => setShowImportForm(false)}
                    onSuccess={handleTransacaoImportada}
                  />
                </div>
              ) : null}

              {transacoesSelecionadas.length === 0 ? (
                <Card className="p-8 text-center bg-surface-2/35">
                  <div className="text-sm font-black text-primary">Sem transacoes nesta fatura</div>
                  <div className="mt-1 text-xs font-bold text-secondary">
                    Quando uma compra for lancada neste cartao, ela aparece aqui.
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {transacoesSelecionadas.map((transacao) => (
                    <TransacaoRow
                      key={transacao.id}
                      transacao={transacao}
                      fatura={selectedFatura}
                      empresas={empresas}
                      planos={planos}
                      saving={savingTransacaoId === transacao.id}
                      onClassificar={handleClassificar}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingFaturaAction && selectedFatura)}
        onClose={() => setPendingFaturaAction(null)}
        onConfirm={() => (pendingFaturaAction ? handleFaturaAction(pendingFaturaAction) : Promise.resolve())}
        title={faturaActionDialogTitle}
        message={faturaActionDialogMessage}
        confirmLabel={pendingFaturaAction === 'fechar' ? 'Fechar fatura' : 'Reabrir fatura'}
        variant={pendingFaturaAction === 'reabrir' ? 'danger' : 'primary'}
      />
    </div>
  );
};
