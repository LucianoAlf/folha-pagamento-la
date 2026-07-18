import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileWarning,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';

import { useToast } from '../../hooks/useToast.tsx';
import { formatCurrency } from '../../services/api.ts';
import {
  applyContasReceber,
  classificarContaReceber,
  fetchContasReceber,
  fetchPlanosContaEntrada,
  preflightContasReceber,
} from '../../services/contasReceberService.ts';
import type {
  ContaReceber,
  ContaReceberFilters,
  ContasReceberPreflight,
  PlanoContaEntrada,
} from '../../types/contasReceber.ts';
import { Badge, Button, Card, CustomSelect, ErrorState, LoadingSpinner, Modal } from '../UI.tsx';
import {
  buildContasReceberFonteStatus,
  buildContasReceberResumo,
  filterContasReceber,
} from './contasReceberSelectors.ts';

const UNIDADE_LABELS = { cg: 'Campo Grande', rec: 'Recreio', bar: 'Barra' } as const;

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

function formatDate(value: string | null) {
  if (!value) return 'Nao informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return 'Sem sincronizacao registrada';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Nao foi possivel concluir esta acao.';
}

function statusBadge(conta: ContaReceber) {
  if (conta.status === 'recebido') return <Badge variant="success">Recebido</Badge>;
  if (conta.status === 'cancelado') return <Badge variant="default">Cancelado</Badge>;
  if (conta.status === 'revisar') return <Badge variant="warning">Revisar origem</Badge>;
  return <Badge variant="info">Em aberto</Badge>;
}

function classificacaoBadge(conta: ContaReceber) {
  if (conta.classificacao_status === 'confirmada') {
    return <Badge variant="success">{conta.classificacao_origem === 'manual' ? 'Classificada' : 'Automatica'}</Badge>;
  }
  if (conta.classificacao_status === 'excluida') return <Badge variant="default">Fora da receita</Badge>;
  return <Badge variant="warning">Classificar</Badge>;
}

