import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

type WhatsappSendPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
  [key: string]: unknown;
};

const readJsonResponse = async (response: Response): Promise<WhatsappSendPayload> => {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as WhatsappSendPayload;
  } catch {
    return { error: raw.slice(0, 500) };
  }
};

const formatWhatsappError = (payload: WhatsappSendPayload, status?: number) => {
  const details = payload.details && typeof payload.details === 'object'
    ? (payload.details as { error?: unknown; message?: unknown })
    : null;
  const detail =
    payload.error ||
    payload.message ||
    (typeof details?.error === 'string' ? details.error : null) ||
    (typeof details?.message === 'string' ? details.message : null) ||
    (typeof payload.details === 'string' ? payload.details : null) ||
    'Falha ao enviar mensagem';

  return status ? `Erro ${status}: ${detail}` : detail;
};

export async function sendWhatsappMessage(numero: string, mensagem: string): Promise<WhatsappSendPayload> {
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
    body: JSON.stringify({ numero, mensagem }),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok || !payload.success) {
    throw new Error(formatWhatsappError(payload, response.ok ? undefined : response.status));
  }

  return payload;
}
