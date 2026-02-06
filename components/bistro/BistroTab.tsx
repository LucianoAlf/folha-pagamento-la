import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { Colaborador, FolhaMensal, Lancamento } from '../../types';
import { Badge, Card, ConfirmDialog, CustomSelect, DatePicker, Modal, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { supabase } from '../../services/supabase';
import { api } from '../../services/api';
import {
  addMonthsToYM,
  applyBistroDiscountsToFolha,
  computeLuciaPagamento,
  computeVendasResumo,
  fetchBistroMovimentacoes,
  fetchBistroParametros,
  fetchBistroCompetenciaByYM,
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
  updateBistroMovimentacao,
  deleteBistroMovimentacao,
  updateBistroCompetencia,
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

function parseMoneyBR(raw: string) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^R\$\s?/i, '')
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(cleaned) || 0;
}

function buildRelatorioFinanceiroText(input: {
  ymRef: string;
  consumoTotal: number;
  vendasRaw: BistroVendasResumo | null;
  vendasCalc: ReturnType<typeof computeVendasResumo>;
  lucia?: ReturnType<typeof computeLuciaPagamento> | null;
  bonusLabel?: string | null;
}) {
  const lines: string[] = [];
  lines.push(`*BISTRÔ ${monthLabelPt(input.ymRef).toUpperCase()}*`);
  lines.push('');

  lines.push('*Desconto de taxa de máquininha*');
  lines.push('');

  const raw = input.vendasRaw;
  const pix = Number(raw?.pix_bruto) || 0;
  const deb = Number(raw?.debito_bruto) || 0;
  const cred = Number(raw?.credito_bruto) || 0;
  const din = Number(raw?.dinheiro_bruto) || 0;

  const pixPct = Number(raw?.pix_taxa_pct) || 0.0099;
  const debPct = Number(raw?.debito_taxa_pct) || 0.0168;
  const credPct = Number(raw?.credito_taxa_pct) || 0.0368;

  const taxPix = input.vendasCalc.taxaPix;
  const taxDeb = input.vendasCalc.taxaDeb;
  const taxCred = input.vendasCalc.taxaCred;

  const pctLabel = (pct: number) => (pct * 100).toFixed(2).replace(/\.00$/, '');

  // Sempre renderiza o template completo (mesmo com 0), para ficar igual ao WhatsApp.
  lines.push(`- Pix: ${formatMoneyBR(pix)} (${pctLabel(pixPct)}%)`);
  lines.push(`⛔ Taxa ${formatMoneyBR(taxPix)}`);
  lines.push(`✅ Recebido ${formatMoneyBR(pix - taxPix)}`);
  lines.push('');

  lines.push(`- Débito: ${formatMoneyBR(deb)} (${pctLabel(debPct)}%)`);
  lines.push(`⛔Taxa ${formatMoneyBR(taxDeb)}`);
  lines.push(`✅ Recebido ${formatMoneyBR(deb - taxDeb)}`);
  lines.push('');

  lines.push(`- Crédito ${formatMoneyBR(cred)}`);
  lines.push(`(taxa${pctLabel(credPct)}%)`);
  lines.push(`⛔Taxa ${formatMoneyBR(taxCred)}`);
  lines.push(`✅ Recebido ${formatMoneyBR(cred - taxCred)}`);
  lines.push('');

  lines.push(`- Dinheiro ${formatMoneyBR(din)}`);
  lines.push(`- Colaboradores ${formatMoneyBR(input.consumoTotal)}`);
  lines.push('');
  lines.push(`Total de taxas ${formatMoneyBR(input.vendasCalc.totalTaxas)}`);
  lines.push('');

  lines.push(`* Total de vendas no mês ${formatMoneyBR(input.vendasCalc.totalBruto)}`);
  lines.push(`* ⛔Taxas ${formatMoneyBR(input.vendasCalc.totalTaxas)}`);
  lines.push(`* ✅ Recebimento sem taxas ${formatMoneyBR(input.vendasCalc.recebLiquido)} `);
  lines.push('');

  if (input.lucia) {
    lines.push(`- Despesa com insumos e compras ${formatMoneyBR(input.lucia.despesasInsumosOutros)}`);
    lines.push('');
    lines.push(`= ${formatMoneyBR(input.lucia.lucroLiquido)}`);
    lines.push('Comissão Lucia');
    lines.push(`☆ 15% do lucro líquido = ${formatMoneyBR(input.lucia.comissao)}`);
    lines.push('');
    lines.push(`Salário ${formatMoneyBR(input.lucia.salario)}`);
    lines.push(`Comissão: ${formatMoneyBR(input.lucia.comissao)}`);
    lines.push(`${input.bonusLabel || 'Bonificação'} ${formatMoneyBR(input.lucia.bonus)}`);
    lines.push('');
    lines.push('Total a Receber');
    lines.push(`= *${formatMoneyBR(input.lucia.totalBrutoLucia)}*`);
    lines.push('');
    lines.push('Desconto de consumo do mês da Lucia no bistrô');
    lines.push(`${formatMoneyBR(input.lucia.consumo)}`);
    lines.push('');
    lines.push('Total a receber líquido');
    lines.push(`*${formatMoneyBR(input.lucia.totalLiquidoLucia)}*`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildRelatorioRepassesText(input: {
  ymRef: string;
  consumoTotal: number;
  movs: BistroMovimentacao[];
  saldoFinalEmla: number;
}) {
  const lines: string[] = [];
  const monthName = monthLabelPt(input.ymRef).split('/')[0];

  lines.push(`*BISTRÔ ${monthLabelPt(input.ymRef).toUpperCase()}*`);
  lines.push('');
  lines.push('*Valores a serem repassados, consumo Colaboradores*');
  lines.push(`☆ ${formatMoneyBR(input.consumoTotal)} (Sem contar gastos Lucia, Anne e Luciano)`);
  lines.push('');

  const contabilizaRepasse = input.movs
    .filter((m) => m.tipo === 'repasse_bistro' || m.tipo === 'despesa')
    .slice()
    .sort((a, b) => String(a.data_mov).localeCompare(String(b.data_mov)));

  lines.push('*Valores repassados ao Bistrô*');
  if (contabilizaRepasse.length === 0) {
    lines.push('- (nenhum repasse/despesa registrada)');
  } else {
    contabilizaRepasse.forEach((m, idx) => {
      lines.push(`${idx + 1}- ${m.descricao} ${formatMoneyBR(m.valor)} (CG)`);
    });
  }
  const totalRepasse = contabilizaRepasse.reduce((acc, m) => acc + (m.valor || 0), 0);
  lines.push('');
  lines.push(`Total repassado em ${monthName}: ${formatMoneyBR(totalRepasse)}`);
  const diff = totalRepasse - input.consumoTotal;
  if (Math.abs(diff) > 0.009) {
    lines.push(`OBS.: ${diff >= 0 ? 'Foi repassado a mais para o bistrô em' : 'Faltou repassar para o bistrô em'} ${monthName} ${formatMoneyBR(Math.abs(diff))}`);
  }
  lines.push('');
  lines.push(`*BISTRÔ DEVE A EMLA:* ${formatMoneyBR(input.saldoFinalEmla)}`);
  lines.push('');
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

  const vendasCalc = useMemo(() => {
    // Garantir que os valores brutos sejam tratados como números antes do cálculo
    const normalizePctUI = (x: any, fallback: number) => {
      const n = Number(String(x ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return n >= 0.1 ? n / 100 : n;
    };
    const vNorm = vendas ? {
      ...vendas,
      pix_bruto: parseMoneyBR(String((vendas as any)?.pix_bruto || '')),
      debito_bruto: parseMoneyBR(String((vendas as any)?.debito_bruto || '')),
      credito_bruto: parseMoneyBR(String((vendas as any)?.credito_bruto || '')),
      dinheiro_bruto: parseMoneyBR(String((vendas as any)?.dinheiro_bruto || '')),
      // Taxas também precisam ser normalizadas para o cálculo em tempo real
      pix_taxa_pct: normalizePctUI((vendas as any)?.pix_taxa_pct, 0.0099),
      debito_taxa_pct: normalizePctUI((vendas as any)?.debito_taxa_pct, 0.0168),
      credito_taxa_pct: normalizePctUI((vendas as any)?.credito_taxa_pct, 0.0368),
    } : null;
    return computeVendasResumo(vNorm as any, consumoTotal);
  }, [vendas, consumoTotal]);

  const luciaLanc = useMemo(() => {
    if (!params?.lucia_colaborador_id) return null;
    return lancamentosFolha.find((l) => l.colaborador_id === params.lucia_colaborador_id) || null;
  }, [lancamentosFolha, params?.lucia_colaborador_id]);

  // Garante consistência: busca a linha da Lúcia diretamente no banco (evita falso "não encontrei" por dados em memória filtrados/defasados).
  const [luciaLancRemote, setLuciaLancRemote] = useState<Lancamento | null>(null);
  const [luciaLancRemoteLoading, setLuciaLancRemoteLoading] = useState(false);
  useEffect(() => {
    const colabId = params?.lucia_colaborador_id;
    if (!colabId) {
      setLuciaLancRemote(null);
      return;
    }
    let cancelled = false;
    setLuciaLancRemoteLoading(true);
    void supabase
      .from('lancamentos_folha')
      .select('id,folha_id,colaborador_id,unidade,categoria,salario,bonus,comissao,passagem,reembolso,inss,descontos,total,detalhamento')
      .eq('folha_id', folhaAtual.id)
      .eq('colaborador_id', colabId)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[bistro] fetch lucia lancamento failed', error);
          setLuciaLancRemote(null);
          return;
        }
        setLuciaLancRemote((data && data.length ? (data[0] as any) : null) as any);
      })
      .finally(() => {
        if (!cancelled) setLuciaLancRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhaAtual.id, params?.lucia_colaborador_id]);

  const luciaLancEffective = luciaLancRemote || luciaLanc;

  const lucia = useMemo(() => {
    if (!params?.lucia_colaborador_id) return null;
    const consumoLucia = consumos.find((c) => c.colaborador_id === params.lucia_colaborador_id)?.valor || 0;
    const vt = luciaLancEffective?.passagem || 0;
    return computeLuciaPagamento({
      params,
      vendas,
      movs,
      consumoLucia: Number(consumoLucia) || 0,
      vt: Number(vt) || 0,
      colaboradoresBruto: consumoTotal,
    });
  }, [params, consumos, luciaLancEffective, vendas, movs, consumoTotal]);

  const [luciaSalarioDraft, setLuciaSalarioDraft] = useState<string>('');
  const [luciaVtDraft, setLuciaVtDraft] = useState<string>('');
  const lastLuciaLancIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!luciaLancEffective) return;
    if (lastLuciaLancIdRef.current === luciaLancEffective.id) return;
    setLuciaSalarioDraft(String(luciaLancEffective.salario || ''));
    setLuciaVtDraft(String(luciaLancEffective.passagem || ''));
    lastLuciaLancIdRef.current = luciaLancEffective.id;
  }, [luciaLancEffective]);

  const [luciaApplyLoading, setLuciaApplyLoading] = useState(false);
  const [luciaApplyOk, setLuciaApplyOk] = useState(false);
  const [luciaCreateLoading, setLuciaCreateLoading] = useState(false);

  async function createLuciaLancamento() {
    if (!canEdit || !params?.lucia_colaborador_id) return;
    const colab = colaboradores.find((c) => c.id === params.lucia_colaborador_id) as any;
    if (!colab) return;

    const unidadeRaw = String(colab.unidade_fixa || 'cg').toLowerCase();
    const unidade = (['cg', 'rec', 'bar'].includes(unidadeRaw) ? unidadeRaw : 'cg') as 'cg' | 'rec' | 'bar';
    const depRaw = String(colab.departamento || 'equipe_operacional') as any;
    const categoria = (['staff_rateado', 'equipe_operacional', 'professores'].includes(depRaw) ? depRaw : 'equipe_operacional') as any;

    setLuciaCreateLoading(true);
    try {
      const created = await api.createLancamento({
        folha_id: folhaAtual.id,
        colaborador_id: params.lucia_colaborador_id,
        unidade,
        categoria,
        salario: Number((params as any).lucia_salario_base || 0),
        bonus: 0,
        comissao: 0,
        reembolso: 0,
        passagem: 0,
        inss: 0,
        descontos: 0,
        observacoes: '',
      } as any);
      setLuciaLancRemote(created as any);
      await onRefreshLancamentos();
    } catch (e: any) {
      console.warn('[bistro] create lucia lancamento failed', e);
      // fallback: mantém a UI estável; o usuário ainda pode criar manualmente na folha
    } finally {
      setLuciaCreateLoading(false);
    }
  }

  async function applyLuciaToFolha() {
    if (!canEdit || !luciaLancEffective || !lucia || !params?.lucia_colaborador_id) return;
    setLuciaApplyLoading(true);
    setLuciaApplyOk(false);
    try {
      const salario = luciaSalarioDraft.trim() ? parseMoneyBR(luciaSalarioDraft) : Number(luciaLancEffective.salario || 0);
      const passagem = luciaVtDraft.trim() ? parseMoneyBR(luciaVtDraft) : Number(luciaLancEffective.passagem || 0);

      await api.updateLancamento(luciaLancEffective.id, {
        salario,
        passagem,
        comissao: lucia.comissao,
        bonus: lucia.bonus,
      } as any);

      await onRefreshLancamentos();
      setLuciaApplyOk(true);
      window.setTimeout(() => setLuciaApplyOk(false), 1500);
    } finally {
      setLuciaApplyLoading(false);
    }
  }

  const reportFinanceiroText = useMemo(() => {
    const bonusLabel = (() => {
      const bonus = Number(lucia?.bonus || 0);
      const tiers = (params?.bonus_tiers || []) as Array<{ min: number; valor: number }>;
      if (!bonus || !tiers.length) return 'Bonificação:';
      const sorted = tiers.slice().sort((a, b) => a.min - b.min);
      const hit = sorted.filter((t) => Number(t.valor) === bonus).sort((a, b) => b.min - a.min)[0];
      if (!hit?.min) return 'Bonificação:';
      // Mantém o texto como a Ana escreve no WhatsApp (ex.: "Bonificação acima de 13k:")
      return `Bonificação acima de ${Math.round(hit.min / 1000)}k:`;
    })();

    return buildRelatorioFinanceiroText({
      ymRef,
      consumoTotal,
      vendasRaw: vendas,
      vendasCalc,
      lucia,
      bonusLabel,
    });
  }, [ymRef, consumoTotal, vendas, vendasCalc, lucia, params?.bonus_tiers]);

  const reportRepassesText = useMemo(() => {
    return buildRelatorioRepassesText({
      ymRef,
      consumoTotal,
      movs,
      saldoFinalEmla,
    });
  }, [ymRef, consumoTotal, movs, saldoFinalEmla]);

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
      setParams(rowParams);

      // Persistência das taxas: se ainda não existe vendas_resumo no mês, herda as taxas do mês anterior (ou defaults) e cria o registro.
      if (!rowVendas) {
        const prevYm = addMonthsToYM(ymRef, -1);
        let pixTax = 0.0099;
        let debTax = 0.0168;
        let credTax = 0.0368;
        try {
          const prevComp = await fetchBistroCompetenciaByYM({ ym: prevYm, unidade: 'cg' });
          if (prevComp) {
            const prevVendas = await fetchBistroVendasResumo(prevComp.id);
            if (prevVendas) {
              pixTax = Number(prevVendas.pix_taxa_pct) || pixTax;
              debTax = Number(prevVendas.debito_taxa_pct) || debTax;
              credTax = Number(prevVendas.credito_taxa_pct) || credTax;
            }
          }
        } catch {
          // best-effort: mantém defaults
        }

        const created = await upsertBistroVendasResumo({
          competencia_id: comp.id,
          pix_bruto: 0,
          debito_bruto: 0,
          credito_bruto: 0,
          dinheiro_bruto: 0,
          pix_taxa_pct: pixTax,
          debito_taxa_pct: debTax,
          credito_taxa_pct: credTax,
        } as any);
        setVendas(created);
      } else {
        setVendas(rowVendas);
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      const denied =
        msg.toLowerCase().includes('row-level security') ||
        msg.toLowerCase().includes('permission denied') ||
        msg.toLowerCase().includes('not allowed');
      setError(denied ? 'Você não tem permissão para acessar o Bistrô.' : msg || 'Falha ao carregar dados do Bistrô');
    } finally {
      setLoading(false);
    }
  }

  async function saveSaldoInicialEmla(next: string) {
    if (!competenciaId) return;
    const n = Number(String(next || '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return;
    await updateBistroCompetencia({ competencia_id: competenciaId, saldo_inicial_emla: n });
    await loadAll();
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

  const inputBase =
    'w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-slate-600';

  const colaboradoresOptions = useMemo(() => {
    return colaboradores
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((c) => ({ value: String(c.id), label: c.nome }));
  }, [colaboradores]);

  const movTipoOptions = useMemo(
    () => [
      { value: 'despesa', label: 'Despesa' },
      { value: 'repasse_bistro', label: 'Repasse Bistrô' },
      { value: 'aporte_emla', label: 'Aporte EMLA' },
      { value: 'abatimento_emla', label: 'Abatimento EMLA' },
    ],
    []
  );

  const movCategoriaOptions = useMemo(
    () => [
      { value: 'insumos', label: 'Insumos' },
      { value: 'salario_lucia', label: 'Salário Lúcia' },
      { value: 'outros', label: 'Outros' },
      { value: '', label: '—' },
    ],
    []
  );

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
    // As taxas podem vir em "%" (ex.: 0,99) ou em fração (0.0099). Normalizamos.
    const normalizePct = (x: any, fallback: number) => {
      const n = Number(String(x ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return fallback;
      // Padrão esperado na UI: taxa em percentual (ex.: 0,99 / 1,68 / 3,68).
      // Se alguém já digitar a fração (ex.: 0.0099), ela fica < 0.1 e preservamos.
      return n >= 0.1 ? n / 100 : n;
    };

    await upsertBistroVendasResumo({
      competencia_id: competenciaId,
      ...vendas,
      pix_bruto: parseMoneyBR(String((vendas as any)?.pix_bruto || '')),
      debito_bruto: parseMoneyBR(String((vendas as any)?.debito_bruto || '')),
      credito_bruto: parseMoneyBR(String((vendas as any)?.credito_bruto || '')),
      dinheiro_bruto: parseMoneyBR(String((vendas as any)?.dinheiro_bruto || '')),
      pix_taxa_pct: normalizePct((vendas as any)?.pix_taxa_pct, 0.0099),
      debito_taxa_pct: normalizePct((vendas as any)?.debito_taxa_pct, 0.0168),
      credito_taxa_pct: normalizePct((vendas as any)?.credito_taxa_pct, 0.0368),
    } as any);
    await loadAll();
  }

  async function autoSaveTaxas() {
    if (!competenciaId) return;
    const normalizePct = (x: any, fallback: number) => {
      const n = Number(String(x ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return n >= 0.1 ? n / 100 : n;
    };
    const saved = await upsertBistroVendasResumo({
      competencia_id: competenciaId,
      ...(vendas || ({} as any)),
      // mantém brutos (se já preenchidos) e garante que taxas fiquem persistidas
      pix_bruto: parseMoneyBR(String((vendas as any)?.pix_bruto || '')),
      debito_bruto: parseMoneyBR(String((vendas as any)?.debito_bruto || '')),
      credito_bruto: parseMoneyBR(String((vendas as any)?.credito_bruto || '')),
      dinheiro_bruto: parseMoneyBR(String((vendas as any)?.dinheiro_bruto || '')),
      pix_taxa_pct: normalizePct((vendas as any)?.pix_taxa_pct, 0.0099),
      debito_taxa_pct: normalizePct((vendas as any)?.debito_taxa_pct, 0.0168),
      credito_taxa_pct: normalizePct((vendas as any)?.credito_taxa_pct, 0.0368),
    } as any);
    setVendas(saved);
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
  const [copyOk, setCopyOk] = useState<null | 'financeiro' | 'repasses'>(null);
  const [reportKind, setReportKind] = useState<'financeiro' | 'repasses'>('financeiro');
  const [reportDraftFinanceiro, setReportDraftFinanceiro] = useState('');
  const [reportDraftRepasses, setReportDraftRepasses] = useState('');
  const [luciaPickerOpen, setLuciaPickerOpen] = useState(false);

  // CRUD Movimentações (editar/excluir com confirmação)
  const [movEditOpen, setMovEditOpen] = useState(false);
  const [movEditDraft, setMovEditDraft] = useState<{
    id: string;
    tipo: BistroMovimentacaoTipo;
    categoria: BistroMovimentacaoCategoria | '' | null;
    descricao: string;
    valor: string;
    data_mov: string;
  } | null>(null);
  const [movEditSaving, setMovEditSaving] = useState(false);

  const [movDeleteOpen, setMovDeleteOpen] = useState(false);
  const [movToDelete, setMovToDelete] = useState<BistroMovimentacao | null>(null);

  function openEditMov(m: BistroMovimentacao) {
    setMovEditDraft({
      id: m.id,
      tipo: m.tipo,
      categoria: (m.categoria || '') as any,
      descricao: m.descricao || '',
      valor: String(m.valor ?? '').replace('.', ','),
      data_mov: m.data_mov,
    });
    setMovEditOpen(true);
  }

  async function saveEditMov() {
    if (!movEditDraft) return;
    setMovEditSaving(true);
    try {
      await updateBistroMovimentacao({
        id: movEditDraft.id,
        tipo: movEditDraft.tipo,
        categoria: movEditDraft.tipo === 'despesa' ? ((movEditDraft.categoria || null) as any) : null,
        descricao: (movEditDraft.descricao || '').trim(),
        valor: parseMoneyBR(movEditDraft.valor),
        data_mov: movEditDraft.data_mov,
      });
      setMovEditOpen(false);
      setMovEditDraft(null);
      await loadAll();
    } finally {
      setMovEditSaving(false);
    }
  }

  async function confirmDeleteMov() {
    if (!movToDelete) return;
    await deleteBistroMovimentacao(movToDelete.id);
    setMovToDelete(null);
    await loadAll();
  }

  useEffect(() => {
    if (!reportOpen) return;
    setReportKind('financeiro');
    setCopyOk(null);
    setReportDraftFinanceiro(reportFinanceiroText);
    setReportDraftRepasses(reportRepassesText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportOpen]);

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
                'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border disabled:opacity-60',
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
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Gerar Relatório (Copiar)
            </button>
            <Tooltip content={!canEdit ? 'A folha precisa estar em rascunho para aplicar descontos.' : 'Aplicar desconto na coluna Descontos (com meta __bistro)'}>
              <button
                type="button"
                onClick={() => void applyDiscounts()}
                disabled={!canEdit || applyLoading}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border disabled:opacity-60',
                  !canEdit
                    ? 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30',
                  applyLoading && 'opacity-70'
                )}
              >
                {applyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Aplicar descontos na Folha ({monthLabelPt(ymFolha)})
              </button>
            </Tooltip>
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

        <div className="space-y-6">
          <Card className="p-5">
            <div className="text-white font-black">Pagamento da Lúcia (Folha)</div>
            <div className="text-xs text-slate-500 font-bold mt-1">Resolve o Bistrô inteiro aqui: calcula e já preenche na Folha</div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Colaboradora</div>
                <button
                  type="button"
                  onClick={() => setLuciaPickerOpen((v) => !v)}
                  className="text-[10px] font-black uppercase tracking-widest text-violet-300 hover:text-violet-200 transition-colors"
                >
                  Alterar
                </button>
              </div>
              <div className="mt-2 px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-950/30 text-slate-100 font-black">
                {params?.lucia_colaborador_id
                  ? colaboradores.find((c) => c.id === params.lucia_colaborador_id)?.nome || `#${params.lucia_colaborador_id}`
                  : 'Não configurado'}
              </div>

              {luciaPickerOpen ? (
                <div className="mt-2">
                  <CustomSelect
                    value={params?.lucia_colaborador_id ? String(params.lucia_colaborador_id) : ''}
                    onValueChange={(v) => {
                      void saveParametros({ lucia_colaborador_id: v ? Number(v) : null });
                      setLuciaPickerOpen(false);
                      // Se mudar, permite reinicializar drafts na próxima renderização
                      luciaDraftInitRef.current = false;
                    }}
                    options={[{ value: '', label: 'Selecione...' }, ...colaboradoresOptions]}
                    className="w-full"
                  />
                  <div className="mt-1 text-[10px] text-slate-500 font-bold">
                    * Você só precisa mexer nisso se um dia a Lúcia mudar de cadastro
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Salário (Folha)</div>
                <input
                  value={luciaSalarioDraft}
                  onChange={(e) => setLuciaSalarioDraft(e.target.value)}
                  placeholder={params ? formatMoneyBR(Number((params as any).lucia_salario_base || 0)) : '0,00'}
                  className={inputBase}
                  inputMode="decimal"
                  disabled={!luciaLancEffective}
                />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">VT (Passagem)</div>
                <input
                  value={luciaVtDraft}
                  onChange={(e) => setLuciaVtDraft(e.target.value)}
                  placeholder="0,00"
                  className={inputBase}
                  inputMode="decimal"
                  disabled={!luciaLancEffective}
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pagamento (calculado)</div>
              {lucia ? (
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between text-slate-300 font-bold">
                    <span>Total líquido</span>
                    <span className="text-emerald-300 font-black">{formatMoneyBR(lucia.totalLiquidoLucia)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
                    <div className="flex items-center justify-between">
                      <span>Comissão</span>
                      <span className="text-slate-200 font-mono">{formatMoneyBR(lucia.comissao)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Bônus</span>
                      <span className="text-slate-200 font-mono">{formatMoneyBR(lucia.bonus)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Consumo (mês)</span>
                      <span className="text-slate-200 font-mono">- {formatMoneyBR(lucia.consumo)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Lucro líquido</span>
                      <span className="text-slate-200 font-mono">{formatMoneyBR(lucia.lucroLiquido)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-slate-500 font-bold text-sm">
                  Selecione a Lúcia para ver o cálculo.
                </div>
              )}
            </div>

            {!luciaLancEffective ? (
              <div className="mt-3 text-[10px] font-bold text-amber-300">
                {luciaLancRemoteLoading
                  ? 'Verificando a linha da Lúcia na folha atual…'
                  : `Não encontrei a linha da Lúcia na folha atual (${monthLabelPt(ymFolha)}). Esse mês ainda não tem lançamentos (provavelmente não foi duplicado). Você pode criar só a linha da Lúcia aqui, ou duplicar o mês anterior em Folha → Lançamentos.`}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createLuciaLancamento()}
                    disabled={!canEdit || luciaCreateLoading}
                    className={cn(
                      'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center gap-2',
                      !canEdit ? 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed' : 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/25'
                    )}
                  >
                    {luciaCreateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Criar linha da Lúcia na Folha
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'folha', page: 'lancamentos' } }))}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 bg-slate-800/50 text-white hover:bg-slate-700 transition-all flex items-center gap-2"
                  >
                    Ir para Lançamentos (Folha)
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-3">
              {luciaApplyOk ? (
                <div className="text-[10px] text-emerald-300 font-black flex items-center gap-2">
                  <CheckCircle2 size={14} /> Aplicado na Folha
                </div>
              ) : null}
            <Tooltip content={!canEdit ? 'A folha precisa estar em rascunho para preencher automaticamente.' : 'Preenche salário/VT/comissão/bônus na folha da Lúcia'}>
              <button
                type="button"
                onClick={() => void applyLuciaToFolha()}
                disabled={!canEdit || !luciaLanc || !lucia || luciaApplyLoading}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center gap-2',
                  !canEdit || !luciaLanc || !lucia
                    ? 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed'
                    : 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30 shadow-lg shadow-violet-600/10 active:scale-95',
                  luciaApplyLoading && 'opacity-70'
                )}
              >
                {luciaApplyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Preencher na Folha
              </button>
            </Tooltip>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-white font-black">EMLA (saldo acumulado)</div>
            <div className="text-xs text-slate-500 font-bold mt-1">Dívida/adiantamentos do Bistrô com a LA (EMLA)</div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Saldo inicial (mês)</div>
                <input
                  defaultValue={String(saldoInicialEmla ?? '')}
                  onBlur={(e) => void saveSaldoInicialEmla(e.target.value)}
                  placeholder="0,00"
                  className={inputBase}
                  inputMode="decimal"
                />
                <div className="mt-1 text-[10px] text-slate-500 font-bold">* Salva automaticamente ao sair do campo</div>
              </div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saldo final (mês)</div>
                <div className="mt-1 text-lg font-black text-white font-mono">{formatMoneyBR(saldoFinalEmla)}</div>
                <div className="mt-1 text-xs text-slate-500 font-bold">Saldo inicial + aportes − abatimentos</div>
              </div>
            </div>
          </Card>
        </div>
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
                  className={inputBase}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {([
              { k: 'pix_taxa_pct', label: 'Taxa Pix (%)' },
              { k: 'debito_taxa_pct', label: 'Taxa Débito (%)' },
              { k: 'credito_taxa_pct', label: 'Taxa Crédito (%)' },
            ] as const).map(({ k, label }) => (
              <div key={k}>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</div>
                <input
                  value={String((vendas as any)?.[k] ?? '')}
                  onChange={(e) => {
                    const raw = String(e.target.value || '').replace(',', '.');
                    setVendas((p) => ({ ...(p || ({} as any)), [k]: raw } as any));
                  }}
                  onBlur={() => void autoSaveTaxas()}
                  placeholder={k === 'pix_taxa_pct' ? '0,99' : k === 'debito_taxa_pct' ? '1,68' : '3,68'}
                  className={inputBase}
                  inputMode="decimal"
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
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => void saveVendas()}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-violet-600/10',
                  canEdit 
                    ? 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30 active:scale-95' 
                    : 'bg-slate-900/30 border-slate-800/50 text-slate-500 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                Salvar vendas do mês
              </button>
              <div className="text-[10px] text-slate-500 font-bold text-center italic">
                * Necessário para calcular lucro e comissões
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-black">Movimentações (repasses / despesas / EMLA)</div>
              <div className="text-xs text-slate-500 font-bold mt-1">
                Repasses/despesas entram no relatório. <span className="text-slate-400">Saldo EMLA só muda com Aporte/Abatimento.</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tipo</div>
              <CustomSelect
                value={movDraft.tipo}
                onValueChange={(v) =>
                  setMovDraft((p) => ({
                    ...p,
                    tipo: v as any,
                    // Categoria só faz sentido para Despesa. Para repasse/aporte/abatimento, deixamos nulo.
                    categoria: v === 'despesa' ? p.categoria : '',
                  }))
                }
                options={movTipoOptions}
              />
              <div className="mt-1 text-[10px] text-slate-500 font-bold">
                * Use <span className="text-slate-300">Aporte EMLA</span> quando a LA paga algo do Bistrô (vira dívida). Use{' '}
                <span className="text-slate-300">Abatimento EMLA</span> quando essa dívida é abatida.
              </div>

              {movDraft.tipo === 'repasse_bistro' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tooltip content="Atalho: preenche descrição e sugere o valor do consumo do mês">
                    <button
                      type="button"
                      onClick={() =>
                        setMovDraft((p) => ({
                          ...p,
                          descricao: p.descricao?.trim() ? p.descricao : 'Repasse consumo colaboradores',
                          valor: p.valor?.trim() ? p.valor : String(consumoTotal || '').replace('.', ','),
                        }))
                      }
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-all flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Repasse consumo (sugestão)
                    </button>
                  </Tooltip>
                  <div className="text-[10px] text-slate-500 font-bold self-center">
                    Consumo do mês: <span className="text-slate-300">{formatMoneyBR(consumoTotal)}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Categoria</div>
              {movDraft.tipo === 'despesa' ? (
                <CustomSelect
                  value={movDraft.categoria}
                  onValueChange={(v) => setMovDraft((p) => ({ ...p, categoria: v as any }))}
                  options={movCategoriaOptions}
                />
              ) : (
                <div className="px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-950/30 text-slate-500 font-black">
                  — (somente para Despesa)
                </div>
              )}
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Descrição</div>
              <input
                value={movDraft.descricao}
                onChange={(e) => setMovDraft((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex.: Insumos; Repasse; Reparo Micro-ondas…"
                className={inputBase}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Valor</div>
              <input
                value={movDraft.valor}
                onChange={(e) => setMovDraft((p) => ({ ...p, valor: e.target.value }))}
                placeholder="0,00"
                className={inputBase}
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data</div>
              <DatePicker
                value={movDraft.data_mov}
                onChange={(v) => setMovDraft((p) => ({ ...p, data_mov: v || '' }))}
                placeholder="Selecione..."
                className="bg-slate-900/40 border-slate-700/60 text-slate-100"
              />
            </div>
            <div className="col-span-2 flex justify-end mt-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => void addMov()}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center gap-2 shadow-lg shadow-violet-600/10',
                  canEdit 
                    ? 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30 active:scale-95' 
                    : 'bg-slate-900/30 border-slate-800/50 text-slate-500 cursor-not-allowed'
                )}
              >
                <Plus className="w-4 h-4" />
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
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t border-slate-800/60">
                    <td className="px-4 py-3 text-slate-400 font-bold text-sm">{m.data_mov}</td>
                    <td className="px-4 py-3 text-slate-200 font-bold text-sm">{m.tipo}</td>
                    <td className="px-4 py-3 text-slate-200 font-bold text-sm">{m.descricao}</td>
                    <td className="px-4 py-3 text-right text-slate-200 font-mono font-bold">{formatMoneyBR(m.valor)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditMov(m)}
                          className="px-2.5 py-2 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 text-slate-200 transition-all"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovToDelete(m);
                            setMovDeleteOpen(true);
                          }}
                          className="px-2.5 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15 text-rose-200 transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {movs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500 font-bold">
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit Movimentação */}
      <Modal
        isOpen={movEditOpen}
        onClose={() => {
          setMovEditOpen(false);
          setMovEditDraft(null);
        }}
        title="Editar movimentação"
        subtitle="Ajuste os dados e salve"
        className="max-w-2xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMovEditOpen(false);
                setMovEditDraft(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 font-black"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveEditMov()}
              disabled={!movEditDraft || movEditSaving || !canEdit}
              className={cn(
                'px-4 py-2 rounded-xl font-black border transition-all disabled:opacity-60 flex items-center gap-2',
                !canEdit ? 'bg-slate-900/30 text-slate-500 border-slate-800/50 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30'
              )}
            >
              {movEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        }
      >
        {movEditDraft ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tipo</div>
              <CustomSelect
                value={movEditDraft.tipo}
                onValueChange={(v) =>
                  setMovEditDraft((p) =>
                    p
                      ? ({
                          ...p,
                          tipo: v as any,
                          categoria: v === 'despesa' ? p.categoria : '',
                        } as any)
                      : p
                  )
                }
                options={movTipoOptions}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Categoria</div>
              {movEditDraft.tipo === 'despesa' ? (
                <CustomSelect
                  value={(movEditDraft.categoria || '') as any}
                  onValueChange={(v) => setMovEditDraft((p) => (p ? ({ ...p, categoria: v as any } as any) : p))}
                  options={movCategoriaOptions}
                />
              ) : (
                <div className="px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-950/30 text-slate-500 font-black">
                  — (somente para Despesa)
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Descrição</div>
              <input
                value={movEditDraft.descricao}
                onChange={(e) => setMovEditDraft((p) => (p ? ({ ...p, descricao: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="Ex.: Repasse; Insumos; Reparo…"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Valor</div>
              <input
                value={movEditDraft.valor}
                onChange={(e) => setMovEditDraft((p) => (p ? ({ ...p, valor: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data</div>
              <DatePicker
                value={movEditDraft.data_mov}
                onChange={(v) => setMovEditDraft((p) => (p ? ({ ...p, data_mov: v || '' } as any) : p))}
                placeholder="Selecione..."
                className="bg-slate-900/40 border-slate-700/60 text-slate-100"
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={movDeleteOpen}
        onClose={() => {
          setMovDeleteOpen(false);
          setMovToDelete(null);
        }}
        onConfirm={() => void confirmDeleteMov()}
        title="Excluir movimentação?"
        message={`Tem certeza que deseja excluir "${movToDelete?.descricao || 'movimentação'}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
      />

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
            <div className="text-xs text-slate-500 font-bold">
              {copyOk ? <span className="text-emerald-300 font-black">Copiado ({copyOk})!</span> : 'WhatsApp: copiar e colar no grupo'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(reportDraftFinanceiro).then(() => {
                    setCopyOk('financeiro');
                    setTimeout(() => setCopyOk(null), 1500);
                  });
                }}
                className="px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 font-black flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Copiar Financeiro
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(reportDraftRepasses).then(() => {
                    setCopyOk('repasses');
                    setTimeout(() => setCopyOk(null), 1500);
                  });
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Copiar Repasses
              </button>
            </div>
          </div>
        }
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setReportKind('financeiro')}
            className={cn(
              'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
              reportKind === 'financeiro'
                ? 'bg-violet-600 text-white border-violet-500/30'
                : 'bg-slate-900/40 text-slate-300 border-slate-800 hover:bg-slate-900/60'
            )}
          >
            Financeiro (taxas)
          </button>
          <button
            type="button"
            onClick={() => setReportKind('repasses')}
            className={cn(
              'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
              reportKind === 'repasses'
                ? 'bg-violet-600 text-white border-violet-500/30'
                : 'bg-slate-900/40 text-slate-300 border-slate-800 hover:bg-slate-900/60'
            )}
          >
            Repasses (Ana)
          </button>
        </div>

        <textarea
          value={reportKind === 'financeiro' ? reportDraftFinanceiro : reportDraftRepasses}
          onChange={(e) => {
            const v = e.target.value;
            if (reportKind === 'financeiro') setReportDraftFinanceiro(v);
            else setReportDraftRepasses(v);
          }}
          className="w-full min-h-[380px] bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 text-slate-100 font-mono text-sm"
        />
      </Modal>
    </div>
  );
};

