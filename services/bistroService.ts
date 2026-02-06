import { supabase } from './supabase';
import type { LancamentoDetalhamento } from '../types';

export type BistroUnidade = 'cg' | 'rec' | 'bar' | 'todas';

export type BistroCompetencia = {
  id: string;
  unidade: BistroUnidade;
  ano: number;
  mes: number;
  status: 'aberta' | 'fechada';
  saldo_inicial_emla: number;
  observacoes: string | null;
};

export type BistroConsumo = {
  id: string;
  competencia_id: string;
  colaborador_id: number;
  valor: number;
  observacoes: string | null;
};

export type BistroVendasResumo = {
  id: string;
  competencia_id: string;
  pix_bruto: number;
  debito_bruto: number;
  credito_bruto: number;
  dinheiro_bruto: number;
  pix_taxa_pct: number;
  debito_taxa_pct: number;
  credito_taxa_pct: number;
  observacoes: string | null;
};

export type BistroMovimentacaoTipo = 'repasse_bistro' | 'despesa' | 'aporte_emla' | 'abatimento_emla';
export type BistroMovimentacaoCategoria = 'insumos' | 'salario_lucia' | 'outros';

export type BistroMovimentacao = {
  id: string;
  competencia_id: string;
  tipo: BistroMovimentacaoTipo;
  categoria: BistroMovimentacaoCategoria | null;
  descricao: string;
  valor: number;
  data_mov: string; // yyyy-mm-dd
};

export type BistroParametros = {
  id: string;
  unidade: BistroUnidade;
  lucia_colaborador_id: number | null;
  lucia_salario_base: number;
  lucia_comissao_pct: number;
  bonus_tiers: Array<{ min: number; valor: number }>;
};

function safeNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ymToParts(ym: string) {
  const [y, m] = String(ym || '').split('-');
  const ano = Number(y);
  const mes = Number(m);
  if (!ano || !mes || mes < 1 || mes > 12) throw new Error(`Competência inválida: ${ym}`);
  return { ano, mes };
}

