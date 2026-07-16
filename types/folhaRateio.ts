import type { CollaboratorDepartment } from '../types.ts';
import type { FinanceiroContaBancaria } from './contasPagar.ts';

export type FolhaRateioFatiaInput = {
  lancamento_id: number | null;
  categoria: CollaboratorDepartment;
  conta_pagadora_id: string;
  salario: number;
  bonus: number;
  comissao: number;
  passagem: number;
  reembolso: number;
  inss: number;
  descontos: number;
};

export type FolhaRateioProblema = {
  codigo:
    | 'fatias_sem_conta'
    | 'incoerencias_fiscais'
    | 'conflitos_chave'
    | 'total_geral_divergente';
  quantidade: number;
};

export type FolhaRateioTotalConta = {
  conta_pagadora_id: string;
  conta_apelido: string;
  empresa: string;
  unidade: 'cg' | 'rec' | 'bar';
  valor: number;
};

export type FolhaRateioPreflight = {
  folha_id: number;
  pronto: boolean;
  pessoas_total: number;
  pessoas_pendentes: number;
  fatias_sem_conta: number;
  incoerencias_fiscais: number;
  conflitos_chave: number;
  total_folha: number;
  total_lancamentos: number;
  diferenca: number;
  totais_por_conta: FolhaRateioTotalConta[];
  problemas: FolhaRateioProblema[];
};

export type FolhaRateioSaveResponse = {
  success: true;
  folha_id: number;
  colaborador_id: number;
  audit_id: string;
  fatias: Record<string, unknown>[];
  preflight: FolhaRateioPreflight;
};

export type FolhaContaGerada = {
  id: string;
  empresa: string;
  valor: number;
};

export type FolhaContaCancelada = {
  id: string;
  descricao: string;
  status: 'cancelado';
  valor: number;
};

export type FolhaFecharResponse = {
  success: true;
  folha_id: number;
  status: 'fechada';
  contas_geradas: FolhaContaGerada[];
  total_geral: number;
  audit_id: string;
};

export type FolhaReabrirResponse = {
  success: true;
  folha_id: number;
  status: 'aprovada';
  contas_canceladas: FolhaContaCancelada[];
  total_geral: number;
  audit_id: string;
};

export type FolhaContaPagadora = FinanceiroContaBancaria;
