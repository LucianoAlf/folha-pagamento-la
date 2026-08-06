import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInterviewGuideDraft,
  consumeInterviewGuideDraft,
  consumeInterviewGuideDraftForCandidate,
  groupInterviewGuideQuestions,
  INTERVIEW_GUIDE_STORAGE_PREFIX,
} from './interviewGuideModel.ts';

const candidateId = 'candidato-123';

test('prepares a one-time draft with no more than three conductors', () => {
  const draft = buildInterviewGuideDraft({
    candidateId,
    data: '2026-08-06',
    horario: '14:30',
    local: 'Sala 2',
    condutores: ['Ana', 'Luciano', 'Maria', 'Ignorado'],
  });

  assert.match(draft.storageKey, new RegExp(`^${INTERVIEW_GUIDE_STORAGE_PREFIX}`));
  assert.deepEqual(draft.payload, {
    candidateId,
    data: '2026-08-06',
    horario: '14:30',
    local: 'Sala 2',
    condutores: ['Ana', 'Luciano', 'Maria'],
  });
});

test('consumes the guide draft only once and only for the matching candidate', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const draft = buildInterviewGuideDraft({ candidateId, data: '2026-08-06' });
  storage.setItem(draft.storageKey, JSON.stringify(draft.payload));

  assert.deepEqual(consumeInterviewGuideDraft(storage, draft.storageKey, candidateId), draft.payload);
  assert.equal(storage.getItem(draft.storageKey), null);
  assert.equal(consumeInterviewGuideDraft(storage, draft.storageKey, candidateId), null);
});

test('finds the copied session draft without putting metadata in the URL', () => {
  const entries = new Map<string, string>();
  const storage = {
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
  const other = buildInterviewGuideDraft({ candidateId: 'outro', data: '2026-08-06' });
  const expected = buildInterviewGuideDraft({ candidateId, data: '2026-08-06', local: 'Sala 2' });
  storage.setItem(other.storageKey, JSON.stringify(other.payload));
  storage.setItem(expected.storageKey, JSON.stringify(expected.payload));

  assert.deepEqual(consumeInterviewGuideDraftForCandidate(storage, candidateId), expected.payload);
  assert.equal(storage.getItem(expected.storageKey), null);
  assert.notEqual(storage.getItem(other.storageKey), null);
});

test('groups canonical pillars, omits historical signals and never returns anchors', () => {
  const groups = groupInterviewGuideQuestions([
    { pilar: 'comportamental', pergunta: 'Conte um caso.', ancora: 'dado privado', titulo_curto: 'Caso concreto' },
    { pilar: 'cultura', pergunta: 'Como colaborou?', ancora: 'dado privado' },
    { pilar: 'tecnica', pergunta: 'Como prioriza?', ancora: 'dado privado', sinal_consistencia: 'Contexto, acao e resultado.', sinal_atencao: 'Sem exemplo concreto.' },
  ]);

  assert.deepEqual(groups.map((group) => group.label), ['Comportamental', 'Cultura e colaboração', 'Técnico da vaga']);
  assert.equal(groups[0].questions[0].tituloCurto, 'Caso concreto');
  assert.equal(groups[1].questions[0].sinalConsistencia, null);
  assert.equal(groups[2].questions[0].sinalAtencao, 'Sem exemplo concreto.');
  assert.doesNotMatch(JSON.stringify(groups), /dado privado/);
});
