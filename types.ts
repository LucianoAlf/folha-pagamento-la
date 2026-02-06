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

export interface Lancamento {
  id: number;
  folha_id: number;
  colaborador_id: number;
  unidade: 'cg' | 'rec' | 'bar';
  categoria: CollaboratorDepartment;
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
  detalhamento?: Record<string, string>;
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
