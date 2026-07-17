# Bistrô Mobile e Contraste Dark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o cabeçalho e a lista de consumos do Bistrô claros no dark mode e ergonomicos no mobile.

**Architecture:** Manter uma única fonte de dados e os mesmos handlers. Renderizar uma tabela somente no desktop e uma lista de itens somente no mobile; ajustar apenas a casca visual do cabeçalho e a nomenclatura da reconciliação.

**Tech Stack:** React, TypeScript, Tailwind, componentes compartilhados de `components/UI.tsx`, Node test runner.

---

### Task 1: Travar o comportamento esperado em testes

**Files:**
- Modify: `components/bistro/folhaBistroModel.test.ts`
- Modify: `components/bistro/folhaBistroUi.test.ts`

- [ ] Alterar o teste de reconciliação para exigir `pagoDireto` e `pagamentosDiretos`.
- [ ] Adicionar asserts estáticos para a lista `lg:hidden`, a tabela `hidden lg:block` e o texto `Pago diretamente ao Bistrô`.
- [ ] Executar `node --test components/bistro/folhaBistroModel.test.ts components/bistro/folhaBistroUi.test.ts` e confirmar falha pelo comportamento ainda ausente.

### Task 2: Corrigir a semântica da reconciliação

**Files:**
- Modify: `components/bistro/folhaBistroModel.ts`
- Modify: `components/bistro/BistroTab.tsx`

- [ ] Renomear a diferença entre consumo bruto e liquidação na folha para pagamento direto.
- [ ] Exibir `Pago diretamente ao Bistrô` e os nomes confirmados, sem alerta de pendência.
- [ ] Executar os testes focados e confirmar que passam.

### Task 3: Aplicar o layout mobile-first aprovado

**Files:**
- Modify: `components/bistro/BistroTab.tsx`

- [ ] Fortalecer o cabeçalho com tokens `surface-2` e `line-strong`.
- [ ] Organizar ações em grade responsiva sem alterar handlers.
- [ ] Renderizar itens mobile com nome, valor e botões de 40px ou mais.
- [ ] Manter a tabela atual em `lg` e acima.

### Task 4: Verificar de ponta a ponta

**Files:**
- Verify only.

- [ ] Executar a suíte completa com `node --test`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar `npm run build`.
- [ ] Executar `git diff --check`.
- [ ] Validar no Agent Browser desktop/mobile e claro/escuro, incluindo ausência de overflow horizontal.

### Task 5: Recolher a lista extensa de colaboradores

**Files:**
- Modify: `components/bistro/folhaBistroUi.test.ts`
- Modify: `components/bistro/BistroTab.tsx`

- [ ] Escrever um teste estático exigindo estado recolhido por padrão, `aria-expanded`, `aria-controls` e o chevron.
- [ ] Executar `node --test components/bistro/folhaBistroUi.test.ts` e confirmar que falha antes da implementação.
- [ ] Adicionar um estado local único que controla somente a lista, mantendo resumo e conciliação fora da região sanfonada.
- [ ] Renderizar o mesmo conteúdo mobile/desktop dentro da região controlada e preservar todos os handlers existentes.
- [ ] Executar o teste focado e a suíte completa.
