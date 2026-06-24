import type {
  WhatsappDestino,
  WhatsappDestinoInput,
  WhatsappDestinoPatch,
  WhatsappGrupoDisponivel,
  WhatsappGrupoNotificacao,
  WhatsappGrupoNotificacaoFrequencia,
  WhatsappGrupoNotificacaoInput,
} from '../types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

type GrupoNotificacaoPatch = Partial<Omit<WhatsappGrupoNotificacaoInput, 'destino_id' | 'tipo'>> & {
  frequencia?: WhatsappGrupoNotificacaoFrequencia;
};

type WhatsappFunctionPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
  grupos?: WhatsappGrupoDisponivel[];
  [key: string]: unknown;
};

const TESTE_VINCULO_MENSAGEM =
  '✅ Teste de vínculo — aqui é a Maria. Se você está vendo isso, o vínculo deste grupo está ok.';

const readJsonResponse = async (response: Response): Promise<WhatsappFunctionPayload> => {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as WhatsappFunctionPayload;
  } catch {
    return { error: raw.slice(0, 500) };
  }
};

const formatFunctionError = (payload: WhatsappFunctionPayload, status?: number) => {
  const details = payload.details && typeof payload.details === 'object'
    ? (payload.details as { error?: unknown; message?: unknown })
    : null;
  const detail =
    payload.error ||
    payload.message ||
    (typeof details?.error === 'string' ? details.error : null) ||
    (typeof details?.message === 'string' ? details.message : null) ||
    (typeof payload.details === 'string' ? payload.details : null) ||
    'Falha na chamada da funcao';

  return status ? `Erro ${status}: ${detail}` : detail;
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

export async function listGruposDisponiveis(): Promise<WhatsappGrupoDisponivel[]> {
  const { data, error } = await supabase.functions.invoke('whatsapp-grupos-disponiveis', {
    body: {},
  });

  if (error) throw error;
  const payload = (data || {}) as WhatsappFunctionPayload;
  if (!payload.success) {
    throw new Error(formatFunctionError(payload));
  }

  return (payload.grupos || [])
    .filter((grupo) => grupo?.jid)
    .map((grupo) => ({
      jid: String(grupo.jid).trim(),
      nome: String(grupo.nome || grupo.jid).trim(),
    }));
}

export async function testarVinculo(jid: string): Promise<WhatsappFunctionPayload> {
  const destino = String(jid || '').trim();
  if (!destino) throw new Error('JID do grupo ausente.');

  const { data: currentSession } = await supabase.auth.getSession();
  let token = currentSession.session?.access_token;

  if (token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token || token;
  }

  if (!token) {
    throw new Error('Sessao expirada. Faca login novamente para enviar o teste.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      numero: destino,
      tipo: 'grupo',
      mensagem: TESTE_VINCULO_MENSAGEM,
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok || !payload.success) {
    throw new Error(formatFunctionError(payload, response.ok ? undefined : response.status));
  }

  return payload;
}

export async function createDestino(input: WhatsappDestinoInput): Promise<WhatsappDestino> {
  const { data, error } = await supabase
    .from('whatsapp_destinos')
    .insert({
      ...input,
      tipo: input.tipo,
      unidade: input.unidade ?? 'geral',
      ativo: input.ativo ?? true,
      observacao: input.observacao ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsappDestino;
}

export async function updateDestino(
  id: string,
  patch: WhatsappDestinoPatch
): Promise<WhatsappDestino> {
  const { data, error } = await supabase
    .from('whatsapp_destinos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsappDestino;
}

export async function deleteDestino(id: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_destinos')
    .delete()
    .eq('id', id);

  if (error) throw error;
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
