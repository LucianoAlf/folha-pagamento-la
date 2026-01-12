// =============================================
// TIPOS DO MÓDULO AGENDA
// Alinhado ao schema atual do Supabase (public.*)
// =============================================

export interface TarefaLista {
  id: string;
  nome: string;
  descricao?: string | null;
  cor: string;
  icone: string;
  ordem: number;
  is_smart: boolean;
  smart_filter?: {
    vencimento?: 'hoje' | 'amanha' | 'semana' | 'mes';
    prioridade?: ('baixa' | 'media' | 'alta' | 'urgente')[];
    tem_data?: boolean;
  } | null;
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Computed: quantidade de tarefas (opcional, preenchido pela UI)
  _count?: number;
}

export interface TarefaRecorrencia {
  tipo: 'diaria' | 'semanal' | 'mensal' | 'anual';
  dias?: number[];
  fim?: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao?: string | null;

  lista_id?: string | null;
  lista?: TarefaLista | null;

  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  tags: string[];
  categoria: 'financeiro' | 'rh' | 'administrativo' | 'pessoal' | 'geral';
  unidade?: 'cg' | 'rec' | 'bar' | 'todas' | null;

  vencimento_em?: string | null; // timestamptz ISO
  dia_inteiro: boolean;
  data_conclusao?: string | null; // timestamptz ISO

  is_recorrente: boolean;
  recorrencia?: TarefaRecorrencia | null; // jsonb
  recorrencia_pai_id?: string | null;

  lembrete_minutos: number[]; // int[]

  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada' | 'adiada';

  vinculo_tipo?: 'conta_pagar' | 'folha_pagamento' | 'reuniao' | null;
  vinculo_id?: string | null;

  google_event_id?: string | null;

  created_by?: string | null;
  created_at: string;
  updated_at: string;
  ordem: number;

  // Relations
  subtarefas?: TarefaSubtarefa[];
}

export interface TarefaSubtarefa {
  id: string;
  tarefa_id: string;
  titulo: string;
  concluida: boolean;
  ordem: number;
  created_at: string;
}

