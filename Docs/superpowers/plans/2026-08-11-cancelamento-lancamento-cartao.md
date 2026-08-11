# Cancelamento de lançamento de cartão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor na fatura aberta o cancelamento auditado de um lançamento de cartão com motivo e escopo seguro.

**Architecture:** Reutilizar a RPC `financeiro_cartao_transacao_cancelar`, encapsulá-la em `services/cartoesService.ts` e adicionar no `TransacaoRow` uma ação com modal de confirmação. O modal diferencia lançamento unitário e grupo parcelado, mas não cria um caminho para apagar origem de recorrência.

**Tech Stack:** React 19, TypeScript, Supabase RPC, componentes semânticos existentes em `components/UI.tsx`, Node test runner e Vite.

---

### Task 1: Contratos de cancelamento

**Files:**
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`
- Modify: `supabase/migrations/financeiro_cartoes_backend.test.mjs`
- Modify: `types/cartoes.ts`

- [ ] **Step 1: Write the failing contract tests**

  Assert the cancel payload contains exactly `transacao_id` or `compra_parcelada_id` plus a trimmed `motivo`, and assert the existing RPC contract remains authenticated/service-role only and rejects non-open invoices and recurrence origins.

- [ ] **Step 2: Run the focused tests and observe RED**

  Run `node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs`.

  Expected result: the new payload/service contract is missing while all existing card contracts continue to pass.

- [ ] **Step 3: Add the minimal typed payload and response shapes**

  Define `FinanceiroCartaoTransacaoCancelarPayload` with `transacao_id?: string`, `compra_parcelada_id?: string`, and `motivo: string`, plus the existing JSON response shape used by the RPC.

- [ ] **Step 4: Re-run the focused tests**

  Run the same command and confirm the contract assertions pass.

- [ ] **Step 5: Commit the contract**

  Run `git add types/cartoes.ts components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs` and `git commit -m "test: definir contrato de cancelamento de cartao"`.

### Task 2: Serviço Supabase

**Files:**
- Modify: `services/cartoesService.ts`
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`

- [ ] **Step 1: Add the failing service-shape assertion**

  Assert that the service calls `supabase.rpc('financeiro_cartao_transacao_cancelar', { payload, ator: {} })`, trims the reason, and surfaces the RPC error without converting it into success.

- [ ] **Step 2: Run the service contract test and observe RED**

  Run `node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts` and confirm the service export is absent.

- [ ] **Step 3: Implement the service wrapper**

  Add `cancelarTransacaoCartao(payload)` next to the other card RPC wrappers. Require one scope identifier, trim the reason, call the RPC with `ator: {}`, and return the typed response through `friendlyRpcError`.

- [ ] **Step 4: Run the service contract test and confirm GREEN**

  Run `node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts`; the new assertion and all existing selector tests must pass.

- [ ] **Step 5: Commit the service**

  Run `git add services/cartoesService.ts components/cartoes/cartoesFaturasSelectors.test.ts` and `git commit -m "feat: expor cancelamento de transacao de cartao"`.

### Task 3: Ação na fatura

**Files:**
- Modify: `components/cartoes/FaturasCartaoPage.tsx`
- Modify: `components/UI.tsx` only if the existing dialog needs a non-breaking prop extension
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`

- [ ] **Step 1: Write failing UI contract assertions**

  Assert the row exposes `Cancelar lançamento` only for an open invoice, opens a confirmation with the current description/value, requires a non-empty reason, sends `transacao_id` for a single row, and sends `compra_parcelada_id` for the group option. Assert recurring-origin rows show the protected guidance instead of a delete action.

- [ ] **Step 2: Run the UI contract and observe RED**

  Run `node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts`; the action and handlers must be missing.

- [ ] **Step 3: Implement the row action and modal**

  Add local state for the selected transaction, scope, reason, and saving state. Render a semantic danger/outline action in open invoices, keep it hidden for closed/paid/cancelled invoices, and render the existing `ConfirmDialog`/modal primitives with `Cancelar` and `Confirmar cancelamento`. On success call the existing reload path; on error retain the modal and reason. If the transaction is a recurrence origin, render the explanation to end the rule and record an adjustment/estorno instead of invoking the cancellation RPC.

- [ ] **Step 4: Run focused tests and typecheck**

  Run the selector/contract test and `npm run typecheck`. Fix implementation errors without widening the scope.

- [ ] **Step 5: Commit the UI**

  Run `git add components/cartoes/FaturasCartaoPage.tsx components/UI.tsx components/cartoes/cartoesFaturasSelectors.test.ts` and `git commit -m "feat: permitir cancelar lancamento na fatura"`.

### Task 4: Full verification and handoff

**Files:**
- No additional source files.

- [ ] **Step 1: Run the complete card/backend suite**

  Run `node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs` and require zero failures.

- [ ] **Step 2: Run the PostgreSQL fixture**

  Run `node supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs` and require `PASS: PostgreSQL 17` plus `rollback_sentinel_rows=0`.

- [ ] **Step 3: Run typecheck and production build**

  Run `npm run typecheck` and `node node_modules/vite/bin/vite.js build`, recording the known Deno `path` workaround if `npm run build` is invoked under Deno.

- [ ] **Step 4: Browser smoke without destructive data**

  Open an authenticated preview, open an existing fatura, show the cancel action and modal, verify reason validation and both scope labels, then cancel the modal without submitting. Do not delete a real launch during QA.

- [ ] **Step 5: Commit and push main**

  Run `git diff --check`, `git status --short`, `git add` the implementation files, `git commit -m "feat: cancelar lancamento de cartao pela fatura"`, and `git push origin main`.
