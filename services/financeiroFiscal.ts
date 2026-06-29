import type { ContaPagar, FinanceiroContaBancaria } from '../types/contasPagar.ts';

export type ContaPagadoraFiscalDerivada = {
  empresa_id: string;
  centro_custo_id: string;
  unidade: NonNullable<ContaPagar['unidade']>;
  label_operacional: string;
};

export function deriveContaPagadoraFiscal(conta: Pick<FinanceiroContaBancaria, 'id' | 'empresa_id' | 'empresa'>): ContaPagadoraFiscalDerivada {
  const empresa = conta.empresa;
  const centro = empresa?.unidade;
  const unidade = centro?.codigo;

  if (!empresa?.id || !empresa.unidade_id || !centro?.id || !unidade) {
    throw new Error('Conta pagadora sem unidade operacional configurada.');
  }
  if (!['cg', 'rec', 'bar'].includes(unidade)) {
    throw new Error(`Codigo de unidade operacional invalido: ${unidade}.`);
  }

  return {
    empresa_id: empresa.id || conta.empresa_id,
    centro_custo_id: centro.id,
    unidade: unidade as NonNullable<ContaPagar['unidade']>,
    label_operacional: empresa.label_operacional || empresa.nome_fantasia || empresa.razao_social || 'Empresa',
  };
}
