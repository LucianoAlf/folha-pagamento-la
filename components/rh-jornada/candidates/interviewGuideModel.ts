import type { RhInterviewQuestion } from '../../../types/rh';

export const INTERVIEW_GUIDE_STORAGE_PREFIX = 'rh-interview-guide:';
const MAX_SIGNAL_LENGTH = 90;

export interface InterviewGuideDraftInput {
  candidateId: string;
  data: string;
  horario?: string;
  local?: string;
  condutores?: string[];
}

export interface InterviewGuideDraftPayload {
  candidateId: string;
  data: string;
  horario: string;
  local: string;
  condutores: string[];
}

export interface InterviewGuideDraft {
  storageKey: string;
  payload: InterviewGuideDraftPayload;
}

export interface InterviewGuideStorage {
  readonly length?: number;
  key?(index: number): string | null;
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface InterviewGuideQuestion {
  number: number;
  tituloCurto: string;
  pergunta: string;
  sinalConsistencia: string | null;
  sinalAtencao: string | null;
}

export interface InterviewGuideGroup {
  key: RhInterviewQuestion['pilar'];
  label: string;
  questions: InterviewGuideQuestion[];
}

const pillarLabels: Record<RhInterviewQuestion['pilar'], string> = {
  comportamental: 'Comportamental',
  cultura: 'Cultura e colaboração',
  tecnica: 'Técnico da vaga',
};

const cleanText = (value: unknown, maxLength?: number): string => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return maxLength ? text.slice(0, maxLength) : text;
};

const makeStorageKey = () => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${INTERVIEW_GUIDE_STORAGE_PREFIX}${random}`;
};

export function buildInterviewGuideDraft(input: InterviewGuideDraftInput): InterviewGuideDraft {
  return {
    storageKey: makeStorageKey(),
    payload: {
      candidateId: cleanText(input.candidateId),
      data: cleanText(input.data),
      horario: cleanText(input.horario),
      local: cleanText(input.local),
      condutores: (input.condutores ?? []).map((value) => cleanText(value)).filter(Boolean).slice(0, 3),
    },
  };
}

export function consumeInterviewGuideDraft(
  storage: InterviewGuideStorage,
  storageKey: string | null | undefined,
  candidateId: string,
): InterviewGuideDraftPayload | null {
  if (!storageKey?.startsWith(INTERVIEW_GUIDE_STORAGE_PREFIX)) return null;
  const raw = storage.getItem(storageKey);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as InterviewGuideDraftPayload;
    if (!payload || !cleanText(payload.data)) {
      storage.removeItem(storageKey);
      return null;
    }
    if (cleanText(payload.candidateId) !== cleanText(candidateId)) return null;
    const normalized = {
      candidateId: cleanText(payload.candidateId),
      data: cleanText(payload.data),
      horario: cleanText(payload.horario),
      local: cleanText(payload.local),
      condutores: Array.isArray(payload.condutores)
        ? payload.condutores.map((value) => cleanText(value)).filter(Boolean).slice(0, 3)
        : [],
    };
    storage.removeItem(storageKey);
    return normalized;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function consumeInterviewGuideDraftForCandidate(
  storage: InterviewGuideStorage,
  candidateId: string,
): InterviewGuideDraftPayload | null {
  if (typeof storage.length !== 'number' || !storage.key) return null;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key!(index)).filter(
    (key): key is string => Boolean(key?.startsWith(INTERVIEW_GUIDE_STORAGE_PREFIX)),
  );
  for (const key of keys) {
    const payload = consumeInterviewGuideDraft(storage, key, candidateId);
    if (payload) return payload;
  }
  return null;
}

export function groupInterviewGuideQuestions(questions: RhInterviewQuestion[]): InterviewGuideGroup[] {
  const byPillar = new Map<RhInterviewQuestion['pilar'], InterviewGuideQuestion[]>();
  let number = 0;
  for (const question of questions) {
    if (!(question.pilar in pillarLabels) || !cleanText(question.pergunta)) continue;
    number += 1;
    const items = byPillar.get(question.pilar) ?? [];
    items.push({
      number,
      tituloCurto: cleanText(question.titulo_curto) || `Pergunta ${number}`,
      pergunta: cleanText(question.pergunta),
      sinalConsistencia: cleanText(question.sinal_consistencia, MAX_SIGNAL_LENGTH) || null,
      sinalAtencao: cleanText(question.sinal_atencao, MAX_SIGNAL_LENGTH) || null,
    });
    byPillar.set(question.pilar, items);
  }
  return (Object.keys(pillarLabels) as RhInterviewQuestion['pilar'][])
    .map((key) => ({ key, label: pillarLabels[key], questions: byPillar.get(key) ?? [] }))
    .filter((group) => group.questions.length > 0);
}
