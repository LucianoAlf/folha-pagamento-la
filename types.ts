export type CollaboratorDepartment = 'staff_rateado' | 'equipe_operacional' | 'professores';
export type CollaboratorContractType = 'pj' | 'clt' | 'mei' | 'estagiario' | 'diarista' | 'rpa';
export type CollaboratorStatus = 'active' | 'inactive' | 'on_leave';

export interface Colaborador {
  id: number;
  nome: string;
  nome_completo?: string;
  foto_url?: string;
  funcao: string;
  tipo: CollaboratorContractType;
  departamento: CollaboratorDepartment;
  unidade_fixa?: string;
  is_rateado: boolean;
  ativo: boolean;
  em_rescisao?: boolean;
  observacoes?: string;
  
  // New MusiClass fields
  cpf?: string;
  rg?: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  
  // Endereço
  logradouro?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  
  // Vínculo
  data_admissao?: string;
  status: CollaboratorStatus;
  
  // Bancário
  conta_pagadora_id?: string | null;
  banco?: string;
  agencia?: string;
  conta?: string;
  tipo_conta?: string;
  pix?: string;
  
  // Financeiro Base
  salario_base: number;
  
  instrumentos?: string[];
  
  created_at?: string;
  updated_at?: string;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
}

export interface FolhaMensal {
  id: number;
  mes: number;
  ano: number;
  status: 'rascunho' | 'pendente' | 'aprovada';
  total_geral: number;
  total_cg: number;
  total_rec: number;
  total_bar: number;
  notas_rh?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string; // auth.users uuid
  nome: string;
  role: 'admin' | 'rh' | 'user';
  avatar_url?: string | null;
  created_at?: string;
}

export type BistroDescontoMeta = {
  ref_ym: string; // yyyy-mm (mês de consumo)
  valor: number;
  updated_at?: string;
};

export type LancamentoDetalhamento = {
  // Notas livres (UI premium)
  [key: string]: string | BistroDescontoMeta | null | undefined;
  // Metadado do desconto do Bistrô (para coluna e geração idempotente)
  __bistro?: BistroDescontoMeta;
};

export interface Lancamento {
  id: number;
  folha_id: number;
  colaborador_id: number;
  unidade: 'cg' | 'rec' | 'bar';
  categoria: CollaboratorDepartment;
  conta_pagadora_id?: string | null;
  salario: number;
  bonus: number;
  comissao: number;
  reembolso: number;
  passagem: number;
  inss: number;
  descontos: number;
  total: number;
  observacao?: string;
  alert_checked?: boolean;
  detalhamento?: LancamentoDetalhamento | null;
  colaboradores?: Colaborador;
}

export interface TotaisFolha {
  totalGeral: number;
  totalCG: number;
  totalRec: number;
  totalBar: number;
  headcount: {
    total: number;
    cg: number;
    rec: number;
    bar: number;
  };
}

export interface Alerta {
  id?: number;
  severidade: 'warning' | 'critical' | 'info';
  titulo: string;
  descricao: string;
}

// =====================================================
// WHATSAPP - DESTINOS E NOTIFICACOES POR GRUPO
// =====================================================

export type WhatsappDestinoTipo = 'grupo' | 'pessoa';
export type WhatsappDestinoFinalidade = 'contas_diario' | 'suporte' | 'conciliacao' | 'diretoria';

export type WhatsappGrupoNotificacaoTipo =
  | 'contas_a_pagar_dia'
  | 'resumo_financeiro_semanal'
  | 'resumo_financeiro_mensal';

export type WhatsappGrupoNotificacaoFrequencia = 'diario' | 'semanal' | 'mensal';

export interface WhatsappDestino {
  id: string;
  nome: string;
  tipo: WhatsappDestinoTipo;
  jid: string;
  finalidade: WhatsappDestinoFinalidade;
  unidade: string | null;
  ativo: boolean;
  observacao: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WhatsappDestinoInput {
  nome: string;
  tipo: WhatsappDestinoTipo;
  jid: string;
  finalidade: WhatsappDestinoFinalidade;
  unidade?: string | null;
  ativo?: boolean;
  observacao?: string | null;
}

export type WhatsappDestinoPatch = Partial<Pick<
  WhatsappDestinoInput,
  'nome' | 'finalidade' | 'unidade' | 'ativo' | 'observacao'
>>;

export interface WhatsappGrupoDisponivel {
  jid: string;
  nome: string;
}

export interface WhatsappGrupoNotificacao {
  id: string;
  destino_id: string;
  tipo: WhatsappGrupoNotificacaoTipo;
  frequencia: WhatsappGrupoNotificacaoFrequencia;
  horario: string;
  dia_semana: number | null;
  dia_mes: number | null;
  ativo: boolean;
  ultima_execucao: string | null;
  observacao: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WhatsappGrupoNotificacaoInput {
  destino_id: string;
  tipo: WhatsappGrupoNotificacaoTipo;
  frequencia: WhatsappGrupoNotificacaoFrequencia;
  horario: string;
  dia_semana?: number | null;
  dia_mes?: number | null;
  ativo?: boolean;
  observacao?: string | null;
}

// =====================================================
// FÉRIAS CLT
// =====================================================
export * from './types/ferias';
