import { supabase } from './supabase';
import { CategoriaDespesa, ContaPagar, StatusVisual } from '../types/contasPagar';

// Categorias
export async function fetchCategorias(): Promise<CategoriaDespesa[]> {
  const { data, error } = await supabase
    .from('categorias_despesa')
    .select('*')
    .eq('ativo', true)
    .order('ordem');

  if (error) throw error;
  return (data || []) as CategoriaDespesa[];
}

export async function upsertCategoria(categoria: Partial<CategoriaDespesa>): Promise<CategoriaDespesa> {
  const { data, error } = await supabase
    .from('categorias_despesa')
    .upsert([categoria])
    .select()
    .single();

  if (error) throw error;
  return data as CategoriaDespesa;
}

export async function deleteCategoria(id: string): Promise<void> {
  const { error } = await supabase
    .from('categorias_despesa')
    .update({ ativo: false }) // Soft delete
    .eq('id', id);

  if (error) throw error;
}

// Contas
export async function fetchContasPagar(filtros?: {
  status?: 'todas' | 'pendente' | 'pago';
  unidade?: 'todas' | 'cg' | 'rec' | 'bar';
}): Promise<ContaPagar[]> {
  // 1. Garantir que contas recorrentes existam para o mês atual (batch otimizado)
  try {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const competenciaAtual = `${yyyy}-${mm}-01`;

    // 1a. Busca SOMENTE modelos recorrentes (recorrente_modelo_id IS NULL)
    const { data: recorrentes } = await supabase
      .from('contas_pagar')
      .select('*')
      .eq('tipo_lancamento', 'recorrente')
      .neq('status', 'cancelado')
      .neq('status', 'finalizado')
      .is('recorrente_modelo_id', null);

    if (recorrentes && recorrentes.length > 0) {
      // 1b. Busca instâncias já geradas neste mês (por modelo_id)
      const { data: existentes } = await supabase
        .from('contas_pagar')
        .select('recorrente_modelo_id')
        .eq('competencia', competenciaAtual)
        .not('recorrente_modelo_id', 'is', null);

      // 1c. Set de modelo_ids já gerados para lookup O(1)
      const geradosSet = new Set(
        (existentes || []).map(e => e.recorrente_modelo_id)
      );

      // 1d. Filtrar modelos que ainda não têm instância este mês
      const faltantes = recorrentes.filter(
        modelo => !geradosSet.has(modelo.id)
      );

      // 1e. Batch INSERT com recorrente_modelo_id vinculado
      if (faltantes.length > 0) {
        const novos = faltantes.map(modelo => {
          const dataVencOriginal = new Date(`${modelo.data_vencimento}T00:00:00`);
          const novoVencimento = `${yyyy}-${mm}-${String(dataVencOriginal.getDate()).padStart(2, '0')}`;
          const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = modelo;
          return {
            ...rest,
            recorrente_modelo_id: modelo.id,
            competencia: competenciaAtual,
            data_vencimento: novoVencimento,
            status: 'pendente',
            data_pagamento: null,
            metodo_pagamento: null,
          };
        });
        await supabase.from('contas_pagar').insert(novos);
      }
    }
  } catch (err) {
    console.error('Erro ao processar recorrentes automáticos:', err);
  }

  let query = supabase
    .from('contas_pagar')
    .select('*, categoria:categorias_despesa(*)')
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
  return (data || []) as ContaPagar[];
}

export async function fetchContaPagarById(contaId: string): Promise<ContaPagar | null> {
  if (!contaId) return null;
  const { data, error } = await supabase
    .from('contas_pagar')
    .select('*, categoria:categorias_despesa(*)')
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
    .select('*, categoria:categorias_despesa(*)')
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
  const { data: user } = await supabase.auth.getUser();

  // Parcelada: cria N registros
  if (conta.tipo_lancamento === 'parcelada' && conta.total_parcelas && conta.total_parcelas > 1) {
    const parcelas: Partial<ContaPagar>[] = [];
    const parcelaInicial = conta.parcela_atual || 1;
    const qtdParcelas = conta.total_parcelas - parcelaInicial + 1;
    const valorPorParcela = options?.valorPorParcela ?? true;
    const valorParcela = valorPorParcela ? (conta.valor || 0) : (conta.valor || 0) / qtdParcelas;
    const dataBase = new Date(`${conta.data_vencimento!}T00:00:00`);

    for (let i = 0; i < qtdParcelas; i++) {
      const dataVenc = new Date(dataBase);
      dataVenc.setMonth(dataVenc.getMonth() + i);

      const yyyy = dataVenc.getFullYear();
      const mm = String(dataVenc.getMonth() + 1).padStart(2, '0');
      const dd = String(dataVenc.getDate()).padStart(2, '0');

      parcelas.push({
        ...conta,
        descricao: `${conta.descricao} (${parcelaInicial + i}/${conta.total_parcelas})`,
        valor: valorParcela,
        data_vencimento: `${yyyy}-${mm}-${dd}`,
        parcela_atual: parcelaInicial + i,
        total_parcelas: conta.total_parcelas,
        created_by: user.user?.id,
      });
    }

    const { data, error } = await supabase
      .from('contas_pagar')
      .insert(parcelas)
      .select('*, categoria:categorias_despesa(*)');

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Nenhuma parcela foi criada');
    return data[0] as ContaPagar;
  }

  const { data, error } = await supabase
    .from('contas_pagar')
    .insert([{ ...conta, created_by: user.user?.id }])
    .select('*, categoria:categorias_despesa(*)')
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
    .select('*, categoria:categorias_despesa(*)')
    .single();

  if (error) throw error;
  return data as ContaPagar;
}

