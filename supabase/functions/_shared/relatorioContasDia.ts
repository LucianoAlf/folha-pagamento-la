export interface PlanoContaRelatorio {
  codigo: string;
  nome: string;
}

export interface CentroCustoRelatorio {
  nome: string;
}

export interface ContaPagarCodigoMes {
  conta_pagar_id: string;
  competencia: string;
  codigo_barras?: string | null;
  chave_pix?: string | null;
  qr_pix_payload?: string | null;
}

export interface ContaPagar {
  id: string;
  descricao: string;
  unidade?: 'cg' | 'rec' | 'bar' | 'todas' | string | null;
  valor: number;
  data_vencimento: string;
  competencia?: string | null;
  status: 'pendente' | 'pago' | 'cancelado' | 'finalizado' | string;
  tipo_lancamento?: 'unica' | 'recorrente' | 'parcelada' | string;
  recorrente_modelo_id?: string | null;
  plano_conta?: PlanoContaRelatorio | null;
  centro_custo?: CentroCustoRelatorio | null;
  pix_chave_fixa?: string | null;
  debito_automatico?: boolean | null;
}

export type RelatorioSaldos = {
  rec?: number | null;
  bar?: number | null;
  kids_cg?: number | null;
  emla_cg?: number | null;
};

type GrupoRelatorioId = 'emla_cg' | 'kids_cg' | 'bar' | 'rec';
type UnidadeRelatorioId = 'rec' | 'bar' | 'cg';

export const GRUPOS_RELATORIO: { id: GrupoRelatorioId; saldoLabel: string }[] = [
  { id: 'rec', saldoLabel: 'Recreio' },
  { id: 'bar', saldoLabel: 'Barra' },
  { id: 'kids_cg', saldoLabel: 'Kids CG' },
  { id: 'emla_cg', saldoLabel: 'EMLA CG' },
];

const UNIDADES_RELATORIO: { id: UnidadeRelatorioId; titulo: string; resumoLabel: string; grupos: GrupoRelatorioId[] }[] = [
  { id: 'rec', titulo: 'RECREIO', resumoLabel: 'Recreio', grupos: ['rec'] },
  { id: 'bar', titulo: 'BARRA', resumoLabel: 'Barra', grupos: ['bar'] },
  { id: 'cg', titulo: 'CAMPO GRANDE', resumoLabel: 'Campo Grande', grupos: ['emla_cg', 'kids_cg'] },
];

const CONTA_PAGAR_SELECT = '*, plano_conta:plano_contas(*), centro_custo:centros_custo(*)';

type SupabaseAdminLike = {
  from: (table: string) => any;
};

function toDateOnly(value?: string | null): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function dedupeRecorrentesVisao(contas: ContaPagar[]): ContaPagar[] {
  // Esconde a linha-modelo apenas quando existe instancia na MESMA data dela. Chavear por
  // data (e nao por mes) preserva o mensal e suporta o semanal, onde o modelo (1a ocorrencia)
  // convive com varias instancias no mesmo mes em datas diferentes.
  const instanciaPorModeloData = new Set(
    contas
      .filter((c) => c.recorrente_modelo_id && c.data_vencimento)
      .map((c) => `${c.recorrente_modelo_id}|${toDateOnly(c.data_vencimento)}`)
  );
  return contas.filter((c) => {
    if (c.tipo_lancamento !== 'recorrente' || c.recorrente_modelo_id) return true;
    const venc = toDateOnly(c.data_vencimento);
    if (!venc) return true;
    return !instanciaPorModeloData.has(`${c.id}|${venc}`);
  });
}

