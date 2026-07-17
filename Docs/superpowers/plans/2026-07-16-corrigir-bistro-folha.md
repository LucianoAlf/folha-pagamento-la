# Correcao Bistrô x Folha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar na UI o consumo Bistrô efetivamente liquidado dos demais descontos da folha e explicar a diferenca entre consumo bruto e liquidacao, sem alterar valores financeiros.

**Architecture:** A view auditada `vw_folha_dre_analitico` sera lida por um servico read-only. Um seletor puro consolida por lancamento e colaborador; `App.tsx` usa esse modelo nas tabelas desktop/mobile e `BistroTab` mostra a reconciliacao e a composicao do total bruto.

**Tech Stack:** React 18, TypeScript, Supabase JS, Node test runner, Tailwind tokens do Super Folha.

---

### Task 1: Modelo puro e contrato read-only

**Files:**
- Create: `components/bistro/folhaBistroModel.ts`
- Create: `components/bistro/folhaBistroModel.test.ts`
- Create: `services/folhaDreService.ts`

- [ ] Escrever testes que exigem separacao por lancamento, subtotal por categoria e pendencias por colaborador.
- [ ] Rodar `node --test components/bistro/folhaBistroModel.test.ts` e confirmar falha pela ausencia do modelo.
- [ ] Implementar `buildFolhaBistroBreakdown` e `buildBistroReconciliation` usando centavos inteiros.
- [ ] Implementar `fetchFolhaDreSnapshot(folhaId)` com `select` em `vw_folha_dre_analitico`, sem RPC ou escrita.
- [ ] Reexecutar o teste e confirmar sucesso.

### Task 2: Corrigir a tabela de lancamentos

**Files:**
- Modify: `App.tsx`
- Create: `components/bistro/folhaBistroUi.test.ts`

- [ ] Escrever teste estrutural para exigir as colunas Bistrô e Descontos separadas no subtotal e no mobile.
- [ ] Carregar o snapshot da folha selecionada e construir o breakdown em `useMemo`.
- [ ] Exibir Bistrô liquidado como leitura e editar somente o residual de outros descontos, preservando `lancamentos_folha.descontos` como total.
- [ ] Adicionar as duas celulas ao subtotal e manter o total da folha inalterado.
- [ ] Reexecutar os testes focados.

### Task 3: Explicar e reconciliar na aba Bistrô

**Files:**
- Modify: `components/bistro/BistroTab.tsx`
- Modify: `services/bistroService.ts`

- [ ] Mostrar `Vendas por canais`, `Consumo de colaboradores` e `Total bruto` como parcelas distintas.
- [ ] Mostrar o aviso semantico de conciliacao com bruto, liquidado e pendente, incluindo os nomes pendentes.
- [ ] Usar somente tokens do tema e manter os controles existentes intactos.

### Task 4: Verificacao

**Files:**
- No production file changes.

- [ ] Rodar `node --test` e confirmar todos os testes verdes.
- [ ] Rodar `npm run typecheck` e `npm run build`.
- [ ] Rodar `git diff --check`.
- [ ] Abrir o preview no Agent Browser e validar desktop/mobile em claro/escuro.
