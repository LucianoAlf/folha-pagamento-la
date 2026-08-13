# Cartões: acesso administrativo e correções operacionais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promover Rose a administradora, corrigir a baixa de fatura, isolar estados de ação e permitir que uma compra existente vire recorrente sem duplicar transações.

**Architecture:** Uma migration aditiva centraliza a autorização administrativa de cartões, corrige o gatilho interno de pagamento e cria uma RPC idempotente para adotar uma transação existente como origem de recorrência. O cliente ganha um contrato tipado e um modal focado; previsões continuam separadas de transações e não entram nos totais.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Supabase/PostgreSQL, Node test runner e Docker/PostgreSQL 17.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/20260813_1_cartoes_admin_pagamento_recorrencia_existente.sql` | Perfil admin da Rose, autorização de cartões, política de faturas, gatilho de pagamento e RPC de adoção. |
| `supabase/migrations/financeiro_cartoes_backend.test.mjs` | Contratos estáticos de segurança, pagamento e nova RPC. |
| `supabase/tests/financeiro_cartao_recorrencias_fixture.sql` | Prova comportamental de admin/user, baixa e adoção idempotente. |
| `supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs` | Schema mínimo e execução PostgreSQL 17 descartável. |
| `types/cartoes.ts` | Payload e resposta da adoção de recorrência. |
| `services/cartoesService.ts` | Chamada tipada da nova RPC. |
| `components/cartoes/cartoesFaturasSelectors.ts` | Elegibilidade pura para tornar uma transação recorrente. |
| `components/cartoes/cartoesFaturasSelectors.test.ts` | Regressões de elegibilidade e de estados independentes. |
| `components/cartoes/RecorrenciaAdotarModal.tsx` | Confirmação de dados futuros sem editar a compra de origem. |
| `components/cartoes/FaturasCartaoPage.tsx` | Ação `Tornar recorrente`, estado específico e remoção do bloqueio global. |
| `services/contasPagarService.ts` | Tradução da falha de baixa para mensagem operacional. |

### Task 1: Fixar os contratos em testes vermelhos

**Files:**
- Create: `supabase/migrations/20260813_1_cartoes_admin_pagamento_recorrencia_existente.sql`
- Modify: `supabase/migrations/financeiro_cartoes_backend.test.mjs`
- Modify: `components/cartoes/cartoesFaturasSelectors.test.ts`

- [ ] **Step 1: Criar a migration pelo CLI**

Run:

```powershell
npx supabase migration new cartoes_admin_pagamento_recorrencia_existente
```

Expected: exatamente um arquivo novo e vazio com o sufixo `cartoes_admin_pagamento_recorrencia_existente.sql`.

Renomear somente o arquivo recém-criado para `supabase/migrations/20260813_1_cartoes_admin_pagamento_recorrencia_existente.sql`, preservando a convenção diária do repositório.

- [ ] **Step 2: Escrever os asserts estáticos antes do SQL**

Adicionar um teste que leia a migration real e exija:

```js
assert.match(sql, /update public\.user_profiles[\s\S]*set role = 'admin'[\s\S]*cf0e4bf0-d056-4b55-83c1-92b81f6be9c4/i);
assert.match(sql, /create or replace function public\.financeiro_cartoes_is_admin\(\)/i);
assert.match(sql, /create policy financeiro_cartao_faturas_update_admin/i);
assert.match(sql, /create or replace function public\.financeiro_cartao_faturas_sync_pagamento\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
assert.match(sql, /create or replace function public\.financeiro_cartao_recorrencia_adotar\(payload jsonb, ator jsonb/i);
assert.doesNotMatch(sql, /insert into public\.financeiro_cartao_transacoes/i);
assert.doesNotMatch(sql, /cascade/i);
```

Também exigir revogação de `PUBLIC`/`anon`, grant apenas às portas necessárias e validação administrativa no ramo `authenticated` do resolvedor de ator.

- [ ] **Step 3: Escrever os testes puros de elegibilidade e estado**

Adicionar fixtures para compra comum, parcela, tarifa, origem recorrente e fatura fechada:

```ts
assert.deepEqual(getRecorrenciaAdocaoDisponibilidade(compra, faturaAberta, null), { disponivel: true, motivo: null });
assert.equal(getRecorrenciaAdocaoDisponibilidade(parcela, faturaAberta, null).motivo, 'Compras parceladas não podem ser transformadas em recorrentes.');
assert.equal(getRecorrenciaAdocaoDisponibilidade(tarifa, faturaAberta, null).motivo, 'Somente compras podem ser transformadas em recorrentes.');
assert.equal(getRecorrenciaAdocaoDisponibilidade(compra, faturaFechada, null).motivo, 'A fatura precisa estar aberta para criar a recorrência.');
assert.equal(getRecorrenciaAdocaoDisponibilidade(compra, faturaAberta, recorrencia).motivo, 'Esta compra já possui uma recorrência.');
assert.doesNotMatch(faturasPageSource, /savingPrevisaoId\s*!==\s*null\s*\}/);
```

- [ ] **Step 4: Rodar RED**

Run:

```powershell
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs
```

Expected: os testes novos falham pela migration vazia, seletor ausente e bloqueio global ainda presente; testes antigos continuam executando.

### Task 2: Corrigir autorização, pagamento e adoção no banco

**Files:**
- Modify: `supabase/migrations/20260813_1_cartoes_admin_pagamento_recorrencia_existente.sql`
- Test: `supabase/migrations/financeiro_cartoes_backend.test.mjs`

- [ ] **Step 1: Promover Rose e criar o predicado admin**

Implementar atualização idempotente pelo UUID confirmado e helper estável:

```sql
update public.user_profiles
   set role = 'admin'
 where id = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'::uuid
   and role is distinct from 'admin';

create or replace function public.financeiro_cartoes_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.id = (select auth.uid()) and up.role = 'admin'
  );
