import type { Colaborador } from '../../types.ts';
import type { FinanceiroContaBancaria } from '../../types/contasPagar.ts';

export type ContaPagadoraFilter = 'all' | 'missing';

type CollaboratorPayerInput = Pick<Colaborador, 'ativo' | 'arquivado_em' | 'status'> & {
  conta_pagadora_id?: string | null;
};

function isActiveNonArchived(collaborator: CollaboratorPayerInput): boolean {
  return collaborator.ativo === true && collaborator.status !== 'on_leave' && !collaborator.arquivado_em;
}

export function formatContaPagadoraOption(conta: FinanceiroContaBancaria): string {
  const empresa = conta.empresa?.label_operacional
    || conta.empresa?.nome_fantasia
    || conta.empresa?.razao_social
    || conta.apelido
    || 'Empresa';
  const finalConta = String(conta.conta || '').trim().slice(-6);
  return `${empresa} · ${conta.banco} ${conta.agencia} · final ${finalConta}`;
}

export function buildContaPagadoraOptions(contas: FinanceiroContaBancaria[]) {
  return contas
    .filter((conta) => conta.ativo && conta.empresa?.ativo === true)
    .map((conta) => ({ value: conta.id, label: formatContaPagadoraOption(conta) }));
}

export function normalizeContaPagadoraSelection(value: string): string | null {
  return value === 'none' ? null : value;
}

export function countActiveCollaboratorsWithoutPayer(collaborators: CollaboratorPayerInput[]): number {
  return collaborators.filter((collaborator) => isActiveNonArchived(collaborator) && !collaborator.conta_pagadora_id).length;
}

export function filterCollaboratorsByPayerStatus<T extends CollaboratorPayerInput>(
  collaborators: T[],
  filter: ContaPagadoraFilter
): T[] {
  if (filter === 'all') return collaborators;
  return collaborators.filter((collaborator) => isActiveNonArchived(collaborator) && !collaborator.conta_pagadora_id);
}
