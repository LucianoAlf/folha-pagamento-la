# MusiClass — Módulo **Contas a Pagar** (Especificação para Replicação)

> **Escopo deste documento**: apenas a aba **Financeiro → Contas a Pagar** (listagem, KPIs e registro de pagamento) e o fluxo de **criação de despesas** que alimenta a aba (via `TransactionModal`).
>
> Stack alvo para replicação (igual ao projeto): **Supabase (Postgres + RLS + Realtime)** + **React + TypeScript + Tailwind**.

---

## 0) Visão geral rápida (como o módulo funciona)

- **Fonte de dados**: a aba “Contas a Pagar” não usa uma tabela “accounts_payable” própria. Ela é construída em cima da tabela **`public.transactions`**, filtrando:
  - `type = 'expense'`
  - `status != 'paid'` e `status != 'canceled'`
  - e inferindo “vencida/urgente/pendente” por **comparação de `dueDate` com a data atual**.

- **Criação de conta a pagar**: feita via modal global **“Novo Lançamento”** (`TransactionModal`), selecionando o tipo **DESPESA** e preenchendo `dueDate` (vencimento).

- **Liquidação (pagar)**: feito pelo modal **“Registrar Pagamento”** (`PayExpenseModal`) que chama `updateTransaction()` para marcar:
  - `status = 'paid'`
  - `paymentDate` (mapeia para `paid_at` no banco)
  - `paymentMethod` (mapeia para `payment_method` no banco)

---

## 1) Estrutura de Banco de Dados (tabelas de Contas a Pagar)

### 1.1 `public.transactions` (tabela **principal** do Contas a Pagar)

> Observação: o projeto usa `transactions` tanto para **receitas** quanto para **despesas**. Contas a pagar é um recorte de **despesas pendentes**.
>
> A estrutura abaixo é o **schema esperado** para replicação, a partir do que o frontend e services utilizam (`types.ts`, `types/database.ts`, `transactionsService.ts`, `transactionAdapter.ts`) + constraints/trigger de defaults (`supabase/migrations/20260104_transactions_defaults_and_constraints.sql`).

```sql
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Escopo operacional
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE SET NULL,
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE SET NULL,

  -- Vínculos opcionais
  student_id uuid NULL REFERENCES public.students(id) ON DELETE SET NULL,

  -- Classificação
  category_id uuid NULL REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  cost_center_id uuid NULL REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  cost_behavior text NULL CHECK (cost_behavior IN ('fixed','variable','mixed')),

  -- Natureza e status
  type text NOT NULL CHECK (type IN ('revenue','expense')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled'/*, 'reconciled' (se usar conciliação)*/)),

  -- Valores e datas
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  event_date date NOT NULL,
  competence_month date NULL CHECK (competence_month = date_trunc('month', competence_month)::date),
  due_date date NULL,

  -- Pagamento
  paid_at timestamptz NULL,
  payment_method text NULL,

  -- Auditoria
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices típicos (pelo uso no app)
CREATE INDEX idx_transactions_tenant_event_date ON public.transactions(tenant_id, event_date DESC);
CREATE INDEX idx_transactions_tenant_competence ON public.transactions(tenant_id, competence_month);
CREATE INDEX idx_transactions_tenant_status ON public.transactions(tenant_id, status);
CREATE INDEX idx_transactions_business_unit_id ON public.transactions(business_unit_id);
CREATE INDEX idx_transactions_financial_account_id ON public.transactions(financial_account_id);
CREATE INDEX idx_transactions_category_id ON public.transactions(category_id);
CREATE INDEX idx_transactions_due_date ON public.transactions(due_date);
```

#### Trigger de defaults (unidade/conta) + constraints graduais

O projeto aplica um trigger que preenche automaticamente `business_unit_id` e `financial_account_id` caso venham nulos, buscando a unidade e conta **primárias do tenant**:

- `supabase/migrations/20260104_transactions_defaults_and_constraints.sql`

> Para replicar, implemente a mesma função/trigger ou defina defaults na camada de app.

---

### 1.2 `public.transaction_categories` (categorias de despesa/receita)

