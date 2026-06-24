import type {
  WhatsappDestino,
  WhatsappGrupoNotificacao,
  WhatsappGrupoNotificacaoFrequencia,
  WhatsappGrupoNotificacaoInput,
} from '../types';
import { supabase } from './supabase';

type GrupoNotificacaoPatch = Partial<Omit<WhatsappGrupoNotificacaoInput, 'destino_id' | 'tipo'>> & {
  frequencia?: WhatsappGrupoNotificacaoFrequencia;
};

function normalizeHorario(horario?: string | null) {
  const match = String(horario || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '08:00';
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeDiaSemana(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return 1;
  return Math.min(6, Math.max(0, Number(value)));
}

function normalizeDiaMes(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return 1;
  return Math.min(31, Math.max(1, Number(value)));
}

function normalizeGrupoPayload<T extends WhatsappGrupoNotificacaoInput | GrupoNotificacaoPatch>(input: T): T {
  const payload = { ...input };
  const frequencia = payload.frequencia;
  if ('horario' in payload) {
    payload.horario = normalizeHorario(payload.horario);
  }
  if (!frequencia) return payload;
  return {
    ...payload,
    dia_semana: frequencia === 'semanal' ? normalizeDiaSemana(input.dia_semana) : null,
    dia_mes: frequencia === 'mensal' ? normalizeDiaMes(input.dia_mes) : null,
  };
}

export async function listDestinos(): Promise<WhatsappDestino[]> {
  const { data, error } = await supabase
    .from('whatsapp_destinos')
    .select('*')
    .eq('ativo', true)
    .eq('tipo', 'grupo')
    .order('nome', { ascending: true });

  if (error) throw error;
  return (data || []) as WhatsappDestino[];
}

export async function listGrupoNotificacoes(): Promise<WhatsappGrupoNotificacao[]> {
  const { data, error } = await supabase
    .from('whatsapp_grupo_notificacoes')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as WhatsappGrupoNotificacao[];
}

export async function createGrupoNotificacao(
  input: WhatsappGrupoNotificacaoInput
): Promise<WhatsappGrupoNotificacao> {
  const payload = normalizeGrupoPayload({
    ...input,
    ativo: input.ativo ?? false,
  });

  const { data, error } = await supabase
    .from('whatsapp_grupo_notificacoes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsappGrupoNotificacao;
}

export async function updateGrupoNotificacao(
  id: string,
  patch: GrupoNotificacaoPatch
): Promise<WhatsappGrupoNotificacao> {
  const payload = normalizeGrupoPayload(patch);
  const { data, error } = await supabase
    .from('whatsapp_grupo_notificacoes')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsappGrupoNotificacao;
}

export async function toggleGrupoNotificacao(
  id: string,
  ativo: boolean
): Promise<WhatsappGrupoNotificacao> {
  const { data, error } = await supabase
    .from('whatsapp_grupo_notificacoes')
    .update({ ativo })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsappGrupoNotificacao;
}

export async function deleteGrupoNotificacao(id: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_grupo_notificacoes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
