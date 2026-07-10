# Conta Pagadora no Colaborador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma conta pagadora nullable ao colaborador e permitir que a Rose identifique, filtre e preencha os cadastros pendentes sem alterar o fechamento da folha.

**Architecture:** A migration adiciona `conta_pagadora_id` com FK para `financeiro_contas_bancarias`. O frontend reutiliza o lookup financeiro existente, mantem filtros em helpers puros testaveis e passa as contas ativas aos formularios mobile e desktop.

**Tech Stack:** PostgreSQL/Supabase migrations, React 18, TypeScript, Node test runner, Tailwind e componentes compartilhados do Super Folha.

---

### Task 1: Migration aditiva

**Files:**
- Create: `supabase/migrations/20260710_1_colaboradores_conta_pagadora.sql`
- Create: `supabase/migrations/colaboradores_conta_pagadora.test.mjs`

- [ ] Escrever teste estatico exigindo coluna nullable, FK para `financeiro_contas_bancarias`, indice e ausencia de `UPDATE`.
- [ ] Rodar `node --test supabase/migrations/colaboradores_conta_pagadora.test.mjs` e confirmar falha por arquivo ausente.
- [ ] Criar a migration idempotente, sem backfill.
- [ ] Rodar o teste novamente e confirmar sucesso.
- [ ] Aplicar somente essa migration com `apply_migration` no projeto `ubdvtjbitozhkuvvqkxj`.
- [ ] Auditar no banco vivo coluna, FK, nullable, indice e zero valores preenchidos.

### Task 2: Seletores testaveis da conta pagadora

**Files:**
- Create: `components/colaboradores/contaPagadoraSelectors.ts`
- Create: `components/colaboradores/contaPagadoraSelectors.test.ts`

- [ ] Escrever testes para rotulo de conta, contagem de ativos sem conta e filtro `missing`.
- [ ] Rodar o teste e confirmar falha porque o helper ainda nao existe.
- [ ] Implementar os helpers minimos usando `FinanceiroContaBancaria` e `Colaborador`.
- [ ] Rodar o teste e confirmar sucesso.

### Task 3: Carregar contas e integrar filtros

**Files:**
- Modify: `types.ts`
- Modify: `App.tsx`

- [ ] Adicionar teste estatico garantindo que `Colaborador` possui `conta_pagadora_id` e que a aba usa `fetchFinanceiroContasBancarias`.
- [ ] Rodar o teste e confirmar falha esperada.
- [ ] Adicionar o campo nullable ao tipo, carregar contas ativas e criar estado `all | missing`.
- [ ] Calcular indicador somente para colaboradores ativos e nao arquivados.
- [ ] Integrar o filtro aos controles mobile e desktop.
- [ ] Rodar testes e typecheck.

### Task 4: Campo nos formularios mobile e desktop

**Files:**
- Modify: `components/CollaboratorComponents.tsx`
- Modify: `components/colaboradores/MobileCollaboratorList.tsx`

- [ ] Escrever teste estatico cobrindo o campo nas duas variantes do formulario e ausencia de autoatribuicao.
- [ ] Rodar o teste e confirmar falha esperada.
- [ ] Passar contas pagadoras ao modal compartilhado e renderizar `CustomSelect` nas variantes mobile e desktop.
- [ ] Exibir de forma discreta a empresa/conta atual nos cards e lista mobile.
- [ ] Rodar os testes direcionados e confirmar sucesso.

### Task 5: Gates e smoke visual

**Files:**
- Verify all changed files.

- [ ] Rodar `node --test` e exigir zero falhas.
- [ ] Rodar `npm run typecheck`.
- [ ] Rodar `npm run build`.
- [ ] Rodar `git diff --check origin/main...HEAD`.
- [ ] Iniciar preview da worktree em porta livre.
- [ ] Validar no Agent Browser indicador, filtro, modal desktop e modal mobile sem salvar dados reais.
- [ ] Confirmar no banco que nenhum colaborador foi autoatribuido.
- [ ] Commitar, enviar a branch e abrir PR para auditoria sem mergear.