> As categorias são **dinâmicas por tenant** e são usadas na UI de contas a pagar para:
> - exibir “ALUGUEL”, “FOLHA / SALÁRIOS”, etc.
> - agrupar/organizar dropdown de categoria
> - inferir “tipo de custo” (cost_behavior) quando configurado na categoria

Schema esperado (pelos campos usados em `services/categoryService.ts` + migrations de seed e icon/color):

```sql
CREATE TABLE public.transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Hierarquia (opcional)
  parent_id uuid NULL REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  code text NULL,
  level int NULL CHECK (level IN (1,2,3)),
  sort_order int NOT NULL DEFAULT 0,
  is_selectable boolean NOT NULL DEFAULT true,

  -- Identificação
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('revenue','expense')),

  -- Metadados e UX
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  cost_behavior text NULL CHECK (cost_behavior IN ('fixed','variable','mixed')),
  icon text NOT NULL DEFAULT '📊',
  color text NOT NULL DEFAULT '#6b7280',

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_categories_tenant_type ON public.transaction_categories(tenant_id, type);
CREATE INDEX idx_transaction_categories_parent ON public.transaction_categories(parent_id);
```

Seeds de categorias (exemplos que aparecem na UI):

- `supabase/migrations/20251221_seed_transaction_categories.sql`
- `supabase/migrations/20251225_add_icon_color_to_categories.sql`

---

### 1.3 `public.cost_centers` e `public.category_cost_centers` (centros de custo)

> **Centro de custo** é opcional no lançamento. A UI mostra “Centro de Custo (Opcional)” no modal de nova despesa.
> O projeto também suporta vincular categorias a centros de custo via a tabela de junção `category_cost_centers`.

Schema esperado (pelos campos usados em `types.ts` e `services/costCenterService.ts`):

```sql
CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  name text NOT NULL,
  slug text NOT NULL,
  description text NULL,
  explanation text NULL,

  icon text NOT NULL DEFAULT '📌',
  color text NOT NULL DEFAULT '#6b7280',

  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','revenue','both')),
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  formula_hint text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, slug)
);

CREATE TABLE public.category_cost_centers (
  category_id uuid NOT NULL REFERENCES public.transaction_categories(id) ON DELETE CASCADE,
  cost_center_id uuid NOT NULL REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, cost_center_id)
);
```

---

### 1.4 `public.business_units` (unidades) — **escopo obrigatório**

Esta tabela é usada para escopo de transações e filtro por unidade (OperationalContext). A migration define a tabela e adiciona `business_unit_id` em `transactions`.

- `supabase/migrations/20251231_business_units_module.sql`

---

### 1.5 `public.financial_accounts` (contas bancárias/jurídicas) — **escopo obrigatório**

As transações são associadas a uma conta financeira (por unidade). A migration cria a tabela e adiciona `financial_account_id` em `transactions`.

- `supabase/migrations/20260102_financial_accounts_module.sql`

---

## 2) Categorias e Classificações

### 2.1 Categorias de despesas

São registros em `transaction_categories` (`type = 'expense'`), seed inicial inclui:

- Folha / Salários
- Aluguel / Condomínio
- Impostos / Taxas
- Marketing / Ads
- Energia / Água
- Internet / Softwares
- Manutenção
- Materiais
- Serviços
- Eventos
- Outros

### 2.2 Status possíveis (e como a UI exibe)

- **Status persistido no banco (`transactions.status`)**:
  - `pending`
  - `paid`
  - `canceled`

> Importante: na aba Contas a Pagar, o “status” visível ao usuário não é o `transactions.status`.  
> A UI mostra **VENCIDA / URGENTE / PENDENTE** com base na data de vencimento (`dueDate`) vs “hoje”.

Regra usada:
- **VENCIDA**: `dueDate < hoje`
- **URGENTE**: `hoje <= dueDate <= hoje + 7 dias`
- **PENDENTE**: demais casos

### 2.3 Formas de pagamento

No modal “Registrar Pagamento” (`PayExpenseModal.tsx`), as opções são strings “humanas”:

