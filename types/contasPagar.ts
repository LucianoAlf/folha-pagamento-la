export interface CategoriaDespesa {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  tipo_fluxo: 'receita' | 'despesa';
  tipo_custo: 'fixo' | 'variavel' | null;
  ativo: boolean;
  ordem: number;
}

export interface ContaPagar {
  id: string;
  descricao: string;
  categoria_id: string | null;
  categoria?: CategoriaDespesa;
  unidade: 'cg' | 'rec' | 'bar' | 'todas' | null;
  valor: number;
  data_lancamento: string;
  data_vencimento: string;
  competencia: string;
  status: 'pendente' | 'pago' | 'cancelado' | 'finalizado';
  data_pagamento: string | null;
  metodo_pagamento: string | null;
  tipo_lancamento: 'unica' | 'recorrente' | 'parcelada';
  parcela_atual: number | null;
  total_parcelas: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at?: string;
  created_by?: string | null;
}

export type StatusVisual = 'vencida' | 'urgente' | 'pendente' | 'pago';

export const METODOS_PAGAMENTO = [
  'PIX',
  'Transferência Bancária',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Débito Automático',
  'Boleto',
  'Dinheiro',
] as const;

export const UNIDADES_CONTA = [
  { value: 'cg', label: 'Campo Grande' },
  { value: 'rec', label: 'Recreio' },
  { value: 'bar', label: 'Barra' },
  { value: 'todas', label: 'Todas / Matriz' },
] as const;