export async function updateContaPagar(contaId: string, patch: Partial<ContaPagar>): Promise<ContaPagar> {
  const nextPatch: Partial<ContaPagar> = { ...patch };

  // Mantém competência consistente com o mês do vencimento, se o vencimento mudar.
  if (nextPatch.data_vencimento) {
    const [yyyy, mm] = nextPatch.data_vencimento.split('-');
    if (yyyy && mm) nextPatch.competencia = `${yyyy}-${mm}-01`;
  }

  const { data, error } = await supabase
    .from('contas_pagar')
    .update(nextPatch)
    .eq('id', contaId)
    .select('*, categoria:categorias_despesa(*)')
    .single();

  if (error) throw error;
  return data as ContaPagar;
}

export async function updateFuturasRecorrentes(contaOriginal: ContaPagar, patch: Partial<ContaPagar>): Promise<void> {
  const fieldsToUpdate: any = {};
  if (patch.descricao) fieldsToUpdate.descricao = patch.descricao;
  if (patch.valor) fieldsToUpdate.valor = patch.valor;
  if (patch.categoria_id) fieldsToUpdate.categoria_id = patch.categoria_id;
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
  if (patch.categoria_id) fieldsToUpdate.categoria_id = patch.categoria_id;
  if (patch.observacoes !== undefined) fieldsToUpdate.observacoes = patch.observacoes;

  if (Object.keys(fieldsToUpdate).length === 0) return;

  // Extract base description without "(X/Y)" suffix
  const baseDesc = contaOriginal.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, '');

  const { error } = await supabase
    .from('contas_pagar')
    .update(fieldsToUpdate)
    .like('descricao', `${baseDesc} (%`)
    .eq('unidade', contaOriginal.unidade)
    .eq('tipo_lancamento', 'parcelada')
    .eq('status', 'pendente')
    .gte('data_vencimento', contaOriginal.data_vencimento);

  if (error) throw error;
}

export async function deleteConta(contaId: string): Promise<void> {
  const { error } = await supabase.from('contas_pagar').delete().eq('id', contaId);
  if (error) throw error;
}

export async function finalizarConta(contaId: string): Promise<void> {
  const { error } = await supabase
    .from('contas_pagar')
    .update({ status: 'finalizado' })
    .eq('id', contaId);
  if (error) throw error;
}

export async function deleteParcelamento(conta: ContaPagar): Promise<number> {
  if (conta.tipo_lancamento !== 'parcelada' || !conta.total_parcelas) {
    await deleteConta(conta.id);
    return 1;
  }

  const baseDesc = conta.descricao.split(' (')[0];

  const { data, error } = await supabase
    .from('contas_pagar')
    .delete()
    .eq('categoria_id', conta.categoria_id)
    .eq('unidade', conta.unidade)
    .like('descricao', `${baseDesc} (%`)
    .eq('tipo_lancamento', 'parcelada')
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

export async function finalizarParcelamento(conta: ContaPagar): Promise<void> {
  if (conta.tipo_lancamento !== 'parcelada' || !conta.total_parcelas) {
    return finalizarConta(conta.id);
  }

  // Para parcelados, buscamos outras parcelas com a mesma base de descrição e que ainda estejam pendentes
  // O formato da descrição é "Descrição (1/10)"
  const baseDesc = conta.descricao.split(' (')[0];
  
  const { error } = await supabase
    .from('contas_pagar')
    .update({ status: 'finalizado' })
    .eq('categoria_id', conta.categoria_id)
    .eq('unidade', conta.unidade)
    .like('descricao', `${baseDesc} (%`)
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
