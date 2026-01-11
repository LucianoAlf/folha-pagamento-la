import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Card, CustomSelect } from '../UI';
import { formatCurrency } from '../../services/api';
import { CheckCircle2, DollarSign as DollarIcon, Info, TrendingUp, Plus, Filter } from 'lucide-react';
import { cn } from '../CollaboratorComponents';

type FiltroTab = 'todas' | 'hoje' | 'vencidas' | 'prox7' | 'prox30';

export const ContasPagarPage: React.FC<{
  mode?: 'visao-geral' | 'todas' | 'categorias';
}> = ({ mode = 'visao-geral' }) => {
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroTab, setFiltroTab] = useState<FiltroTab>('todas');
  const [unidadeFiltro, setUnidadeFiltro] = useState<'todas' | 'cg' | 'rec' | 'bar'>('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('all');
  const [comportamentoFiltro, setComportamentoFiltro] = useState<'all' | 'fixo' | 'variavel'>('all');
  const [tipoFiltro, setTipoFiltro] = useState<'all' | 'unica' | 'parcelada' | 'recorrente'>('all');

  const [novaOpen, setNovaOpen] = useState(false);
  const [pagarConta, setPagarConta] = useState<ContaPagar | null>(null);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaDespesa | null>(null);

  const [busca, setBusca] = useState('');

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

  const contasFiltradas = useMemo(() => {
    return contas.filter(c => {
      // Filtro Unidade
      if (unidadeFiltro !== 'todas' && c.unidade !== unidadeFiltro && c.unidade !== 'todas') return false;
      
      // Filtro Categoria
      if (categoriaFiltro !== 'all' && c.categoria_id !== categoriaFiltro) return false;
      
      // Filtro Comportamento (Fixo/Variável)
      if (comportamentoFiltro !== 'all' && c.categoria?.tipo_custo !== comportamentoFiltro) return false;
      
      // Filtro Tipo (Única/Parcelada)
      if (tipoFiltro !== 'all' && c.tipo_lancamento !== tipoFiltro) return false;

      // Filtro de Busca
      if (busca) {
        const q = busca.toLowerCase();
        const inDesc = (c.descricao || '').toLowerCase().includes(q);
        const inCat = (c.categoria?.nome || '').toLowerCase().includes(q);
        if (!inDesc && !inCat) return false;
      }

      return true;
    });
  }, [contas, unidadeFiltro, categoriaFiltro, comportamentoFiltro, tipoFiltro, busca]);

  const resumoFiltrado = useMemo(() => calcularResumo(contasFiltradas), [contasFiltradas]);
  const resumoAuditoriaFiltrado = useMemo(() => calcularResumoAuditoria(contasFiltradas), [contasFiltradas]);

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
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black shadow-lg shadow-rose-600/20 transition-all"
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
              className="group rounded-2xl border border-slate-800 bg-slate-900/20 p-5 flex items-center justify-between hover:border-rose-500/30 hover:bg-rose-500/5 transition-all text-left"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-slate-800 group-hover:border-rose-500/30 transition-colors"
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
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-700 font-black group-hover:text-rose-500 transition-colors">#{c.ordem}</div>
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
        {/* Barra de Filtros Superior (Estilo Folha) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'todas', label: 'Consolidado' },
              { id: 'cg', label: 'Campo Grande' },
              { id: 'rec', label: 'Recreio' },
              { id: 'bar', label: 'Barra' },
            ].map((u) => (
              <button
                key={u.id}
                onClick={() => setUnidadeFiltro(u.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  unidadeFiltro === u.id 
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                )}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNovaOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all"
            >
              <Plus size={16} />
              Nova Conta
            </button>
          </div>
        </div>

        {/* Filtros Avançados */}
        <div className="flex flex-wrap items-center gap-4 mb-8 bg-slate-900/20 p-4 rounded-3xl border border-slate-800/60">
          <div className="flex items-center gap-2 text-slate-500 mr-2">
            <Filter size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">Filtros</span>
          </div>

          <div className="w-full sm:w-48">
            <CustomSelect
              value={categoriaFiltro}
              onValueChange={setCategoriaFiltro}
              options={[
                { value: 'all', label: 'Todas Categorias' },
                ...categorias.map(c => ({ value: c.id, label: c.nome }))
              ]}
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'fixo', label: 'Fixo' },
              { id: 'variavel', label: 'Variável' },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => setComportamentoFiltro(b.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  comportamentoFiltro === b.id 
                    ? "bg-slate-800 text-white" 
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
            {[
              { id: 'all', label: 'Tipos' },
              { id: 'unica', label: 'Única' },
              { id: 'parcelada', label: 'Parc.' },
              { id: 'recorrente', label: 'Recorr.' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTipoFiltro(t.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  tipoFiltro === t.id 
                    ? "bg-slate-800 text-white" 
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cards de Auditoria (resumo filtrado) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Pago</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPago.total)}</div>
            <div className="mt-1 text-xs text-rose-400 font-bold">{resumoAuditoriaFiltrado.totalPago.count} contas liquidadas</div>
          </Card>

          <Card className="p-6 border border-violet-500/20 bg-violet-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                <DollarIcon size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Pendente</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalPendente.total)}</div>
            <div className="mt-1 text-xs text-violet-400 font-bold">{resumoAuditoriaFiltrado.totalPendente.count} em aberto</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <TrendingUp size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Total Acumulado</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.totalGeral.total)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Volume no filtro</div>
          </Card>

          <Card className="p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center">
                <Info size={18} />
              </div>
              <div className="text-sm font-bold text-slate-300">Ticket Médio</div>
            </div>
            <div className="text-2xl font-black text-white">{formatCurrency(resumoAuditoriaFiltrado.ticketMedio)}</div>
            <div className="mt-1 text-xs text-slate-500 font-bold">Por lançamento</div>
          </Card>
        </div>

        <ContasTable
          contas={contasFiltradas.filter(c => c.status !== 'cancelado')}
          filtro={filtroTab}
          onFiltroChange={setFiltroTab}
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
      {/* Barra de Filtros Superior (Estilo Folha) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-fit">
          {[
            { id: 'todas', label: 'Consolidado' },
            { id: 'cg', label: 'Campo Grande' },
            { id: 'rec', label: 'Recreio' },
            { id: 'bar', label: 'Barra' },
          ].map((u) => (
            <button
              key={u.id}
              onClick={() => setUnidadeFiltro(u.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black transition-all",
                unidadeFiltro === u.id 
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" 
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              )}
            >
              {u.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNovaOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-lg shadow-violet-600/20 transition-all"
          >
            <Plus size={16} />
            Nova Conta
          </button>
        </div>
      </div>

      {/* Filtros Avançados para Visão Geral */}
      <div className="flex flex-wrap items-center gap-4 mb-8 bg-slate-900/20 p-4 rounded-3xl border border-slate-800/60">
        <div className="flex items-center gap-2 text-slate-500 mr-2">
          <Filter size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider">Filtros</span>
        </div>

        <div className="w-full sm:w-48">
          <CustomSelect
            value={categoriaFiltro}
            onValueChange={setCategoriaFiltro}
            options={[
              { value: 'all', label: 'Todas Categorias' },
              ...categorias.map(c => ({ value: c.id, label: c.nome }))
            ]}
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'fixo', label: 'Fixo' },
            { id: 'variavel', label: 'Variável' },
          ].map(b => (
            <button
              key={b.id}
              onClick={() => setComportamentoFiltro(b.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                comportamentoFiltro === b.id 
                  ? "bg-slate-800 text-white" 
                  : "text-slate-600 hover:text-slate-400"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-slate-950/40 border border-slate-800 rounded-xl p-1">
          {[
            { id: 'all', label: 'Tipos' },
            { id: 'unica', label: 'Única' },
            { id: 'parcelada', label: 'Parc.' },
            { id: 'recorrente', label: 'Recorr.' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTipoFiltro(t.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                tipoFiltro === t.id 
                  ? "bg-slate-800 text-white" 
                  : "text-slate-600 hover:text-slate-400"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ContasSummaryCards
        vencendoHoje={resumoFiltrado.vencendoHoje}
        vencidas={resumoFiltrado.vencidas}
        proximos7={resumoFiltrado.proximos7}
        proximos30={resumoFiltrado.proximos30}
      />

      <div className="mt-6">
        <ContasTable
          contas={contasFiltradas.filter((c) => c.status !== 'cancelado' && c.status !== 'pago')}
          filtro={filtroTab}
          onFiltroChange={setFiltroTab}
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

