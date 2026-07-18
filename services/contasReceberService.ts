import { supabase } from './supabase.ts';
import type {
  ContaReceber,
  ContasReceberPreflight,
  PlanoContaEntrada,
} from '../types/contasReceber.ts';

export async function fetchContasReceber(competencia: string): Promise<ContaReceber[]> {
  const { data, error } = await supabase
    .from('contas_receber')
    .select('*, plano_conta:plano_contas(id,codigo,nome), centro_custo:centros_custo(id,codigo,nome)')
    .eq('competencia', competencia)
    .order('data_vencimento', { ascending: true })
    .order('aluno_nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ContaReceber[];
}

export async function fetchPlanosContaEntrada(): Promise<PlanoContaEntrada[]> {
  const { data, error } = await supabase
    .from('plano_contas')
    .select('id,codigo,nome')
    .eq('nivel', 3)
    .eq('natureza', 'entrada')
    .eq('ativo', true)
    .order('codigo');
  if (error) throw error;
  return (data ?? []) as PlanoContaEntrada[];
}

export async function preflightContasReceber(competencia: string): Promise<ContasReceberPreflight> {
  const { data, error } = await supabase.functions.invoke('contas-receber-sync', {
    body: { action: 'preflight', competencia },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? 'Nao foi possivel consultar o LA Report.');
  return data as ContasReceberPreflight;
}

export async function applyContasReceber(competencia: string, preflightId: string) {
  const { data, error } = await supabase.functions.invoke('contas-receber-sync', {
    body: { action: 'apply', competencia, preflight_id_esperado: preflightId },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? 'Nao foi possivel sincronizar o LA Report.');
  return data;
}

export async function classificarContaReceber(args: {
  contaReceberId: string;
  planoContaId?: string | null;
  excluidoDaReceita?: boolean;
  motivoExclusao?: string | null;
}) {
  const { data, error } = await supabase.rpc('contas_receber_classificar', {
    p_conta_receber_id: args.contaReceberId,
    p_plano_conta_id: args.planoContaId ?? null,
    p_excluido_da_receita: args.excluidoDaReceita ?? false,
    p_motivo_exclusao: args.motivoExclusao ?? null,
    p_ator: {},
  });
  if (error) throw error;
  return data;
}
