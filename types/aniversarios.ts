// =============================================
// TIPOS DO MÓDULO ANIVERSÁRIOS
// Alinhado ao schema atual do Supabase (public.aniversarios)
// =============================================

export interface Aniversario {
  id: string;
  nome: string;
  data_nascimento: string; // yyyy-mm-dd
  colaborador_id?: number | null;
  tipo: 'colaborador' | 'manual';
  lembrete_tipo: LembreteTipo;
  lembrete_ativo: boolean;
  notas?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Computed (UI-only, preenchido pelo service)
  _idade?: number;
  _proximoAniversario?: string; // yyyy-mm-dd
  _diasAteProximo?: number;
}

export type LembreteTipo = 'anual' | 'semanal' | 'diario';

export const LEMBRETE_TIPOS: Record<LembreteTipo, { label: string; descricao: string; icone: string }> = {
  anual: { label: 'Anual', descricao: 'Lembrete no dia do aniversário', icone: '🔔' },
  semanal: { label: 'Semanal', descricao: 'Lembrete toda semana antes', icone: '📅' },
  diario: { label: 'Diário', descricao: 'Lembrete todo dia na semana do aniversário', icone: '⏰' },
};