$$;
```

Revogar `PUBLIC`/`anon`, conceder execução a `authenticated`, conceder `UPDATE` na tabela a `authenticated` e criar política `FOR UPDATE` com `USING` e `WITH CHECK` chamando o helper.

- [ ] **Step 2: Fazer as RPCs de cartão reconhecerem somente administradores web**

Recriar `financeiro_cartoes_resolve_ator(jsonb)` preservando `service_role` e `maria_operacional`, mas no ramo web exigir:

```sql
if v_role = 'authenticated' then
  if not public.financeiro_cartoes_is_admin() then
    raise exception 'Perfil administrativo obrigatório para operar cartões.' using errcode = '42501';
  end if;
  v_ator_tipo := 'web';
  v_created_by := auth.uid();
  v_ator_ref := v_created_by::text;
```

- [ ] **Step 3: Corrigir o gatilho transacional de pagamento**

Recriar `financeiro_cartao_faturas_sync_pagamento()` como `SECURITY DEFINER SET search_path = ''`, usando nomes qualificados e revogando execução direta de todos os papéis clientes. O gatilho continua `AFTER UPDATE` em `contas_pagar`; conta e fatura confirmam ou revertem juntas.

- [ ] **Step 4: Criar a RPC idempotente de adoção**

Implementar `financeiro_cartao_recorrencia_adotar(payload, ator)` com este contrato:

```json
{
  "transacao_id": "uuid",
  "data_inicio": "2026-08-17",
  "dia_base": 17,
  "descricao": "Assinatura",
  "estabelecimento": "Fornecedor",
  "valor": 49.90,
  "empresa_id": null,
  "plano_conta_id": null,
  "centro_custo_id": null,
  "classificacao_status": "pendente"
}
```

A função resolve ator admin, adquire o mesmo advisory lock do cartão, bloqueia transação e fatura, valida compra/fatura aberta/não parcela, retorna a regra existente quando houver, insere somente em `financeiro_cartao_recorrencias`, gera a primeira previsão futura pela infraestrutura existente e audita antes/depois. Nunca insere em `financeiro_cartao_transacoes`.

- [ ] **Step 5: Rodar o teste estático GREEN**

Run:

```powershell
node --test supabase/migrations/financeiro_cartoes_backend.test.mjs
```

Expected: todos os testes passam.

### Task 3: Implementar contratos TypeScript e interface

**Files:**
- Modify: `types/cartoes.ts`
- Modify: `services/cartoesService.ts`
- Modify: `components/cartoes/cartoesFaturasSelectors.ts`
- Modify: `components/cartoes/FaturasCartaoPage.tsx`
- Create: `components/cartoes/RecorrenciaAdotarModal.tsx`
- Modify: `services/contasPagarService.ts`

- [ ] **Step 1: Adicionar payload, resposta e chamada RPC**

Declarar:

```ts
export interface FinanceiroCartaoRecorrenciaAdotarPayload {
  transacao_id: string;
  data_inicio: string;
  dia_base: number;
  descricao: string;
  estabelecimento?: string | null;
  valor: number;
  empresa_id?: string | null;
  plano_conta_id?: string | null;
  centro_custo_id?: string | null;
  classificacao_status: CartaoClassificacaoStatus;
}

