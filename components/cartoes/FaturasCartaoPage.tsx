import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Filter,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { Badge, Button, Card, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../UI';
import { cn } from '../CollaboratorComponents';
import { formatCurrency } from '../../services/api';
import { fetchCartoesFaturas } from '../../services/cartoesService';
import {
  attachClassificacaoResumo,
  buildFaturasResumo,
  filterAndSortFaturas,
  getCompetenciasOptions,
  getTransacoesDaFatura,
} from './cartoesFaturasSelectors';
import type {
  CartaoClassificacaoStatus,
  FinanceiroCartao,
  FinanceiroCartaoFatura,
  FinanceiroCartaoTransacao,
} from '../../types/cartoes';
import type { FinanceiroEmpresa } from '../../types/contasPagar';

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

const getInitialCartaoId = (explicit?: string | null) => {
  if (explicit) return explicit;
  try {
    return new URLSearchParams(window.location.search || '').get('cartaoId') || 'all';
  } catch {
    return 'all';
  }
};

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

  return (
    <Card className="p-5 md:p-6 transition-all hover:border-line-strong hover:bg-surface/80">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.8fr)_minmax(180px,0.5fr)_auto] gap-5 items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(fatura.status)}>{statusLabel(fatura.status)}</Badge>
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

const TransacaoRow: React.FC<{ transacao: FinanceiroCartaoTransacao }> = ({ transacao }) => {
  const valor = Number(transacao.valor || 0);
  const isCredit = valor < 0 || transacao.tipo_transacao === 'estorno';
  const parcela =
    transacao.total_parcelas && transacao.total_parcelas > 1
      ? `${transacao.parcela_atual || 1}/${transacao.total_parcelas}`
      : null;
  const hasTriad =
    transacao.classificacao_status === 'confirmada' &&
    (transacao.plano_conta || transacao.empresa || transacao.centro_custo);

  return (
    <div className="rounded-2xl border border-line bg-bg/45 p-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={classificacaoVariant(transacao.classificacao_status)}>
              {classificacaoLabel(transacao.classificacao_status)}
            </Badge>
            <Badge variant="default">{tipoLabel(transacao.tipo_transacao)}</Badge>
            {parcela ? <Badge variant="purple">Parcela {parcela}</Badge> : null}
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
    </div>
  );
};

type FaturasCartaoPageProps = {
  embedded?: boolean;
  initialCartaoId?: string | null;
};

export const FaturasCartaoPage: React.FC<FaturasCartaoPageProps> = ({ embedded = false, initialCartaoId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartoes, setCartoes] = useState<FinanceiroCartao[]>([]);
  const [empresas, setEmpresas] = useState<FinanceiroEmpresa[]>([]);
  const [faturas, setFaturas] = useState<FinanceiroCartaoFatura[]>([]);
  const [transacoes, setTransacoes] = useState<FinanceiroCartaoTransacao[]>([]);
  const [cartaoFiltro, setCartaoFiltro] = useState(() => getInitialCartaoId(initialCartaoId));
  const [empresaFiltro, setEmpresaFiltro] = useState('all');
  const [statusFiltro, setStatusFiltro] = useState('all');
  const [competenciaFiltro, setCompetenciaFiltro] = useState('all');
  const [selectedFaturaId, setSelectedFaturaId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCartoesFaturas();
      setCartoes(data.cartoes);
      setEmpresas(data.empresas);
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
              Visao read-only das faturas e das transacoes que ja nasceram no modulo de cartoes.
            </p>
          </div>
          <Badge variant="purple" className="w-fit">Somente leitura</Badge>
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
            <FaturaCard key={fatura.id} fatura={fatura} onOpen={(next) => setSelectedFaturaId(next.id)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedFatura}
        onClose={() => setSelectedFaturaId(null)}
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

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted">Transacoes</div>
                  <div className="text-sm font-bold text-secondary">
                    {transacoesSelecionadas.length} item(ns) desta fatura
                  </div>
                </div>
              </div>

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
                    <TransacaoRow key={transacao.id} transacao={transacao} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
