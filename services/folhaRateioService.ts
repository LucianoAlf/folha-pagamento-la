import type {
  FolhaContaPagadora,
  FolhaRateioFatiaInput,
  FolhaRateioPreflight,
  FolhaRateioSaveResponse,
} from '../types/folhaRateio.ts';

const money = (value: number): number =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizeFolhaRateioFatias(
  fatias: FolhaRateioFatiaInput[]
): FolhaRateioFatiaInput[] {
  return fatias.map((fatia) => ({
    lancamento_id: fatia.lancamento_id || null,
    categoria: fatia.categoria,
    conta_pagadora_id: String(fatia.conta_pagadora_id || '').trim(),
    salario: money(fatia.salario),
    bonus: money(fatia.bonus),
    comissao: money(fatia.comissao),
    passagem: money(fatia.passagem),
    reembolso: money(fatia.reembolso),
    inss: money(fatia.inss),
    descontos: money(fatia.descontos),
  }));
}

function folhaRateioError(error: unknown): Error {
  const message = String((error as { message?: string })?.message || '');
  if (/totais por categoria e componente nao conferem/i.test(message)) {
    return new Error('A divisao precisa manter o total de cada componente.');
  }
  if (/detalhamento estruturado exige preservacao/i.test(message)) {
    return new Error('Esta pessoa possui detalhes que precisam permanecer em uma das fatias.');
  }
  if (/conta pagadora repetida/i.test(message)) {
    return new Error('Use cada conta apenas uma vez dentro da mesma categoria.');
  }
  if (/conta pagadora inativa|sem unidade operacional/i.test(message)) {
    return new Error('Escolha uma conta pagadora ativa e vinculada a uma unidade.');
  }
  return new Error(message || 'Nao foi possivel salvar a divisao por conta.');
}

export async function fetchFolhaContasPagadoras(): Promise<FolhaContaPagadora[]> {
  const { fetchFinanceiroContasBancarias } = await import('./contasPagarService.ts');
  const contas = await fetchFinanceiroContasBancarias();
  return contas.filter((conta) => conta.ativo && conta.empresa?.ativo);
}

export async function fetchFolhaRateioPreflight(
  folhaId: number
): Promise<FolhaRateioPreflight> {
  const { supabase } = await import('./supabase.ts');
  const { data, error } = await supabase.rpc('folha_rateio_contas_preflight', {
    p_folha_id: folhaId,
  });
  if (error) throw folhaRateioError(error);
  return data as FolhaRateioPreflight;
}

export async function saveFolhaRateio(input: {
  folhaId: number;
  colaboradorId: number;
  fatias: FolhaRateioFatiaInput[];
}): Promise<FolhaRateioSaveResponse> {
  const { supabase } = await import('./supabase.ts');
  const { data, error } = await supabase.rpc('folha_rateio_contas_salvar', {
    p_folha_id: input.folhaId,
    p_colaborador_id: input.colaboradorId,
    p_fatias: normalizeFolhaRateioFatias(input.fatias),
    p_ator: {},
  });
  if (error) throw folhaRateioError(error);
  return data as FolhaRateioSaveResponse;
}
