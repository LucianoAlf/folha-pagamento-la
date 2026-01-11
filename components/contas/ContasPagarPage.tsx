import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { LoadingSpinner, ErrorState } from '../UI';
import { ContaPagar, CategoriaDespesa } from '../../types/contasPagar';
import {
  calcularResumo,
  fetchCategorias,
  fetchContasPagar,
  registrarPagamento,
  createContaPagar,
} from '../../services/contasPagarService';
import { supabase } from '../../services/supabase';
import { ContasSummaryCards } from './ContasSummaryCards';
import { ContasTable } from './ContasTable';
import { NovaContaModal } from './NovaContaModal';
import { PagarContaModal } from './PagarContaModal';

type FiltroTab = 'todas' | 'vencidas' | 'prox7' | 'prox30';

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const resumo = useMemo(() => calcularResumo(contas), [contas]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  if (mode === 'categorias') {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xl font-black text-white">Categorias</div>
            <div className="text-sm text-slate-500 font-bold">Configuração inicial (read-only)</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categorias.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${c.cor}22`, color: c.cor }}
                >
                  <span className="text-lg">{c.icone}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-white font-black truncate">{c.nome}</div>
                  <div className="text-xs text-slate-500 font-bold truncate">
                    {c.tipo_custo ? c.tipo_custo.toUpperCase() : '—'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-500 font-black">#{c.ordem}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // visao-geral / todas usam mesma tela por enquanto (diferença: no futuro incluir pagos)
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