const KpiCard: React.FC<{
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
  tone: 'accent' | 'success' | 'info' | 'warning';
}> = ({ label, value, helper, icon: Icon, tone }) => {
  const toneClass = {
    accent: 'bg-accent/15 text-accent border-accent/20',
    success: 'bg-success/15 text-success border-success/20',
    info: 'bg-info/15 text-info border-info/20',
    warning: 'bg-warning/15 text-warning border-warning/20',
  }[tone];
  return (
    <Card className="min-h-[152px] p-5 flex flex-col justify-between">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${toneClass}`}>
        <Icon size={19} />
      </div>
      <div className="mt-5 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">{label}</p>
        <p className="mt-1 text-2xl font-black text-primary truncate">{value}</p>
        <p className="mt-1 text-xs font-semibold text-secondary">{helper}</p>
      </div>
    </Card>
  );
};

export const ContasReceberPage: React.FC = () => {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth);
  const competencia = toCompetencia(month);
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [planos, setPlanos] = useState<PlanoContaEntrada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContaReceberFilters>({
    unidade: 'all', status: 'all', classificacao: 'all', busca: '',
  });
  const [preflight, setPreflight] = useState<ContasReceberPreflight | null>(null);
  const [syncBusy, setSyncBusy] = useState<'preflight' | 'apply' | null>(null);
  const [selected, setSelected] = useState<ContaReceber | null>(null);
  const [selectedPlano, setSelectedPlano] = useState('');
  const [classifyBusy, setClassifyBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextContas, nextPlanos] = await Promise.all([
        fetchContasReceber(competencia),
        fetchPlanosContaEntrada(),
      ]);
      setContas(nextContas);
      setPlanos(nextPlanos);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [competencia]);

  useEffect(() => {
    setPreflight(null);
    void load();
  }, [load]);

  const resumo = useMemo(() => buildContasReceberResumo(contas), [contas]);
  const filtered = useMemo(() => filterContasReceber(contas, filters), [contas, filters]);
  const lastSourceSync = contas.map((conta) => conta.source_synced_at).filter(Boolean).sort().at(-1) ?? null;
  const fonteStatus = buildContasReceberFonteStatus(
    preflight?.manifesto.source_synced_at ?? lastSourceSync,
  );

  const runPreflight = async () => {
    setSyncBusy('preflight');
    try {
      const result = await preflightContasReceber(competencia);
      setPreflight(result);
      toast.info('Conferencia pronta. Revise os numeros antes de atualizar.');
    } catch (syncError) {
      toast.error(getErrorMessage(syncError));
    } finally {
      setSyncBusy(null);
    }
  };

  const runApply = async () => {
    if (!preflight) return;
    setSyncBusy('apply');
    try {
      await applyContasReceber(competencia, preflight.manifesto.manifest_hash);
      toast.success('Contas a receber atualizadas sem alterar classificacoes manuais.');
      setPreflight(null);
      await load();
    } catch (syncError) {
      toast.error(getErrorMessage(syncError));
    } finally {
      setSyncBusy(null);
    }
  };

  const openClassification = (conta: ContaReceber) => {
    setSelected(conta);
    setSelectedPlano(conta.plano_conta_id ?? '');
  };

  const confirmClassification = async () => {
    if (!selected || !selectedPlano) return;
    setClassifyBusy(true);
    try {
      await classificarContaReceber({ contaReceberId: selected.id, planoContaId: selectedPlano });
      toast.success('Receita classificada. As proximas sincronizacoes vao preservar esta escolha.');
      setSelected(null);
      await load();
    } catch (classifyError) {
      toast.error(getErrorMessage(classifyError));
    } finally {
      setClassifyBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="w-full space-y-5 pb-28 lg:pb-10">
      <section className="flex flex-col gap-4 border-b border-line/60 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <CircleDollarSign size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Financeiro</span>
          </div>
          <h2 className="mt-2 text-2xl font-black text-primary">Contas a Receber</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-secondary">
            Receita dos alunos consolidada por competencia, com classificacao preservada no Super Folha.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted" htmlFor="contas-receber-month">
            Competencia
          </label>
          <input
            id="contas-receber-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-11 min-w-[170px] rounded-xl border border-line-strong bg-surface px-4 text-sm font-bold text-primary outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Recebido" value={formatCurrency(resumo.recebido)} helper="Valor efetivamente pago" icon={CheckCircle2} tone="success" />
        <KpiCard label="Em aberto" value={formatCurrency(resumo.emAberto)} helper="Saldo liquido a receber" icon={Clock3} tone="info" />
        <KpiCard label="Percentual recebido" value={`${resumo.percentualRecebido.toFixed(1)}%`} helper={`De ${formatCurrency(resumo.totalReceita)}`} icon={CircleDollarSign} tone="accent" />
        <KpiCard label="Revisao manual" value={String(resumo.pendentesClassificacao)} helper={`${resumo.excluidos} rateio(s) fora da receita`} icon={FileWarning} tone="warning" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-info/20 bg-info/10 text-info">
              <ArrowDownToLine size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-primary">Atualizacao pelo LA Report</h3>
                <Badge variant={fonteStatus.stale ? 'warning' : 'success'}>
                  {fonteStatus.stale ? 'Fonte desatualizada' : 'Fonte atualizada'}
                </Badge>
              </div>
              <p className="mt-1 text-xs font-semibold text-secondary">
                Dados da origem: {formatUpdatedAt(fonteStatus.sourceSyncedAt)}
                {fonteStatus.ageHours == null ? '' : ` · ha ${fonteStatus.ageHours}h`}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void runPreflight()} disabled={syncBusy !== null}>
              <RefreshCw size={16} className={syncBusy === 'preflight' ? 'animate-spin' : ''} />
              Conferir atualizacao
            </Button>
            {preflight ? (
              <Button variant="primary" onClick={() => void runApply()} disabled={syncBusy !== null}>
                <ShieldCheck size={16} />
                Aplicar conferencia
              </Button>
            ) : null}
          </div>
        </div>
        {preflight ? (
          <div className="grid gap-3 border-t border-line bg-surface-2/45 p-5 sm:grid-cols-3 xl:grid-cols-6">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Linhas</p><p className="mt-1 font-black text-primary">{preflight.manifesto.total_linhas}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Valor liquido</p><p className="mt-1 font-black text-primary">{formatCurrency(preflight.manifesto.total_valor_liquido)}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Mensalidades</p><p className="mt-1 font-black text-primary">{preflight.classificacao.mensalidades}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Matriculas</p><p className="mt-1 font-black text-primary">{preflight.classificacao.matriculas_passaportes}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Rateios fora</p><p className="mt-1 font-black text-primary">{preflight.classificacao.rateios_excluidos}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted">Revisao manual</p><p className="mt-1 font-black text-warning">{preflight.classificacao.pendentes_manuais}</p></div>
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={17} />
            <input
              value={filters.busca}
              onChange={(event) => setFilters((current) => ({ ...current, busca: event.target.value }))}
              placeholder="Buscar aluno, curso ou descricao..."
              className="h-12 w-full rounded-xl border border-line-strong bg-surface/60 pl-11 pr-4 text-sm font-semibold text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/50"
            />
          </label>
          <CustomSelect value={filters.unidade} onValueChange={(unidade) => setFilters((current) => ({ ...current, unidade: unidade as ContaReceberFilters['unidade'] }))} icon={UsersRound} options={[{ value: 'all', label: 'Todas as unidades' }, { value: 'cg', label: 'Campo Grande' }, { value: 'rec', label: 'Recreio' }, { value: 'bar', label: 'Barra' }]} />
          <CustomSelect value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status: status as ContaReceberFilters['status'] }))} icon={CalendarDays} options={[{ value: 'all', label: 'Todos os status' }, { value: 'recebido', label: 'Recebidos' }, { value: 'pendente', label: 'Em aberto' }, { value: 'revisar', label: 'Revisar origem' }, { value: 'cancelado', label: 'Cancelados' }]} />
          <CustomSelect value={filters.classificacao} onValueChange={(classificacao) => setFilters((current) => ({ ...current, classificacao: classificacao as ContaReceberFilters['classificacao'] }))} icon={Filter} options={[{ value: 'all', label: 'Toda classificacao' }, { value: 'pendente', label: 'Fila manual' }, { value: 'confirmada', label: 'Classificadas' }, { value: 'excluida', label: 'Fora da receita' }]} />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <CircleDollarSign className="mx-auto text-muted" size={34} />
          <h3 className="mt-4 font-black text-primary">Nenhuma conta nesta visao</h3>
          <p className="mt-1 text-sm font-semibold text-secondary">Ajuste os filtros ou confira uma nova atualizacao do LA Report.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_140px_130px_140px_150px] border-b border-line bg-surface-2/40 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted lg:grid">
            <span>Aluno e origem</span><span>Unidade</span><span>Vencimento</span><span className="text-right">Valor</span><span className="text-right">Situacao</span>
          </div>
          <div className="divide-y divide-line">
            {filtered.map((conta) => (
              <article key={conta.id} className="grid gap-4 p-5 transition-colors hover:bg-surface-2/30 lg:grid-cols-[minmax(220px,1.4fr)_140px_130px_140px_150px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate font-black text-primary">{conta.aluno_nome || conta.descricao}</h4>
                    {conta.cadastro_match_status !== 'unico' ? <Badge variant="warning">{conta.cadastro_match_status === 'duplicado' ? 'Cadastro duplicado' : 'Sem cadastro'}</Badge> : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-secondary">{conta.descricao}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">Emusys #{conta.emusys_fatura_id}{conta.curso_nome ? ` · ${conta.curso_nome}` : ''}</p>
                </div>
                <div><span className="text-[10px] font-black uppercase tracking-widest text-muted lg:hidden">Unidade · </span><span className="text-sm font-bold text-secondary">{UNIDADE_LABELS[conta.unidade]}</span></div>
                <div><span className="text-[10px] font-black uppercase tracking-widest text-muted lg:hidden">Vence · </span><span className="text-sm font-bold text-secondary">{formatDate(conta.data_vencimento)}</span></div>
                <div className="lg:text-right"><span className="text-[10px] font-black uppercase tracking-widest text-muted lg:hidden">Valor · </span><span className="font-black text-primary">{formatCurrency(conta.status === 'recebido' ? (conta.valor_pago ?? 0) : conta.valor_liquido)}</span></div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {statusBadge(conta)}
                  <button type="button" onClick={() => openClassification(conta)} className="rounded-full outline-none focus:ring-2 focus:ring-accent/50" aria-label={`Classificar ${conta.aluno_nome || conta.descricao}`}>
                    {classificacaoBadge(conta)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Classificar receita"
        subtitle={selected ? `${selected.aluno_nome || selected.descricao} · ${formatCurrency(selected.valor_liquido)}` : undefined}
        headerIcon={<Sparkles className="text-accent" size={20} />}
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!selectedPlano || classifyBusy} onClick={() => void confirmClassification()}>
              <CheckCircle2 size={16} /> Confirmar classificacao
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          {selected?.cadastro_match_status !== 'unico' ? (
            <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm font-semibold text-secondary">
              <AlertCircle className="mt-0.5 shrink-0 text-warning" size={18} />
              A classificacao financeira pode continuar, mas o vinculo de aluno/curso precisa de revisao cadastral no LA Report.
            </div>
          ) : null}
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">Plano de receita</label>
            <CustomSelect
              value={selectedPlano}
              onValueChange={setSelectedPlano}
              placeholder="Selecione uma folha de entrada"
              options={planos.map((plano) => ({ value: plano.id, label: `${plano.codigo} · ${plano.nome}` }))}
            />
          </div>
          <p className="text-xs font-semibold leading-relaxed text-secondary">
            Esta escolha fica protegida: novas atualizacoes de valor ou status vindas do LA Report nao substituem a classificacao manual.
          </p>
        </div>
      </Modal>
    </div>
  );
};
