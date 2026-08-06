# Financeiro e RH Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reduzir bloqueios no primeiro quadro de Folha, Contas a Pagar, Cartões e Férias, com cancelamento e recuperação sem alterar dados de negócio.

**Architecture:** dados indispensáveis continuam a usar os contratos atuais; referências usadas apenas em filtros e modais são carregadas depois do primeiro quadro. Um utilitário compartilhado cancela leituras Supabase penduradas após 10 s e os componentes exibem skeleton local em vez do spinner global.

**Tech Stack:** React 19, TypeScript, Supabase JS, fetch com AbortController, Node test runner, Vite.

---

### Task 1: Reaproveitar o contrato de leituras canceláveis

**Files:**
- Modify: `services/rhReadResilience.ts`
- Modify: `services/rhReadResilience.test.ts`

- [ ] **Step 1: Escrever testes para sucesso, timeout que chama `abort()` e propagação de erro não relacionado a timeout.**
- [ ] **Step 2: Rodar o teste e confirmar falha pelo novo contrato ausente.**
- [ ] **Step 3: Manter `fetchRhRead` como utilitário compartilhado de leituras REST, sem criar um segundo helper paralelo.**
- [ ] **Step 4: Rodar o teste e confirmar verde.**

### Task 2: Tornar a Folha resiliente a timeout transitório

**Files:**
- Modify: `services/api.ts`
- Modify: `App.tsx`
- Test: `services/supabaseReadResilience.test.mjs`

- [ ] **Step 1: Declarar em teste que `fetchColaboradores`, `fetchFolhasMensais` e `fetchLancamentos` passam o `signal` do utilitário ao `fetch`.**
- [ ] **Step 2: Aplicar o utilitário sem alterar URLs, headers, ordenação ou formatos dos dados.**
- [ ] **Step 3: Confirmar que a carga de colaboradores permanece não bloqueante no bootstrap e que falha secundária não substitui a Folha já aberta por erro global.**
- [ ] **Step 4: Rodar os testes de Folha e typecheck.**

### Task 3: Carregamento progressivo de Contas a Pagar

**Files:**
- Modify: `components/contas/ContasPagarPage.tsx`
- Create: `components/contas/ContasPagarPage.performance.test.mjs`

- [ ] **Step 1: Escrever teste que exige contas como leitura crítica, referências em segundo plano e ausência de `LoadingSpinner` como retorno global.**
- [ ] **Step 2: Executar o teste e confirmar falha.**
- [ ] **Step 3: Buscar contas primeiro; preencher referências de filtros/modais em uma promessa separada, com estados próprios de disponibilidade.**
- [ ] **Step 4: Renderizar skeleton de resumo/lista enquanto as contas críticas chegam e manter `ErrorState` para falha crítica.**
- [ ] **Step 5: Rodar teste específico e contratos existentes de Contas a Pagar.**

### Task 4: Carregamento progressivo de Cartões

**Files:**
- Modify: `services/cartoesService.ts`
- Modify: `components/cartoes/CartoesPage.tsx`
- Create: `components/cartoes/CartoesPage.performance.test.mjs`

- [ ] **Step 1: Escrever teste que separa cartões/faturas das referências de modal e exige `abortSignal(signal)` nas leituras Supabase.**
- [ ] **Step 2: Executar o teste e confirmar falha.**
- [ ] **Step 3: Expor carregadores crítico e de referências no serviço, usando o utilitário cancelável no componente.**
- [ ] **Step 4: Substituir o spinner global por skeleton de cartões e manter os botões que exigem referência indisponíveis até a carga terminar.**
- [ ] **Step 5: Rodar teste específico e typecheck.**

### Task 5: Separar dados de Férias e reduzir recarga por filtro

**Files:**
- Modify: `components/ferias/FeriasPage.tsx`
- Modify: `services/feriasService.ts`
- Create: `components/ferias/FeriasPage.performance.test.mjs`

- [ ] **Step 1: Escrever teste que exige debounce da busca e impede que a carga de programações dependa de filtro de colaborador.**
- [ ] **Step 2: Executar o teste e confirmar falha.**
- [ ] **Step 3: Aplicar debounce de busca, manter programações em carregamento separado e recarregá-las somente após mutações de programação.**
- [ ] **Step 4: Aplicar a leitura resiliente na consulta de programações.**
- [ ] **Step 5: Rodar teste específico e testes operacionais de Férias.**

### Task 6: Verificação integrada

**Files:**
- Verify: `App.tsx`, `components/contas/ContasPagarPage.tsx`, `components/cartoes/CartoesPage.tsx`, `components/ferias/FeriasPage.tsx`

- [ ] **Step 1: Rodar testes de performance e contratos relacionados.**
- [ ] **Step 2: Rodar `npm run typecheck`, `npm run build` e `git diff --check`.**
- [ ] **Step 3: Abrir produção autenticada e confirmar que Folha, Contas a Pagar, Cartões e Férias mostram dados reais, sem spinner indefinido nem erros de console.**
- [ ] **Step 4: Revisar o diff, solicitar revisão independente, commitar e publicar diretamente na `main`.**
