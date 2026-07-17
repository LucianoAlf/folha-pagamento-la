import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Copy, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { Colaborador, FolhaMensal, Lancamento } from '../../types';
import { Badge, Card, ConfirmDialog, CustomSelect, DatePicker, Modal, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { supabase } from '../../services/supabase';
import { api } from '../../services/api';
import { buildBistroReconciliation, type FolhaDreSnapshotRow } from './folhaBistroModel';
import {
  addMonthsToYM,
  applyBistroFolhaSugestao,
  computeLuciaPagamento,
  computeVendasResumo,
  fetchBistroMovimentacoes,
  fetchBistroParametros,
  fetchBistroCompetenciaByYM,
  fetchBistroConsumos,
  fetchBistroFolhaSugestoes,
  fetchBistroVendasResumo,
  formatMoneyBR,
  getOrCreateBistroCompetencia,
  normalizeName,
  parseConsumosText,
  saveBistroPagamentoDireto,
  upsertBistroConsumos,
  deleteBistroConsumo,
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
  type BistroConsumo,
  type BistroFolhaSugestoesResponse,
} from '../../services/bistroService';
import { useAsyncAction } from '../../hooks/useAsyncAction';

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
  dreSnapshotRows: FolhaDreSnapshotRow[];
  onRefreshLancamentos: () => Promise<void> | void;
}> = ({ folhaAtual, statusFolha, colaboradores, lancamentosFolha, dreSnapshotRows, onRefreshLancamentos }) => {
  const ymRef = useMemo(() => ymFromFolhaRef(folhaAtual), [folhaAtual]);
  const ymFolha = useMemo(() => `${folhaAtual.ano}-${String(folhaAtual.mes).padStart(2, '0')}`, [folhaAtual]);

  // P1: tratamento de erro + feedback (toast) para mutações async
  const { run } = useAsyncAction();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [competenciaId, setCompetenciaId] = useState<string | null>(null);
  const [saldoInicialEmla, setSaldoInicialEmla] = useState<number>(0);

  const [consumos, setConsumos] = useState<BistroConsumo[]>([]);
  const [consumosExpanded, setConsumosExpanded] = useState(false);
  const [vendas, setVendas] = useState<BistroVendasResumo | null>(null);
  const [movs, setMovs] = useState<BistroMovimentacao[]>([]);
  const [params, setParams] = useState<BistroParametros | null>(null);

  // Colar lista
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState<
    Array<{
      nome: string;
      valor: number;
      colaborador_id: number | null;
      sugestoes?: Array<{ id: number; nome: string }>;
    }>
  >([]);

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
  const consumosOrdenados = useMemo(
    () => consumos.slice().sort((a, b) => {
      const nomeA = colaboradores.find((colaborador) => colaborador.id === a.colaborador_id)?.nome || '';
      const nomeB = colaboradores.find((colaborador) => colaborador.id === b.colaborador_id)?.nome || '';
      return nomeA.localeCompare(nomeB);
    }),
    [consumos, colaboradores],
  );
  const bistroReconciliation = useMemo(
    () => buildBistroReconciliation({ consumos, colaboradores, snapshotRows: dreSnapshotRows }),
    [consumos, colaboradores, dreSnapshotRows],
  );

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
      // .then(onFulfilled, onRejected) em vez de .finally: o builder do
      // Supabase é PromiseLike (sem .finally tipado). O loading=false roda
      // em ambos os casos, replicando o finally.
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.warn('[bistro] fetch lucia lancamento failed', error);
            setLuciaLancRemote(null);
          } else {
            setLuciaLancRemote((data && data.length ? (data[0] as any) : null) as any);
          }
          setLuciaLancRemoteLoading(false);
        },
        () => {
          if (!cancelled) setLuciaLancRemoteLoading(false);
        }
      );
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
    await run(
      async () => {
        const salario = luciaSalarioDraft.trim() ? parseMoneyBR(luciaSalarioDraft) : Number(luciaLancEffective.salario || 0);
        const passagem = luciaVtDraft.trim() ? parseMoneyBR(luciaVtDraft) : Number(luciaLancEffective.passagem || 0);

        await api.updateLancamento(luciaLancEffective.id, {
          salario,
          passagem,
          comissao: lucia.comissao,
          bonus: lucia.bonus,
        } as any);

        await onRefreshLancamentos();
      },
      {
        success: 'Dados da Lúcia aplicados à folha.',
        error: 'Não foi possível aplicar os dados à folha.',
        onSuccess: () => {
          setLuciaApplyOk(true);
          window.setTimeout(() => setLuciaApplyOk(false), 1500);
        },
      }
    );
    setLuciaApplyLoading(false);
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
      setConsumos(rowsConsumo.map((r) => ({
        ...r,
        valor: Number(r.valor) || 0,
        valor_pago_direto: Number(r.valor_pago_direto) || 0,
      })));
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
    await run(
      async () => {
        await updateBistroCompetencia({ competencia_id: competenciaId, saldo_inicial_emla: n });
        await loadAll();
      },
      { error: 'Não foi possível salvar o saldo inicial.' }
    );
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

  const colabNormIndex = useMemo(() => {
    return colaboradores.map((c) => {
      const norms = new Set<string>();
      norms.add(normalizeName(c.nome));
      if (c.nome_completo) norms.add(normalizeName(c.nome_completo));
      const normAll = Array.from(norms);
      const words = new Set<string>();
      for (const n of normAll) for (const w of n.split(' ')) if (w) words.add(w);
      return { c, norms: normAll, words: Array.from(words) };
    });
  }, [colaboradores]);

  const inputBase =
    'w-full bg-surface/40 border border-line-strong/60 rounded-2xl px-4 py-3 text-secondary font-bold outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-muted';

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
      const wanted = normalizeName(r.nome);
      const exact = colabByNorm.get(wanted) || null;
      if (exact) return { ...r, colaborador_id: exact.id };

      // Match “premium”: permite primeiro nome / prefixo (Jeremias -> Jeremias Junior),
      // mas evita escolher errado quando houver ambiguidade.
      const candidates = colabNormIndex
        .filter(({ norms, words }) => {
          if (!wanted) return false;
          // prefixo do nome completo ou do nome curto
          if (norms.some((n) => n.startsWith(wanted))) return true;
          // prefixo de qualquer palavra (ex.: "jer" casa com "jeremias")
          if (words.some((w) => w.startsWith(wanted))) return true;
          // tokens: "jer junior" deve casar com palavras do candidato
          const tokens = wanted.split(' ').filter(Boolean);
          if (tokens.length >= 2) {
            return tokens.every((t) => words.some((w) => w.startsWith(t)));
          }
          return false;
        })
        .map(({ c }) => c);

      if (candidates.length === 1) {
        return { ...r, colaborador_id: candidates[0].id };
      }

      if (candidates.length > 1) {
        return {
          ...r,
          colaborador_id: null,
          sugestoes: candidates.slice(0, 6).map((c) => ({ id: c.id, nome: c.nome })),
        };
      }

      return { ...r, colaborador_id: null };
    });
    setPastePreview(preview);
  }

  async function confirmPaste() {
    if (!competenciaId) return;
    const valid = pastePreview.filter((p) => p.colaborador_id && p.valor > 0) as Array<{ colaborador_id: number; valor: number }>;
    await run(
      async () => {
        await upsertBistroConsumos(valid.map((v) => ({ competencia_id: competenciaId, colaborador_id: v.colaborador_id, valor: v.valor })));
        setPasteOpen(false);
        setPasteText('');
        setPastePreview([]);
        await loadAll();
      },
      {
        success: `${valid.length} consumo${valid.length !== 1 ? 's' : ''} importado${valid.length !== 1 ? 's' : ''}.`,
        error: 'Não foi possível importar os consumos.',
      }
    );
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

    await run(
      async () => {
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
      },
      { success: 'Vendas salvas.', error: 'Não foi possível salvar as vendas.' }
    );
  }

  async function autoSaveTaxas() {
    if (!competenciaId) return;
    const normalizePct = (x: any, fallback: number) => {
      const n = Number(String(x ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return n >= 0.1 ? n / 100 : n;
    };
    await run(
      async () => {
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
      },
      { error: 'Não foi possível salvar as taxas.' }
    );
  }

  async function saveParametros(next: Partial<BistroParametros>) {
    await run(
      async () => {
        const saved = await upsertBistroParametros({ ...(params || {}), ...next, unidade: 'cg' });
        setParams(saved);
      },
      { error: 'Não foi possível salvar os parâmetros.' }
    );
  }

  async function addMov() {
    if (!competenciaId) return;
    const valor = Number(String(movDraft.valor || '').replace(/\./g, '').replace(',', '.')) || 0;
    if (!movDraft.descricao.trim()) return;
    await run(
      async () => {
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
      },
      { success: 'Movimentação adicionada.', error: 'Não foi possível adicionar a movimentação.' }
    );
  }

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewData, setReviewData] = useState<BistroFolhaSugestoesResponse | null>(null);
  const [confirmarOutrosDescontos, setConfirmarOutrosDescontos] = useState(false);

  async function loadReview(preferredColaboradorId?: number) {
    setReviewLoading(true);
    try {
      const data = await fetchBistroFolhaSugestoes(folhaAtual.id);
      setReviewData(data);
      setReviewIndex((current) => {
        if (preferredColaboradorId) {
          const found = data.pessoas.findIndex((pessoa) => pessoa.colaborador_id === preferredColaboradorId);
          if (found >= 0) return found;
        }
        return Math.min(current, Math.max(0, data.pessoas.length - 1));
      });
      setConfirmarOutrosDescontos(false);
    } finally {
      setReviewLoading(false);
    }
  }

  async function openReview() {
    setReviewOpen(true);
    setReviewIndex(0);
    setConfirmarOutrosDescontos(false);
    await run(
      () => loadReview(),
      { error: 'Não foi possível carregar as sugestões do Bistrô.' },
    );
  }

  async function applyReviewAction(acao: 'aplicar' | 'remover') {
    const pessoa = reviewData?.pessoas[reviewIndex];
    if (!pessoa) return;
    setReviewSaving(true);
    await run(
      async () => {
        await applyBistroFolhaSugestao({
          folhaId: folhaAtual.id,
          colaboradorId: pessoa.colaborador_id,
          acao,
          sourceHash: pessoa.source_hash,
        });
        await onRefreshLancamentos();
        await loadAll();
        await loadReview(pessoa.colaborador_id);
      },
      {
        success: acao === 'aplicar' ? 'Sugestão aplicada à folha.' : 'Parcela do Bistrô removida da folha.',
        error: acao === 'aplicar' ? 'Não foi possível aplicar a sugestão.' : 'Não foi possível remover a parcela do Bistrô.',
      },
    );
    setReviewSaving(false);
  }

  const reviewPessoa = reviewData?.pessoas[reviewIndex] || null;
  const reviewPessoaBloqueada = !reviewPessoa?.source_hash || [
    'sem_lancamento',
    'metadata mista',
    'consumo maior que a base disponivel',
    'sem_competencia',
  ].includes(reviewPessoa.status || '');
  const reviewPessoaPodeAplicar = reviewPessoa?.status === 'pronto_aplicar'
    || reviewPessoa?.status === 'desconto_sem_origem';

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

  // CRUD Consumos (editar/excluir)
  const [consumoEditOpen, setConsumoEditOpen] = useState(false);
  const [consumoEditDraft, setConsumoEditDraft] = useState<{
    id: string;
    colaborador_id: number;
    nome: string;
    valor: string;
    valor_esperado: number;
    valor_pago_direto: string;
    valor_pago_direto_esperado: number;
    motivo_pagamento_direto: string;
  } | null>(null);
  const [consumoEditSaving, setConsumoEditSaving] = useState(false);

  const [consumoDeleteOpen, setConsumoDeleteOpen] = useState(false);
  const [consumoToDelete, setConsumoToDelete] = useState<{ colaborador_id: number; nome: string; valor: number } | null>(null);

  // UX: campos de taxa (%) devem aparecer no formato humano (0,99 / 1,68 / 3,68),
  // mesmo quando persistimos no banco como fração (0.0099 / 0.0168 / 0.0368).
  const [focusedPctKey, setFocusedPctKey] = useState<null | 'pix_taxa_pct' | 'debito_taxa_pct' | 'credito_taxa_pct'>(null);

  const formatPctForUI = (raw: any, fallbackFraction: number) => {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
    const frac = Number.isFinite(n) && n > 0 ? n : fallbackFraction;
    const pct = frac < 0.1 ? frac * 100 : frac; // se vier fração (<0.1), converte pra %; se vier em %, mantém
    const s = pct
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1')
      .replace('.', ',');
    return s;
  };

  const pctInputValue = (k: 'pix_taxa_pct' | 'debito_taxa_pct' | 'credito_taxa_pct') => {
    const v = (vendas as any)?.[k];
    // Enquanto o usuário digita, não “reformata” o valor (evita cursor pulando).
    if (focusedPctKey === k && typeof v === 'string') return v;
    const fallback = k === 'pix_taxa_pct' ? 0.0099 : k === 'debito_taxa_pct' ? 0.0168 : 0.0368;
    return formatPctForUI(v, fallback);
  };

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
    await run(
      async () => {
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
      },
      { success: 'Movimentação atualizada.', error: 'Não foi possível atualizar a movimentação.' }
    );
    setMovEditSaving(false);
  }

  async function confirmDeleteMov() {
    if (!movToDelete) return;
    const id = movToDelete.id;
    await run(
      async () => {
        await deleteBistroMovimentacao(id);
        setMovToDelete(null);
        await loadAll();
      },
      { success: 'Movimentação excluída.', error: 'Não foi possível excluir a movimentação.' }
    );
  }

  function openEditConsumo(colaborador_id: number) {
    const col = colaboradores.find((c) => c.id === colaborador_id);
    const nome = col?.nome || `#${colaborador_id}`;
    const row = consumos.find((x) => x.colaborador_id === colaborador_id);
    setConsumoEditDraft({
      id: row?.id || '',
      colaborador_id,
      nome,
      valor: String(row?.valor ?? '').replace('.', ','),
      valor_esperado: Number(row?.valor) || 0,
      valor_pago_direto: String(row?.valor_pago_direto ?? 0).replace('.', ','),
      valor_pago_direto_esperado: Number(row?.valor_pago_direto) || 0,
      motivo_pagamento_direto: '',
    });
    setConsumoEditOpen(true);
  }

  async function saveEditConsumo() {
    if (!competenciaId || !consumoEditDraft) return;
    setConsumoEditSaving(true);
    await run(
      async () => {
        const valor = parseMoneyBR(consumoEditDraft.valor);
        const valorPagoDireto = parseMoneyBR(consumoEditDraft.valor_pago_direto);
        if (valorPagoDireto < 0 || valorPagoDireto > valor) {
          throw new Error('O valor pago diretamente deve ficar entre R$ 0,00 e o consumo bruto.');
        }
        const mudouPagamentoDireto = Math.abs(valorPagoDireto - consumoEditDraft.valor_pago_direto_esperado) > 0.004;
        const mudouValor = Math.abs(valor - consumoEditDraft.valor_esperado) > 0.004;
        if (mudouPagamentoDireto && mudouValor) {
          throw new Error('Altere o consumo bruto e o pagamento direto em salvamentos separados para manter a auditoria atômica.');
        }
        if (mudouPagamentoDireto && !consumoEditDraft.motivo_pagamento_direto.trim()) {
          throw new Error('Informe o motivo da alteração do pagamento direto.');
        }
        if (mudouValor) {
          await upsertBistroConsumos([
            {
              competencia_id: competenciaId,
              colaborador_id: consumoEditDraft.colaborador_id,
              valor,
            },
          ]);
        }
        if (mudouPagamentoDireto) {
          if (!consumoEditDraft.id) throw new Error('Salve o consumo antes de registrar pagamento direto.');
          await saveBistroPagamentoDireto({
            consumoId: consumoEditDraft.id,
            valorEsperado: consumoEditDraft.valor_pago_direto_esperado,
            valorPagoDireto,
            motivo: consumoEditDraft.motivo_pagamento_direto.trim(),
          });
        }
        setConsumoEditOpen(false);
        setConsumoEditDraft(null);
        await loadAll();
      },
      { success: 'Consumo atualizado.', error: 'Não foi possível atualizar o consumo.' }
    );
    setConsumoEditSaving(false);
  }

  async function confirmDeleteConsumo() {
    if (!competenciaId || !consumoToDelete) return;
    const colaboradorId = consumoToDelete.colaborador_id;
    await run(
      async () => {
        await deleteBistroConsumo({ competencia_id: competenciaId, colaborador_id: colaboradorId });
        setConsumoToDelete(null);
        await loadAll();
      },
      { success: 'Consumo excluído.', error: 'Não foi possível excluir o consumo.' }
    );
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
        <div className="flex items-center gap-3 text-secondary font-bold">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando Bistrô…
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <div className="text-danger font-black">Erro no Bistrô</div>
        <div className="text-secondary font-bold mt-2">{error}</div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="mt-4 px-4 py-2 rounded-xl bg-accent hover:bg-accent text-primary font-black"
        >
          Tentar novamente
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-line-strong bg-surface-2 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="text-primary font-black text-lg">Bistrô (Campo Grande)</div>
            <div className="text-xs text-secondary font-bold mt-1">
              Folha: <span className="text-secondary">{monthLabelPt(ymFolha)}</span> • Referência (consumo):{' '}
              <span className="text-secondary">{monthLabelPt(ymRef)}</span>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              disabled={!canEdit}
              className={cn(
                'order-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-widest transition-all disabled:opacity-80 lg:order-1 lg:px-4',
                canEdit
                  ? 'border-accent/30 bg-accent text-white shadow-sm hover:bg-accent'
                  : 'cursor-not-allowed border-line-strong bg-surface-3 text-secondary'
              )}
            >
              <Plus className="w-4 h-4" /> Lançar Consumos
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="order-1 col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-info px-4 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-widest text-white shadow-sm transition-all hover:bg-info lg:order-2 lg:col-span-1"
            >
              <Copy className="w-4 h-4" /> Gerar Relatório (Copiar)
            </button>
            <Tooltip content={!canEdit ? 'A folha precisa estar em rascunho para revisar sugestões.' : 'Revise e confirme cada pessoa antes de alterar a folha'}>
              <button
                type="button"
                onClick={() => void openReview()}
                disabled={!canEdit || reviewLoading}
                className={cn(
                  'order-3 col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-widest transition-all disabled:opacity-80 lg:col-span-1 lg:px-4',
                  !canEdit
                    ? 'cursor-not-allowed border-line-strong bg-surface-3 text-secondary'
                    : 'border-success/30 bg-success text-white shadow-sm hover:bg-success',
                  reviewLoading && 'opacity-70'
                )}
              >
                {reviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Revisar sugestões do Bistrô
              </button>
            </Tooltip>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={reviewOpen}
        onClose={() => {
          if (reviewSaving) return;
          setReviewOpen(false);
          setReviewData(null);
        }}
        title="Revisar sugestões do Bistrô"
        subtitle={`Conferência pessoa por pessoa · Folha ${monthLabelPt(ymFolha)}`}
        className="max-w-5xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setReviewOpen(false);
                setReviewData(null);
              }}
              disabled={reviewSaving}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-4 py-2 font-black text-secondary transition-colors hover:bg-surface-3 disabled:opacity-60"
            >
              Fechar
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void applyReviewAction('remover')}
                disabled={!reviewPessoa || reviewSaving || reviewPessoaBloqueada || reviewPessoa.ja_aplicado <= 0}
                className="min-h-11 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 font-black text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remover parcela do Bistrô
              </button>
              <button
                type="button"
                onClick={() => void applyReviewAction('aplicar')}
                disabled={
                  !reviewPessoa ||
                  reviewSaving ||
                  reviewPessoaBloqueada ||
                  !reviewPessoaPodeAplicar ||
                  (reviewPessoa.desconto_sem_origem && !confirmarOutrosDescontos)
                }
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-success/30 bg-success px-4 py-2 font-black text-white shadow-sm transition-colors hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reviewSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aplicar nesta pessoa
              </button>
            </div>
          </div>
        }
      >
        {reviewLoading ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-black">Calculando sugestões auditadas...</span>
          </div>
        ) : !reviewData || reviewData.pessoas.length === 0 ? (
          <div className="rounded-2xl border border-line-strong bg-surface-2 p-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
            <div className="mt-3 font-black text-primary">Nenhuma pessoa para revisar</div>
            <div className="mt-1 text-sm font-bold text-secondary">A folha não possui sugestões do Bistrô nesta competência.</div>
          </div>
        ) : reviewPessoa ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-line-strong bg-surface-2 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">Consumo bruto</div>
                <div className="mt-1 font-mono font-black text-primary">{formatMoneyBR(reviewData.resumo.total_bruto)}</div>
              </div>
              <div className="rounded-2xl border border-info/30 bg-info/10 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-info">Pago direto</div>
                <div className="mt-1 font-mono font-black text-info">{formatMoneyBR(reviewData.resumo.pago_direto)}</div>
              </div>
              <div className="rounded-2xl border border-success/25 bg-success/10 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-success">Aplicável à folha</div>
                <div className="mt-1 font-mono font-black text-success">{formatMoneyBR(reviewData.resumo.aplicavel)}</div>
              </div>
              <div className="rounded-2xl border border-line-strong bg-surface-2 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">Revisão</div>
                <div className="mt-1 font-black text-primary">{reviewIndex + 1} de {reviewData.pessoas.length}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-line-strong bg-surface-2 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted">Colaborador</div>
                  <div className="mt-1 break-words text-lg font-black text-primary">{reviewPessoa.nome}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="info">{reviewPessoa.status || 'Em revisão'}</Badge>
                    <Badge variant="default">Consumo {formatMoneyBR(reviewPessoa.valor_consumo)}</Badge>
                    {reviewPessoa.valor_pago_direto > 0 ? (
                      <Badge variant="info">Pago direto {formatMoneyBR(reviewPessoa.valor_pago_direto)}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="grid min-w-64 grid-cols-2 gap-2">
                  <div className="rounded-xl border border-line-strong bg-surface px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted">Na folha</div>
                    <div className="mt-1 font-mono font-black text-primary">{formatMoneyBR(reviewPessoa.ja_aplicado)}</div>
                  </div>
                  <div className="rounded-xl border border-success/25 bg-success/10 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-success">Sugestão</div>
                    <div className="mt-1 font-mono font-black text-success">{formatMoneyBR(reviewPessoa.valor_aplicavel)}</div>
                  </div>
                </div>
              </div>

              {reviewPessoa.motivo ? (
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-bold text-warning">
                  {reviewPessoa.motivo}
                </div>
              ) : null}

              {reviewPessoa.desconto_sem_origem ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
                  <input
                    type="checkbox"
                    checked={confirmarOutrosDescontos}
                    onChange={(event) => setConfirmarOutrosDescontos(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span className="text-sm font-bold text-secondary">
                    Confirmo que o desconto sem origem comprovada deve permanecer como outro desconto. Nada será apagado silenciosamente.
                  </span>
                </label>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">Distribuição calculada</div>
              {reviewPessoa.linhas.map((linha) => (
                <div key={linha.lancamento_id} className="grid grid-cols-2 gap-3 rounded-2xl border border-line-strong bg-surface p-4 sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted">Origem</div>
                    <div className="mt-1 font-bold text-primary">{linha.unidade.toUpperCase()} · {linha.categoria}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted">Base disponível</div>
                    <div className="mt-1 font-mono font-black text-primary">{formatMoneyBR(linha.base_disponivel)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted">Bistrô anterior</div>
                    <div className="mt-1 font-mono font-black text-secondary">{formatMoneyBR(linha.bistro_anterior)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-success">Bistrô novo</div>
                    <div className="mt-1 font-mono font-black text-success">{formatMoneyBR(linha.bistro_novo)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line-strong pt-4">
              <button
                type="button"
                onClick={() => {
                  setReviewIndex((current) => Math.max(0, current - 1));
                  setConfirmarOutrosDescontos(false);
                }}
                disabled={reviewIndex === 0 || reviewSaving}
                className="min-h-10 rounded-xl border border-line-strong bg-surface px-4 py-2 font-black text-secondary disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-center text-xs font-bold text-muted">Revise e confirme pessoa por pessoa.</span>
              <button
                type="button"
                onClick={() => {
                  setReviewIndex((current) => Math.min(reviewData.pessoas.length - 1, current + 1));
                  setConfirmarOutrosDescontos(false);
                }}
                disabled={reviewIndex >= reviewData.pessoas.length - 1 || reviewSaving}
                className="min-h-10 rounded-xl border border-line-strong bg-surface px-4 py-2 font-black text-secondary disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Edit Consumo */}
      <Modal
        isOpen={consumoEditOpen}
        onClose={() => {
          setConsumoEditOpen(false);
          setConsumoEditDraft(null);
        }}
        title="Editar consumo"
        subtitle="Ajuste o valor do consumo do mês"
        className="max-w-2xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConsumoEditOpen(false);
                setConsumoEditDraft(null);
              }}
              className="px-4 py-2 rounded-xl bg-surface/50 border border-line text-secondary font-black"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveEditConsumo()}
              disabled={!canEdit || !consumoEditDraft || consumoEditSaving}
              className={cn(
                'px-4 py-2 rounded-xl font-black border transition-all disabled:opacity-60 flex items-center gap-2',
                !canEdit
                  ? 'bg-surface/30 text-muted border-line/50 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent text-primary border-accent/30'
              )}
            >
              {consumoEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        }
      >
        {consumoEditDraft ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Colaborador</div>
              <div className="px-4 py-3 rounded-2xl border border-line/60 bg-bg/30 text-secondary font-black">
                {consumoEditDraft.nome}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Valor (mês)</div>
              <input
                value={consumoEditDraft.valor}
                onChange={(e) => setConsumoEditDraft((p) => (p ? ({ ...p, valor: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Pago diretamente ao Bistrô</div>
              <input
                value={consumoEditDraft.valor_pago_direto}
                onChange={(e) => setConsumoEditDraft((p) => (p ? ({ ...p, valor_pago_direto: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="0,00"
                inputMode="decimal"
              />
              <div className="mt-1 text-[11px] font-bold text-muted">Valor explícito: não é inferido pela diferença da folha.</div>
            </div>
            {Math.abs(parseMoneyBR(consumoEditDraft.valor_pago_direto) - consumoEditDraft.valor_pago_direto_esperado) > 0.004 ? (
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Motivo da alteração *</div>
                <textarea
                  value={consumoEditDraft.motivo_pagamento_direto}
                  onChange={(e) => setConsumoEditDraft((p) => (p ? ({ ...p, motivo_pagamento_direto: e.target.value } as any) : p))}
                  className={`${inputBase} min-h-24 resize-y`}
                  placeholder="Ex.: pagamento recebido diretamente na conta do Bistrô"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={consumoDeleteOpen}
        onClose={() => {
          setConsumoDeleteOpen(false);
          setConsumoToDelete(null);
        }}
        onConfirm={() => void confirmDeleteConsumo()}
        title="Excluir consumo?"
        message={`Tem certeza que deseja excluir o consumo de "${consumoToDelete?.nome || 'colaborador'}" (${formatMoneyBR(consumoToDelete?.valor || 0)})? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-primary font-black">Consumo por colaborador</div>
              <div className="text-xs text-muted font-bold mt-1">1 valor por pessoa (mês)</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="info">{formatMoneyBR(consumoTotal)}</Badge>
              <button
                type="button"
                onClick={() => setConsumosExpanded((current) => !current)}
                aria-expanded={consumosExpanded}
                aria-controls="bistro-consumos-lista"
                aria-label={consumosExpanded ? 'Recolher lista de colaboradores' : 'Expandir lista de colaboradores'}
                title={consumosExpanded ? 'Recolher colaboradores' : 'Ver colaboradores'}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line-strong bg-surface text-secondary transition-colors hover:bg-surface-3 hover:text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <ChevronDown className={cn('h-5 w-5 transition-transform', consumosExpanded && 'rotate-180')} />
              </button>
            </div>
          </div>

          {bistroReconciliation.pagoDireto > 0.009 ? (
            <div className="mt-4 rounded-2xl border border-info/30 bg-info/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-info" />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-primary">Conciliação com a folha</div>
                  <div className="mt-1 text-xs font-bold text-secondary">
                    A diferença foi paga diretamente ao Bistrô e não passa pelos descontos da folha desta competência.
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted">Consumo bruto</div>
                      <div className="mt-1 font-mono font-black text-primary">{formatMoneyBR(bistroReconciliation.consumoBruto)}</div>
                    </div>
                    <div className="rounded-xl border border-success/25 bg-success/10 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-success">Liquidado na folha</div>
                      <div className="mt-1 font-mono font-black text-success">{formatMoneyBR(bistroReconciliation.liquidadoFolha)}</div>
                    </div>
                    <div className="rounded-xl border border-info/30 bg-info/10 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-info">Pago diretamente ao Bistrô</div>
                      <div className="mt-1 font-mono font-black text-info">{formatMoneyBR(bistroReconciliation.pagoDireto)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bistroReconciliation.pagamentosDiretos.map((item) => (
                      <span key={item.colaboradorId} className="rounded-full border border-info/25 bg-surface-2 px-3 py-1 text-xs font-bold text-secondary">
                        {item.nome}: {formatMoneyBR(item.valor)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : bistroReconciliation.consumoBruto > 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-sm font-bold text-success">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Todo o consumo deste mês foi liquidado na folha.
            </div>
          ) : null}

          {consumosExpanded ? (
            <div id="bistro-consumos-lista">
          <div className="mt-4 overflow-hidden rounded-xl border border-line-strong bg-surface-2 lg:hidden">
            {consumosOrdenados.length > 0 ? (
              <div className="divide-y divide-line-strong">
                {consumosOrdenados.map((consumo) => {
                  const colaborador = colaboradores.find((item) => item.id === consumo.colaborador_id);
                  const nome = colaborador?.nome || `#${consumo.colaborador_id}`;
                  return (
                    <div key={consumo.colaborador_id} className="bg-surface-2 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 break-words text-sm font-black text-primary">{nome}</div>
                        <div className="shrink-0 font-mono text-sm font-black text-primary">{formatMoneyBR(consumo.valor)}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-muted">Consumo do mês</span>
                          {Number(consumo.valor_pago_direto) > 0 ? (
                            <Badge variant="info">Direto {formatMoneyBR(consumo.valor_pago_direto)}</Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditConsumo(consumo.colaborador_id)}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line-strong bg-surface text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
                            aria-label={`Editar consumo de ${nome}`}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConsumoToDelete({ colaborador_id: consumo.colaborador_id, nome, valor: Number(consumo.valor) || 0 });
                              setConsumoDeleteOpen(true);
                            }}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger transition-colors hover:bg-danger/15"
                            aria-label={`Excluir consumo de ${nome}`}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm font-bold text-muted">Nenhum consumo lançado ainda.</div>
            )}
          </div>

          <div className="mt-4 hidden lg:block overflow-auto rounded-xl border border-line">
            <table className="w-full text-left">
              <thead className="bg-bg/40">
                <tr className="text-[10px] font-black uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {consumosOrdenados.map((c) => {
                    const col = colaboradores.find((x) => x.id === c.colaborador_id);
                    return (
                      <tr key={c.colaborador_id} className="border-t border-line/60">
                        <td className="px-4 py-3 text-secondary font-bold">{col?.nome || `#${c.colaborador_id}`}</td>
                        <td className="px-4 py-3 text-right text-secondary font-mono font-bold">
                          <div>{formatMoneyBR(c.valor)}</div>
                          {Number(c.valor_pago_direto) > 0 ? (
                            <div className="mt-1 text-[10px] font-black text-info">Direto {formatMoneyBR(c.valor_pago_direto)}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditConsumo(c.colaborador_id)}
                              className="px-2.5 py-2 rounded-xl border border-line bg-surface/40 hover:bg-surface/70 text-secondary transition-all"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nome = col?.nome || `#${c.colaborador_id}`;
                                setConsumoToDelete({ colaborador_id: c.colaborador_id, nome, valor: Number(c.valor) || 0 });
                                setConsumoDeleteOpen(true);
                              }}
                              className="px-2.5 py-2 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/15 text-danger transition-all"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {consumos.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted font-bold">
                      Nenhum consumo lançado ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="text-primary font-black">Pagamento da Lúcia (Folha)</div>
            <div className="text-xs text-muted font-bold mt-1">Resolve o Bistrô inteiro aqui: calcula e já preenche na Folha</div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">Colaboradora</div>
                <button
                  type="button"
                  onClick={() => setLuciaPickerOpen((v) => !v)}
                  className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-accent transition-colors"
                >
                  Alterar
                </button>
              </div>
              <div className="mt-2 px-4 py-3 rounded-2xl border border-line/60 bg-bg/30 text-secondary font-black">
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
                      // (zera o ID rastreado para o effect de init voltar a rodar)
                      lastLuciaLancIdRef.current = null;
                    }}
                    options={[{ value: '', label: 'Selecione...' }, ...colaboradoresOptions]}
                    className="w-full"
                  />
                  <div className="mt-1 text-[10px] text-muted font-bold">
                    * Você só precisa mexer nisso se um dia a Lúcia mudar de cadastro
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Salário (Folha)</div>
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
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">VT (Passagem)</div>
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

            <div className="mt-4 rounded-2xl border border-line bg-bg/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">Pagamento (calculado)</div>
              {lucia ? (
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between text-secondary font-bold">
                    <span>Total líquido</span>
                    <span className="text-success font-black">{formatMoneyBR(lucia.totalLiquidoLucia)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold text-muted">
                    <div className="flex items-center justify-between">
                      <span>Comissão</span>
                      <span className="text-secondary font-mono">{formatMoneyBR(lucia.comissao)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Bônus</span>
                      <span className="text-secondary font-mono">{formatMoneyBR(lucia.bonus)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Consumo (mês)</span>
                      <span className="text-secondary font-mono">- {formatMoneyBR(lucia.consumo)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Lucro líquido</span>
                      <span className="text-secondary font-mono">{formatMoneyBR(lucia.lucroLiquido)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-muted font-bold text-sm">
                  Selecione a Lúcia para ver o cálculo.
                </div>
              )}
            </div>

            {!luciaLancEffective ? (
              <div className="mt-3 text-[10px] font-bold text-warning">
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
                      !canEdit ? 'bg-surface/30 text-muted border-line/50 cursor-not-allowed' : 'bg-warning/20 text-warning border-warning/30 hover:bg-warning/25'
                    )}
                  >
                    {luciaCreateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Criar linha da Lúcia na Folha
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'folha', page: 'lancamentos' } }))}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-line-strong bg-surface-2/50 text-primary hover:bg-surface-3 transition-all flex items-center gap-2"
                  >
                    Ir para Lançamentos (Folha)
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-3">
              {luciaApplyOk ? (
                <div className="text-[10px] text-success font-black flex items-center gap-2">
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
                    ? 'bg-surface/30 text-muted border-line/50 cursor-not-allowed'
                    : 'bg-accent hover:bg-accent text-primary border-accent/30 shadow-lg shadow-accent/10 active:scale-95',
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
            <div className="text-primary font-black">EMLA (saldo acumulado)</div>
            <div className="text-xs text-muted font-bold mt-1">Dívida/adiantamentos do Bistrô com a LA (EMLA)</div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Saldo inicial (mês)</div>
                <input
                  defaultValue={String(saldoInicialEmla ?? '')}
                  onBlur={(e) => void saveSaldoInicialEmla(e.target.value)}
                  placeholder="0,00"
                  className={inputBase}
                  inputMode="decimal"
                />
                <div className="mt-1 text-[10px] text-muted font-bold">* Salva automaticamente ao sair do campo</div>
              </div>
              <div className="rounded-2xl border border-line/60 bg-bg/30 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">Saldo final (mês)</div>
                <div className="mt-1 text-lg font-black text-primary font-mono">{formatMoneyBR(saldoFinalEmla)}</div>
                <div className="mt-1 text-xs text-muted font-bold">Saldo inicial + aportes − abatimentos</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="text-primary font-black">Vendas do mês (bruto)</div>
          <div className="text-xs text-muted font-bold mt-1">Usado para taxas, lucro e bônus</div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {(['pix_bruto', 'debito_bruto', 'credito_bruto', 'dinheiro_bruto'] as const).map((k) => (
              <div key={k}>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">{k.replace('_bruto', '').toUpperCase()}</div>
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
                <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">{label}</div>
                <input
                  value={pctInputValue(k)}
                  onChange={(e) => {
                    // Mantém o que o usuário digitou (com vírgula ou ponto); normalizamos no autosave.
                    setVendas((p) => ({ ...(p || ({} as any)), [k]: String(e.target.value || '') } as any));
                  }}
                  onFocus={() => setFocusedPctKey(k)}
                  onBlur={() => {
                    setFocusedPctKey(null);
                    void autoSaveTaxas();
                  }}
                  placeholder={k === 'pix_taxa_pct' ? '0,99' : k === 'debito_taxa_pct' ? '1,68' : '3,68'}
                  className={inputBase}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <div className="text-muted font-bold">Vendas por canais</div>
            <div className="text-secondary font-black">{formatMoneyBR(vendasCalc.vendasCanaisBruto)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-sm">
            <div className="text-muted font-bold">Consumo de colaboradores</div>
            <div className="text-secondary font-black">{formatMoneyBR(vendasCalc.colaboradoresBruto)}</div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
            <div className="text-secondary font-bold">Total bruto</div>
            <div className="text-primary font-black">{formatMoneyBR(vendasCalc.totalBruto)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-muted font-bold text-sm">Taxas</div>
            <div className="text-danger font-black">{formatMoneyBR(vendasCalc.totalTaxas)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-muted font-bold text-sm">Recebimento sem taxas</div>
            <div className="text-success font-black">{formatMoneyBR(vendasCalc.recebLiquido)}</div>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => void saveVendas()}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-accent/10',
                  canEdit 
                    ? 'bg-accent hover:bg-accent text-primary border-accent/30 active:scale-95' 
                    : 'bg-surface/30 border-line/50 text-muted cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                Salvar vendas do mês
              </button>
              <div className="text-[10px] text-muted font-bold text-center italic">
                * Necessário para calcular lucro e comissões
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-primary font-black">Movimentações (repasses / despesas / EMLA)</div>
              <div className="text-xs text-muted font-bold mt-1">
                Repasses/despesas entram no relatório. <span className="text-secondary">Saldo EMLA só muda com Aporte/Abatimento.</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Tipo</div>
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
              <div className="mt-1 text-[10px] text-muted font-bold">
                * Use <span className="text-secondary">Aporte EMLA</span> quando a LA paga algo do Bistrô (vira dívida). Use{' '}
                <span className="text-secondary">Abatimento EMLA</span> quando essa dívida é abatida.
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
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-info/30 bg-info/10 text-info hover:bg-info/20 transition-all flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Repasse consumo (sugestão)
                    </button>
                  </Tooltip>
                  <div className="text-[10px] text-muted font-bold self-center">
                    Consumo do mês: <span className="text-secondary">{formatMoneyBR(consumoTotal)}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Categoria</div>
              {movDraft.tipo === 'despesa' ? (
                <CustomSelect
                  value={movDraft.categoria}
                  onValueChange={(v) => setMovDraft((p) => ({ ...p, categoria: v as any }))}
                  options={movCategoriaOptions}
                />
              ) : (
                <div className="px-4 py-3 rounded-2xl border border-line/60 bg-bg/30 text-muted font-black">
                  — (somente para Despesa)
                </div>
              )}
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Descrição</div>
              <input
                value={movDraft.descricao}
                onChange={(e) => setMovDraft((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex.: Insumos; Repasse; Reparo Micro-ondas…"
                className={inputBase}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Valor</div>
              <input
                value={movDraft.valor}
                onChange={(e) => setMovDraft((p) => ({ ...p, valor: e.target.value }))}
                placeholder="0,00"
                className={inputBase}
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Data</div>
              <DatePicker
                value={movDraft.data_mov}
                onChange={(v) => setMovDraft((p) => ({ ...p, data_mov: v || '' }))}
                placeholder="Selecione..."
                className="bg-surface/40 border-line-strong/60 text-secondary"
              />
            </div>
            <div className="col-span-2 flex justify-end mt-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => void addMov()}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 flex items-center gap-2 shadow-lg shadow-accent/10',
                  canEdit 
                    ? 'bg-accent hover:bg-accent text-primary border-accent/30 active:scale-95' 
                    : 'bg-surface/30 border-line/50 text-muted cursor-not-allowed'
                )}
              >
                <Plus className="w-4 h-4" />
                Adicionar movimentação
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-auto max-h-[260px] rounded-xl border border-line">
            <table className="w-full text-left">
              <thead className="bg-bg/40">
                <tr className="text-[10px] font-black uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Desc.</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t border-line/60">
                    <td className="px-4 py-3 text-secondary font-bold text-sm">{m.data_mov}</td>
                    <td className="px-4 py-3 text-secondary font-bold text-sm">{m.tipo}</td>
                    <td className="px-4 py-3 text-secondary font-bold text-sm">{m.descricao}</td>
                    <td className="px-4 py-3 text-right text-secondary font-mono font-bold">{formatMoneyBR(m.valor)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditMov(m)}
                          className="px-2.5 py-2 rounded-xl border border-line bg-surface/40 hover:bg-surface/70 text-secondary transition-all"
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
                          className="px-2.5 py-2 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/15 text-danger transition-all"
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
                    <td colSpan={5} className="px-4 py-6 text-center text-muted font-bold">
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
              className="px-4 py-2 rounded-xl bg-surface/50 border border-line text-secondary font-black"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveEditMov()}
              disabled={!movEditDraft || movEditSaving || !canEdit}
              className={cn(
                'px-4 py-2 rounded-xl font-black border transition-all disabled:opacity-60 flex items-center gap-2',
                !canEdit ? 'bg-surface/30 text-muted border-line/50 cursor-not-allowed' : 'bg-accent hover:bg-accent text-primary border-accent/30'
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
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Tipo</div>
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
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Categoria</div>
              {movEditDraft.tipo === 'despesa' ? (
                <CustomSelect
                  value={(movEditDraft.categoria || '') as any}
                  onValueChange={(v) => setMovEditDraft((p) => (p ? ({ ...p, categoria: v as any } as any) : p))}
                  options={movCategoriaOptions}
                />
              ) : (
                <div className="px-4 py-3 rounded-2xl border border-line/60 bg-bg/30 text-muted font-black">
                  — (somente para Despesa)
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Descrição</div>
              <input
                value={movEditDraft.descricao}
                onChange={(e) => setMovEditDraft((p) => (p ? ({ ...p, descricao: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="Ex.: Repasse; Insumos; Reparo…"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Valor</div>
              <input
                value={movEditDraft.valor}
                onChange={(e) => setMovEditDraft((p) => (p ? ({ ...p, valor: e.target.value } as any) : p))}
                className={inputBase}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Data</div>
              <DatePicker
                value={movEditDraft.data_mov}
                onChange={(v) => setMovEditDraft((p) => (p ? ({ ...p, data_mov: v || '' } as any) : p))}
                placeholder="Selecione..."
                className="bg-surface/40 border-line-strong/60 text-secondary"
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
            <div className="text-xs text-muted font-bold">
              {pastePreview.length ? `${pastePreview.filter((p) => p.colaborador_id).length}/${pastePreview.length} reconhecidos` : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface/50 border border-line text-secondary font-black"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canEdit || !pastePreview.length}
                onClick={() => void confirmPaste()}
                className={cn(
                  'px-5 py-2 rounded-xl font-black text-primary',
                  !canEdit || !pastePreview.length ? 'bg-surface-2 cursor-not-allowed' : 'bg-accent hover:bg-accent'
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
            className="w-full min-h-[160px] bg-surface/40 border border-line-strong/60 rounded-2xl p-4 text-secondary font-mono text-sm"
            placeholder={`Ex:\nLucia - 74,30\nJoão Silva - 25,00`}
          />

          {pastePreview.length ? (
            <div className="rounded-2xl border border-line/60 overflow-hidden">
              <div className="px-4 py-3 bg-bg/40 text-[10px] font-black uppercase tracking-widest text-muted">
                Preview (reconhecimento por nome)
              </div>
              <div className="max-h-[220px] overflow-auto">
                {pastePreview.map((p, idx) => (
                  <div key={idx} className="px-4 py-2 border-t border-line/60 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-secondary font-bold truncate">{p.nome}</div>
                      <div className="text-xs text-muted font-bold truncate">
                        {p.colaborador_id
                          ? `→ ${colaboradores.find((c) => c.id === p.colaborador_id)?.nome || `#${p.colaborador_id}`}`
                          : p.sugestoes?.length
                            ? 'Não reconhecido. Sugestões:'
                            : 'Não reconhecido (ajuste o nome na lista)'}
                      </div>
                      {!p.colaborador_id && p.sugestoes?.length ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {p.sugestoes.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setPastePreview((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? ({ ...row, colaborador_id: s.id, sugestoes: undefined } as any) : row
                                  )
                                );
                              }}
                              className="px-2 py-1 rounded-xl bg-surface/40 border border-line-strong/60 text-secondary text-[10px] font-black hover:bg-surface/60 transition-all"
                            >
                              {s.nome}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-secondary font-mono font-black">{formatMoneyBR(p.valor)}</div>
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
            <div className="text-xs text-muted font-bold">
              {copyOk ? <span className="text-success font-black">Copiado ({copyOk})!</span> : 'WhatsApp: copiar e colar no grupo'}
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
                className="px-4 py-2 rounded-xl bg-surface/50 border border-line text-secondary font-black flex items-center gap-2"
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
                className="px-4 py-2 rounded-xl bg-success hover:bg-success text-primary font-black flex items-center gap-2"
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
                ? 'bg-accent text-primary border-accent/30'
                : 'bg-surface/40 text-secondary border-line hover:bg-surface/60'
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
                ? 'bg-accent text-primary border-accent/30'
                : 'bg-surface/40 text-secondary border-line hover:bg-surface/60'
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
          className="w-full min-h-[380px] bg-bg/40 border border-line/60 rounded-2xl p-4 text-secondary font-mono text-sm"
        />
      </Modal>
    </div>
  );
};

