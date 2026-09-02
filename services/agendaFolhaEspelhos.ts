/**
 * Decisao pura de fechamento dos espelhos de Folha na Agenda (tarefas com vinculo_tipo = 'folha_pagamento')
 * cuja folha saiu do conjunto ativo do sync (folha mais recente + folhas pendentes).
 *
 * Por que existe: o sync so reconciliava espelhos de folhas `latest` e `pendente`. Quando uma folha saia de
 * pendente sem ser a mais recente, o espelho "Aprovar Folha" ficava aberto pra sempre — foi assim que nasceu
 * o fantasma "Aprovar Folha: Mai/2026" (fechado a mao em 01/09/2026).
 *
 * Sem supabase aqui: testavel com `node --test --experimental-strip-types services/agendaFolhaEspelhos.test.mjs`.
 */

export type FolhaParaEspelho = { id: number; status: string; vinculo: string };
export type EspelhoFolha = { id: string; vinculo_id: string | null; status: string };
export type PlanoFechamentoEspelhos = { concluir: string[]; cancelar: string[] };

/** Status de tarefa que ainda contam como "abertos" para a reconciliacao. */
export const STATUS_ESPELHO_ABERTO: ReadonlySet<string> = new Set(['pendente', 'em_andamento', 'adiada']);

/**
 * Status alvo do espelho a partir do status da folha:
 * - `pendente` -> null (a folha ainda espera aprovacao; o espelho continua ativo e e tratado pelo fluxo normal)
 * - `rascunho` -> 'cancelada' (a aprovacao deixou de ser pedida)
 * - qualquer outro (aprovada, fechada, ...) -> 'concluida' (a aprovacao aconteceu)
 */
export function statusFechamentoEspelhoFolha(folhaStatus: string): 'concluida' | 'cancelada' | null {
  if (folhaStatus === 'pendente') return null;
  if (folhaStatus === 'rascunho') return 'cancelada';
  return 'concluida';
}

/**
 * Classifica os espelhos existentes que devem ser fechados. Ignora: espelhos do conjunto ativo (`ativos`),
 * espelhos ja fechados, espelhos sem vinculo ou cuja folha nao esta em `folhas`.
 */
export function planejarFechamentoEspelhosFolha(input: {
  folhas: FolhaParaEspelho[];
  ativos: ReadonlySet<string>;
  existentes: EspelhoFolha[];
}): PlanoFechamentoEspelhos {
  const folhaPorVinculo = new Map(input.folhas.map((f) => [f.vinculo, f] as const));
  const plano: PlanoFechamentoEspelhos = { concluir: [], cancelar: [] };
  for (const espelho of input.existentes) {
    if (!espelho.vinculo_id || input.ativos.has(espelho.vinculo_id)) continue;
    if (!STATUS_ESPELHO_ABERTO.has(espelho.status)) continue;
    const folha = folhaPorVinculo.get(espelho.vinculo_id);
    if (!folha) continue;
    const alvo = statusFechamentoEspelhoFolha(folha.status);
    if (alvo === 'concluida') plano.concluir.push(espelho.id);
    else if (alvo === 'cancelada') plano.cancelar.push(espelho.id);
  }
  return plano;
}

/**
 * Folha apagada: o espelho some da busca por vinculo (que parte das folhas existentes) e ficaria aberto pra
 * sempre. Recebe os espelhos de folha ainda abertos e devolve os que nao correspondem a nenhuma folha conhecida.
 */
export function planejarCancelamentoEspelhosSemFolha(input: {
  vinculosConhecidos: ReadonlySet<string>;
  abertos: EspelhoFolha[];
}): string[] {
  return input.abertos
    .filter((t) => !!t.vinculo_id && !input.vinculosConhecidos.has(t.vinculo_id) && STATUS_ESPELHO_ABERTO.has(t.status))
    .map((t) => t.id);
}