export function formatDateDDMM(isoDate: string) {
  if (!isoDate) return '\u2014';
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

export function formatCompetenciaMY(competencia: string | null | undefined, fallbackVencimento?: string) {
  const src = competencia || (fallbackVencimento ? `${fallbackVencimento.slice(0, 7)}-01` : '');
  const [yyyy, mm] = src.split('-');
  if (!yyyy || !mm) return '';
  return `${mm}/${yyyy}`;
}

/** R$ 1.674,33 - padrão WhatsApp aprovado para o financeiro */
export function formatMoneyWhatsApp(value: number): string {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const [intPart, decPart] = n.toFixed(2).split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${intFmt},${decPart}`;
}

export function linhaSaldo(label: string, valor?: number | null): string {
  if (valor == null || Number.isNaN(Number(valor))) return `${label}: R$ `;
  return `${label}: ${formatMoneyWhatsApp(Number(valor))}`;
}

export function limparTituloPG(descricao: string): string {
  let d = descricao.trim();
  // Remove prefixo legado "1 - PG " sem cortar a unidade no final, ex.: "Light Loja 170 - (Recreio)"
  d = d.replace(/^\d+\s*-\s*PG\s*/i, '');
  d = d.replace(/^PG\s+/i, '');
  return d.trim();
}

export function ordemContaRelatorio(conta: ContaPagar): number {
  const d = (conta.descricao || '').toLowerCase();
  if (d.includes('simples nacional')) return 0;
  if (d.includes('cheirinho')) return 1;
  return 2;
}

export function compararContasRelatorio(a: ContaPagar, b: ContaPagar): number {
  const oa = ordemContaRelatorio(a);
  const ob = ordemContaRelatorio(b);
  if (oa !== ob) return oa - ob;
  return a.descricao.localeCompare(b.descricao, 'pt-BR');
}

function somarValores(contas: ContaPagar[]): number {
  return contas.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
}

function totalUnidadePorGrupos(porGrupo: Map<GrupoRelatorioId, ContaPagar[]>, unidade: UnidadeRelatorioId): number {
  const config = UNIDADES_RELATORIO.find((u) => u.id === unidade);
  if (!config) return 0;
  return config.grupos.reduce((acc, grupo) => acc + somarValores(porGrupo.get(grupo) || []), 0);
}

export function temPossivelNecessidadeRateio(
  porGrupo: Map<GrupoRelatorioId, ContaPagar[]>,
  saldos: RelatorioSaldos
): boolean {
  const totalRec = totalUnidadePorGrupos(porGrupo, 'rec');
  const totalBar = totalUnidadePorGrupos(porGrupo, 'bar');
  const totalCg = totalUnidadePorGrupos(porGrupo, 'cg');

  if (saldos.rec != null && totalRec > Number(saldos.rec)) return true;
  if (saldos.bar != null && totalBar > Number(saldos.bar)) return true;
  // Regra operacional: Campo Grande paga primeiro pela EMLA CG; se EMLA não cobre,
  // pode precisar de transferência interna Kids CG -> EMLA CG ou apoio de outra unidade.
  if (saldos.emla_cg != null && totalCg > Number(saldos.emla_cg)) return true;

  return false;
}

export function classificarGrupoRelatorio(conta: ContaPagar): GrupoRelatorioId {
  const desc = (conta.descricao || '').toLowerCase();
  const un = conta.unidade || 'cg';

  if (un === 'rec' || desc.includes('recreio')) return 'rec';
  if (un === 'bar' || desc.includes('barra')) return 'bar';
  if (desc.includes('kids')) return 'kids_cg';
  return 'emla_cg';
}

export function contaPassaFiltroUnidade(conta: ContaPagar, unidadeFiltro: string): boolean {
  if (unidadeFiltro === 'todas') return true;
  if (conta.unidade === unidadeFiltro || conta.unidade === 'todas') return true;
  const grupo = classificarGrupoRelatorio(conta);
  if (unidadeFiltro === 'cg' && (grupo === 'emla_cg' || grupo === 'kids_cg')) return true;
  return false;
}

export function linhaCodigoPagamento(
  conta: ContaPagar,
  codigo?: ContaPagarCodigoMes | null
): string | null {
  if (codigo?.codigo_barras?.trim()) return codigo.codigo_barras.trim();
  if (codigo?.qr_pix_payload?.trim()) return codigo.qr_pix_payload.trim();
  if (codigo?.chave_pix?.trim()) return codigo.chave_pix.trim();
  if (conta.pix_chave_fixa?.trim()) return conta.pix_chave_fixa.trim();
  return null;
}

const MARCADOR_DEBITO_AUTOMATICO = '\u{1F501} DÉBITO AUTOMÁTICO — não pagar manualmente';

export function blocoContaRelatorio(
  conta: ContaPagar,
  codigo?: ContaPagarCodigoMes | null
): string {
  const titulo = limparTituloPG(conta.descricao || 'Conta');
  const comp = formatCompetenciaMY(conta.competencia, conta.data_vencimento);
  const valor = formatMoneyWhatsApp(Number(conta.valor) || 0);
  const linhas = [`*PG ${titulo} ${comp} ${valor}*`];
  if (conta.debito_automatico) {
    // Se paga sozinha: o marcador substitui a linha de código (mesmo que exista um código coletado).
    linhas.push(MARCADOR_DEBITO_AUTOMATICO);
  } else {
    const cod = linhaCodigoPagamento(conta, codigo);
    if (cod) linhas.push(cod);
  }
  return linhas.join('\n');
}

/**
 * Monta mensagem no molde operacional das meninas (WhatsApp):
 * - Cabecalho *CONTAS A PAGAR HOJE DD/MM* receipt emoji
 * - Total geral + resumo por unidade
 * - Blocos Recreio -> Barra -> Campo Grande separados por _________
 * - Cada conta: *PG ... MM/AAAA R$...* + linha de codigo (barras/PIX quando houver)
 * - Rodape *SALDO EM CONTAS* (Pluggy preenche na Fatia D)
 * - Alerta curto de rateio quando houver possivel insuficiencia de saldo
 */
export function montarRelatorioMensagem(
  contas: ContaPagar[],
  dataRef: string,
  options?: {
    codigosPorConta?: Record<string, ContaPagarCodigoMes>;
    saldos?: RelatorioSaldos;
    unidadeFiltro?: string;
  }
): string {
  const { codigosPorConta = {}, saldos = {}, unidadeFiltro = 'todas' } = options || {};

  const porGrupo = new Map<GrupoRelatorioId, ContaPagar[]>();
  for (const g of GRUPOS_RELATORIO) porGrupo.set(g.id, []);

  for (const c of contas) {
    if (!contaPassaFiltroUnidade(c, unidadeFiltro)) continue;
    const grupo = classificarGrupoRelatorio(c);
    porGrupo.get(grupo)!.push(c);
  }

  for (const g of GRUPOS_RELATORIO) {
    porGrupo.get(g.id)!.sort(compararContasRelatorio);
  }

  const totalGeral = Array.from(porGrupo.values()).reduce((acc, lista) => acc + somarValores(lista), 0);
  const partes: string[] = [`*CONTAS A PAGAR HOJE ${formatDateDDMM(dataRef)}* \u{1F9FE}`, ''];
  partes.push(`\u{1F4B8} *Total Geral:* ${formatMoneyWhatsApp(totalGeral)}`);
  const totalDebitoAutomatico = Array.from(porGrupo.values()).reduce(
    (acc, lista) => acc + somarValores(lista.filter((c) => !!c.debito_automatico)),
    0
  );
  if (totalDebitoAutomatico > 0) partes.push(`\u{1F501} *Em débito automático:* ${formatMoneyWhatsApp(totalDebitoAutomatico)}`);
  partes.push('');
  partes.push('*Resumo por unidade*');
  for (const unidade of UNIDADES_RELATORIO) {
    const total = totalUnidadePorGrupos(porGrupo, unidade.id);
    if (total > 0) partes.push(`• ${unidade.resumoLabel}: ${formatMoneyWhatsApp(total)}`);
  }

  const unidadesComContas = UNIDADES_RELATORIO.filter((u) => u.grupos.some((g) => (porGrupo.get(g)?.length || 0) > 0));

  if (unidadesComContas.length === 0) {
    partes.push('');
    partes.push('_Nenhuma conta pendente para esta data._');
  } else {
    unidadesComContas.forEach((unidade) => {
      const ordenada = unidade.grupos.flatMap((grupo) => porGrupo.get(grupo) || []).sort(compararContasRelatorio);
      // Débito automático por último: o que se paga sozinho não compete com o que precisa de ação.
      const lista = [...ordenada.filter((c) => !c.debito_automatico), ...ordenada.filter((c) => !!c.debito_automatico)];
      partes.push('');
      partes.push('_______________');
      partes.push(`*${unidade.titulo}*`);
      partes.push('');
      lista.forEach((c, idxConta) => {
        partes.push(blocoContaRelatorio(c, codigosPorConta[c.id]));
        if (idxConta < lista.length - 1) partes.push('');
      });
    });
  }

  partes.push('');
  partes.push('*SALDO EM CONTAS*');
  partes.push(linhaSaldo('Recreio', saldos.rec));
  partes.push(linhaSaldo('Barra', saldos.bar));
  partes.push(linhaSaldo('Kids CG', saldos.kids_cg));
  partes.push(linhaSaldo('EMLA CG', saldos.emla_cg));

  if (temPossivelNecessidadeRateio(porGrupo, saldos)) {
    partes.push('');
    partes.push('\u26A0\uFE0F Há possível necessidade de rateio hoje.');
    partes.push('Se quiserem, peçam: “Maria, calcular rateio.”');
  }

  return partes.join('\n').trimEnd();
}

/** Filtra contas pendentes com vencimento exatamente na data de referencia */
export function filtrarContasRelatorioDia(
  contas: ContaPagar[],
  dataRef: string,
  unidadeFiltro: string
): ContaPagar[] {
  return contas.filter((c) => {
    if (c.status !== 'pendente') return false;
    if (!contaPassaFiltroUnidade(c, unidadeFiltro)) return false;
    return c.data_vencimento === dataRef;
  });
}

const LABEL_PARA_CHAVE_SALDO: Record<string, keyof RelatorioSaldos> = {
  Recreio: 'rec',
  Barra: 'bar',
  'Kids CG': 'kids_cg',
  'EMLA CG': 'emla_cg',
};

/**
 * Busca o saldo de hoje por unidade (Open Finance / Pluggy). Nunca lança: se a sincronização
 * falhou ou ainda não rodou, retorna {} e o relatório sai com o rodapé em branco (fallback já
 * existente em linhaSaldo) em vez de deixar de ser gerado.
 *
 * Mora aqui, e não no index.ts de cada Edge Function, de propósito: as duas funções que enviam a
 * lista do dia (contas-pagar-dia-gerar e whatsapp-grupo-dispatcher) importam este módulo, então o
 * saldo vale para as duas. Nasceu no branch feat/openfinance-pluggy (a3cb7ce, 14/08) e nunca foi
 * mergeado no main: o deploy de 15/08 subiu o código do branch e o primeiro deploy feito a partir
 * do main devolveu "SALDO EM CONTAS" vazio por 4 dias (30/08 a 02/09), sem teste nenhum reclamar.
 */
export async function buscarSaldosDoDia(
  supabaseAdmin: SupabaseAdminLike,
  dataRef: string
): Promise<RelatorioSaldos> {
  try {
    const { data, error } = await supabaseAdmin
      .from('financeiro_conta_saldos_diarios')
      .select('saldo, financeiro_contas_bancarias(financeiro_empresas(label_operacional))')
      .eq('data_referencia', dataRef);

    if (error) throw error;

    const saldos: RelatorioSaldos = {};
    for (const linha of (data || []) as any[]) {
      const label = linha?.financeiro_contas_bancarias?.financeiro_empresas?.label_operacional;
      const chave = label ? LABEL_PARA_CHAVE_SALDO[label] : undefined;
      if (chave && typeof linha.saldo === 'number') saldos[chave] = linha.saldo;
    }
    return saldos;
  } catch (e) {
    console.error('buscarSaldosDoDia:', (e as any)?.message || e);
    return {};
  }
}

function monthBounds(dataRef: string) {
  const [yyyyStr, mmStr] = toDateOnly(dataRef).split('-');
  const yyyy = Number(yyyyStr);
  const mm = Number(mmStr);
  if (!yyyy || !mm) throw new Error('dataRef invalida. Use YYYY-MM-DD.');
  const first = `${yyyyStr}-${mmStr}-01`;
  const lastDate = new Date(Date.UTC(yyyy, mm, 0));
  const last = `${lastDate.getUTCFullYear()}-${String(lastDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
  return { first, last };
}

export async function gerarRelatorioContasDia(
  supabaseAdmin: SupabaseAdminLike,
  input: { dataRef: string; unidadeFiltro?: string }
): Promise<{ mensagem: string; conta_ids: string[]; count: number }> {
  const dataRef = toDateOnly(input.dataRef);
  if (!dataRef) throw new Error('dataRef invalida. Use YYYY-MM-DD.');
  const unidadeFiltro = input.unidadeFiltro || 'todas';
  const { first, last } = monthBounds(dataRef);

  const { data: contasRaw, error: contasError } = await supabaseAdmin
    .from('contas_pagar')
    .select(CONTA_PAGAR_SELECT)
    .eq('status', 'pendente')
    .neq('status', 'cancelado')
    .neq('status', 'finalizado')
    .gte('data_vencimento', first)
    .lte('data_vencimento', last)
    .order('data_vencimento', { ascending: true });

  if (contasError) throw contasError;

  const contasMes = dedupeRecorrentesVisao((contasRaw || []) as ContaPagar[]);
  const filtradas = filtrarContasRelatorioDia(contasMes, dataRef, unidadeFiltro);

  const { data: codigosRaw, error: codigosError } = await supabaseAdmin
    .from('contas_pagar_codigo_mes')
    .select('*')
    .eq('competencia', first);

  if (codigosError) throw codigosError;

  const codigosPorConta: Record<string, ContaPagarCodigoMes> = {};
  for (const codigo of (codigosRaw || []) as ContaPagarCodigoMes[]) {
    if (codigo.conta_pagar_id) codigosPorConta[codigo.conta_pagar_id] = codigo;
  }

  const saldos = await buscarSaldosDoDia(supabaseAdmin, dataRef);

  return {
    mensagem: montarRelatorioMensagem(filtradas, dataRef, {
      codigosPorConta,
      saldos,
      unidadeFiltro,
    }),
    conta_ids: filtradas.map((conta) => conta.id),
    count: filtradas.length,
  };
}
