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

export interface PlanoConta {
  id: string;
  codigo: string;
  nome: string;
  nome_completo?: string | null;
  parent_id?: string | null;
  nivel: 1 | 2 | 3;
  grupo_plano?: string | null;
  natureza: 'entrada' | 'saida';
  ativo: boolean;
  ordem: number;
}

export interface PlanoContaMaisUsado {
  plano_conta_id: string | null;
  total: number;
}

export interface CentroCusto {
  id: string;
  codigo: 'cg' | 'rec' | 'bar' | string;
  nome: string;
  tipo: 'unidade' | string;
  ativo: boolean;
  ordem: number;
}

export type FonteTipo = 'site' | 'email' | 'pix_fixo' | 'banco' | 'whatsapp' | 'manual';

export type StatusColetaCodigo = 'pendente' | 'coletado' | 'indisponivel';

export type StatusEnvioRelatorio = 'rascunho' | 'copiado' | 'enviado' | 'erro';

export type CodigoMesBadge = 'sem_codigo' | 'coletado' | 'indisponivel' | 'atualizar';

export interface ContaCredencial {
  id: string;
  nome: string;
  portal: string;
  login_hint: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContaPagarCodigoMes {
  id: string;
  conta_pagar_id: string;
  competencia: string;
  codigo_barras: string | null;
  chave_pix: string | null;
  qr_pix_payload: string | null;
  valor_coletado: number | null;
  coletado_em: string | null;
  coletado_por: string | null;
  status_coleta: StatusColetaCodigo;
  created_at: string;
  updated_at: string;
}

export interface ContaPagarRelatorioDia {
  id: string;
  data_referencia: string;
  unidade: string;
  mensagem_texto: string;
  gerado_por: string;
  status_envio: StatusEnvioRelatorio;
  hash_mensagem: string;
  payload_json: Record<string, unknown> | null;
  canal: string | null;
  provider_message_id: string | null;
  enviado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContaPagar {
  id: string;
  descricao: string;
  categoria_id: string | null;
  categoria?: CategoriaDespesa;
  plano_conta_id?: string | null;
  plano_conta?: PlanoConta | null;
  centro_custo_id?: string | null;
  centro_custo?: CentroCusto | null;
  emusys_lancamento_id?: string | null;
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
  fonte_tipo?: FonteTipo | null;
  fonte_url?: string | null;
  fonte_instrucoes?: string | null;
  fonte_identificador?: string | null;
  credencial_id?: string | null;
  credencial?: ContaCredencial | null;
  pix_chave_fixa?: string | null;
  email_pagamento?: string | null;
  codigo_mes?: ContaPagarCodigoMes | null;
  created_at: string;
  updated_at?: string;
  created_by?: string | null;
  recorrente_modelo_id?: string | null;
}

// 'hoje' = vence exatamente hoje (diffDias === 0); 'urgente' = vence em 1–7 dias.
export type StatusVisual = 'vencida' | 'urgente' | 'hoje' | 'pendente' | 'pago';

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

export const FONTE_TIPOS = [
  { value: 'site', label: 'Site / Portal' },
  { value: 'email', label: 'E-mail' },
  { value: 'pix_fixo', label: 'PIX fixo' },
  { value: 'banco', label: 'Banco / App' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'manual', label: 'Manual' },
] as const;

export const PORTAL_SUGESTOES = [
  'light', 'cedae', 'claro', 'itau', 'bradesco', 'santander', 'vivo', 'tim', 'enel', 'outro',
] as const;