export interface FinanceiroCartaoRecorrenciaAdotarResponse {
  success: boolean;
  transacao_id: string;
  recorrencia_id: string;
  previsao_id: string | null;
  idempotent: boolean;
}
```

E `adotarTransacaoComoRecorrente(payload)` chamando apenas `financeiro_cartao_recorrencia_adotar` por `callCartaoRpc`.

- [ ] **Step 2: Implementar o seletor puro**

Criar `getRecorrenciaAdocaoDisponibilidade(transacao, fatura, recorrencia)` retornando `{ disponivel, motivo }` com a ordem fixa: recorrência existente, fatura não aberta, tipo diferente de compra, parcela; caso contrário disponível.

- [ ] **Step 3: Criar o modal do Design System**

`RecorrenciaAdotarModal` recebe a transação, preenche data-base/descrição/valor/classificação atuais, explica que a compra não será duplicada e envia somente após confirmação. Usa `Modal`, `DatePicker`, `CurrencyInput`, `Select`, `Button` e tokens semânticos existentes.

- [ ] **Step 4: Isolar estados e expor a nova ação**

Em `FaturasCartaoPage`, remover `savingPrevisaoId !== null` do `saving` da linha. Criar `savingAdocaoId` e `transacaoParaRecorrencia`; mostrar `Tornar recorrente` quando disponível e a explicação de indisponibilidade somente no menu/contexto da ação. Após sucesso, recarregar e manter a mesma fatura aberta; em falha, manter o modal e limpar `savingAdocaoId` no `finally`.

- [ ] **Step 5: Melhorar a mensagem de baixa**

Em `registrarPagamento`, preservar o erro original e mapear `42501`/mensagem de sincronização para `Não foi possível atualizar a fatura vinculada. Confirme que seu perfil administrativo está ativo.`; demais erros continuam no fallback com detalhes seguros.

- [ ] **Step 6: Rodar GREEN do cliente**

Run:

```powershell
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts
npm run typecheck
npm run build
```

Expected: todos passam; build sem erro.

### Task 4: Provar os fluxos em PostgreSQL 17

**Files:**
- Modify: `supabase/tests/financeiro_cartao_recorrencias_fixture.sql`
- Modify: `supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs`

- [ ] **Step 1: Estender o schema mínimo com perfis e política admin**

Criar dois usuários sentinela, um `admin` e um `user`, e alternar claims locais antes das operações.

- [ ] **Step 2: Provar acesso e pagamento**

Como `user`, exigir falha `42501` ao editar fatura. Como `admin`, editar uma fatura e registrar a baixa da conta; afirmar `contas_pagar.status = 'pago'` e `financeiro_cartao_faturas.status = 'paga'` na mesma transação.

- [ ] **Step 3: Provar adoção sem duplicata**

Registrar uma compra real, chamar duas vezes `financeiro_cartao_recorrencia_adotar` e afirmar: contagem de transações permanece `1`, regra `1`, previsão futura `1`, segunda resposta `idempotent = true`.

- [ ] **Step 4: Executar a fixture**

Run:

```powershell
node supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs
```

Expected:

```text
PASS: PostgreSQL 17
rollback_sentinel_rows=0
```

### Task 5: Verificar, aplicar e publicar

**Files:**
- Verify: todos os arquivos anteriores

- [ ] **Step 1: Executar o gate completo**

```powershell
git diff --check
node --test --experimental-strip-types components/cartoes/cartoesFaturasSelectors.test.ts supabase/migrations/financeiro_cartoes_backend.test.mjs
node supabase/tests/run_financeiro_cartao_recorrencias_fixture.mjs
npm run typecheck
npm run build
```

- [ ] **Step 2: Aplicar somente a migration versionada**

Confirmar projeto `ubdvtjbitozhkuvvqkxj`, conferir histórico remoto e aplicar o SQL da migration. Verificar por consultas de leitura: Rose `admin`, política `UPDATE`, função de sync `SECURITY DEFINER`, nova RPC e grants.

- [ ] **Step 3: Rodar advisors e smoke autenticado**

Verificar advisors de segurança/desempenho. No navegador, abrir a fatura EMLA CG e confirmar botões independentes, ação `Tornar recorrente`, mensagens e ausência de spinner residual. Não baixar nem cancelar a fatura real como teste.

- [ ] **Step 4: Commitar e publicar**

```powershell
git add docs/superpowers/plans/2026-08-13-cartoes-acesso-admin-correcao-operacional.md supabase/migrations supabase/tests types/cartoes.ts services/cartoesService.ts services/contasPagarService.ts components/cartoes
git commit -m "fix: liberar operacao administrativa de cartoes"
git push origin main
```

Confirmar commit remoto, deployment associado, URL de produção e entregar instruções operacionais à Rose.
