import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import {
  CentroCusto,
  CodigoMesBadge,
  ContaCredencial,
  ContaPagar,
  ContaPagarCodigoMes,
  ContaPagarRelatorioDia,
  FinanceiroContaBancaria,
  FinanceiroEmpresa,
  PlanoConta,
  PlanoContaMaisUsado,
  StatusVisual,
} from '../types/contasPagar';
import { competenciaFromVencimento, toDateOnly } from '../utils/dateOnly';
import { resolveCodigoMesBadge } from './contasPagarCodigoMes';
import { buildParcelasContaPagar } from './contasPagarParcelas';

const CONTA_PAGAR_SELECT =
  '*, plano_conta:plano_contas(*), centro_custo:centros_custo(*), empresa:financeiro_empresas(*), conta_pagadora:financeiro_contas_bancarias(*, empresa:financeiro_empresas(*))';

function normalizeContaDates(conta: Partial<ContaPagar>): Partial<ContaPagar> {
  const next = { ...conta };
  if (next.data_vencimento) {
    next.data_vencimento = toDateOnly(next.data_vencimento);
    const comp = competenciaFromVencimento(next.data_vencimento);
    if (comp) next.competencia = comp;
  } else if (next.competencia) {
    next.competencia = competenciaFromVencimento(next.competencia) || toDateOnly(next.competencia);
  }
  return next;
}

