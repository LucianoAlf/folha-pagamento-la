import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Loader2, Plus } from 'lucide-react';
import type { Colaborador, FolhaMensal, Lancamento } from '../../types';
import { Badge, Card, Modal, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { supabase } from '../../services/supabase';
import {
  addMonthsToYM,
  applyBistroDiscountsToFolha,
  computeLuciaPagamento,
  computeVendasResumo,
  fetchBistroMovimentacoes,
  fetchBistroParametros,
  fetchBistroConsumos,
  fetchBistroVendasResumo,
  formatMoneyBR,
  getOrCreateBistroCompetencia,
  normalizeName,
  parseConsumosText,
  upsertBistroConsumos,
  upsertBistroParametros,
  upsertBistroVendasResumo,
  createBistroMovimentacao,
  type BistroMovimentacao,
  type BistroMovimentacaoCategoria,
  type BistroMovimentacaoTipo,
  type BistroParametros,
  type BistroVendasResumo,
} from '../../services/bistroService';

function ymFromFolhaRef(folha: FolhaMensal) {
  const ymFolha = `${folha.ano}-${String(folha.mes).padStart(2, '0')}`;
  // Regra: folha do mês X é referente ao mês anterior (consumo = X-1)
  return addMonthsToYM(ymFolha, -1);
}

function monthLabelPt(ym: string) {
  const [y, m] = ym.split('-');
  const names = [
    'Janeiro',
    'Fevereiro',
    'Março',
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
  const mi = Math.max(1, Math.min(12, Number(m))) - 1;
  return `${names[mi] || ym}/${y}`;
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function buildWhatsText(input: {
  ymRef: string;
  consumoTotal: number;
  movs: BistroMovimentacao[];
  vendas: ReturnType<typeof computeVendasResumo>;
  saldoInicialEmla: number;
  saldoFinalEmla: number;
  lucia?: ReturnType<typeof computeLuciaPagamento> | null;
}) {
  const lines: string[] = [];
  lines.push(`*BISTRÔ ${monthLabelPt(input.ymRef).toUpperCase()}*`);
  lines.push('');
  lines.push('*Valores a serem repassados, consumo Colaboradores*');
  lines.push(`☆ ${formatMoneyBR(input.consumoTotal)}`);
  lines.push('');

  const repasses = input.movs.filter((m) => m.tipo === 'repasse_bistro');
  lines.push('*Valores repassados ao Bistrô*');
  if (repasses.length === 0) {
    lines.push('- (nenhum repasse registrado)');
  } else {
    repasses.forEach((m, idx) => {
      lines.push(`${idx + 1}- ${m.descricao} ${formatMoneyBR(m.valor)} (CG)`);
    });
  }
  const totalRepasse = repasses.reduce((acc, m) => acc + (m.valor || 0), 0);
  lines.push('');
  lines.push(`Total repassado em ${monthLabelPt(input.ymRef).split('/')[0]}: ${formatMoneyBR(totalRepasse)}`);
  const diff = totalRepasse - input.consumoTotal;
  if (Math.abs(diff) > 0.009) {
    lines.push(`OBS.: ${diff >= 0 ? 'Foi repassado a mais' : 'Faltou repassar'} ${formatMoneyBR(Math.abs(diff))}`);
  }
  lines.push('');
  lines.push(`*BISTRÔ DEVE A EMLA:* ${formatMoneyBR(input.saldoFinalEmla)}`);
  lines.push('');

  if (input.lucia) {
    lines.push('*Pagamento da Lúcia*');
    lines.push(`- Total de vendas no mês ${formatMoneyBR(input.lucia.totalVendasBrutas)}`);
    lines.push(`- ⛔Taxas ${formatMoneyBR(input.lucia.totalTaxas)}`);
    lines.push(`- ✅ Recebimento sem taxas ${formatMoneyBR(input.lucia.recebLiquido)}`);
    lines.push('');
    lines.push(`- Despesa com insumos e compras ${formatMoneyBR(input.lucia.despesasInsumosOutros)}`);
    lines.push('');
    lines.push(`Lucro líquido: ${formatMoneyBR(input.lucia.lucroLiquido)}`);
    lines.push(`Comissão (15% do lucro líquido): ${formatMoneyBR(input.lucia.comissao)}`);
    lines.push(`Salário: ${formatMoneyBR(input.lucia.salario)}`);
    lines.push(`VT: ${formatMoneyBR(input.lucia.vt)}`);
    lines.push(`Bônus: ${formatMoneyBR(input.lucia.bonus)}`);
    lines.push('');
    lines.push(`Desconto de consumo do mês: ${formatMoneyBR(input.lucia.consumo)}`);
    lines.push('');
    lines.push(`*Total líquido a receber:* ${formatMoneyBR(input.lucia.totalLiquidoLucia)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export const BistroTab: React.FC<{
  folhaAtual: FolhaMensal;
  statusFolha: string;
  colaboradores: Colaborador[];
  lancamentosFolha: Lancamento[];
  onRefreshLancamentos: () => Promise<void> | void;
}> = ({ folhaAtual, statusFolha, colaboradores, lancamentosFolha, onRefreshLancamentos }) => {
  const ymRef = useMemo(() => ymFromFolhaRef(folhaAtual), [folhaAtual]);
  const ymFolha = useMemo(() => `${folhaAtual.ano}-${String(folhaAtual.mes).padStart(2, '0')}`, [folhaAtual]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [competenciaId, setCompetenciaId] = useState<string | null>(null);
  const [saldoInicialEmla, setSaldoInicialEmla] = useState<number>(0);

  const [consumos, setConsumos] = useState<Array<{ colaborador_id: number; valor: number }>>([]);
  const [vendas, setVendas] = useState<BistroVendasResumo | null>(null);
  const [movs, setMovs] = useState<BistroMovimentacao[]>([]);
  const [params, setParams] = useState<BistroParametros | null>(null);

  // Colar lista
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState<Array<{ nome: string; valor: number; colaborador_id: number | null }>>([]);

  // Movimentação quick add
  const [movDraft, setMovDraft] = useState<{ tipo: BistroMovimentacaoTipo; categoria: BistroMovimentacaoCategoria | ''; descricao: string; valor: string; data_mov: string }>({
    tipo: 'despesa',
    categoria: 'insumos',
    descricao: '',
    valor: '',
    data_mov: new Date().toISOString().split('T')[0],
  });

  const canEdit = statusFolha === 'rascunho';

  const consumoTotal = useMemo(() => consumos.reduce((acc, c) => acc + (Number(c.valor) || 0), 0), [consumos]);

  const movTotals = useMemo(() => {
    const sum = (tipo: BistroMovimentacaoTipo) => movs.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
    return {
      repasse: sum('repasse_bistro'),
      despesa: sum('despesa'),
      aporte: sum('aporte_emla'),
      abatimento: sum('abatimento_emla'),
    };
  }, [movs]);

  const saldoFinalEmla = useMemo(() => saldoInicialEmla + movTotals.aporte - movTotals.abatimento, [saldoInicialEmla, movTotals.aporte, movTotals.abatimento]);

  const vendasCalc = useMemo(() => computeVendasResumo(vendas), [vendas]);

  const lucia = useMemo(() => {
    if (!params?.lucia_colaborador_id) return null;
    const consumoLucia = consumos.find((c) => c.colaborador_id === params.lucia_colaborador_id)?.valor || 0;
    const lancLucia = lancamentosFolha.find((l) => l.colaborador_id === params.lucia_colaborador_id) || null;
    const vt = lancLucia?.passagem || 0;
    return computeLuciaPagamento({
      params,
      vendas,
      movs,
      consumoLucia: Number(consumoLucia) || 0,
      vt: Number(vt) || 0,
    });
  }, [params, consumos, lancamentosFolha, vendas, movs]);

  const reportText = useMemo(() => {
    return buildWhatsText({
      ymRef,
      consumoTotal,
      movs,
      vendas: vendasCalc,
      saldoInicialEmla,
      saldoFinalEmla,
      lucia,
    });
  }, [ymRef, consumoTotal, movs, vendasCalc, saldoInicialEmla, saldoFinalEmla, lucia]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const comp = await getOrCreateBistroCompetencia({ ym: ymRef, unidade: 'cg' });
      setCompetenciaId(comp.id);
      setSaldoInicialEmla(Number(comp.saldo_inicial_emla) || 0);

      const [rowsConsumo, rowsMov, rowVendas, rowParams] = await Promise.all([
        fetchBistroConsumos(comp.id),
        fetchBistroMovimentacoes(comp.id),
        fetchBistroVendasResumo(comp.id),
        fetchBistroParametros('cg'),
      ]);
      setConsumos(rowsConsumo.map((r) => ({ colaborador_id: r.colaborador_id, valor: Number(r.valor) || 0 })));
      setMovs(rowsMov);
      setVendas(rowVendas);
      setParams(rowParams);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar dados do Bistrô');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymRef]);

  // Auto-refresh via Realtime (padrão de mercado): qualquer mudança nas tabelas bistro_* recarrega a tab.
  const rtTimer = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (rtTimer.current) window.clearTimeout(rtTimer.current);
      rtTimer.current = window.setTimeout(() => {
        void loadAll();
      }, 250);
    };

    const ch = supabase
      .channel(`bistro-realtime:${ymRef}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bistro_competencias' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bistro_consumos' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bistro_vendas_resumo' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bistro_movimentacoes' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bistro_parametros' }, schedule)
      .subscribe();

    return () => {
      if (rtTimer.current) window.clearTimeout(rtTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymRef]);

  const colabByNorm = useMemo(() => {
    const map = new Map<string, Colaborador>();
    for (const c of colaboradores) {
      map.set(normalizeName(c.nome), c);
      if (c.nome_completo) map.set(normalizeName(c.nome_completo), c);
    }
    return map;
  }, [colaboradores]);

  function refreshPastePreview(text: string) {
    const parsed = parseConsumosText(text);
    const preview = parsed.map((r) => {
      const c = colabByNorm.get(normalizeName(r.nome)) || null;
      return { ...r, colaborador_id: c?.id ?? null };
    });
    setPastePreview(preview);
  }

  async function confirmPaste() {
    if (!competenciaId) return;
    const valid = pastePreview.filter((p) => p.colaborador_id && p.valor > 0) as Array<{ colaborador_id: number; valor: number }>;
    await upsertBistroConsumos(valid.map((v) => ({ competencia_id: competenciaId, colaborador_id: v.colaborador_id, valor: v.valor })));
    setPasteOpen(false);
    setPasteText('');
    setPastePreview([]);
    await loadAll();
  }

  async function saveVendas() {
    if (!competenciaId) return;
    await upsertBistroVendasResumo({ competencia_id: competenciaId, ...vendas });
    await loadAll();
  }

  async function saveParametros(next: Partial<BistroParametros>) {
    const saved = await upsertBistroParametros({ ...(params || {}), ...next, unidade: 'cg' });
    setParams(saved);
  }

  async function addMov() {
    if (!competenciaId) return;
    const valor = Number(String(movDraft.valor || '').replace(/\./g, '').replace(',', '.')) || 0;
    if (!movDraft.descricao.trim()) return;
    await createBistroMovimentacao({
      competencia_id: competenciaId,
      tipo: movDraft.tipo,
      categoria: (movDraft.categoria || null) as any,
      descricao: movDraft.descricao.trim(),
      valor,
      data_mov: movDraft.data_mov,
    });
    setMovDraft((p) => ({ ...p, descricao: '', valor: '' }));
    await loadAll();
  }

  const [applyLoading, setApplyLoading] = useState(false);
  async function applyDiscounts() {
    if (!competenciaId) return;
    setApplyLoading(true);
    try {
      await applyBistroDiscountsToFolha({ folhaId: folhaAtual.id, refYm: ymRef, unidade: 'cg' });
      await onRefreshLancamentos();
      await loadAll();
    } finally {
      setApplyLoading(false);
    }
  }

  const [reportOpen, setReportOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center gap-3 text-slate-300 font-bold">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando Bistrô…
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <div className="text-rose-300 font-black">Erro no Bistrô</div>
        <div className="text-slate-400 font-bold mt-2">{error}</div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="mt-4 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black"
        >
          Tentar novamente
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-white font-black text-lg">Bistrô (Campo Grande)</div>
            <div className="text-xs text-slate-400 font-bold mt-1">
              Folha: <span className="text-slate-200">{monthLabelPt(ymFolha)}</span> • Referência (consumo):{' '}
              <span className="text-slate-200">{monthLabelPt(ymRef)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              disabled={!canEdit}
              className={cn(
                'px-4 py-2 rounded-xl font-black transition-all flex items-center gap-2 border',
                canEdit
                  ? 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30'
                  : 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed'
              )}
            >
              <Plus className="w-4 h-4" /> Lançar Consumos
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition-all flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Gerar Relatório (Copiar)
            </button>
            <button
              type="button"
              onClick={() => void applyDiscounts()}
              disabled={!canEdit || applyLoading}
              className={cn(
                'px-4 py-2 rounded-xl font-black transition-all flex items-center gap-2 border',
                !canEdit
                  ? 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30',
                applyLoading && 'opacity-70'
              )}
              title={!canEdit ? 'A folha precisa estar em rascunho para aplicar descontos.' : 'Aplicar desconto na coluna Descontos (com meta __bistro)'}
            >
              {applyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Aplicar descontos na Folha ({monthLabelPt(ymFolha)})
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-black">Consumo por colaborador</div>
              <div className="text-xs text-slate-500 font-bold mt-1">1 valor por pessoa (mês)</div>
            </div>
            <Badge variant="info">{formatMoneyBR(consumoTotal)}</Badge>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-950/40">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {consumos
                  .slice()
                  .sort((a, b) => {
                    const na = colaboradores.find((c) => c.id === a.colaborador_id)?.nome || '';
                    const nb = colaboradores.find((c) => c.id === b.colaborador_id)?.nome || '';
                    return na.localeCompare(nb);
                  })
                  .map((c) => {
                    const col = colaboradores.find((x) => x.id === c.colaborador_id);
                    return (
                      <tr key={c.colaborador_id} className="border-t border-slate-800/60">
                        <td className="px-4 py-3 text-slate-200 font-bold">{col?.nome || `#${c.colaborador_id}`}</td>
                        <td className="px-4 py-3 text-right text-slate-200 font-mono font-bold">{formatMoneyBR(c.valor)}</td>
                      </tr>
                    );
                  })}
                {consumos.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-slate-500 font-bold">
                      Nenhum consumo lançado ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-white font-black">Configuração (Lúcia)</div>
          <div className="text-xs text-slate-500 font-bold mt-1">Necessário para cálculo automático</div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Colaboradora</div>
              <select
                value={params?.lucia_colaborador_id ?? ''}
                onChange={(e) => void saveParametros({ lucia_colaborador_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              >
                <option value="">Selecione…</option>
                {colaboradores
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pagamento (preview)</div>
            {lucia ? (
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span>Total líquido</span>
                  <span className="text-emerald-300 font-black">{formatMoneyBR(lucia.totalLiquidoLucia)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 font-bold text-xs">
                  <span>Salário + VT + comissão + bônus</span>
                  <span>{formatMoneyBR(lucia.totalBrutoLucia)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 font-bold text-xs">
                  <span>Consumo do mês</span>
                  <span>- {formatMoneyBR(lucia.consumo)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-slate-500 font-bold text-sm">Selecione a Lúcia para ver o cálculo.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="text-white font-black">Vendas do mês (bruto)</div>
          <div className="text-xs text-slate-500 font-bold mt-1">Usado para taxas, lucro e bônus</div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {(['pix_bruto', 'debito_bruto', 'credito_bruto', 'dinheiro_bruto'] as const).map((k) => (
              <div key={k}>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{k.replace('_bruto', '').toUpperCase()}</div>
                <input
                  value={String((vendas as any)?.[k] ?? '')}
                  onChange={(e) => setVendas((p) => ({ ...(p || ({} as any)), [k]: e.target.value } as any))}
                  placeholder="0,00"
                  className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-slate-300 font-bold">Total bruto</div>
            <div className="text-white font-black">{formatMoneyBR(vendasCalc.totalBruto)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-slate-500 font-bold text-sm">Taxas</div>
            <div className="text-rose-300 font-black">{formatMoneyBR(vendasCalc.totalTaxas)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-slate-500 font-bold text-sm">Recebimento sem taxas</div>
            <div className="text-emerald-300 font-black">{formatMoneyBR(vendasCalc.recebLiquido)}</div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => void saveVendas()}
              className={cn(
                'px-4 py-2 rounded-xl font-black border transition-all',
                canEdit ? 'bg-slate-900/50 hover:bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-slate-900/30 border-slate-800/50 text-slate-500 cursor-not-allowed'
              )}
            >
              Salvar vendas
            </button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-black">Movimentações (repasses / despesas / EMLA)</div>
              <div className="text-xs text-slate-500 font-bold mt-1">Base para dívida e auditoria</div>
            </div>
            <Badge variant="purple">{formatMoneyBR(saldoFinalEmla)}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tipo</div>
              <select
                value={movDraft.tipo}
                onChange={(e) => setMovDraft((p) => ({ ...p, tipo: e.target.value as any }))}
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              >
                <option value="despesa">Despesa</option>
                <option value="repasse_bistro">Repasse Bistrô</option>
                <option value="aporte_emla">Aporte EMLA</option>
                <option value="abatimento_emla">Abatimento EMLA</option>
              </select>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Categoria</div>
              <select
                value={movDraft.categoria}
                onChange={(e) => setMovDraft((p) => ({ ...p, categoria: e.target.value as any }))}
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              >
                <option value="insumos">Insumos</option>
                <option value="salario_lucia">Salário Lúcia</option>
                <option value="outros">Outros</option>
                <option value="">—</option>
              </select>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Descrição</div>
              <input
                value={movDraft.descricao}
                onChange={(e) => setMovDraft((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex.: Insumos; Repasse; Reparo Micro-ondas…"
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Valor</div>
              <input
                value={movDraft.valor}
                onChange={(e) => setMovDraft((p) => ({ ...p, valor: e.target.value }))}
                placeholder="0,00"
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data</div>
              <input
                type="date"
                value={movDraft.data_mov}
                onChange={(e) => setMovDraft((p) => ({ ...p, data_mov: e.target.value }))}
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-100 font-bold"
              />
            </div>
            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => void addMov()}
                className={cn(
                  'px-4 py-2 rounded-xl font-black border transition-all',
                  canEdit ? 'bg-slate-900/50 hover:bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-slate-900/30 border-slate-800/50 text-slate-500 cursor-not-allowed'
                )}
              >
                Adicionar movimentação
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-auto max-h-[260px] rounded-xl border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-950/40">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Desc.</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t border-slate-800/60">
                    <td className="px-4 py-3 text-slate-400 font-bold text-sm">{m.data_mov}</td>
                    <td className="px-4 py-3 text-slate-200 font-bold text-sm">{m.tipo}</td>
                    <td className="px-4 py-3 text-slate-200 font-bold text-sm">{m.descricao}</td>
                    <td className="px-4 py-3 text-right text-slate-200 font-mono font-bold">{formatMoneyBR(m.valor)}</td>
                  </tr>
                ))}
                {movs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500 font-bold">
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Paste modal */}
      <Modal
        isOpen={pasteOpen}
        onClose={() => {
          setPasteOpen(false);
          setPasteText('');
          setPastePreview([]);
        }}
        title="Lançar Consumos (colar lista)"
        subtitle="Cole linhas no formato: Nome - 123,45"
        className="max-w-3xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 font-bold">
              {pastePreview.length ? `${pastePreview.filter((p) => p.colaborador_id).length}/${pastePreview.length} reconhecidos` : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 font-black"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canEdit || !pastePreview.length}
                onClick={() => void confirmPaste()}
                className={cn(
                  'px-5 py-2 rounded-xl font-black text-white',
                  !canEdit || !pastePreview.length ? 'bg-slate-800 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
                )}
              >
                Salvar consumos
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              refreshPastePreview(e.target.value);
            }}
            className="w-full min-h-[160px] bg-slate-900/40 border border-slate-700/60 rounded-2xl p-4 text-slate-100 font-mono text-sm"
            placeholder={`Ex:\nLucia - 74,30\nJoão Silva - 25,00`}
          />

          {pastePreview.length ? (
            <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
              <div className="px-4 py-3 bg-slate-950/40 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Preview (reconhecimento por nome)
              </div>
              <div className="max-h-[220px] overflow-auto">
                {pastePreview.map((p, idx) => (
                  <div key={idx} className="px-4 py-2 border-t border-slate-800/60 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-200 font-bold truncate">{p.nome}</div>
                      <div className="text-xs text-slate-500 font-bold truncate">
                        {p.colaborador_id
                          ? `→ ${colaboradores.find((c) => c.id === p.colaborador_id)?.nome || `#${p.colaborador_id}`}`
                          : 'Não reconhecido (ajuste o nome na lista)'}
                      </div>
                    </div>
                    <div className="text-slate-200 font-mono font-black">{formatMoneyBR(p.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Report modal */}
      <Modal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Relatório Mensal — Bistrô"
        subtitle="Você pode editar o texto antes de copiar"
        className="max-w-4xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 font-bold">{copyOk ? <span className="text-emerald-300 font-black">Copiado!</span> : 'WhatsApp: copiar e colar no grupo'}</div>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(reportText).then(() => {
                  setCopyOk(true);
                  setTimeout(() => setCopyOk(false), 1500);
                });
              }}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copiar
            </button>
          </div>
        }
      >
        <textarea
          value={reportText}
          readOnly
          className="w-full min-h-[380px] bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 text-slate-100 font-mono text-sm"
        />
      </Modal>
    </div>
  );
};

