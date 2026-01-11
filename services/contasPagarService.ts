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

// Contas
export async function fetchContasPagar(filtros?: {
  status?: 'todas' | 'pendente' | 'pago';
  unidade?: 'todas' | 'cg' | 'rec' | 'bar';
}): Promise<ContaPagar[]> {
  let query = supabase
    .from('contas_pagar')
    .select('*, categoria:categorias_despesa(*)')
    .neq('status', 'cancelado')
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

export async function createContaPagar(conta: Partial<ContaPagar>): Promise<ContaPagar> {
  const { data: user } = await supabase.auth.getUser();

  // Parcelada: cria N registros
  if (conta.tipo_lancamento === 'parcelada' && conta.total_parcelas && conta.total_parcelas > 1) {
    const parcelas: Partial<ContaPagar>[] = [];
    const valorParcela = (conta.valor || 0) / conta.total_parcelas;
    const dataBase = new Date(`${conta.data_vencimento!}T00:00:00`);

    for (let i = 0; i < conta.total_parcelas; i++) {
      const dataVenc = new Date(dataBase);
      dataVenc.setMonth(dataVenc.getMonth() + i);

      const yyyy = dataVenc.getFullYear();
      const mm = String(dataVenc.getMonth() + 1).padStart(2, '0');
      const dd = String(dataVenc.getDate()).padStart(2, '0');

      parcelas.push({
        ...conta,
        descricao: `${conta.descricao} (${i + 1}/${conta.total_parcelas})`,
        valor: valorParcela,
        data_vencimento: `${yyyy}-${mm}-${dd}`,
        parcela_atual: i + 1,
        total_parcelas: conta.total_parcelas,
        created_by: user.user?.id,
      });
    }

    const { data, error } = await supabase
      .from('contas_pagar')
      .insert(parcelas)
      .select('*, categoria:categorias_despesa(*)')
      .limit(1)
      .single();

    if (error) throw error;
    return data as ContaPagar;
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

export async function deleteConta(contaId: string): Promise<void> {
  const { error } = await supabase.from('contas_pagar').delete().eq('id', contaId);
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