- `PIX`
- `Transferência Bancária`
- `Cartão de Crédito`
- `Cartão de Débito`
- `Dinheiro`
- `Boleto`

**Como o valor é persistido hoje:** o `paymentMethod` é salvo como texto em `transactions.payment_method` (via `updateTransaction()` + `transactionAdapter.toDBTransaction()`), sem normalização.

> Se você quer replicar “igual”, persista exatamente essas strings.  
> Se você quer melhorar, crie um enum canônico (ex.: `pix`, `transfer`, `credit_card`) e faça um mapper UI⇄DB.

### 2.4 Tipos de recorrência / parcelamento

O modal de “Novo Lançamento” (`TransactionModal.tsx`) tem UI para:
- **Única**
- **Recorrente**
- **Parcelada** (com `installmentCount`)

Porém, no estado atual do projeto:
- Ele **não gera N registros** automaticamente para parcelas/recorrência.
- Ele apenas seta flags no objeto local (`isRecurrent`, `isInstallment`, `totalInstallments`), mas o adapter `toDBTransaction()` **não persiste esses campos**.

Se o objetivo é replicar 1:1, replique exatamente esse comportamento.

### 2.5 Centros de custo / Unidades

- **Unidade** (`business_unit_id`) é obrigatória e aparece em toda transação (há trigger de defaults no banco).
- **Conta financeira** (`financial_account_id`) é obrigatória e também tem defaults.
- **Centro de custo** (`cost_center_id`) é opcional e pode ser preenchido manualmente no `TransactionModal` quando não há categoria definida ou quando a categoria não tem centro vinculado.

---

## 3) Arquivos do módulo (páginas, componentes, services, types)

### 3.1 Páginas

- `pages/Finance.tsx`: container do Financeiro e abas; chama `AccountsPayableTab`.
- `App.tsx`: carrega `transactions` (por mês/escopo) e mantém **Realtime** do Supabase para atualizar listas automaticamente.

### 3.2 Componentes (Contas a Pagar)

- `components/finance/AccountsPayableTab.tsx`: “orquestrador” da aba (filtra despesas pendentes, calcula KPIs, abre modal de pagamento).
- `components/finance/AccountsPayableSummaryCards.tsx`: cards de KPIs (Vencidas / Próx 7 dias / Próx 30 dias).
- `components/finance/AccountsPayableTable.tsx`: tabela com filtros e busca + botão “Pagar”.
- `components/finance/PayExpenseModal.tsx`: modal “Registrar Pagamento”.

### 3.3 Componentes (criação da conta a pagar)

- `components/TransactionModal.tsx`: modal “Novo Lançamento” (cria `transactions` do tipo `expense`).

### 3.4 Services / API

- `services/transactionsService.ts`: `fetchTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`.
- `services/adapters/transactionAdapter.ts`: mapeia UI ⇄ DB (campos snake_case).
- `services/categoryService.ts`: categorias (dropdown).
- `services/costCenterService.ts`: centros de custo (dropdown e vínculos).

### 3.5 Types / Interfaces

- `types.ts`: interface `Transaction` (usada pela UI e pelo Financeiro).
- `types/database.ts`: interface `DBTransaction` e `DBTransactionCategory` (forma “banco” consumida no adapter).

---

## 4) Fluxos principais (como replicar)

### A) Cadastrar Nova Conta (nova despesa que vira “conta a pagar”)

**Onde acontece:** botão “Novo Lançamento” (header do Financeiro) abre `TransactionModal`.

**Campos obrigatórios (DESPESA):**
- `description` (Descrição do Lançamento)
- `amount` (Valor)
- `categoryId` (Categoria)
- `unitId` (Unidade)
- `dueDate` (Vencimento) — o validador exige vencimento quando `type === 'expense'`
- `competenceMonth` (Competência)
- `eventDate` (Data do Evento)

**O que é persistido:**
- `type = 'expense'`
- `status = 'pending'` (se não marcar como pago)
- `event_date`, `competence_month`, `due_date`
- `category_id`, `business_unit_id`
- `cost_center_id` e `cost_behavior` se informados
- `payment_method` e `paid_at` somente se marcar como “já pago” no modal (quando existe essa opção)

