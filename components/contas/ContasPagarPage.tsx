import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { LoadingSpinner, ErrorState } from '../UI';
import { ContaPagar, CategoriaDespesa } from '../../types/contasPagar';
import {
  calcularResumo,
  calcularResumoAuditoria,
  fetchCategorias,
  fetchContasPagar,
  registrarPagamento,
  createContaPagar,
  upsertCategoria,
  deleteCategoria,
} from '../../services/contasPagarService';
import { supabase } from '../../services/supabase';
import { ContasSummaryCards } from './ContasSummaryCards';
import { ContasTable } from './ContasTable';
import { NovaContaModal } from './NovaContaModal';
import { PagarContaModal } from './PagarContaModal';
import { CategoriaModal } from './CategoriaModal';
import { Card } from '../UI';
import { formatCurrency } from '../../services/api';
import { CheckCircle2, DollarSign as DollarIcon, Info, TrendingUp, Plus } from 'lucide-react';

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

export const ContasPagarPage: React.FC<{
  mode?: 'visao-geral' | 'todas' | 'categorias';
}> = ({ mode = 'visao-geral' }) => {
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroTab>('todas');

  const [novaOpen, setNovaOpen] = useState(false);
  const [pagarConta, setPagarConta] = useState<ContaPagar | null>(null);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaDespesa | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, rows] = await Promise.all([fetchCategorias(), fetchContasPagar()]);
      setCategorias(cats);
      setContas(rows);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar contas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime: auto-refresh on changes
  useEffect(() => {
    const channel = supabase
      .channel('contas-pagar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_pagar' }, () => {
        void refetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_despesa' }, () => {
        void refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const resumo = useMemo(() => calcularResumo(contas), [contas]);
  const resumoAuditoria = useMemo(() => calcularResumoAuditoria(contas), [contas]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  if (mode === 'categorias') {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xl font-black text-white">Categorias</div>
            <div className="text-sm text-slate-500 font-bold tracking-tight">Gestão do Plano de Contas</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingCategoria(null);
              setCategoriaModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Plus size={16} />
            Nova Categoria
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setEditingCategoria(c);
                setCategoriaModalOpen(true);
              }}
              className="group rounded-2xl border border-slate-800 bg-slate-900/20 p-5 flex items-center justify-between hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-left"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-slate-800 group-hover:border-emerald-500/30 transition-colors"
                  style={{ backgroundColor: `${c.cor}10` }}
                >
                  <span className="text-2xl">{c.icone}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-white font-black truncate">{c.nome}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                      {c.tipo_custo || 'VARIÁVEL'}
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-700" />
                    <div className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">
                      {c.tipo_fluxo || 'DESPESA'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-700 font-black group-hover:text-emerald-500 transition-colors">#{c.ordem}</div>
            </button>
          ))}
        </div>

        <CategoriaModal
          isOpen={categoriaModalOpen}
          initialData={editingCategoria}
          onClose={() => setCategoriaModalOpen(false)}
          onConfirm={async (payload) => {
            await upsertCategoria(payload);
            await refetch();
          }}
          onDelete={async (id) => {
            await deleteCategoria(id);
            await refetch();
          }}
        />
      </div>
    );
  }

  // visao-geral / todas usam mesma tela por enquanto (diferença: no futuro incluir pagos)
  if (mode === 'todas') {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xl font-black text-white">Todas as Contas</div>
            <div className="text-sm text-slate-500 font-bold">Histórico completo e auditoria financeira</div>
          </div>
          <button
            type="button"
            onClick={() => setNovaOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20"
          >
            <Plus size={16} />
            Nova Conta
          </button>
        </div>

        {/* Cards de Auditoria */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Pago</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoria.totalPago.total)}</div>
            <div className="mt-1 text-xs text-emerald-400 font-bold">{resumoAuditoria.totalPago.count} contas liquidadas</div>
          </Card>

          <Card className="p-6 border border-violet-500/20 bg-violet-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                <DollarIcon size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Pendente</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoria.totalPendente.total)}</div>
            <div className="mt-1 text-xs text-violet-400 font-bold">{resumoAuditoria.totalPendente.count} em aberto</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <TrendingUp size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Acumulado</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoria.totalGeral.total)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Volume total do mês</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <Info size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Ticket Médio</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoria.ticketMedio)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Por lançamento</div>
          </Card>
        </div>

        <ContasTable
          contas={contas.filter(c => c.status !== 'cancelado')}
          filtro={filtro}
          onFiltroChange={setFiltro}
          busca={busca}
          onBuscaChange={setBusca}
          onPagar={(c) => setPagarConta(c)}
        />

        <NovaContaModal
          isOpen={novaOpen}
          categorias={categorias}
          onClose={() => setNovaOpen(false)}
          onConfirm={async (payload) => {
            await createContaPagar(payload);
            setNovaOpen(false);
            await refetch();
          }}
        />

        <PagarContaModal
          isOpen={!!pagarConta}
          conta={pagarConta}
          onClose={() => setPagarConta(null)}
          onConfirm={async (input) => {
            if (!pagarConta) return;
            await registrarPagamento(pagarConta.id, input);
            setPagarConta(null);
            await refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xl font-black text-white">Contas a Pagar</div>
          <div className="text-sm text-slate-500 font-bold">
            {mode === 'todas' ? 'Todas as contas (exceto canceladas)' : 'Visão geral e pendências'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNovaOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20"
        >
          <Plus size={16} />
          Nova Conta
        </button>
      </div>

      <ContasSummaryCards
        vencendoHoje={resumo.vencendoHoje}
        vencidas={resumo.vencidas}
        proximos7={resumo.proximos7}
        proximos30={resumo.proximos30}
      />

      <div className="mt-6">
        <ContasTable
          contas={contas.filter((c) => (mode === 'todas' ? c.status !== 'cancelado' : c.status !== 'cancelado' && c.status !== 'pago'))}
          filtro={filtro}
          onFiltroChange={setFiltro}
          busca={busca}
          onBuscaChange={setBusca}
          onPagar={(c) => setPagarConta(c)}
        />
      </div>

      <NovaContaModal
        isOpen={novaOpen}
        categorias={categorias}
        onClose={() => setNovaOpen(false)}
        onConfirm={async (payload) => {
          await createContaPagar(payload);
          setNovaOpen(false);
          await refetch();
        }}
      />

      <PagarContaModal
        isOpen={!!pagarConta}
        conta={pagarConta}
        onClose={() => setPagarConta(null)}
        onConfirm={async (input) => {
          if (!pagarConta) return;
          await registrarPagamento(pagarConta.id, input);
          setPagarConta(null);
          await refetch();
        }}
      />
    </div>
  );
};

