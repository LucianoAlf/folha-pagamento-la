export const MAX_HUMAN_NOTE_LENGTH = 2_000;
export const MAX_AI_DRAFT_LENGTH = 600;

export type MemoryStatus = 'pendente' | 'justificada' | 'corrigir_lancamento' | 'monitorar';
export type StoredMemoryStatus = MemoryStatus | 'verificado' | null;

export type VariationIdentityInput = {
  unidade: string | null | undefined;
  planoContaId: string | null | undefined;
  recorrenteModeloId: string | null | undefined;
  descricao: string | null | undefined;
};

export type VariationIdentity = VariationIdentityInput & {
  anomalyKey: string;
  contaId: string | null;
};

export type MemoryNoteLike = {
  anomaly_key: string;
  unidade: string;
  plano_conta_id?: string | null;
  recorrente_modelo_id?: string | null;
  conta_id?: string | null;
  nota: string;
  status: StoredMemoryStatus;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function buildVariationKey(input: VariationIdentityInput): string {
  const unidade = input.unidade || 'todas';
  const plano = input.planoContaId || 'sem_plano';
  const recorrente = input.recorrenteModeloId;
  return `${unidade}|${plano}|${recorrente ? `modelo:${recorrente}` : `desc:${normalizeText(input.descricao)}`}`;
}

export function normalizeMemoryStatus(status: StoredMemoryStatus | string | undefined): MemoryStatus | null {
  if (status === 'verificado') return 'justificada';
  if (status === 'pendente' || status === 'justificada' || status === 'corrigir_lancamento' || status === 'monitorar') return status;
  return null;
}

export function truncateAiDraft(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= MAX_AI_DRAFT_LENGTH) return text;
  return `${text.slice(0, MAX_AI_DRAFT_LENGTH - 1).trimEnd()}…`;
}

export function chooseMatchingNote(notes: MemoryNoteLike[], identity: VariationIdentity): MemoryNoteLike | null {
  const unidade = identity.unidade || 'todas';
  const exact = notes.find((note) => note.anomaly_key === identity.anomalyKey && note.unidade === unidade);
  if (exact) return exact;
  if (!identity.recorrenteModeloId) return null;
  return notes.find((note) =>
    note.unidade === unidade &&
    note.recorrente_modelo_id === identity.recorrenteModeloId &&
    note.plano_conta_id === (identity.planoContaId || null)
  ) || null;
}
