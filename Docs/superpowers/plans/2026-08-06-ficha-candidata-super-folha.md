# Fluxo de Ficha da Candidata no Super Folha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar e administrar o link da Ficha Técnica inteiramente no Super Folha, sem token manual nem cadastros concorrentes.

**Architecture:** O formulário grava a unidade canônica no candidato e no processo de recrutamento. Uma Edge Function RH chama a criação idempotente do LA Report e grava somente o ponteiro seguro no Super Folha. O card deriva seus estados desse vínculo e usa a importação existente para verificar a resposta.

**Tech Stack:** React 19, TypeScript, Supabase Edge Functions/Deno, Postgres, Vite.

---

### Task 1: Versionar o contrato já publicado

**Files:**
- Create: `supabase/migrations/20260806172315_rh_candidatos_ficha_vinculo_e_unidade.sql`
- Create: `D:/2026/LA-performance-report/supabase/functions/ficha-criar-pessoa/index.ts`
- Create: `D:/2026/LA-performance-report/supabase/migrations/20260806170147_ficha_criar_pessoa_idempotente.sql`
- Create: `D:/2026/LA-performance-report/supabase/migrations/20260806170735_ficha_criar_pessoa_lock_concorrencia.sql`
- Create: `D:/2026/LA-performance-report/supabase/migrations/20260806170820_ficha_criar_pessoa_unidade_uuid.sql`

- [ ] Registrar exatamente as colunas, CHECK e índices já aplicados no Super Folha, sem reaplicá-los.
- [ ] Registrar a Edge Function e migrations históricas já publicadas no LA Report, sem executar `db push`.

### Task 2: Testes de contrato do novo fluxo

**Files:**
- Create: `services/rhFichaFluxo.contract.test.mjs`

- [ ] Escrever teste vermelho para exigir unidade canônica, criação idempotente por origem, recuperação de link legado sem data inventada e remoção do token manual da UI.
- [ ] Executar `node --test services/rhFichaFluxo.contract.test.mjs` e confirmar a falha por comportamento ainda ausente.

### Task 3: Implementar a ponte segura e o formulário

**Files:**
- Create: `supabase/functions/rh-ficha-gerar-link/index.ts`
- Modify: `supabase/functions/_shared/rh-auth.ts`
- Modify: `types/rh.ts`
- Modify: `services/rhJornadaService.ts`
- Modify: `components/rh-jornada/candidates/CandidateFormModal.tsx`
- Modify: `components/rh-jornada/tabs/CandidatosTab.tsx`

- [ ] Mapear `bar`, `cg` e `rec` para o nome do LA Report somente na Edge Function.
- [ ] Para token existente, retornar ou reconstruir o link sem chamar o LA Report e sem preencher uma data que não existe.
- [ ] Para vínculo legado incompleto, retornar estado explícito e não criar outro token.
- [ ] Para vínculo ausente, chamar o endpoint LA Report com `origem_sistema=super_folha` e `origem_ref=candidato.id` e persistir token, id e link.
- [ ] Exigir unidade no modal e propagar o código ao processo de recrutamento.
- [ ] Substituir o campo manual por estados Gerar link, Copiar/Abrir WhatsApp/Verificar resposta e o estado respondido atual.
- [ ] Reexecutar o teste de contrato e obter verde.

### Task 4: Ajustar a única porta de candidatos e publicar

**Files:**
- Modify: `D:/2026/LA-performance-report/src/components/App/Time/ModalAdicionarPessoa.tsx`

- [ ] Remover a situação candidato do modal do LA Report, mantendo as pessoas já do time.
- [ ] Executar typecheck/build nos dois repositórios e testes direcionados.
- [ ] Publicar a Edge Function do Super Folha, configurar as duas URLs no Vault, commitar e enviar ambas as `main`.

### Task 5: E2E real e controlado

- [ ] Criar uma candidata de teste com unidade e telefone fictício.
- [ ] Acionar gerar link duas vezes e confirmar token/link idênticos.
- [ ] Abrir a ficha, responder sem dados comportamentais de terceiros, verificar/importar, gerar perguntas e guia.
- [ ] Verificar visualmente os estados na interface publicada e registrar qualquer limite externo não exercitável sem transmitir o link pelo WhatsApp.
