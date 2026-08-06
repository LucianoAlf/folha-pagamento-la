# Dashboard RH Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reduzir o primeiro carregamento do Dashboard RH a uma RPC RLS-safe e apresentar um estado de carregamento recuperável.

**Architecture:** uma função `SECURITY INVOKER` agrega o primeiro quadro com `auth.uid()` e mantém todas as leituras sob RLS. O frontend troca a cascata de consultas por esse contrato único; IA e saúde de desenvolvimento continuam assíncronas e não bloqueantes.

**Tech Stack:** PostgreSQL/Supabase RLS, React 19, TypeScript, Node test runner, Vite.

---

### Task 1: Fixar contratos em testes vermelhos

**Files:**
- Create: `supabase/migrations/20260805_5_rh_dashboard_bootstrap_performance.test.mjs`
- Modify: `services/rhJornadaService.operacional.test.mjs`
- Create: `components/rh-jornada/tabs/DashboardTab.performance.test.mjs`

- [ ] **Step 1: Declarar que a migration cria uma RPC invocadora e os três índices de leitura.**
- [ ] **Step 2: Executar `node --test supabase/migrations/20260805_5_rh_dashboard_bootstrap_performance.test.mjs` e confirmar falha pela migration ausente.**
- [ ] **Step 3: Declarar que o serviço chama somente `rh_dashboard_bootstrap` para o primeiro quadro e não usa `fetchCurrentUserContext`.**
- [ ] **Step 4: Executar `node --test services/rhJornadaService.operacional.test.mjs components/rh-jornada/tabs/DashboardTab.performance.test.mjs` e confirmar falha pelos métodos ausentes.**

### Task 2: Implementar o contrato do banco

**Files:**
- Create: `supabase/migrations/20260805_5_rh_dashboard_bootstrap_performance.sql`

- [ ] **Step 1: Criar `rh_dashboard_bootstrap()` como função SQL `STABLE SECURITY INVOKER`, sem argumentos, com `auth.uid()` e JSON limitado.**
- [ ] **Step 2: Revogar execução de `PUBLIC` e `anon`; conceder somente a `authenticated`.**
- [ ] **Step 3: Criar `IF NOT EXISTS` indexes para `(user_id, processo_id)`, `(user_id, etapa_id)` e `created_at DESC`.**
- [ ] **Step 4: Executar os testes de migration e confirmar verde.**

### Task 3: Usar o bootstrap no Dashboard

**Files:**
- Modify: `types/rh.ts`
- Modify: `services/rhJornadaService.ts`
- Modify: `components/rh-jornada/tabs/DashboardTab.tsx`

- [ ] **Step 1: Criar o tipo do payload da RPC com os seis grupos de dados existentes.**
- [ ] **Step 2: Implementar `fetchDashboardBootstrap()` com uma única RPC e normalização de listas nulas.**
- [ ] **Step 3: Substituir o `Promise.all` inicial pela chamada única, mantendo IA e saúde em segundo plano.**
- [ ] **Step 4: Renderizar skeleton do próprio Dashboard durante a primeira carga; manter `ErrorState` com retry.**
- [ ] **Step 5: Executar contratos de serviço/componente e confirmar verde.**

### Task 4: Verificar segurança e operação

**Files:**
- Verify: `supabase/migrations/20260805_5_rh_dashboard_bootstrap_performance.sql`
- Verify: `components/rh-jornada/tabs/DashboardTab.tsx`

- [ ] **Step 1: Simular `authenticated` com JWT de RH e usuário comum numa transação revertida e confirmar que a RPC respeita a quantidade de dados permitida por RLS.**
- [ ] **Step 2: Rodar todos os testes RH, `npm run typecheck` e `npm run build`.**
- [ ] **Step 3: Aplicar a migration, abrir a produção autenticada, validar Dashboard e troca de abas, e medir que o spinner global não é mais o único feedback.**
- [ ] **Step 4: Revisar diff, commitar e publicar diretamente na `main` após todas as evidências.**
