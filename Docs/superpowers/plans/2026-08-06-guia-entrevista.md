# Guia de Entrevista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o guia de entrevista A4 autenticado e imprimivel a partir do roteiro salvo do candidato.

**Architecture:** Extrair utilitarios puros para normalizar perguntas e montar o payload efemero; estender o contrato da Edge Function; adicionar uma rota de impressao reconhecida pelo resolvedor de navegacao; montar modal e documento como componentes React independentes.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Edge Functions, CSS print.

---

### Task 1: Modelo e contrato de perguntas

**Files:**
- Modify: `types/rh.ts`
- Modify: `supabase/functions/_shared/interview-question-schema.mjs`
- Modify: `supabase/functions/rh-ai-perguntas-entrevista/index.ts`
- Test: `supabase/functions/rh-ai-perguntas-entrevista/index.test.ts`

- [ ] Escrever teste que rejeita sinal acima de 90 caracteres e aceita roteiro historico sem campos novos.
- [ ] Executar o teste e confirmar falha pelo contrato ausente.
- [ ] Incluir os tres campos no schema, no prompt e na normalizacao; truncar somente os sinais antes de persistir.
- [ ] Executar o teste novamente.

### Task 2: Utilitarios de guia e testes

**Files:**
- Create: `components/rh-jornada/candidates/interviewGuideModel.ts`
- Create: `components/rh-jornada/candidates/interviewGuideModel.test.ts`
- Modify: `types/rh.ts`

- [ ] Escrever testes para titulo neutro, mapeamento dos pilares, omissao de sinais historicos e payload de ate tres condutores.
- [ ] Executar o teste e confirmar falha por modulo inexistente.
- [ ] Implementar modelo puro, limites e chave aleatoria de sessionStorage.
- [ ] Executar o teste novamente.

### Task 3: Rota autenticada e documento

**Files:**
- Create: `components/rh-jornada/candidates/InterviewGuidePage.tsx`
- Create: `components/rh-jornada/candidates/InterviewGuidePage.test.ts`
- Modify: `components/navigationLocation.ts`
- Modify: `App.tsx`
- Modify: `services/rhJornadaService.ts`

- [ ] Escrever testes para reconhecer a rota de guia e para nao renderizar ancora nem dados de perfil.
- [ ] Executar os testes e confirmar falha.
- [ ] Criar busca por ID e pagina isolada com CSS de impressao, logo publica e reimpressao.
- [ ] Executar os testes novamente.

### Task 4: Modal e gatilho a partir de Candidatos

**Files:**
- Create: `components/rh-jornada/candidates/InterviewGuideModal.tsx`
- Modify: `components/rh-jornada/tabs/CandidatosTab.tsx`
- Test: `components/rh-jornada/candidates/interviewGuideModel.test.ts`

- [ ] Escrever teste para aviso de roteiro desatualizado e consumo unico de payload.
- [ ] Executar o teste e confirmar falha.
- [ ] Adicionar botao condicionado, modal, confirmacao de desatualizacao e abertura sincrona da aba.
- [ ] Executar os testes novamente.

### Task 5: Verificacao e publicacao

**Files:**
- Verify: arquivos acima

- [ ] Rodar testes especificos, `npm run typecheck` e `npm run build`.
- [ ] Rodar o app e inspecionar a rota no Chrome com roteiro longo; conferir paginas, faixa, ausencia de quebra e impressao unica.
- [ ] Gerar guia da candidata Vitoria de Andrade da Silva somente apos a verificacao e disponibilizar o PDF para aprovacao.
- [ ] Commitar, enviar a `main` e verificar a publicacao.