**Como salva:**
- `TransactionModal` monta um objeto `Transaction` e chama `onSave(transaction)`.
- `pages/Finance.tsx` repassa para `App.tsx`, que chama `createTransaction(t)` (`services/transactionsService.ts`).

### B) Registrar Pagamento (liquidar conta)

**Onde acontece:** botão “Pagar” na tabela abre `PayExpenseModal`.

**Campos do modal:**
- `paymentDate` (Data do Pagamento) → salva em `transactions.paid_at`
- `paymentMethod` (Método) → salva em `transactions.payment_method`
- `notes` (Observações) → **capturado**, mas **não é persistido** no update atual

**Ao confirmar:**
- chama `updateTransaction(expenseId, { status: 'paid', paymentDate, paymentMethod })`
- fecha modal
- a lista se atualiza via Realtime (o app tem subscription em `transactions`)

### C) Listagem e Filtros

**Filtro principal (aba):** somente despesas “abertas”:
- `type === 'expense'`
- `status !== 'paid'` e `status !== 'canceled'`

**Filtros na tabela:**
- `all` (todas)
- `overdue` (vencidas)
- `next7` (próximos 7 dias)
- `next30` (próximos 30 dias)

**Busca:**
- filtra por substring em:
  - `description`
  - `category` (nome da categoria)

### D) KPIs

Cards exibidos:
- **Vencidas**: soma e contagem de despesas com `dueDate < hoje`
- **Próximos 7 dias**: `hoje <= dueDate <= hoje+7`
- **Próximos 30 dias**: `hoje <= dueDate <= hoje+30`

---

## 5) Regras de negócio (igual ao projeto)

### 5.1 Como determina se está “vencida”?

Não existe um status “overdue” persistido em `transactions.status`.  
O vencimento é inferido pela UI comparando `new Date(dueDate) < new Date()`.

### 5.2 Parcelamento gera N registros ou 1 com controle?

Na implementação atual, **não gera N registros**.  
O modal tem UI para isso, mas o payload final salva apenas **1 transação**.

### 5.3 Recorrência gera registros automáticos?

Atualmente **não**. A UI tem `launchType`, mas não existe job/RPC que materialize recorrências.

### 5.4 Unidades/contas obrigatórias

O banco força `business_unit_id` e `financial_account_id` (via trigger + constraints graduais).

---

## 6) Código dos componentes principais (onde copiar)

> Para replicar, o “mais fiel” é copiar estes arquivos e adaptar imports/Design System:

- Listagem:
  - `components/finance/AccountsPayableTab.tsx`
  - `components/finance/AccountsPayableTable.tsx`
  - `components/finance/AccountsPayableSummaryCards.tsx`
- Modal de pagamento:
  - `components/finance/PayExpenseModal.tsx`
- Criação (nova conta / nova despesa):
  - `components/TransactionModal.tsx` (use a aba **DESPESA**)
- Service/API:
  - `services/transactionsService.ts`
  - `services/adapters/transactionAdapter.ts`
- Types:
  - `types.ts` (`Transaction`, `PaymentStatus`, `PaymentMethod`)
  - `types/database.ts` (`DBTransaction`, `DBTransactionCategory`)

---

## 7) Pontos de atenção (para replicar “igual” sem bugs)

- **Realtime**: o projeto atualiza a lista de contas a pagar via subscription em `public.transactions` (em `App.tsx`). Se você não replicar isso, terá que dar `refetch()` manual após criar/pagar.
- **Notas do pagamento**: `PayExpenseModal` coleta `notes`, mas a atualização não salva em lugar nenhum (não existe coluna mapeada no update). Se quiser replicar “igual”, ignore; se quiser melhorar, adicione coluna `notes`/`observations` em `transactions` e mapeie no adapter.
- **Enums/mapeamento de payment_method**: hoje grava texto livre (ex.: “Cartão de Crédito”). Se o novo sistema quiser consistência, normalize (mas aí deixará de ser 1:1).


