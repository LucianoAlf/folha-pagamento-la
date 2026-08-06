import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('a ponte de criação de ficha aceita somente unidades canônicas e é idempotente por candidato', () => {
  const source = read('supabase/functions/rh-ficha-gerar-link/index.ts');

  assert.match(source, /const UNIDADE_LA_REPORT: Record<string, string>/);
  assert.match(source, /bar:\s*['"]Barra['"]/);
  assert.match(source, /cg:\s*['"]Campo Grande['"]/);
  assert.match(source, /rec:\s*['"]Recreio['"]/);
  assert.match(source, /const origem_sistema\s*=\s*['"]super_folha['"]/);
  assert.match(source, /origem_sistema,\s*\n\s*origem_ref,/);
  assert.match(source, /const origem_ref\s*=\s*candidato\.id/);
  assert.match(source, /if \(candidato\.ficha_token\)/);
  assert.match(source, /if \(candidato\.la_colaborador_id\)/);
  assert.doesNotMatch(source, /console\.(log|error)\([^\n]*(link|token)/i);
});

test('o cadastro exige unidade e propaga o código ao processo de recrutamento', () => {
  const modal = read('components/rh-jornada/candidates/CandidateFormModal.tsx');
  const service = read('services/rhJornadaService.ts');

  assert.match(modal, /UNIDADE_OPTIONS/);
  assert.match(modal, /out\.push\(['"]Unidade['"]\)/);
  assert.match(modal, /unidade:\s*unidade/);
  assert.match(service, /unidade:\s*candidate\.unidade/);
});

test('o card não pede token manual e oferece os estados operacionais do link', () => {
  const tab = read('components/rh-jornada/tabs/CandidatosTab.tsx');
  const service = read('services/rhJornadaService.ts');

  assert.doesNotMatch(tab, /placeholder=["']Token da Ficha Técnica["']/);
  assert.match(tab, /Gerar link da Ficha Técnica/);
  assert.match(tab, /Abrir WhatsApp/);
  assert.match(tab, /Verificar resposta/);
  assert.match(service, /async generateCandidateFichaLink\(candidateId: string\)/);
});

test('o modal de pessoas do LA Report não cria mais candidatos', () => {
  const modal = readFileSync('D:/2026/LA-performance-report/src/components/App/Time/ModalAdicionarPessoa.tsx', 'utf8');
  assert.doesNotMatch(modal, /p_situacao:\s*['"]candidato['"]/);
  assert.match(modal, /p_situacao:\s*['"]ativo['"]/);
});

test('a nova aba do guia consome seu rascunho e a aba de origem o limpa imediatamente', () => {
  const modal = read('components/rh-jornada/candidates/InterviewGuideModal.tsx');
  const page = read('components/rh-jornada/candidates/InterviewGuidePage.tsx');

  assert.match(modal, /window\.sessionStorage\.setItem\(draft\.storageKey,/);
  assert.match(modal, /window\.open\(`\/rh\/candidatos\//);
  assert.ok(
    modal.indexOf('window.sessionStorage.removeItem(draft.storageKey)') > modal.indexOf('const guide = window.open'),
    'a aba de origem precisa remover os metadados logo após abrir a guia',
  );
  assert.ok(
    modal.indexOf('window.sessionStorage.removeItem(draft.storageKey)') < modal.indexOf('if (!guide)'),
    'a limpeza deve ocorrer mesmo quando o pop-up for bloqueado',
  );
  assert.match(page, /consumeInterviewGuideDraftForCandidate\(window\.sessionStorage, candidateId\)/);
});
