# DRE Analitico v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um snapshot contabil versionado da folha que preserve a origem, classifique cada componente no plano correto, separe liquidacao do Bistro e alimente o DRE sem duplicar a obrigacao agregada de Contas a Pagar.

**Architecture:** Uma migration cria a ruleset versionada, o snapshot imutavel por conteudo, a RPC auditada e uma view somente leitura. A RPC deriva todas as fatias dos lancamentos da folha e do lote Bistro M-1, reconcilia a soma assinada com `folhas_mensais.total_geral` e permite backfill de folha fechada apenas via service role. `folha_fechar` chama o classificador antes de fechar, em bloco nao bloqueante.

**Tech Stack:** PostgreSQL/PLpgSQL, Supabase RLS e grants, Node.js `node:test` para contratos estaticos.

---

### Task 1: Mapear e travar o contrato

**Files:**
- Create: `supabase/migrations/folha_dre_analitico.test.mjs`
- Create: `supabase/migrations/20260716_2_folha_dre_analitico_v4.sql`

- [ ] Escrever testes estaticos para schema, seed completa, seguranca, idempotencia, backfill, Bistro M-1, metadata validada, rateio proporcional, sinais, escopos, view e integracao no fechamento.
- [ ] Executar `node --test supabase/migrations/folha_dre_analitico.test.mjs` e confirmar falha por comportamento ausente.

### Task 2: Criar regras e snapshot

**Files:**
- Modify: `supabase/migrations/20260716_2_folha_dre_analitico_v4.sql`

- [ ] Criar `folha_normaliza_texto`, `folha_regra_plano_conta` e seed ruleset 1 sem placeholders.
- [ ] Criar `folha_classificacao_dre` com chaves de origem, regra, Bistro, hash e reconciliacao.
- [ ] Aplicar RLS, policies de leitura e grants de menor privilegio.
- [ ] Rodar o teste focado e confirmar schema/seed verdes.

### Task 3: Implementar classificador atomico

**Files:**
- Modify: `supabase/migrations/20260716_2_folha_dre_analitico_v4.sql`

- [ ] Resolver ruleset e hash canonico da origem.
- [ ] Implementar idempotencia por conteudo e bloqueio de folha fechada.
- [ ] Classificar componentes nao-desconto e marcar empate/no-match como pendente.
- [ ] Resolver Bistro pela competencia M-1; validar `__bistro` por pessoa ou aplicar rateio proporcional com residuo na ultima linha.
- [ ] Validar a equacao dura antes de persistir e auditar toda substituicao/backfill.
- [ ] Rodar o teste focado e confirmar verde.

### Task 4: Expor leitura e integrar fechamento

**Files:**
- Modify: `supabase/migrations/20260716_2_folha_dre_analitico_v4.sql`

- [ ] Criar `vw_folha_dre_analitico` com `security_invoker` e valores gerenciais derivados do snapshot.
- [ ] Recriar a versao mais recente de `folha_fechar`, chamando o classificador antes do status `fechada` dentro de bloco `EXCEPTION` nao bloqueante.
- [ ] Preservar vencimento no dia 10 e todas as travas financeiras existentes.
- [ ] Rodar testes de migrations, typecheck, build e `git diff --check`.

### Task 5: Aplicar e validar no banco vivo

**Files:**
- Apply: `supabase/migrations/20260716_2_folha_dre_analitico_v4.sql`

- [ ] Confirmar novamente o project ref `ubdvtjbitozhkuvvqkxj`.
- [ ] Aplicar via `apply_migration`, nunca `db push`.
- [ ] Validar seguranca e estrutura.
- [ ] Executar backfill unico da folha 17 como service role.
- [ ] Confirmar segunda execucao bloqueada, equacao de integridade, Caio, Lucia, Professor PJ, consumos Bistro sem desconto e snapshot imutavel.
- [ ] Executar smokes transacionais com rollback para falha do classificador no fechamento.
- [ ] Parar e reportar para auditoria sem commit, push ou merge.