export interface TarefaTemplate {
  id: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  template: {
    titulo: string;
    categoria?: string;
    prioridade?: string;
    subtarefas?: string[];
  };
  icone: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

export interface NotaRapida {
  id: string;
  conteudo: string;
  cor: string;
  fixada: boolean;
  ordem: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificacaoConfig {
  id: string;
  user_id?: string | null;
  whatsapp_numero?: string | null;
  whatsapp_ativo: boolean;
  google_calendar_ativo: boolean;
  google_refresh_token?: string | null;
  google_calendar_id?: string | null;
  resumo_diario_ativo: boolean;
  resumo_diario_hora: string;
  resumo_semanal_ativo: boolean;
  resumo_semanal_dia: string;
  resumo_semanal_hora: string;
  lembrete_padrao_minutos: number;
  // Aparência da Agenda
  agenda_bg_preset?: string | null;
  agenda_bg_url?: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// APARÊNCIA (Agenda)
// =============================================

export type AgendaBackgroundPresetId =
  | 'classic-dark'
  | 'violet-aurora'
  | 'lavender-cloud'
  | 'sunset-peach'
  | 'ocean-glow'
  | 'forest-mist'
  | 'rose-noir'
  | 'midnight-neon'
  | 'soft-sky'
  | 'paper-ink';

export interface AgendaBackgroundPreset {
  id: AgendaBackgroundPresetId;
  label: string;
  description: string;
  backgroundImage: string; // CSS background-image
}

export const AGENDA_BG_PRESETS: AgendaBackgroundPreset[] = [
  {
    id: 'classic-dark',
    label: 'Clássico',
    description: 'Escuro clean (padrão do sistema)',
    backgroundImage:
      'radial-gradient(1200px 700px at 15% 10%, rgba(148,163,184,.12), transparent 60%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'violet-aurora',
    label: 'Aurora Violeta',
    description: 'Roxo LA com brilho suave',
    backgroundImage:
      'radial-gradient(900px 520px at 18% 12%, rgba(139,92,246,.35), transparent 60%), radial-gradient(900px 520px at 82% 22%, rgba(59,130,246,.18), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'lavender-cloud',
    label: 'Lavanda',
    description: 'Calmo, elegante e leve',
    backgroundImage:
      'radial-gradient(950px 560px at 35% 18%, rgba(167,139,250,.28), transparent 60%), radial-gradient(700px 420px at 75% 65%, rgba(236,72,153,.10), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'sunset-peach',
    label: 'Pôr do Sol',
    description: 'Quente, acolhedor (sem pesar)',
    backgroundImage:
      'radial-gradient(900px 520px at 75% 12%, rgba(249,115,22,.22), transparent 60%), radial-gradient(700px 420px at 25% 25%, rgba(245,158,11,.16), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'ocean-glow',
    label: 'Oceano',
    description: 'Azul/teal com brilho',
    backgroundImage:
      'radial-gradient(980px 580px at 25% 18%, rgba(6,182,212,.18), transparent 60%), radial-gradient(780px 460px at 85% 55%, rgba(16,185,129,.14), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'forest-mist',
    label: 'Floresta',
    description: 'Verde suave, foco e paz',
    backgroundImage:
      'radial-gradient(980px 580px at 30% 20%, rgba(34,197,94,.16), transparent 60%), radial-gradient(780px 460px at 80% 60%, rgba(16,185,129,.10), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'rose-noir',
    label: 'Rosa Noir',
    description: 'Rosa discreto, sofisticado',
    backgroundImage:
      'radial-gradient(980px 580px at 22% 18%, rgba(236,72,153,.18), transparent 60%), radial-gradient(740px 420px at 78% 42%, rgba(139,92,246,.10), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'midnight-neon',
    label: 'Neon Midnight',
    description: 'Neon sutil (tech) sem distrair',
    backgroundImage:
      'radial-gradient(880px 520px at 20% 18%, rgba(99,102,241,.16), transparent 60%), radial-gradient(720px 420px at 80% 70%, rgba(6,182,212,.12), transparent 55%), radial-gradient(520px 320px at 65% 20%, rgba(245,158,11,.10), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'soft-sky',
    label: 'Céu Suave',
    description: 'Azul com roxo leve',
    backgroundImage:
      'radial-gradient(980px 580px at 60% 18%, rgba(96,165,250,.20), transparent 60%), radial-gradient(780px 460px at 25% 70%, rgba(167,139,250,.12), transparent 55%), linear-gradient(180deg, #0f1219, #070a0f)',
  },
  {
    id: 'paper-ink',
    label: 'Papel & Tinta',
    description: 'Mais claro, ainda legível',
    backgroundImage:
      'radial-gradient(1100px 650px at 25% 20%, rgba(226,232,240,.10), transparent 65%), radial-gradient(900px 520px at 80% 40%, rgba(148,163,184,.08), transparent 60%), linear-gradient(180deg, #0c1017, #06080c)',
  },
];

// =============================================
// KANBAN (preferências por usuário)
// =============================================

export type KanbanColumnKey = 'pendente' | 'em_andamento' | 'concluida' | 'adiada';

export interface AgendaKanbanColumnConfig {
  key: KanbanColumnKey;
  label: string;
  visible: boolean;
  order: number;
}

export interface AgendaKanbanConfigRow {
  user_id: string;
  columns: AgendaKanbanColumnConfig[];
  updated_at: string;
}

export interface LembreteLog {
  id: string;
  tarefa_id?: string | null;
  conta_pagar_id?: string | null;
  canal: 'whatsapp' | 'email' | 'push' | 'google_calendar';
  tipo: 'lembrete' | 'resumo_diario' | 'resumo_semanal' | 'alerta_vencimento';
  scheduled_for: string; // timestamptz ISO
  mensagem?: string | null;
  destinatario?: string | null;
  status: 'pendente' | 'enviado' | 'falhou';
  erro?: string | null;
  enviado_em?: string | null; // timestamptz
  created_at: string;
}

// =============================================
// CONSTANTES
// =============================================

export const PRIORIDADES = {
  baixa: { label: 'Baixa', cor: '#6b7280', bg: 'bg-gray-500/20', text: 'text-gray-400', icone: '⬇️' },
  media: { label: 'Média', cor: '#3b82f6', bg: 'bg-blue-500/20', text: 'text-blue-400', icone: '➡️' },
  alta: { label: 'Alta', cor: '#f59e0b', bg: 'bg-amber-500/20', text: 'text-amber-400', icone: '⬆️' },
  urgente: { label: 'Urgente', cor: '#ef4444', bg: 'bg-red-500/20', text: 'text-red-400', icone: '🔴' },
} as const;

export const CATEGORIAS = {
  financeiro: { label: 'Financeiro', cor: '#10b981', bg: 'bg-emerald-500/20', text: 'text-emerald-400', icone: '💰' },
  rh: { label: 'RH', cor: '#8b5cf6', bg: 'bg-purple-500/20', text: 'text-purple-400', icone: '🧑‍🤝‍🧑' },
  administrativo: { label: 'Administrativo', cor: '#6366f1', bg: 'bg-indigo-500/20', text: 'text-indigo-400', icone: '📋' },
  pessoal: { label: 'Pessoal', cor: '#ec4899', bg: 'bg-pink-500/20', text: 'text-pink-400', icone: '🏠' },
  geral: { label: 'Geral', cor: '#6b7280', bg: 'bg-gray-500/20', text: 'text-gray-400', icone: '📌' },
} as const;

export const STATUS_TAREFA = {
  pendente: { label: 'Pendente', cor: '#6b7280', bg: 'bg-gray-500/20', text: 'text-gray-400' },
  em_andamento: { label: 'Em Andamento', cor: '#3b82f6', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  concluida: { label: 'Concluída', cor: '#10b981', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  cancelada: { label: 'Cancelada', cor: '#ef4444', bg: 'bg-red-500/20', text: 'text-red-400' },
  adiada: { label: 'Adiada', cor: '#f59e0b', bg: 'bg-amber-500/20', text: 'text-amber-400' },
} as const;

export const CORES_NOTAS = [
  { cor: '#fbbf24', nome: 'Amarelo' },
  { cor: '#34d399', nome: 'Verde' },
  { cor: '#60a5fa', nome: 'Azul' },
  { cor: '#f472b6', nome: 'Rosa' },
  { cor: '#a78bfa', nome: 'Roxo' },
  { cor: '#fb923c', nome: 'Laranja' },
] as const;

export type Prioridade = keyof typeof PRIORIDADES;
export type Categoria = keyof typeof CATEGORIAS;
export type StatusTarefa = keyof typeof STATUS_TAREFA;