export async function fetchPlanoContas(): Promise<PlanoConta[]> {
  const { data, error } = await supabase
    .from('plano_contas')
    .select('id,codigo,nome,nome_completo,parent_id,nivel,grupo_plano,natureza,tipo_custo,ativo,ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('codigo', { ascending: true });

  if (error) throw error;
  return (data || []) as PlanoConta[];
}

export async function fetchPlanoGrupos(): Promise<{ id: string; codigo: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('plano_contas')
    .select('id,codigo,nome')
    .eq('nivel', 2)
    .eq('natureza', 'saida')
    .eq('ativo', true)
    .order('codigo', { ascending: true });

  if (error) throw error;
  return (data || []) as any;
}

export async function fetchCentrosCusto(): Promise<CentroCusto[]> {
  const { data, error } = await supabase
    .from('centros_custo')
    .select('id,codigo,nome,tipo,ativo,ordem')
    .eq('ativo', true)
    .eq('tipo', 'unidade')
    .order('ordem', { ascending: true });

  if (error) throw error;
  return (data || []) as CentroCusto[];
}

export async function fetchFinanceiroEmpresas(): Promise<FinanceiroEmpresa[]> {
  const { data, error } = await supabase
    .from('financeiro_empresas')
    .select('id,razao_social,nome_fantasia,cnpj,label_operacional,unidade_id,ativo,observacoes,unidade:centros_custo(id,codigo,nome,tipo,ativo,ordem)')
    .eq('ativo', true)
    .order('label_operacional', { ascending: true });

  if (error) throw error;
  return (data || []) as any;
}

export async function fetchFinanceiroContasBancarias(): Promise<FinanceiroContaBancaria[]> {
  const { data, error } = await supabase
    .from('financeiro_contas_bancarias')
    .select('id,empresa_id,banco,banco_codigo,agencia,conta,apelido,tipo,ativo,observacoes,empresa:financeiro_empresas(id,razao_social,nome_fantasia,cnpj,label_operacional,unidade_id,ativo,observacoes,unidade:centros_custo(id,codigo,nome,tipo,ativo,ordem))')
    .eq('ativo', true)
    .order('conta', { ascending: true });

  if (error) throw error;
  return (data || []) as any;
}

export async function fetchPlanoContasMaisUsados(limit = 8): Promise<PlanoContaMaisUsado[]> {
  const { data, error } = await supabase
    .from('contas_pagar')
    .select('plano_conta_id')
    .not('plano_conta_id', 'is', null)
    .limit(1000);

  if (error) throw error;

  const counts = new Map<string, number>();
  (data || []).forEach((row: { plano_conta_id: string | null }) => {
    if (!row.plano_conta_id) return;
    counts.set(row.plano_conta_id, (counts.get(row.plano_conta_id) || 0) + 1);
  });

  return Array.from(counts, ([plano_conta_id, total]) => ({ plano_conta_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function dedupeRecorrentesVisao(contas: ContaPagar[]): ContaPagar[] {
  const instanciaPorModeloMes = new Set(
    contas
      .filter((c) => c.recorrente_modelo_id && c.competencia)
      .map((c) => `${c.recorrente_modelo_id}|${toDateOnly(c.competencia).slice(0, 7)}`)
  );
  return contas.filter((c) => {
    if (c.tipo_lancamento !== 'recorrente' || c.recorrente_modelo_id) return true;
    const comp = toDateOnly(c.competencia).slice(0, 7);
    if (!comp) return true;
    return !instanciaPorModeloMes.has(`${c.id}|${comp}`);
  });
}

function competenciaPrimeiroDia(ymOrDate: string): string {
  const ym = String(ymOrDate || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}-01`;
  const d = toDateOnly(ymOrDate);
  if (!d) return '';
  return `${d.slice(0, 7)}-01`;
}

function ymFromCompetencia(comp?: string | null): string {
  return competenciaPrimeiroDia(comp || '').slice(0, 7);
}

/** Gera instância recorrente para um mês (YYYY-MM), se aplicável. */
async function ensureRecorrentesInstancias(competenciaYM: string): Promise<void> {
  const alvo = competenciaPrimeiroDia(competenciaYM);
  if (!alvo) return;

  const [yyyy, mm] = alvo.split('-');
  const alvoYM = `${yyyy}-${mm}`;

  const { data: recorrentes, error: errRec } = await supabase
    .from('contas_pagar')
    .select('*')
    .eq('tipo_lancamento', 'recorrente')
    .neq('status', 'cancelado')
    .neq('status', 'finalizado')
    .is('recorrente_modelo_id', null);

  if (errRec) throw errRec;
  if (!recorrentes?.length) return;

  const { data: existentes, error: errEx } = await supabase
    .from('contas_pagar')
    .select('recorrente_modelo_id')
    .eq('competencia', alvo)
    .not('recorrente_modelo_id', 'is', null);

  if (errEx) throw errEx;

  const geradosSet = new Set((existentes || []).map((e) => e.recorrente_modelo_id));

  const faltantes = recorrentes.filter((modelo) => {
    const inicioYM = ymFromCompetencia(modelo.competencia);
    if (!inicioYM) return false;
    // Só gera a partir do mês de início do modelo (ex.: julho → não aparece em junho).
    if (alvoYM < inicioYM) return false;
    // O registro modelo já representa o primeiro mês — não duplicar instância.
    if (alvoYM === inicioYM) return false;
    if (geradosSet.has(modelo.id)) return false;
    if (modelo.status === 'pago' && competenciaPrimeiroDia(modelo.competencia) === alvo) return false;
    return true;
  });

  if (faltantes.length === 0) return;

  const novos = faltantes.map((modelo) => {
    const dataVencOriginal = new Date(`${modelo.data_vencimento}T00:00:00`);
    const dia = String(dataVencOriginal.getDate()).padStart(2, '0');
    const novoVencimento = `${yyyy}-${mm}-${dia}`;
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = modelo;
    return {
      ...rest,
      recorrente_modelo_id: modelo.id,
      competencia: alvo,
      data_vencimento: novoVencimento,
      status: 'pendente',
      data_pagamento: null,
      metodo_pagamento: null,
    };
  });

  const { error: errIns } = await supabase.from('contas_pagar').upsert(novos, {
    onConflict: 'recorrente_modelo_id,competencia',
    ignoreDuplicates: true,
  });
  if (errIns) throw errIns;
}

// Contas
export async function fetchContasPagar(filtros?: {
  status?: 'todas' | 'pendente' | 'pago';
  unidade?: 'todas' | 'cg' | 'rec' | 'bar';
  /** YYYY-MM — mês selecionado na tela; garante instância recorrente além do mês corrente. */
  competenciaGarantir?: string;
}): Promise<ContaPagar[]> {
  try {
    const hoje = new Date();
    const atualYM = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const meses = new Set<string>([atualYM]);
    const garantir = filtros?.competenciaGarantir?.slice(0, 7);
    if (garantir) meses.add(garantir);

    for (const ym of meses) {
      await ensureRecorrentesInstancias(ym);
    }
  } catch (err) {
    console.error('Erro ao processar recorrentes automáticos:', err);
  }

  let query = supabase
    .from('contas_pagar')
    .select(CONTA_PAGAR_SELECT)
    .neq('status', 'cancelado')
    .neq('status', 'finalizado')
    .order('data_vencimento', { ascending: true });

  if (filtros?.status && filtros.status !== 'todas') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.unidade && filtros.unidade !== 'todas') {
    query = query.eq('unidade', filtros.unidade);
  }

  const { data, error } = await query;
  if (error) throw error;
  return dedupeRecorrentesVisao((data || []) as ContaPagar[]);
}

export async function fetchContaPagarById(contaId: string): Promise<ContaPagar | null> {
  if (!contaId) return null;
  const { data, error } = await supabase
    .from('contas_pagar')
    .select(CONTA_PAGAR_SELECT)
    .eq('id', contaId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as any;
}

export async function fetchContasPendentesForAgenda(input?: {
  startYmd?: string; // yyyy-mm-dd
  endYmd?: string; // yyyy-mm-dd
  limit?: number;
}): Promise<ContaPagar[]> {
  const limit = Math.min(400, Math.max(50, Number(input?.limit || 200)));

  const today = new Date().toISOString().slice(0, 10);
  const start = input?.startYmd || today;
  const end = input?.endYmd || today;

  const { data, error } = await supabase
    .from('contas_pagar')
    .select(CONTA_PAGAR_SELECT)
    .eq('status', 'pendente')
    .neq('status', 'cancelado')
    .neq('status', 'finalizado')
    .gte('data_vencimento', start)
    .lte('data_vencimento', end)
    .order('data_vencimento', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

export async function createContaPagar(
  conta: Partial<ContaPagar>,
  options?: { valorPorParcela?: boolean }
): Promise<ContaPagar> {
  conta = normalizeContaDates(conta);
  const { data: user } = await supabase.auth.getUser();

  // Parcelada: cria N registros
  if (conta.tipo_lancamento === 'parcelada' && conta.total_parcelas && conta.total_parcelas > 1) {
    const parcelaInicial = conta.parcela_atual || 1;
    const qtdParcelas = conta.total_parcelas - parcelaInicial + 1;
    const valorPorParcela = options?.valorPorParcela ?? true;
    // Valor de cada parcela arredondado em centavos. No modo "valor total", divide o
    // total entre as parcelas e distribui o resíduo de centavos nas primeiras, para que
    // a soma das parcelas seja EXATAMENTE igual ao total informado (evita 33,3333...).
    const valoresParcela: number[] = (() => {
      if (valorPorParcela) {
        return Array.from({ length: qtdParcelas }, () => Math.round((conta.valor || 0) * 100) / 100);
      }
      const totalCents = Math.round((conta.valor || 0) * 100);
      const baseCents = Math.floor(totalCents / qtdParcelas);
      const resto = totalCents - baseCents * qtdParcelas;
      return Array.from({ length: qtdParcelas }, (_, i) => (baseCents + (i < resto ? 1 : 0)) / 100);
    })();
    const parcelas = buildParcelasContaPagar(conta, valoresParcela, user.user?.id);

    const { data, error } = await supabase
      .from('contas_pagar')
      .insert(parcelas)
      .select(CONTA_PAGAR_SELECT);

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Nenhuma parcela foi criada');
    return data[0] as ContaPagar;
  }

  const contaInsert: Partial<ContaPagar> = { ...conta, created_by: user.user?.id };
  if (contaInsert.tipo_lancamento === 'parcelada') {
    contaInsert.parcelamento_id = contaInsert.parcelamento_id || crypto.randomUUID();
  }

  const { data, error } = await supabase
    .from('contas_pagar')
    .insert([contaInsert])
    .select(CONTA_PAGAR_SELECT)
    .single();

  if (error) throw error;
  return data as ContaPagar;
}

export async function registrarPagamento(
  contaId: string,
  pagamento: { data_pagamento: string; metodo_pagamento: string; observacoes?: string }
): Promise<ContaPagar> {
  const { data, error } = await supabase
    .from('contas_pagar')
    .update({
      status: 'pago',
      data_pagamento: pagamento.data_pagamento,
      metodo_pagamento: pagamento.metodo_pagamento,
      observacoes: pagamento.observacoes || null,
    })
    .eq('id', contaId)
    .select(CONTA_PAGAR_SELECT)
    .single();

  if (error) throw error;
  return data as ContaPagar;
}

export async function updateContaPagar(contaId: string, patch: Partial<ContaPagar>): Promise<ContaPagar> {
  const nextPatch: Partial<ContaPagar> = normalizeContaDates(patch);

  const { data, error } = await supabase
    .from('contas_pagar')
    .update(nextPatch)
    .eq('id', contaId)
    .select(CONTA_PAGAR_SELECT)
    .single();

  if (error) throw error;
  return data as ContaPagar;
}

export async function updateFuturasRecorrentes(contaOriginal: ContaPagar, patch: Partial<ContaPagar>): Promise<void> {
  const fieldsToUpdate: any = {};
  if (patch.descricao) fieldsToUpdate.descricao = patch.descricao;
  if (patch.valor) fieldsToUpdate.valor = patch.valor;
  if (patch.plano_conta_id) fieldsToUpdate.plano_conta_id = patch.plano_conta_id;
  if (patch.centro_custo_id) fieldsToUpdate.centro_custo_id = patch.centro_custo_id;
  if (patch.unidade) fieldsToUpdate.unidade = patch.unidade;
  if (patch.tipo_lancamento) fieldsToUpdate.tipo_lancamento = patch.tipo_lancamento;

  if (Object.keys(fieldsToUpdate).length === 0) return;

  // Determinar modelo_id: se é o modelo usa próprio id, se é instância usa recorrente_modelo_id
  const modeloId = contaOriginal.recorrente_modelo_id || contaOriginal.id;

  // Atualizar o modelo original
  const { error: errModelo } = await supabase
    .from('contas_pagar')
    .update(fieldsToUpdate)
    .eq('id', modeloId);
  if (errModelo) throw errModelo;

  // Atualizar todas as instâncias futuras pendentes
  const { error } = await supabase
    .from('contas_pagar')
    .update(fieldsToUpdate)
    .eq('recorrente_modelo_id', modeloId)
    .eq('status', 'pendente')
    .gt('competencia', contaOriginal.competencia);

  if (error) throw error;
}

export async function updateFuturasParceladas(contaOriginal: ContaPagar, patch: Partial<ContaPagar>): Promise<void> {
  const fieldsToUpdate: any = {};
  if (patch.valor !== undefined) fieldsToUpdate.valor = patch.valor;
  if (patch.plano_conta_id !== undefined) fieldsToUpdate.plano_conta_id = patch.plano_conta_id;
  if (patch.observacoes !== undefined) fieldsToUpdate.observacoes = patch.observacoes;

  if (Object.keys(fieldsToUpdate).length === 0) return;
  if (!contaOriginal.parcelamento_id) {
    return;
  }

  const { error } = await supabase
    .from('contas_pagar')
    .update(fieldsToUpdate)
    .eq('parcelamento_id', contaOriginal.parcelamento_id)
    .eq('tipo_lancamento', 'parcelada')
    .eq('status', 'pendente')
    .gte('data_vencimento', contaOriginal.data_vencimento);

  if (error) throw error;
}

export async function deleteConta(contaId: string): Promise<void> {
  const { error } = await supabase.from('contas_pagar').delete().eq('id', contaId);
  if (error) throw error;
}

export async function deleteContasBatch(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from('contas_pagar')
    .delete()
    .in('id', ids)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

export async function finalizarConta(contaId: string): Promise<void> {
  const { error } = await supabase
    .from('contas_pagar')
    .update({ status: 'finalizado' })
    .eq('id', contaId);
  if (error) throw error;
}

export async function fetchParcelasIrmas(conta: ContaPagar): Promise<ContaPagar[]> {
  if (conta.tipo_lancamento !== 'parcelada' || !conta.total_parcelas || !conta.parcelamento_id) return [];
  const { data, error } = await supabase
    .from('contas_pagar')
    .select(CONTA_PAGAR_SELECT)
    .eq('parcelamento_id', conta.parcelamento_id)
    .eq('tipo_lancamento', 'parcelada')
    .order('parcela_atual', { ascending: true });
  if (error) throw error;
  return (data || []) as ContaPagar[];
}

export async function deleteParcelamento(conta: ContaPagar): Promise<number> {
  if (conta.tipo_lancamento !== 'parcelada' || !conta.total_parcelas || !conta.parcelamento_id) {
    await deleteConta(conta.id);
    return 1;
  }

  const { data, error } = await supabase
    .from('contas_pagar')
    .delete()
    .eq('parcelamento_id', conta.parcelamento_id)
    .eq('tipo_lancamento', 'parcelada')
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

export async function finalizarParcelamento(conta: ContaPagar): Promise<void> {
  if (conta.tipo_lancamento !== 'parcelada' || !conta.total_parcelas || !conta.parcelamento_id) {
    return finalizarConta(conta.id);
  }

  const { error } = await supabase
    .from('contas_pagar')
    .update({ status: 'finalizado' })
    .eq('parcelamento_id', conta.parcelamento_id)
    .eq('tipo_lancamento', 'parcelada')
    .eq('status', 'pendente')
    .gte('data_vencimento', conta.data_vencimento);

  if (error) throw error;
}

// =============================================
// NOTIFICAÇÕES (Overrides por conta)
// =============================================

export interface ContaPagarNotificacoesOverride {
  id: string;
  user_id: string;
  conta_pagar_id: string;
  alerta_3d: boolean | null;
  alerta_1d: boolean | null;
  alerta_no_dia: boolean | null;
  created_at: string;
  updated_at: string;
}

export async function fetchContaPagarNotificacoesOverride(contaId: string): Promise<ContaPagarNotificacoesOverride | null> {
  const { data, error } = await supabase
    .from('contas_pagar_notificacoes')
    .select('*')
    .eq('conta_pagar_id', contaId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as any;
}

export async function upsertContaPagarNotificacoesOverride(
  contaId: string,
  patch: { alerta_3d?: boolean | null; alerta_1d?: boolean | null; alerta_no_dia?: boolean | null }
): Promise<ContaPagarNotificacoesOverride> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await supabase
    .from('contas_pagar_notificacoes')
    .upsert([
      {
        user_id: user.user.id,
        conta_pagar_id: contaId,
        ...patch,
      },
    ])
    .select('*')
    .single();
  if (error) throw error;
  return data as any;
}

export async function deleteContaPagarNotificacoesOverride(contaId: string): Promise<void> {
  const { error } = await supabase.from('contas_pagar_notificacoes').delete().eq('conta_pagar_id', contaId);
  if (error) throw error;
}

// Helpers
export function getStatusVisual(conta: ContaPagar): StatusVisual {
  if (conta.status === 'pago') return 'pago';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${conta.data_vencimento}T00:00:00`);
  venc.setHours(0, 0, 0, 0);

  const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return 'vencida';
  if (diffDias === 0) return 'hoje';
  if (diffDias <= 7) return 'urgente';
  return 'pendente';
}

export function calcularResumo(contas: ContaPagar[]) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString().split('T')[0];
  const em7 = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
  const em30 = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  const pendentes = contas.filter((c) => c.status === 'pendente');

  const isBetween = (d: Date, start: Date, end: Date) => d >= start && d <= end;

  const vencendoHoje = pendentes.filter((c) => c.data_vencimento === hojeISO);
  const vencidas = pendentes.filter((c) => {
    const d = new Date(`${c.data_vencimento}T00:00:00`);
    return d < hoje;
  });
  const proximos7 = pendentes.filter((c) => {
    const d = new Date(`${c.data_vencimento}T00:00:00`);
    // Próximos 7 dias excluindo hoje para não duplicar
    return d > hoje && d <= em7;
  });
  const proximos30 = pendentes.filter((c) => {
    const d = new Date(`${c.data_vencimento}T00:00:00`);
    // Próximos 30 dias excluindo hoje e próximos 7 para clareza? 
    // Ou acumulado? Geralmente resumo mostra acumulado. 
    // Vamos manter acumulado mas sem hoje.
    return d > hoje && d <= em30;
  });

  return {
    vencendoHoje: {
      count: vencendoHoje.length,
      total: vencendoHoje.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    },
    vencidas: {
      count: vencidas.length,
      total: vencidas.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    },
    proximos7: {
      count: proximos7.length,
      total: proximos7.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    },
    proximos30: {
      count: proximos30.length,
      total: proximos30.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    },
  };
}

export function calcularResumoAuditoria(contas: ContaPagar[]) {
  const pagas = contas.filter(c => c.status === 'pago');
  const pendentes = contas.filter(c => c.status === 'pendente');
  
  return {
    totalPago: {
      total: pagas.reduce((s, c) => s + (Number(c.valor) || 0), 0),
      count: pagas.length
    },
    totalPendente: {
      total: pendentes.reduce((s, c) => s + (Number(c.valor) || 0), 0),
      count: pendentes.length
    },
    totalGeral: {
      total: contas.reduce((s, c) => s + (Number(c.valor) || 0), 0),
      count: contas.length
    },
    ticketMedio: contas.length > 0 
      ? contas.reduce((s, c) => s + (Number(c.valor) || 0), 0) / contas.length 
      : 0
  };
}

// =============================================
// CREDENCIAIS (Fatia C)
// =============================================

export async function fetchCredenciais(): Promise<ContaCredencial[]> {
  const { data, error } = await supabase
    .from('contas_credenciais')
    .select('*')
    .order('nome');
  if (error) throw error;
  return (data || []) as ContaCredencial[];
}

export async function upsertCredencial(
  credencial: Partial<ContaCredencial> & { nome: string; portal: string }
): Promise<ContaCredencial> {
  const { data, error } = await supabase
    .from('contas_credenciais')
    .upsert([credencial])
    .select('*')
    .single();
  if (error) throw error;
  return data as ContaCredencial;
}

export async function setCredencialSenha(credencialId: string, senha: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/contas-credencial-vault`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ credencial_id: credencialId, senha }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erro ${response.status} ao gravar senha`);
  }

  const body = await response.json().catch(() => ({}));
  if (body?.ok !== true) {
    throw new Error(body?.error || 'Não foi possível gravar a senha');
  }
}

// =============================================
// CÓDIGO DO MÊS
// =============================================

export async function fetchCodigosMes(competencia: string): Promise<ContaPagarCodigoMes[]> {
  const { data, error } = await supabase
    .from('contas_pagar_codigo_mes')
    .select('*')
    .eq('competencia', competencia);
  if (error) throw error;
  return (data || []) as ContaPagarCodigoMes[];
}

export async function upsertCodigoMes(
  input: Partial<ContaPagarCodigoMes> & { conta_pagar_id: string; competencia: string }
): Promise<ContaPagarCodigoMes> {
  const humanInput: Partial<ContaPagarCodigoMes> & { conta_pagar_id: string; competencia: string } = {
    registrado_por_agente: false,
    agente_nome: null,
    agente_actor: null,
    confirmado_por_nome: null,
    confirmado_por_actor: null,
    canal_origem: null,
    mensagem_origem_id: null,
    registrado_via: null,
    registrado_em: null,
    observacao_operacional: null,
    ...input,
  };

  const { data, error } = await supabase
    .from('contas_pagar_codigo_mes')
    .upsert([humanInput], { onConflict: 'conta_pagar_id,competencia' })
    .select('*')
    .single();
  if (error) throw error;
  return data as ContaPagarCodigoMes;
}

export function getCodigoMesBadge(conta: ContaPagar, codigo?: ContaPagarCodigoMes | null): CodigoMesBadge {
  return resolveCodigoMesBadge(conta, codigo, getStatusVisual(conta));
}

// =============================================
// RELATÓRIO DO DIA (molde WhatsApp das meninas)
// =============================================

export type RelatorioSaldos = {
  rec?: number | null;
  bar?: number | null;
  kids_cg?: number | null;
  emla_cg?: number | null;
};

type GrupoRelatorioId = 'emla_cg' | 'kids_cg' | 'bar' | 'rec';
type UnidadeRelatorioId = 'rec' | 'bar' | 'cg';

const GRUPOS_RELATORIO: { id: GrupoRelatorioId; saldoLabel: string }[] = [
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

function formatDateDDMM(isoDate: string) {
  if (!isoDate) return '—';
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatCompetenciaMY(competencia: string | null | undefined, fallbackVencimento?: string) {
  const src = competencia || (fallbackVencimento ? `${fallbackVencimento.slice(0, 7)}-01` : '');
  const [yyyy, mm] = src.split('-');
  if (!yyyy || !mm) return '';
  return `${mm}/${yyyy}`;
}

/** R$ 1.674,33 — padrão WhatsApp aprovado para o financeiro */
function formatMoneyWhatsApp(value: number): string {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const [intPart, decPart] = n.toFixed(2).split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${intFmt},${decPart}`;
}

function linhaSaldo(label: string, valor?: number | null): string {
  if (valor == null || Number.isNaN(Number(valor))) return `${label}: R$ `;
  return `${label}: ${formatMoneyWhatsApp(Number(valor))}`;
}

function limparTituloPG(descricao: string): string {
  let d = descricao.trim();
  // Remove prefixo legado "1 - PG " sem cortar a unidade no final, ex.: "Light Loja 170 - (Recreio)"
  d = d.replace(/^\d+\s*-\s*PG\s*/i, '');
  d = d.replace(/^PG\s+/i, '');
  return d.trim();
}

function ordemContaRelatorio(conta: ContaPagar): number {
  const d = (conta.descricao || '').toLowerCase();
  if (d.includes('simples nacional')) return 0;
  if (d.includes('cheirinho')) return 1;
  return 2;
}

function compararContasRelatorio(a: ContaPagar, b: ContaPagar): number {
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

function temPossivelNecessidadeRateio(
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

function classificarGrupoRelatorio(conta: ContaPagar): GrupoRelatorioId {
  const desc = (conta.descricao || '').toLowerCase();
  const un = conta.unidade || 'cg';

  if (un === 'rec' || desc.includes('recreio')) return 'rec';
  if (un === 'bar' || desc.includes('barra')) return 'bar';
  if (desc.includes('kids')) return 'kids_cg';
  return 'emla_cg';
}

function contaPassaFiltroUnidade(conta: ContaPagar, unidadeFiltro: string): boolean {
  if (unidadeFiltro === 'todas') return true;
  if (conta.unidade === unidadeFiltro || conta.unidade === 'todas') return true;
  const grupo = classificarGrupoRelatorio(conta);
  if (unidadeFiltro === 'cg' && (grupo === 'emla_cg' || grupo === 'kids_cg')) return true;
  return false;
}

function linhaCodigoPagamento(
  conta: ContaPagar,
  codigo?: ContaPagarCodigoMes | null
): string | null {
  if (codigo?.codigo_barras?.trim()) return codigo.codigo_barras.trim();
  if (codigo?.qr_pix_payload?.trim()) return codigo.qr_pix_payload.trim();
  if (codigo?.chave_pix?.trim()) return codigo.chave_pix.trim();
  if (conta.pix_chave_fixa?.trim()) return conta.pix_chave_fixa.trim();
  return null;
}

function blocoContaRelatorio(
  conta: ContaPagar,
  codigo?: ContaPagarCodigoMes | null
): string {
  const titulo = limparTituloPG(conta.descricao || 'Conta');
  const comp = formatCompetenciaMY(conta.competencia, conta.data_vencimento);
  const valor = formatMoneyWhatsApp(Number(conta.valor) || 0);
  const linhas = [`*PG ${titulo} ${comp} ${valor}*`];
  const cod = linhaCodigoPagamento(conta, codigo);
  if (cod) linhas.push(cod);
  return linhas.join('\n');
}

/**
 * Monta mensagem no molde operacional das meninas (WhatsApp):
 * - Cabeçalho *CONTAS A PAGAR HOJE DD/MM* 🧾
 * - Total geral + resumo por unidade
 * - Blocos Recreio → Barra → Campo Grande separados por _________
 * - Cada conta: *PG … MM/AAAA R$…* + linha de código (barras/PIX quando houver)
 * - Rodapé *SALDO EM CONTAS* (Pluggy preenche na Fatia D)
 * - Alerta curto de rateio quando houver possível insuficiência de saldo
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
  const partes: string[] = [`*CONTAS A PAGAR HOJE ${formatDateDDMM(dataRef)}* 🧾`, ''];
  partes.push(`💸 *Total Geral:* ${formatMoneyWhatsApp(totalGeral)}`);
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
      const lista = unidade.grupos.flatMap((grupo) => porGrupo.get(grupo) || []).sort(compararContasRelatorio);
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
    partes.push('⚠️ Há possível necessidade de rateio hoje.');
    partes.push('Se quiserem, peçam: “Maria, calcular rateio.”');
  }

  return partes.join('\n').trimEnd();
}

/** Filtra contas pendentes com vencimento exatamente na data de referência */
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

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function fetchRelatoriosDia(dataRef: string, unidade: string): Promise<ContaPagarRelatorioDia[]> {
  let query = supabase
    .from('contas_pagar_relatorio_dia')
    .select('*')
    .eq('data_referencia', dataRef)
    .order('created_at', { ascending: false });

  if (unidade !== 'todas') {
    query = query.eq('unidade', unidade);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ContaPagarRelatorioDia[];
}

export async function salvarRelatorioDia(input: {
  data_referencia: string;
  unidade: string;
  mensagem_texto: string;
  gerado_por: string;
  status_envio?: ContaPagarRelatorioDia['status_envio'];
  payload_json?: Record<string, unknown> | null;
}): Promise<ContaPagarRelatorioDia> {
  const hash = await sha256Hex(input.mensagem_texto);
  const { data, error } = await supabase
    .from('contas_pagar_relatorio_dia')
    .insert([
      {
        ...input,
        hash_mensagem: hash,
        status_envio: input.status_envio || 'rascunho',
      },
    ])
    .select('*')
    .single();
  if (error) throw error;
  return data as ContaPagarRelatorioDia;
}

export async function marcarRelatorioCopiado(id: string): Promise<void> {
  const { error } = await supabase
    .from('contas_pagar_relatorio_dia')
    .update({ status_envio: 'copiado' })
    .eq('id', id);
  if (error) throw error;
}
