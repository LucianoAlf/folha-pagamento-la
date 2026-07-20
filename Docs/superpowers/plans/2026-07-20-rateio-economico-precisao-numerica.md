# Rateio Econômico: Precisão Numérica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canonicalizar percentuais de rateio em `numeric(9,6)` antes de validar e hashear, preservar centavos e impedir resolução de distribuições acima de 100%.

**Architecture:** Uma migration aditiva redefine, sem `DROP`, as três funções públicas existentes e repete todos os atributos de segurança. Um runner Node cria PostgreSQL descartável em Docker, aplica um schema mínimo, as migrations 2B-A existentes, a hotfix e um teste SQL transacional.

**Tech Stack:** PostgreSQL 15, PL/pgSQL, Node.js `node:test`/`child_process`, Docker.

---

### Task 1: Regressão PostgreSQL reproduzível

**Files:**
- Create: `scripts/test-folha-alocacao-dre-hotfix.mjs`
- Create: `supabase/tests/hotfix/folha_alocacao_dre_hotfix_setup.sql`
- Create: `supabase/tests/hotfix/folha_alocacao_dre_numeric_precision.test.sql`

- [ ] **Step 1: Criar o runner descartável**

O runner deve criar `postgres:15-alpine`, aplicar setup e migrations por `docker exec -i ... psql -v ON_ERROR_STOP=1`, sempre remover o container em `finally` e aceitar `--skip-hotfix` para provar o RED.

- [ ] **Step 2: Criar o teste comportamental**

O SQL deve executar dentro de `BEGIN`/`ROLLBACK` e verificar:

```sql
-- Rejeição após canonicalização.
jsonb_build_array(
  jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'cg',  'percentual', 33.3333335),
  jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'rec', 'percentual', 33.3333335),
  jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'bar', 'percentual', 33.333333)
)
```

O caso limpo deve usar `33.333333`, `33.333333`, `33.333334`; a soma de `valor_assinado_rateado` deve ser `1000000.00`; o hash deve ser recalculado das fatias persistidas; `pg_proc` deve provar `prosecdef`, `proconfig` e `provolatile`; privilégios efetivos devem permanecer iguais.

- [ ] **Step 3: Provar o RED**

Run: `node scripts/test-folha-alocacao-dre-hotfix.mjs --skip-hotfix`

Expected: FAIL com `cenario patologico deveria ser rejeitado` porque a implementação mergeada ainda aceita os valores brutos.

### Task 2: Migration aditiva

**Files:**
- Create: `supabase/migrations/20260720_1_folha_alocacao_dre_precisao_numerica.sql`

- [ ] **Step 1: Redefinir `allocation_hash`**

Usar `percentual numeric(9,6)` no `jsonb_to_recordset` e repetir:

```sql
language plpgsql
immutable
security definer
set search_path = public, pg_temp
```

- [ ] **Step 2: Redefinir `gravar`**

Usar `percentual numeric(9,6) not null` na tabela temporária e repetir `SECURITY DEFINER` e `SET search_path = public, pg_temp`.

- [ ] **Step 3: Redefinir `resolver`**

Manter assinatura e `RETURNS TABLE`, mudar para PL/pgSQL, executar `RAISE EXCEPTION` quando qualquer `centavos_faltantes < 0`, retornar a consulta existente com `RETURN QUERY`, e repetir:

```sql
language plpgsql
stable
security definer
set search_path = public, pg_temp
```

- [ ] **Step 4: Provar o GREEN**

Run: `node scripts/test-folha-alocacao-dre-hotfix.mjs`

Expected: PASS e container removido sem resíduo.

### Task 3: Verificação e parada

**Files:**
- Verify: `supabase/migrations/20260720_1_folha_alocacao_dre_precisao_numerica.sql`
- Verify: `supabase/tests/hotfix/folha_alocacao_dre_numeric_precision.test.sql`

- [ ] **Step 1: Rodar regressões estruturais**

Run: `node --test supabase/migrations/folha_alocacao_dre.test.mjs supabase/migrations/folha_alocacao_dre_privilegios.test.mjs`

Expected: 9 testes passando.

- [ ] **Step 2: Rodar validações do frontend**

Run: `npm run typecheck` e `npm run build`

Expected: ambos com exit code 0.

- [ ] **Step 3: Auditar o diff e parar**

Run: `git diff --check`, `git status --short` e `git diff --stat origin/main...HEAD`.

Expected: somente plano, runner, fixtures/teste e migration nova; nenhuma migration aplicada alterada, merge ou deploy.
