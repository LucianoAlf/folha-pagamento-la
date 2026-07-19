import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  Layers3,
  ListTree,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

import { formatCurrency } from '../../services/api.ts';
import { fetchDreConsulta, fetchDreDetalhes } from '../../services/dreService.ts';
import type {
  DreConsulta,
  DreCursor,
  DreDetalhe,
  DreFonte,
  DreModoVisual,
  DreRegime,
} from '../../types/dre.ts';
import { Badge, Button, Card, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../UI.tsx';
import {
  buildDreCoverageMessage,
  buildDreReconciliationTotals,
  getDreErrorMessage,
  getDreDisplayRows,
  type DreDisplayRow,
} from './dreSelectors.ts';

const SOURCE_LABELS: Record<DreFonte, string> = {
  contas_receber: 'Contas a Receber',
  contas_pagar: 'Contas a Pagar',
  cartao: 'Cartões',
  folha: 'Folha de Pagamento',
};

const GROUP_TONES: Record<string, string> = {
  '3': 'border-success/25 bg-success/10 text-success',
  '4': 'border-info/25 bg-info/10 text-info',
  '5': 'border-accent/25 bg-accent/10 text-accent',
  '6': 'border-warning/25 bg-warning/10 text-warning',
  '7': 'border-line-strong bg-surface-2 text-secondary',
};

function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function toCompetencia(month: string) {
  return `${month}-01`;
}

function formatSignedCurrency(value: number) {
  const amount = Number(value || 0);
  if (amount === 0) return formatCurrency(0);
  return amount < 0 ? `− ${formatCurrency(Math.abs(amount))}` : formatCurrency(amount);
}

function formatDate(value: string | null) {
  if (!value) return 'Sem liquidação';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const KpiCard: React.FC<{
  label: string;
  value: number;
  helper: string;
  icon: React.ElementType;
  tone: 'success' | 'info' | 'accent' | 'warning' | 'neutral';
  signed?: boolean;
}> = ({ label, value, helper, icon: Icon, tone, signed = false }) => {
  const toneClass = {
    success: 'border-success/25 bg-success/10 text-success',
    info: 'border-info/25 bg-info/10 text-info',
    accent: 'border-accent/25 bg-accent/10 text-accent',
    warning: 'border-warning/25 bg-warning/10 text-warning',
    neutral: 'border-line-strong bg-surface-2 text-secondary',
  }[tone];

  return (
    <Card className="min-h-[142px] p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${toneClass}`}>
        <Icon size={19} />
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-1 whitespace-nowrap text-lg font-black leading-tight text-primary sm:text-xl">
        {signed ? formatSignedCurrency(value) : formatCurrency(Math.abs(value))}
      </p>
      <p className="mt-1 text-xs font-semibold text-secondary">{helper}</p>
    </Card>
  );
};

export const DrePage: React.FC = () => {
  const [month, setMonth] = useState(currentMonth);
  const [regime, setRegime] = useState<DreRegime>('competencia');
  const [modo, setModo] = useState<DreModoVisual>('simples');
  const [dre, setDre] = useState<DreConsulta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [selectedRow, setSelectedRow] = useState<DreDisplayRow | null>(null);
  const [detailSource, setDetailSource] = useState<'all' | DreFonte>('all');
  const [details, setDetails] = useState<DreDetalhe[]>([]);
  const [nextCursor, setNextCursor] = useState<DreCursor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const competencia = toCompetencia(month);

  const load = useCallback(async () => {
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDreConsulta(competencia, regime);
      if (requestId.current !== nextRequestId) return;
      setDre(result);
    } catch (loadError) {
      if (requestId.current !== nextRequestId) return;
      console.error('Falha ao carregar DRE:', loadError);
      setError(getDreErrorMessage(loadError));
      setDre(null);
    } finally {
      if (requestId.current === nextRequestId) setLoading(false);
    }
  }, [competencia, regime]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => dre ? getDreDisplayRows(dre, modo) : [], [dre, modo]);
  const coverageMessage = useMemo(
    () => dre ? buildDreCoverageMessage(dre.cobertura) : null,
    [dre],
  );
  const reconciliationTotals = useMemo(
    () => dre ? buildDreReconciliationTotals(dre.reconciliacao) : null,
    [dre],
  );
  const margin = dre && dre.kpis.receita !== 0
    ? (dre.kpis.lucro_operacional / dre.kpis.receita) * 100
    : 0;

  const loadDetails = useCallback(async (append: boolean, cursor: DreCursor | null = null) => {
    if (!selectedRow) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const result = await fetchDreDetalhes({
        competencia,
        regime,
        planoCodigo: selectedRow.codigo,
        fonte: detailSource === 'all' ? null : detailSource,
        cursor,
      });
      setDetails((current) => append ? [...current, ...result.itens] : result.itens);
      setNextCursor(result.next_cursor);
    } catch (loadError) {
      console.error('Falha ao carregar detalhes da DRE:', loadError);
      setDetailError(getDreErrorMessage(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, [competencia, detailSource, regime, selectedRow]);

  useEffect(() => {
    if (!selectedRow) return;
    setDetails([]);
    setNextCursor(null);
    void loadDetails(false);
  }, [loadDetails, selectedRow]);

  const closeDetails = () => {
    setSelectedRow(null);
    setDetailSource('all');
    setDetails([]);
    setNextCursor(null);
    setDetailError(null);
  };

  return (
    <div className="w-full space-y-5 pb-28 lg:pb-10">
      <section className="flex flex-col gap-4 border-b border-line/60 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <BarChart3 size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Financeiro</span>
          </div>
          <h2 className="mt-2 text-2xl font-black text-primary">DRE</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-secondary">
            Resultado consolidado das receitas, despesas, investimentos e movimentos não operacionais.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[170px_auto_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">Competência</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-bold text-primary outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">Regime</span>
            <div className="grid h-11 grid-cols-2 rounded-lg border border-line-strong bg-surface-2 p-1" aria-label="Regime do DRE">
              {(['competencia', 'caixa'] as DreRegime[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRegime(option)}
                  className={`min-w-[108px] rounded-md px-3 text-xs font-black transition-colors ${regime === option ? 'bg-surface text-accent shadow-sm' : 'text-secondary hover:text-primary'}`}
                  aria-pressed={regime === option}
                >
                  {option === 'competencia' ? 'Competência' : 'Caixa'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">Visão</span>
            <div className="grid h-11 grid-cols-2 rounded-lg border border-line-strong bg-surface-2 p-1" aria-label="Nível de detalhe">
              {(['simples', 'sofisticado'] as DreModoVisual[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setModo(option)}
                  className={`min-w-[100px] rounded-md px-3 text-xs font-black transition-colors ${modo === option ? 'bg-surface text-accent shadow-sm' : 'text-secondary hover:text-primary'}`}
                  aria-pressed={modo === option}
                >
                  {option === 'simples' ? 'Simples' : 'Analítico'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading ? <LoadingSpinner /> : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : dre ? (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-info/25 bg-info/10 text-info">
                  <ShieldCheck size={19} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-primary">Cobertura das fontes</h3>
                    <Badge variant={coverageMessage ? 'warning' : 'success'}>
                      {coverageMessage ? 'Cobertura incompleta' : 'Fontes disponíveis'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-secondary">
                    {coverageMessage ?? 'As quatro fontes possuem dados no período selecionado.'}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw size={16} /> Atualizar
              </Button>
            </div>
            <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
              {dre.cobertura.map((item) => (
                <div key={item.fonte} className="bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black text-primary">{item.label}</p>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.estado === 'ok' ? 'bg-success' : 'bg-warning'}`} />
                  </div>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {item.linhas} linhas · {item.classificadas} no DRE
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <KpiCard label="Receita" value={dre.kpis.receita} helper="Entradas classificadas" icon={ArrowUpRight} tone="success" />
            <KpiCard label="Despesas" value={dre.kpis.despesa} helper="Variáveis e fixas" icon={ArrowDownRight} tone="info" />
            <KpiCard label="Lucro operacional" value={dre.kpis.lucro_operacional} helper={`Margem ${margin.toFixed(1)}%`} icon={TrendingUp} tone="accent" signed />
            <KpiCard label="Investimentos" value={dre.kpis.investimentos} helper="Grupo 6" icon={Landmark} tone="warning" />
            <KpiCard label="Não operacional" value={dre.kpis.entradas_nao_operacionais - dre.kpis.saidas_nao_operacionais} helper="Entradas menos saídas" icon={WalletCards} tone="neutral" signed />
            <KpiCard label="Lucro líquido" value={dre.kpis.lucro_liquido} helper="Resultado final" icon={CircleDollarSign} tone={dre.kpis.lucro_liquido >= 0 ? 'success' : 'warning'} signed />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {modo === 'simples' ? <Layers3 className="text-accent" size={18} /> : <ListTree className="text-accent" size={18} />}
                  <h3 className="font-black text-primary">Demonstrativo do resultado</h3>
                </div>
                <p className="mt-1 text-xs font-semibold text-secondary">
                  {modo === 'simples' ? 'Grupos consolidados do plano de contas.' : 'Folhas analíticas classificadas por plano.'}
                </p>
              </div>
              <Badge variant="info">{regime === 'caixa' ? 'Movimento pago/recebido' : 'Competência econômica'}</Badge>
            </div>

            <div className="divide-y divide-line">
              {rows.map((row) => (
                <button
                  key={row.codigo}
                  type="button"
                  onClick={() => setSelectedRow(row)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/40"
                >
                  <span className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-black ${GROUP_TONES[row.grupoCodigo] ?? GROUP_TONES['7']}`}>
                    {row.codigo}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-primary">{row.nome}</span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted">
                      {row.linhasClassificadas == null ? SOURCE_LABELS_FROM_PLAN(dre, row.codigo) : `${row.linhasClassificadas} lançamentos classificados`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`text-sm font-black ${row.valorResultado < 0 ? 'text-secondary' : 'text-primary'}`}>
                      {formatSignedCurrency(row.valorResultado)}
                    </span>
                    <ChevronRight className="text-muted" size={17} />
                  </span>
                </button>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-3 bg-surface-2/55 px-5 py-5">
                <div>
                  <p className="text-sm font-black text-primary">Lucro líquido</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">Resultado após investimentos e movimentos não operacionais</p>
                </div>
                <p className={`text-lg font-black ${dre.kpis.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedCurrency(dre.kpis.lucro_liquido)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-line p-5">
              <div className="flex items-center gap-2">
                <SearchCheck className="text-accent" size={18} />
                <h3 className="font-black text-primary">Reconciliação</h3>
              </div>
              <p className="mt-1 text-xs font-semibold text-secondary">
                O total de cada fonte permanece visível, inclusive o que não participa dos KPIs.
              </p>
            </div>

            <div className="hidden grid-cols-[minmax(180px,1.2fr)_repeat(6,minmax(115px,1fr))] border-b border-line bg-surface-2/40 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted xl:grid">
              <span>Fonte</span><span className="text-right">No DRE</span><span className="text-right">Em revisão</span><span className="text-right">Sem plano</span><span className="text-right">Cancelado</span><span className="text-right">Excluído/rateio</span><span className="text-right">Total da origem</span>
            </div>
            <div className="divide-y divide-line">
              {dre.reconciliacao.map((item) => (
                <div key={item.fonte} className="grid gap-3 p-5 xl:grid-cols-[minmax(180px,1.2fr)_repeat(6,minmax(115px,1fr))] xl:items-center">
                  <p className="font-black text-primary">{item.label}</p>
                  {[
                    ['No DRE', item.classificado_dre],
                    ['Em revisão', item.em_revisao],
                    ['Sem plano', item.sem_plano],
                    ['Cancelado', item.cancelado],
                    ['Excluído/rateio', item.excluido],
                    ['Total da origem', item.total_origem],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-3 xl:block xl:text-right">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted xl:hidden">{label}</span>
                      <span className="text-sm font-bold text-secondary">{formatCurrency(Number(value))}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {reconciliationTotals ? (
              <div className="grid gap-3 border-t border-line-strong bg-surface-2/55 p-5 sm:grid-cols-3 xl:grid-cols-6">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Classificado</p><p className="mt-1 font-black text-primary">{formatCurrency(reconciliationTotals.classificadoDre)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Em revisão</p><p className="mt-1 font-black text-warning">{formatCurrency(reconciliationTotals.emRevisao)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Sem plano</p><p className="mt-1 font-black text-warning">{formatCurrency(reconciliationTotals.semPlano)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Cancelado</p><p className="mt-1 font-black text-secondary">{formatCurrency(reconciliationTotals.cancelado)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Excluído</p><p className="mt-1 font-black text-secondary">{formatCurrency(reconciliationTotals.excluido)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-wider text-muted">Origem</p><p className="mt-1 font-black text-primary">{formatCurrency(reconciliationTotals.totalOrigem)}</p></div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      <Modal
        isOpen={Boolean(selectedRow)}
        onClose={closeDetails}
        title={selectedRow ? `${selectedRow.codigo} · ${selectedRow.nome}` : 'Detalhes do DRE'}
        subtitle={selectedRow ? `${month.split('-').reverse().join('/')} · ${regime === 'caixa' ? 'Regime de caixa' : 'Regime de competência'}` : undefined}
        headerIcon={<ListTree className="text-accent" size={20} />}
        size="xl"
      >
        <div className="space-y-4">
          <div className="max-w-xs">
            <CustomSelect
              value={detailSource}
              onValueChange={(value) => setDetailSource(value as 'all' | DreFonte)}
              icon={Layers3}
              options={[
                { value: 'all', label: 'Todas as fontes' },
                ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>

          {detailError ? (
            <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/10 p-4 text-sm font-semibold text-secondary">
              <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
              <span>{detailError}</span>
            </div>
          ) : null}

          {detailLoading && details.length === 0 ? <LoadingSpinner /> : details.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface-2/40 p-8 text-center">
              <ListTree className="mx-auto text-muted" size={30} />
              <p className="mt-3 font-black text-primary">Nenhum lançamento nesta seleção</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="divide-y divide-line">
                {details.map((item) => (
                  <article key={`${item.fonte}:${item.origem_id}:${item.origem_sequencia}`} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_160px_150px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.status_classificacao === 'classificado_dre' ? 'success' : item.status_classificacao === 'em_revisao' || item.status_classificacao === 'sem_plano' ? 'warning' : 'default'}>
                          {SOURCE_LABELS[item.fonte]}
                        </Badge>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.status_financeiro}</span>
                      </div>
                      <h4 className="mt-2 truncate font-black text-primary">{item.contraparte}</h4>
                      <p className="mt-1 truncate text-xs font-semibold text-secondary">{item.descricao}</p>
                      {item.conta_pagadora_label ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">{item.conta_pagadora_label}</p> : null}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted">Data considerada</p>
                      <p className="mt-1 text-sm font-bold text-secondary">{formatDate(regime === 'caixa' ? item.data_caixa : item.competencia_origem)}</p>
                    </div>
                    <div className="lg:text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted">Efeito no DRE</p>
                      <p className="mt-1 font-black text-primary">{formatSignedCurrency(item.valor_resultado)}</p>
                      <p className="mt-1 text-xs font-semibold text-muted">Origem {formatCurrency(item.valor_origem)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {nextCursor ? (
            <div className="flex justify-center">
              <Button variant="outline" disabled={detailLoading} onClick={() => void loadDetails(true, nextCursor)}>
                {detailLoading ? <RefreshCw className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                Carregar mais
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

function SOURCE_LABELS_FROM_PLAN(dre: DreConsulta, planoCodigo: string) {
  const sources = Object.keys(
    dre.planos.find((plano) => plano.plano_codigo === planoCodigo)?.por_fonte ?? {},
  ) as DreFonte[];
  return sources.length > 0 ? sources.map((source) => SOURCE_LABELS[source]).join(' · ') : 'Sem lançamentos classificados';
}