export function addMonthsToYM(ym: string, delta: number) {
  const { ano, mes } = ymToParts(ym);
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  const ny = d.getUTCFullYear();
  const nm = d.getUTCMonth() + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export async function getOrCreateBistroCompetencia(input: { ym: string; unidade?: BistroUnidade }) {
  const unidade: BistroUnidade = input.unidade || 'cg';
  const { ano, mes } = ymToParts(input.ym);

  const computeSaldoFinalFrom = async (comp: BistroCompetencia) => {
    const { data, error } = await supabase
      .from('bistro_movimentacoes')
      .select('tipo,valor')
      .eq('competencia_id', comp.id);
    if (error) throw error;
    const movs = (data || []) as Array<{ tipo: BistroMovimentacaoTipo; valor: any }>;
    const aporte = movs.filter((m) => m.tipo === 'aporte_emla').reduce((acc, m) => acc + safeNumber(m.valor), 0);
    const abat = movs.filter((m) => m.tipo === 'abatimento_emla').reduce((acc, m) => acc + safeNumber(m.valor), 0);
    return safeNumber(comp.saldo_inicial_emla) + aporte - abat;
  };

  const selectOne = async () => {
    const { data, error } = await supabase
      .from('bistro_competencias')
      .select('*')
      .eq('unidade', unidade)
      .eq('ano', ano)
      .eq('mes', mes)
      .limit(1);
    if (error) throw error;
    return (data && data.length ? (data[0] as BistroCompetencia) : null) as BistroCompetencia | null;
  };

  const existing = await selectOne();
  if (existing) return existing;

  // Ao criar uma nova competência, tenta carregar o saldo inicial EMLA do mês anterior automaticamente.
  let saldoInicial = 0;
  try {
    const prevYm = addMonthsToYM(input.ym, -1);
    const { ano: pa, mes: pm } = ymToParts(prevYm);
    const { data: prevData, error: prevErr } = await supabase
      .from('bistro_competencias')
      .select('*')
      .eq('unidade', unidade)
      .eq('ano', pa)
      .eq('mes', pm)
      .limit(1);
    if (!prevErr && prevData && prevData.length) {
      saldoInicial = await computeSaldoFinalFrom(prevData[0] as BistroCompetencia);
    }
  } catch {
    // best-effort (não bloqueia criação)
  }

  // Concorrência: duas abas/sessões podem tentar criar ao mesmo tempo.
  const { data: inserted, error: insErr } = await supabase
    .from('bistro_competencias')
    .insert({ unidade, ano, mes, status: 'aberta', saldo_inicial_emla: saldoInicial })
    .select('*')
    .single();

  if (!insErr) return inserted as BistroCompetencia;

  // Se falhou por duplicidade (unique constraint), apenas busca novamente.
  const msg = String((insErr as any)?.message || '');
  const code = String((insErr as any)?.code || '');
  const isDup = code === '23505' || msg.toLowerCase().includes('duplicate key value') || msg.includes('bistro_competencias_unidade_ano_mes_key');
  if (isDup) {
    const after = await selectOne();
    if (after) return after;
  }

  throw insErr;
}

export async function fetchBistroConsumos(competenciaId: string) {
  const { data, error } = await supabase
    .from('bistro_consumos')
    .select('*')
    .eq('competencia_id', competenciaId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as BistroConsumo[];
}

export async function updateBistroCompetencia(input: { competencia_id: string; saldo_inicial_emla?: number; observacoes?: string | null }) {
  const patch: any = { updated_at: new Date().toISOString() };
  if (typeof input.saldo_inicial_emla === 'number') patch.saldo_inicial_emla = input.saldo_inicial_emla;
  if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
  const { data, error } = await supabase.from('bistro_competencias').update(patch).eq('id', input.competencia_id).select('*').single();
  if (error) throw error;
  return data as BistroCompetencia;
}

export async function upsertBistroConsumos(
  rows: Array<{ competencia_id: string; colaborador_id: number; valor: number; observacoes?: string | null }>
) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({
    competencia_id: r.competencia_id,
    colaborador_id: r.colaborador_id,
    valor: Number(r.valor) || 0,
    observacoes: r.observacoes ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('bistro_consumos').upsert(payload, { onConflict: 'competencia_id,colaborador_id' });
  if (error) throw error;
}

export async function fetchBistroVendasResumo(competenciaId: string) {
  const { data, error } = await supabase.from('bistro_vendas_resumo').select('*').eq('competencia_id', competenciaId).single();
  if (error && error.code !== 'PGRST116') throw error; // no rows
  return (data || null) as BistroVendasResumo | null;
}

export async function upsertBistroVendasResumo(input: Partial<BistroVendasResumo> & { competencia_id: string }) {
  const payload = {
    competencia_id: input.competencia_id,
    pix_bruto: Number(input.pix_bruto) || 0,
    debito_bruto: Number(input.debito_bruto) || 0,
    credito_bruto: Number(input.credito_bruto) || 0,
    dinheiro_bruto: Number(input.dinheiro_bruto) || 0,
    pix_taxa_pct: typeof input.pix_taxa_pct === 'number' ? input.pix_taxa_pct : 0.0099,
    debito_taxa_pct: typeof input.debito_taxa_pct === 'number' ? input.debito_taxa_pct : 0.0168,
    credito_taxa_pct: typeof input.credito_taxa_pct === 'number' ? input.credito_taxa_pct : 0.0368,
    observacoes: input.observacoes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('bistro_vendas_resumo').upsert(payload, { onConflict: 'competencia_id' }).select('*').single();
  if (error) throw error;
  return data as BistroVendasResumo;
}

export async function fetchBistroMovimentacoes(competenciaId: string) {
  const { data, error } = await supabase
    .from('bistro_movimentacoes')
    .select('*')
    .eq('competencia_id', competenciaId)
    .order('data_mov', { ascending: true });
  if (error) throw error;
  return (data || []) as BistroMovimentacao[];
}

export async function createBistroMovimentacao(input: Omit<BistroMovimentacao, 'id'>) {
  const payload = {
    ...input,
    valor: Number(input.valor) || 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('bistro_movimentacoes').insert(payload).select('*').single();
  if (error) throw error;
  return data as BistroMovimentacao;
}

export async function fetchBistroParametros(unidade: BistroUnidade = 'cg') {
  const { data, error } = await supabase.from('bistro_parametros').select('*').eq('unidade', unidade).single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data || null) as BistroParametros | null;
}

export async function upsertBistroParametros(input: Partial<BistroParametros> & { unidade?: BistroUnidade }) {
  const unidade: BistroUnidade = input.unidade || 'cg';
  const payload = {
    unidade,
    lucia_colaborador_id: typeof input.lucia_colaborador_id === 'number' ? input.lucia_colaborador_id : null,
    lucia_salario_base: Number(input.lucia_salario_base ?? 1800),
    lucia_comissao_pct: Number(input.lucia_comissao_pct ?? 0.15),
    bonus_tiers: input.bonus_tiers ?? [
      { min: 13000, valor: 250 },
      { min: 15000, valor: 500 },
      { min: 20000, valor: 800 },
    ],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('bistro_parametros').upsert(payload, { onConflict: 'unidade' }).select('*').single();
  if (error) throw error;
  return data as BistroParametros;
}

export function getBistroMetaFromDetalhamento(det: LancamentoDetalhamento | null | undefined) {
  const raw = (det && (det as any).__bistro) as any;
  const valor = safeNumber(raw?.valor);
  const ref_ym = typeof raw?.ref_ym === 'string' ? raw.ref_ym : null;
  return { valor, ref_ym };
}

export async function applyBistroDiscountsToFolha(input: { folhaId: number; refYm: string; unidade?: BistroUnidade }) {
  const unidade: BistroUnidade = input.unidade || 'cg';
  const competencia = await getOrCreateBistroCompetencia({ ym: input.refYm, unidade });
  const consumos = await fetchBistroConsumos(competencia.id);
  const consumoByColab = new Map<number, number>(consumos.map((c) => [c.colaborador_id, Number(c.valor) || 0]));

  const { data: lancs, error } = await supabase
    .from('lancamentos_folha')
    .select('id, colaborador_id, descontos, detalhamento')
    .eq('folha_id', input.folhaId);
  if (error) throw error;

  const updates: Array<{ id: number; descontos: number; detalhamento: any }> = [];
  for (const row of (lancs || []) as any[]) {
    const id = Number(row.id);
    const colaboradorId = Number(row.colaborador_id);
    const descontosAtual = safeNumber(row.descontos);
    const det = (row.detalhamento || {}) as LancamentoDetalhamento;

    const oldMeta = getBistroMetaFromDetalhamento(det);
    const oldBistro = oldMeta.valor;
    const newBistro = safeNumber(consumoByColab.get(colaboradorId) || 0);

    if (Math.abs(newBistro - oldBistro) < 0.00001 && oldMeta.ref_ym === input.refYm) continue;

    const nextDescontos = Math.max(0, descontosAtual - oldBistro + newBistro);
    const nextDet = {
      ...(det || {}),
      __bistro: {
        ref_ym: input.refYm,
        valor: newBistro,
        updated_at: new Date().toISOString(),
      },
    };

    updates.push({ id, descontos: nextDescontos, detalhamento: nextDet });
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('lancamentos_folha')
      .update({ descontos: u.descontos, detalhamento: u.detalhamento, updated_at: new Date().toISOString() } as any)
      .eq('id', u.id);
    if (upErr) throw upErr;
  }

  return { updated: updates.length, competencia_id: competencia.id };
}

export function formatMoneyBR(value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
}

export function normalizeName(name: string) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseConsumosText(input: string) {
  const lines = String(input || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rows: Array<{ nome: string; valor: number }> = [];
  for (const line of lines) {
    const m = line.match(
      /(.+?)\s*(?:-|:)?\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2})?)\s*$/i
    );
    if (!m) continue;
    const nome = m[1].trim();
    const raw = m[2].trim();
    const v = raw.includes(',') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw);
    rows.push({ nome, valor: Number.isFinite(v) ? v : 0 });
  }
  return rows;
}

export function pickBonusFromTiers(totalVendasBrutas: number, tiers: Array<{ min: number; valor: number }>) {
  const sorted = (tiers || []).slice().sort((a, b) => a.min - b.min);
  let best = 0;
  for (const t of sorted) if (totalVendasBrutas >= t.min) best = t.valor;
  return best;
}

export function computeVendasResumo(v: BistroVendasResumo | null, colaboradoresBruto: number = 0) {
  const pix = safeNumber(v?.pix_bruto);
  const deb = safeNumber(v?.debito_bruto);
  const cred = safeNumber(v?.credito_bruto);
  const din = safeNumber(v?.dinheiro_bruto);
  // Regra de negócio: "Colaboradores" entra no total de vendas do mês,
  // porém NÃO gera taxa de maquininha (desconto acontece via folha).
  const colab = safeNumber(colaboradoresBruto);
  const totalBruto = pix + deb + cred + din + colab;
  const taxaPix = pix * safeNumber(v?.pix_taxa_pct ?? 0.0099);
  const taxaDeb = deb * safeNumber(v?.debito_taxa_pct ?? 0.0168);
  const taxaCred = cred * safeNumber(v?.credito_taxa_pct ?? 0.0368);
  const totalTaxas = taxaPix + taxaDeb + taxaCred;
  const recebLiquido = totalBruto - totalTaxas;
  return { totalBruto, totalTaxas, recebLiquido, taxaPix, taxaDeb, taxaCred };
}

export function computeLuciaPagamento(input: {
  params: BistroParametros;
  vendas: BistroVendasResumo | null;
  movs: BistroMovimentacao[];
  consumoLucia: number;
  vt: number;
  colaboradoresBruto: number;
}) {
  const { totalBruto, totalTaxas, recebLiquido } = computeVendasResumo(input.vendas, input.colaboradoresBruto);

  const despesasInsumosOutros = (input.movs || [])
    .filter((m) => m.tipo === 'despesa' && m.categoria !== 'salario_lucia')
    .reduce((acc, m) => acc + safeNumber(m.valor), 0);

  const lucroLiquido = recebLiquido - despesasInsumosOutros;
  const comissao = lucroLiquido > 0 ? lucroLiquido * safeNumber(input.params.lucia_comissao_pct) : 0;
  const bonus = pickBonusFromTiers(totalBruto, input.params.bonus_tiers || []);
  const salario = safeNumber(input.params.lucia_salario_base);
  const vt = safeNumber(input.vt);
  const consumo = safeNumber(input.consumoLucia);

  const totalBrutoLucia = salario + vt + comissao + bonus;
  const totalLiquidoLucia = totalBrutoLucia - consumo;

  return {
    totalVendasBrutas: totalBruto,
    totalTaxas,
    recebLiquido,
    despesasInsumosOutros,
    lucroLiquido,
    comissao,
    bonus,
    salario,
    vt,
    consumo,
    totalBrutoLucia,
    totalLiquidoLucia,
  };
}

