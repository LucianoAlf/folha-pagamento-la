# Folha de Pagamento em Contas a Pagar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a edição, exibição e agregação das obrigações de folha e fazer novos fechamentos vencerem no dia 10 da competência.

**Architecture:** O frontend reconhece `folha_pagamento` como obrigação gerada sem plano, preserva seus campos fiscais e permite apenas ajustes operacionais. Uma migration `CREATE OR REPLACE` mantém a RPC existente e troca exclusivamente a data de vencimento gerada. As Edge Functions usam a mesma regra anti-dupla-contagem do frontend.

**Tech Stack:** React 19, TypeScript, Supabase/PostgreSQL, Deno Edge Functions, Node test runner, Vite.

---

### Task 1: Regressões automatizadas

**Files:**
- Modify: `components/contas/EditarContaModal.codigoMes.test.ts`
- Modify: `components/contas/planoContasSelectors.test.ts`
- Modify: `components/contas/ContasTable.codigoMes.test.ts`
- Create: `components/contas/PagarContaModal.folhaPagamento.test.ts`
- Create: `components/contas/ContasPagarPage.folhaPagamento.test.ts`
- Modify: `supabase/migrations/financeiro_cartoes_backend.test.mjs`
- Modify: `supabase/migrations/folha_fechar_contas_pagar.test.mjs`

- [ ] Escrever testes para tipo fixo, plano opcional, valor bloqueado, labels e exclusão das agregações.
- [ ] Executar os testes focados e confirmar que falham pela ausência do tratamento de `folha_pagamento`.

### Task 2: Tratamento de `folha_pagamento` no frontend

**Files:**
- Modify: `types/contasPagar.ts`
- Modify: `components/contas/EditarContaModal.tsx`
- Modify: `components/contas/PagarContaModal.tsx`
- Modify: `components/contas/ContasTable.tsx`
- Modify: `components/contas/planoContasSelectors.ts`
- Modify: `components/contas/ContasPagarPage.tsx`

- [ ] Adicionar `folha_pagamento` ao tipo TypeScript.
- [ ] Preservar campos gerados e expor somente vencimento, observações, código/PIX e lembretes.
- [ ] Exibir labels e badges de folha em todos os pontos relevantes.
- [ ] Excluir a obrigação das agregações por plano no frontend.
- [ ] Executar os testes focados e confirmar passagem.

### Task 3: Vencimento e Edge Functions

**Files:**
- Create: `supabase/migrations/20260715_2_folha_vencimento_dia_10.sql`
- Modify: `supabase/functions/ai-contas-auditoria/index.ts`
- Modify: `supabase/functions/ai-contas-comparativo/index.ts`

- [ ] Redefinir `folha_fechar` preservando o corpo auditado e usando dia 10 da competência como vencimento.
- [ ] Adicionar `folha_pagamento` aos tipos e filtros anti-dupla-contagem das duas Edge Functions.
- [ ] Executar os testes de migration e Edge.
- [ ] Aplicar a migration e redeployar as duas funções com `verify_jwt=false`, preservando a autenticação interna existente.

### Task 4: Verificação e entrega

**Files:**
- Verify all modified files.

- [x] Executar `node --test`, `npm run typecheck`, `npm run build` e `git diff --check`.
- [x] Validar o modal no Agent Browser em desktop/mobile e claro/escuro.
- [x] Confirmar o banco vivo e as versões das Edge Functions.
- [x] Buscar atualizações remotas, revisar o diff, criar commit e enviar `main`.
