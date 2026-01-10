# Pessoas / RH (MusiClass) — Especificação Completa (Frontend + Backend)

Documento para replicação do módulo **Pessoas / RH** do MusiClass em um **novo sistema de RH**.

Este documento descreve somente o escopo da página **Pessoas / RH** (e a rota pública de relatório que ela gera), não o restante do MusiClass.

Data: 2026-01-10
Fonte de verdade: código do repositório (componentes, hooks, services, migrations).

---

## 1) Escopo e objetivos

### 1.1 Objetivo

Permitir que o novo sistema de RH replique (igual ou bem parecido) o que existe no MusiClass na página **Pessoas / RH**, com:

- **4 abas**:
  - **Colaboradores**
  - **Lançamentos**
  - **Folha de Pagamento**
  - **Relatórios**
- **Integração total** com:
  - multi-unidade
  - escopo operacional (unidade/conta)
  - RBAC e RLS no backend
- **Fluxo de ponta a ponta**:
  - cadastro e rateio do colaborador
  - lançamentos por mês + unidade
  - geração de folha (draft) por unidade ou consolidada
  - aprovação/pagamento da folha (gera despesas no Financeiro)
  - geração de relatório e compartilhamento público (/r/TOKEN)

### 1.2 Fora de escopo (intencional)

- Financeiro completo (contas a pagar/receber, conciliações, categorias, etc.)
- Captação/Leads
- Alunos/Agenda/Salas/Professores (fora do que é necessário para o RH)
- Qualquer automação externa (n8n, edge functions, integrações)

### 1.3 Premissas importantes (do MusiClass atual)

- Backend: **Supabase Postgres** com RLS forte (policies RESTRICTIVE por unidade/conta em tabelas “fato”).
- Frontend: React + Vite, com TanStack Query no bootstrap (ver `index.tsx`).
- Identidade multi-tenant: `profiles.tenant_id` é fonte do tenant no frontend; RLS usa funções `public.get_my_tenant()` / `public.get_current_tenant_id()` dependendo do contexto.
- O módulo RH é multi-unidade e opera em dois eixos:
  - eixo 1: unidade (business_unit_id) — “Consolidado” = todas as unidades
  - eixo 2: conta financeira (financial_account_id) — relevante para KPIs de receita e gráficos

---

## 2) Onde fica no frontend (rotas/telas) e como se navega

### 2.1 Menu lateral

O item do menu é “Pessoas / RH”.

- Arquivo: `components/sidebar/Sidebar.tsx`
- O menu aparece apenas se o usuário tiver um dos papéis:
  - `owner`
  - `finance`
  - `hr`
  - `unit_manager`

### 2.2 Página container “Pessoas / RH”

A página container é `pages/People.tsx`.

Ela:

- renderiza o título “Pessoas / RH”
- renderiza as 4 abas (botões)
- faz gating de acesso por papel (RBAC)
- injeta os componentes reais de cada aba:
  - `CollaboratorsManager`
  - `PayrollLaunchesManager`
  - `PayrollManager`
  - `ReportsManager`

### 2.3 Abas (definição)

As abas são definidas no tipo:

- `PeopleTab = 'collaborators' | 'launches' | 'payroll' | 'reports'`

As permissões no container definem:

- **Colaboradores**: `owner`, `hr`, `unit_manager`, `finance`
- **Lançamentos**: `owner`, `hr`, `finance`
- **Folha**: `owner`, `hr`, `finance`
- **Relatórios**: `owner`, `hr`, `finance`

Observação: se o usuário não tem nenhuma dessas permissões, a página mostra “Acesso Restrito”.

---

## 3) Escopo operacional (Unidade / Conta) e por que isso importa no RH

Este é um conceito crítico para replicação correta.

### 3.1 O que é “contexto operacional”

O MusiClass mantém dois seletores globais no header (canto superior direito):

- seletor de **Unidade**
- seletor de **Conta Financeira** (aparece apenas quando a unidade selecionada tem mais de 1 conta)

Arquivos:

- `components/Layout.tsx` (header global)
- `components/OperationalScopeSelector.tsx` (UI dos selects)
- `src/contexts/OperationalContext.tsx` (estado global e persistência)

### 3.2 Como o contexto é persistido

Chaves no `localStorage`:

- `musiclass-active-business-unit`
- `musiclass-active-financial-account`

### 3.3 Quem pode usar “Consolidado”

Consolidado significa “all” (todas as unidades / todas as contas).

Regra:

- `canUseConsolidated = roles contém owner OU finance OU hr`

Isso é calculado em `OperationalProvider`.

Implicação:

- usuários sem essa permissão nunca devem ver a opção “Consolidado” na UI.

### 3.4 Como esse contexto impacta o módulo Pessoas/RH

- Aba **Colaboradores**:
  - aplica filtro de unidade (se não estiver em “all”)
  - lista apenas colaboradores visíveis no escopo do usuário (RLS e filtros)
- Aba **Lançamentos**:
  - muda a unidade ativa da aba conforme o contexto global
  - usa conta financeira (quando existir) para calcular receita e gráficos (KPIs)
- Aba **Folha**:
  - se “all” e o usuário pode consolidado, habilita visão consolidada da folha
  - caso contrário, trabalha por unidade
- Aba **Relatórios**:
  - permite gerar relatório por mês e opcionalmente por unidade
  - compartilhamento cria rota pública `/r/TOKEN`

---

## 4) RBAC e RLS: modelo de permissões do RH

### 4.1 Papéis (roles) que existem

Definidos em `services/rbacService.ts` e migration `supabase/migrations/20260103_rbac_unit_account_scope.sql`:

- `attendant`
- `unit_manager`
- `teacher`
- `finance`
- `hr`
- `owner`

### 4.2 Tabelas RBAC (backend)

Criadas pela migration RBAC:

- `user_roles`
- `user_unit_access`
- `user_account_access`
- `user_default_context`

### 4.3 Funções helper para RLS (backend)

Criadas pela migration RBAC:

- `public.is_owner_or_admin_profile()`
- `public.has_role(p_role)`
- `public.get_default_business_unit()`
- `public.get_default_financial_account()`
- `public.has_unit_access(p_business_unit_id)`
- `public.has_account_access(p_financial_account_id)`

### 4.4 Resumo do gating no frontend (visibilidade da página)

Além do RLS no backend, o frontend faz gating do menu e da página:

- Sidebar só mostra “Pessoas / RH” para certos papéis
- `pages/People.tsx` esconde abas se o papel não autoriza
- `pages/People.tsx` mostra “Acesso Restrito” se não tiver nenhuma permissão

### 4.5 RLS específico do RH (tabelas relevantes)

O escopo do RH envolve estas tabelas:

- `collaborators`
- `collaborator_unit_allocations`
- `collaborator_instruments`
- `collaborator_payroll_items`
- `collaborator_allocation_overrides`
- `payroll_runs`
- `payroll_entries`
- (para relatórios) `report_templates`, `reports`, `report_views`, `report_comments`

As policies aplicadas nessas tabelas variam por migration, mas o padrão é:

- isolamento por tenant (`tenant_id = get_my_tenant()` ou `get_current_tenant_id()`)
- restrição por papéis (apenas `owner/finance/hr` e em alguns casos `unit_manager`)
- restrição por unidade (`has_unit_access`) quando há `business_unit_id`

Ponto importante:

- o RH é “sensível” e não é liberado para papéis operacionais comuns (`attendant`).

---

## 5) Modelo de dados do RH (backend)

Nesta seção, o objetivo é dar ao sistema novo de RH uma visão completa das entidades e relacionamentos necessários para replicar o comportamento.

### 5.1 Entidade: Colaborador

Tabela: `collaborators`

Usada intensivamente por:

- Colaboradores (cadastro)
- Lançamentos (filtragem e cálculo de base)
- Folha (geração e auditoria)
- Relatórios (agregações por departamento/unidade)

Campos usados pelo frontend (via `services/collaboratorService.ts`):

- `id`
- `tenant_id`
- `name`
- `email`
- `phone`
- `cpf`
- `rg`
- `civil_status`
- `birth_date`
- `address`
- `neighborhood`
- `city`
- `state`
- `cep`
- `department` (staff/teacher/operational)
- `role` (função: texto livre)
- `contract_type` (pj/clt/etc.)
- `status` (active/inactive/on_leave)
- `hire_date`
- `termination_date`
- `base_salary`
- `allocation_mode` (none/fixed/by_students)
- `business_unit_id` (unidade base)
- `company_name`, `cnpj`, `municipal_registration` (dados PJ)
- `pix_key`, `bank_name`, `bank_agency`, `bank_account`, `bank_account_type`
- `profile_id` (opcional)
- `teacher_legacy_id` (legado)
- `created_at`, `updated_at`

Observação crítica:

- No frontend, o mapping está em `services/collaboratorService.ts` na função `mapDBToCollaborator`.

### 5.2 Entidade: Alocação por unidade (rateio)

Tabela: `collaborator_unit_allocations`

Uso:

- define como o colaborador “se distribui” entre unidades
- influencia cálculo de base por unidade no Lançamentos
- influencia geração de folha por unidade no backend (RPC)

Campos usados:

- `collaborator_id`
- `business_unit_id`
- `allocation_value` (valor fixo) e/ou `allocation_percent` (percentual)
- `is_primary`

### 5.3 Entidade: Instrumentos (para professores)

Tabela: `collaborator_instruments`

Uso:

- somente para colaboradores de `department='teacher'`
- suportar seleção de instrumentos na UI do colaborador

Campos usados:

- `collaborator_id`
- `instrument_id`
- `is_primary`

### 5.4 Entidade: Lançamentos de folha (itens variáveis)

Tabela: `collaborator_payroll_items`

Conceito:

- cada lançamento é um item variável do mês
- pode ser provento (positivo) ou desconto (negativo)
- é “unit-scoped” (por unidade) no RH moderno

Campos usados:

- `tenant_id`
- `collaborator_id`
- `reference_month` (sempre primeiro dia do mês: YYYY-MM-01)
- `business_unit_id`:
  - null: “legado/sem unidade” (suportado em regras específicas)
  - não-null: lançamento de uma unidade específica
- `item_type`:
  - bonus
  - commission
  - transport
  - reimbursement
  - discount
  - inss
  - alimony
  - advance
  - other
- `description`
- `amount`:
  - positivo: provento
  - negativo: desconto
- `created_at`

Migration relevante:

- `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`
  - adiciona `business_unit_id` e índices

### 5.5 Entidade: Exceções mensais de rateio (override)

Tabela: `collaborator_allocation_overrides`

Conceito:

- rateio “padrão” é o cadastro (allocations) e/ou regra by_students
- override é um ajuste pontual por mês, por unidade, com motivo (auditoria)

Campos usados:

- `tenant_id`
- `collaborator_id`
- `business_unit_id`
- `reference_month` (YYYY-MM-01)
- `allocation_value` (valor fixo do mês naquela unidade) OU
- `allocation_percent` (percentual do mês naquela unidade)
- `reason` (obrigatório na UI)
- `created_by`, `created_at`, `updated_at`

Migration relevante:

- `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`

### 5.6 Entidade: Folha gerada (payroll run)

Tabela: `payroll_runs`

Conceito:

- representa uma folha “fechada/gerada” (mesmo que em draft)
- agora existe por unidade e opcional consolidada

Campos usados:

- `tenant_id`
- `business_unit_id`:
  - null: consolidado (grupo)
  - não-null: folha de uma unidade
- `reference_month`
- `status`
  - draft
  - reviewing
  - approved
  - paid
  - cancelled
- totais:
  - `total_gross`
  - `total_deductions`
  - `total_net`
  - `collaborator_count`
- auditoria:
  - `created_at`
  - `approved_at`
  - `approved_by`
  - `paid_at`

Migration relevante:

- `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`
  - altera unicidade: por unidade por mês, e consolidado por mês (unit null)
- `supabase/migrations/20260108_phase2_collaborators_leads_units.sql`
  - adiciona `business_unit_id` em payroll_runs (se não existia)

### 5.7 Entidade: Linha da folha (payroll entry)

Tabela: `payroll_entries`

Conceito:

- cada linha representa o que será pago para 1 colaborador naquele run
- no modo “unidade”, o net_amount é o valor daquela unidade
- o breakdown carrega detalhamento (itens + allocations)

Campos usados:

- `tenant_id`
- `business_unit_id` (para reforçar escopo)
- `payroll_run_id`
- `collaborator_id`
- `base_salary` (no run de unidade é apenas a parcela daquela unidade)
- `total_additions` (somente itens daquela unidade)
- `total_deductions` (somente itens daquela unidade)
- `net_amount` (base + adds - deds)
- `breakdown` (JSONB)
- `status` (pending/paid/cancelled) quando aplicável

Migration relevante:

- `supabase/migrations/20260108_phase2_collaborators_leads_units.sql`
  - adiciona `business_unit_id`
- `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`
  - atualiza geração do draft para ser unit-safe

### 5.8 Entidades de Relatórios

Tabelas:

- `report_templates`
- `reports`
- `report_views`
- `report_comments`

Migration relevante:

- `supabase/migrations/20260130_create_reports_module.sql`

Funções principais:

- `generate_report_share_token(p_report_id)`
- `get_report_by_token(p_token)`
- `register_report_view(p_token, ...)`
- `get_payroll_report_data(p_reference_month, p_business_unit_id)`
- `approve_report(p_report_id, p_action, p_comment)`

---

## 6) Contratos backend (RPCs) usados pelo RH

### 6.1 RPC: generate_payroll_draft

Função: `public.generate_payroll_draft(p_reference_month, p_business_unit_id default null)`

Fonte: `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`

Objetivo:

- criar `payroll_runs` e `payroll_entries` do período, respeitando:
  - tenant
  - unidade (quando p_business_unit_id não-null)
  - regras de rateio
  - override mensal
  - lançamentos por unidade
  - “itens legacy” sem unidade em casos específicos

Regra de unicidade:

- se já existe payroll_run para (tenant, unidade, mês), falha
- se já existe consolidado (tenant, mês) com unidade null, falha

Regras de seleção de colaboradores:

- consolidado:
  - pega todos colaboradores ativos do tenant
- unidade:
  - pega colaboradores ativos que:
    - ou tenham unidade base igual à unidade
    - ou tenham alocação nessa unidade

Regras de base_salary “por unidade”:

Se consolidado (unit null):

- base_portion = base_salary completo

Se unidade:

Ordem de precedência (importante):

1) Override do mês (collaborator_allocation_overrides) para (collab, unit, month):
   - se tem allocation_value, usa como base_portion
   - se tem allocation_percent, aplica como base_portion de forma consistente
2) Sem override:
   - allocation_mode = none:
     - se base_unit do collab == unidade: base_portion = base_salary
     - senão: base_portion = 0
   - allocation_mode = by_students:
     - usa `calculate_teacher_allocation_by_students(collab, month)` e pega a linha da unidade
   - allocation_mode = fixed:
     - usa `collaborator_unit_allocations`:
       - prefere allocation_value
       - senão usa allocation_percent * base_salary

Regra de lançamentos (collaborator_payroll_items):

Consolidado:

- inclui todos itens do mês do colaborador, ignorando unidade

Unidade:

- inclui itens com `business_unit_id = unidade`
- inclui itens legacy com `business_unit_id is null` somente se:
  - allocation_mode='none' (colaborador “de uma unidade só”)
  - business_unit_id do colaborador == unidade

Regra de allocations no breakdown:

Consolidado:

- inclui “distribuição por unidades” no breakdown:
  - by_students: lista todas unidades resultantes do cálculo
  - demais: lista allocations cadastradas

Unidade:

- evita “vazamento” de allocations de outras unidades
- coloca no breakdown um array com exatamente 1 allocation:
  - unit_id = unidade atual
  - value = net_amount daquela unidade

Regra de “linhas zeradas”:

Unidade:

- se net_amount ~ 0, pula (não cria payroll_entry)

Totais do payroll_run:

- total_gross = soma(base_portion + additions)
- total_deductions = soma(deductions)
- total_net = soma(net)
- collaborator_count = quantidade de entradas inseridas

### 6.2 RPC: calculate_teacher_allocation_by_students (dependência)

No repositório, essa função é chamada por:

- `services/collaboratorService.ts` (`calculateTeacherAllocation`)
- `generate_payroll_draft` (na migration de payroll)

Observação crítica:

- o SQL de criação dessa função não está versionado em `supabase/migrations/` neste repositório.
- para o novo sistema, ela é um requisito funcional.

Contrato esperado (pela forma de uso no código):

- input:
  - `p_collaborator_id`
  - `p_reference_month` (YYYY-MM-01)
- output por unidade:
  - `business_unit_id`
  - `unit_name`
  - `student_count`
  - `allocation_percent`
  - `allocation_value`

### 6.3 RPC: approve_and_generate_payroll_transactions (dependência)

No frontend, a aprovação da folha chama:

- `supabase.rpc('approve_and_generate_payroll_transactions', { p_payroll_run_id })`

Observação crítica:

- o SQL de criação dessa função não está versionado em `supabase/migrations/` neste repositório.
- há documentação/menções em `docs/` e o frontend depende disso para a “folha virar despesas”.

Contrato esperado:

- input:
  - `p_payroll_run_id`
- output:
  - quantidade de transações (INT)

Responsabilidade:

- mudar status do payroll_run (para paid/approved conforme desenho)
- criar despesas (transactions) vinculadas ao colaborador e à unidade quando aplicável
- marcar payroll_entries como pagas

### 6.4 RPC: get_payroll_report_data

Fonte: `supabase/migrations/20260130_create_reports_module.sql`

Objetivo:

- retornar um JSON com dados agregados da folha do mês para montar relatório

Entradas:

- `p_reference_month` (DATE, YYYY-MM-01)
- `p_business_unit_id` (UUID ou null)

Saída:

- JSONB com:
  - summary (total_gross, total_net, total_deductions, headcount, variation_percent)
  - by_unit (lista)
  - by_department (lista)

Regras:

- considera apenas payroll_runs com status `approved` ou `paid`
- se `p_business_unit_id` é null:
  - soma todos payroll_runs do mês (todas as unidades)
- se não é null:
  - filtra por unidade

### 6.5 RPCs públicas de relatório (share e tracking)

Fonte: `supabase/migrations/20260130_create_reports_module.sql`

- `generate_report_share_token(report_id)`:
  - gera token
  - seta expiracao 30 dias
  - muda status draft -> sent
- `get_report_by_token(token)`:
  - retorna dados mínimos do relatório para renderização pública
  - valida expiracao
- `register_report_view(token, ...)`:
  - insere em report_views (RLS permite insert público)
  - incrementa view_count
  - status sent -> viewed

---

## 7) Contratos frontend (services/hooks) usados pelo RH

### 7.1 Service: collaboratorService

Arquivo: `services/collaboratorService.ts`

Responsabilidades:

- buscar tenant_id via `profiles` (`getTenantId`)
- CRUD de colaboradores
- persistir alocações e instrumentos
- CRUD de lançamentos (payroll_items)
- CRUD de overrides
- listar payroll_runs e payroll_entries
- chamar RPCs de geração/aprovação
- fornecer históricos para gráficos

Pontos de atenção para replicação:

- `fetchCollaborators`:
  - faz join com allocations e instruments
  - se filtra por unidade, usa `!inner` em `collaborator_unit_allocations`
  - no mapping final, também gera `unitNames` e `instrumentNames`
- `saveAllocations` e `saveInstruments`:
  - estratégia “replace all”: delete tudo e insert do payload
- `fetchPayrollItemsForMonthUnit`:
  - join com collaborators para exibir name e department na tabela de lançamentos
- `duplicatePayrollItemsMonthUnit`:
  - evita duplicatas comparando a chave:
    - collaborator_id + item_type + description + amount
- `fetchPayrollClosedTotals`:
  - detecta se existe folha (run) fechada para o mês
  - para consolidado:
    - se existir run oficial com business_unit_id null, usa ele
    - senão, soma entries dos runs por unidade
- `generatePayrollDraft`:
  - chama RPC com p_business_unit_id (ou null)

### 7.2 Hook: useCollaborators / usePayrollLaunches / usePayrollRuns

Arquivo: `hooks/useCollaborators.ts`

Uso no RH:

- Colaboradores:
  - `useCollaborators({ unitId })`
- Lançamentos:
  - `usePayrollLaunches(referenceMonth, businessUnitId)`
- Folha:
  - `usePayrollRuns(unitId?)` e `usePayrollRun(runId)`
- Subcomponentes:
  - `usePayrollItems(collaboratorId, month, unit)`
  - `useAllocationOverrides(collaboratorId, month)`
  - `useTeacherAllocation(collaboratorId, month)`

### 7.3 Service: reportService

Arquivo: `services/reportService.ts`

Responsabilidades:

- CRUD de reports e templates
- gerar conteúdo padrão do relatório mensal (usando get_payroll_report_data)
- gerar WhatsApp message e URL wa.me
- compartilhar (token)
- leitura pública por token e registro de view
- aprovação do relatório e comentários

### 7.4 Hook: useReports / usePublicReport

Arquivo: `hooks/useReports.ts`

Responsabilidades:

- listagem de relatórios e templates
- criação/edição/exclusão
- compartilhamento
- carregamento público via token:
  - `usePublicReport(token)` chama `fetchReportByToken(token)` e registra a view

---

## 8) Especificação de UI/UX comum (padrões do módulo)

### 8.1 Layout geral

O módulo é renderizado dentro do layout padrão do app:

- sidebar fixa
- header com:
  - título do módulo atual
  - seletor de mês global (setas)
  - seletor de unidade/conta
  - toggle dark mode

### 8.2 Estilo e linguagem visual

Características:

- tipografia forte (muitos elementos em uppercase tracking-widest para “UI administrativa”)
- cards arredondados (rounded-2xl / rounded-3xl)
- dark mode com classes `dark:*`
- feedback visual com cores semânticas:
  - verde: sucesso/positivo/aprovado
  - amarelo: atenção/pendente/alerta
  - vermelho: erro/negativo/desconto
  - violeta: ação principal do módulo e seleção de tab

### 8.3 Estados de carregamento e erro

Padrões observados:

- loading:
  - centralizado
  - icon `Loader2` girando
  - texto pequeno uppercase
- erro:
  - bloco com texto em vermelho, geralmente simples
  - em relatórios há botão “Tentar novamente”

### 8.4 Confirmações e modais

O módulo mistura:

- `confirm()` e `alert()` do browser (muito usado em ações destrutivas)
- `AlertDialog` do design system para algumas confirmações (ex.: excluir relatório)
- modais próprios com overlay (ex.: editor de relatórios, share modal)

Para o novo sistema, recomenda-se padronizar em um único componente, mas para ficar “igual”, considere manter comportamento híbrido.

### 8.5 Persistências em localStorage (UX)

Além do contexto operacional, há persistências de UX:

- Colaboradores (modo de visualização):
  - `people:collaborators:viewMode` = `cards` ou `table`
- Lançamentos (seções colapsadas por mês + unidade):
  - `payroll:launches:collapsed:${referenceMonth}:${unitKey}`

---

## 9) Aba 1 — Colaboradores (especificação completa)

### 9.1 Visão geral

Objetivo:

- cadastrar e manter dados de colaboradores (staff, professores, operacional)
- definir rateio/alocação por unidade
- cadastrar dados bancários e dados PJ
- cadastrar lançamentos individuais (itens) e exceções mensais de rateio (dentro do modal)

Componente principal:

- `components/settings/collaborators/CollaboratorsManager.tsx`

### 9.2 Frontend — fluxos principais

Fluxo A: Listar e filtrar colaboradores

- abre a aba “Colaboradores”
- carrega colaboradores via `useCollaborators({ unitId })`
- aplica filtros locais:
  - search (nome/email/função)
  - departamento
  - status
- exibe stats cards:
  - total
  - staff
  - professores
  - folha base (soma baseSalary)

Fluxo B: Alternar visualização (Cards x Tabela)

- toggle no topo
- persistido em `localStorage` (`people:collaborators:viewMode`)

Fluxo C: Criar colaborador

- botão “Novo Colaborador”
- abre `CollaboratorModal` vazio
- salvar chama:
  - `createCollaborator(input)` (service)
  - depois salva allocations/instruments (replace-all)

Fluxo D: Editar colaborador

- botão editar (card ou tabela)
- abre modal com dados
- salvar chama:
  - `updateCollaborator(id, partial)`
  - e atualiza allocations/instruments conforme payload

Fluxo E: Inativar / Reativar

- ação “Inativar” muda status:
  - active -> inactive
  - inactive -> active

Fluxo F: Excluir

- confirma via `confirm()`
- chama `deleteCollaborator(id)`

### 9.3 Frontend — estrutura da tela (wireframe)

Wireframe (desktop, cards):

```
PESSOAS / RH
[Colaboradores] [Lançamentos] [Folha de Pagamento] [Relatórios]

-----------------------------------------------
Stats:
[Total] [Staff] [Professores] [Folha Base]

Filtros:
[Busca por nome/email/função.................]
[Departamento: Todos] [Status: Todos]
            [Cards] [Tabela]   [Novo Colaborador]

Grid cards:
[Card Colaborador] [Card Colaborador] [Card Colaborador]
[Card Colaborador] [Card Colaborador] [Card Colaborador]
...
```

Wireframe (desktop, tabela):

```
Tabela:
Nome | Departamento | Função | Contrato | Status | Unidades | Base | Ações
-----------------------------------------------------------------------
Fulano | Staff | Financeiro | PJ | Ativo | CG, Barra | R$ ... | [E] [I] [X]
...
```

### 9.4 Frontend — UI/UX detalhada

#### 9.4.1 Stats cards

Características:

- grid responsivo 2 colunas (mobile) / 4 colunas (desktop)
- ícones e cor por tipo
- folha base usa formatação BRL (pt-BR)

#### 9.4.2 Busca e filtros

Busca (string):

- compara:
  - name
  - email
  - role
- case-insensitive

Filtros:

- departmentFilter:
  - `all` ou um valor do enum
- statusFilter:
  - `all` ou um valor do enum

#### 9.4.3 Visualização em tabela

Detalhes:

- zebra rows
- chips para departamento e status
- unidades exibidas como tags:
  - mostra até 2 e depois “+N”

#### 9.4.4 Ações por colaborador

Ações e tooltips:

- Editar (Pencil)
- Inativar/Reativar (UserX/UserCheck)
- Excluir (Trash)

### 9.5 Modal do colaborador (cadastro/edição) — seções e UX

Componente:

- `components/settings/collaborators/CollaboratorModal.tsx`

O modal é dividido em seções (menu lateral interno):

- Dados Pessoais
- Vínculo
- Remuneração
- Alocação por Unidade
- Dados Bancários
- Instrumentos (condicional: somente dept=teacher)

Importante:

- o modal também contém editores “operacionais” (dentro da seção Remuneração):
  - editor de itens do mês
  - editor de exceções mensais de rateio

Wireframe (modal, desktop):

```
-------------------------------------------------------------
Modal: Colaborador (Cadastrar/Editar)
[X]
-------------------------------------------------------------
Menu lateral:
  > Dados Pessoais
  > Vínculo
  > Remuneração
  > Alocação por Unidade
  > Dados Bancários
  > Instrumentos (se professor)

Área de conteúdo:
  Campos da seção selecionada

Rodapé:
  [Cancelar] [Salvar]
-------------------------------------------------------------
```

#### 9.5.1 Dados Pessoais

Campos (observados no form state e mapping):

- Nome (obrigatório)
- Email
- Telefone
- CPF
- RG
- Data de nascimento
- Endereço (logradouro)
- Bairro
- Cidade
- UF (select com lista de estados)
- CEP

Regras de validação:

- nome obrigatório (trim)
- demais campos aceitam null/empty

#### 9.5.2 Vínculo

Campos:

- Departamento:
  - staff / teacher / operational
- Função (role)
- Tipo de contrato:
  - pj / clt / mei / estagiario / diarista / rpa
- Status:
  - active / inactive / on_leave
- Data de admissão (hire_date)
- Data de desligamento (termination_date)
- Dados PJ (condicionais, conforme uso operacional):
  - Razão social
  - CNPJ
  - Inscrição municipal

Regra automática importante:

- quando `contractType === 'pj'` e `department === 'teacher'`:
  - `allocationMode` é forçado para `by_students`
- quando `contractType === 'clt'`:
  - `allocationMode` é forçado para `fixed`

#### 9.5.3 Remuneração

Campos:

- Salário base (base_salary)
- Mês de referência (MonthPicker)
- Unidade (para itens do mês) — default:
  - primary allocation
  - ou business_unit_id do colaborador
  - ou primeira unidade cadastrada

Subcomponentes importantes:

- `PayrollItemsEditor` (itens do mês por colaborador + unidade)
- `AllocationOverrideEditor` (exceções de rateio por mês)

#### 9.5.4 Alocação por Unidade

Componente:

- `AllocationEditor.tsx`

Modos:

- none:
  - conceito: 100% em uma unidade
  - UI permite múltiplas unidades com percentuais se houver mais de 1 linha (edge case)
- fixed:
  - UI mostra campo de valor fixo (R$) por unidade
- by_students:
  - UI mostra aviso “automático”
  - ainda permite escolher as unidades em que atua (cadastro de unidades serve como “escopo”)

Regras UX:

- botão “Adicionar Unidade” se houver unidades disponíveis não adicionadas
- marcação de “Principal”:
  - só pode existir uma unidade principal
  - ao remover a principal, a primeira vira principal automaticamente

#### 9.5.5 Dados Bancários

Campos:

- Chave PIX
- Banco
- Agência
- Conta
- Tipo de conta

#### 9.5.6 Instrumentos (somente teacher)

Componente:

- `InstrumentSelect.tsx`

Objetivo:

- selecionar lista de instrumentos
- marcar o primeiro como principal (no backend, `is_primary` é index===0 no insert)

### 9.6 Backend — queries/tabelas usadas em Colaboradores

Leituras:

- `select * from collaborators`
- join:
  - `collaborator_unit_allocations ( ... business_units (id, name) )`
  - `collaborator_instruments ( ... instruments (id, name) )`

Escritas:

- insert/update em `collaborators`
- replace-all em:
  - `collaborator_unit_allocations`
  - `collaborator_instruments`

Observação:

- o frontend sempre calcula tenant_id pelo profile e envia `tenant_id` na criação.
- o RLS precisa permitir `INSERT` com tenant_id do usuário.

---

## 10) Aba 2 — Lançamentos (especificação completa)

### 10.1 Visão geral

Objetivo:

- operar como “planilha” de lançamentos mensais
- por unidade ou consolidado
- com prévia de folha, KPIs e gráficos
- permitir exportar para Excel
- permitir duplicar lançamentos do mês anterior (por unidade)
- finalizar: gerar “folha oficial” (payroll_run) e navegar para a aba Folha

Componente principal:

- `components/payroll/PayrollLaunchesManager.tsx`

### 10.2 O que o usuário vê (macro UX)

Três blocos:

1) Header da aba:
   - título (Lançamentos)
   - navegação de mês (setas e MonthPicker)
   - botões de ação (duplicar, exportar, gerar folha)
2) KPIs e gráficos:
   - totais base/adicionais/descontos/líquido
   - gráficos de evolução e distribuição
   - alertas e métricas (ex.: folha sobre receita)
3) Tabela estilo planilha:
   - seções colapsáveis por departamento:
     - Staff Rateado
     - Equipe Operacional
     - Professores
   - células editáveis inline
   - modal para criar/editar lançamentos “manuais” quando necessário

### 10.3 Modos de unidade: Consolidado vs Unidade

No topo, existe um seletor de “aba interna”:

- Consolidado
- [Unidade 1]
- [Unidade 2]
- [Unidade 3]

Regra:

- se `activeBusinessUnitId !== 'all'`, a aba trava na unidade do contexto global
- se `activeBusinessUnitId === 'all'`, o default é Consolidado

Variável-chave:

- `effectiveUnitId`:
  - null quando selectedUnitId = consolidated
  - uuid da unidade quando selectedUnitId = unit.id

Consequência:

- Consolidado não permite criar/editar lançamentos (células bloqueadas)
- Lançamentos só existem “de verdade” por unidade

### 10.4 Frontend — fonte de dados (hooks/services)

Dados principais:

- colaboradores:
  - `useCollaborators()` (sem filtro de unidade)
- lançamentos do mês:
  - `usePayrollLaunches(referenceMonth, effectiveUnitId)`
- totais de folha já fechada:
  - `fetchPayrollClosedTotals({ referenceMonth, businessUnitId: effectiveUnitId })`
- KPIs (receita):
  - `fetchKPIs(new Date(referenceMonth), effectiveUnitId, accountId?)`
- histórico para gráficos:
  - folha: `fetchPayrollHistory({ unitId, referenceMonth })`
  - receita: `fetchHistoricalData(date, unitId, accountId?)`

### 10.5 Regras de cálculo no frontend (importantes para replicação)

#### 10.5.1 “Ativo no mês”

Antes de listar um colaborador na tabela, o sistema checa se ele deveria aparecer no mês:

- usa `hireDate` (ou fallback `createdAt`)
- usa `terminationDate`
- considera ativo se:
  - hire <= final do mês
  - termination >= início do mês

Função: `isCollaboratorActiveForMonth(collab, referenceMonth)`

#### 10.5.2 Base efetiva por unidade

Para cálculos e export, o sistema calcula a base “daquela unidade”:

Função: `getEffectiveBaseSalary(collab, unitId)`

Regra:

- se unitId null (consolidado):
  - baseSalary total
- se unitId não-null:
  - se existe allocation para a unidade:
    - usa allocationValue se existir
    - senão usa allocationPercent * baseSalary
  - senão, se collab.businessUnitId == unitId:
    - usa baseSalary
  - senão:
    - 0

Observação:

- o backend (RPC generate_payroll_draft) tem regras mais fortes e considera override mensal; o frontend aqui é uma prévia/cálculo operacional, não o “cálculo final” oficial.

#### 10.5.3 Totais exibidos (fonte preferencial)

O componente calcula `totals` assim:

1) Se existe folha fechada no mês/unidade (closedTotals.exists):
   - usa os totais da folha fechada
   - source = closed
2) Se não existe folha fechada mas há lançamentos:
   - calcula prévia:
     - additions = soma itens positivos
     - deductions = soma abs(itens negativos)
     - base = soma getEffectiveBaseSalary de todos colaboradores do escopo
     - net = base + additions - deductions
   - source = preview
3) Se não há folha e não há lançamentos:
   - zera tudo
   - source = none

#### 10.5.4 INSS sugerido (cálculo local)

O componente implementa um cálculo progressivo de INSS 2024:

- função `calculateINSS(salary)`
- aplicado como sugestão para CLT quando não existe item_type=inss

Importante:

- isso é uma regra de UI/UX e “prévia”.
- o backend pode (e deve) ter o cálculo oficial para folha paga, se aplicável.

### 10.6 Edição inline estilo planilha (CellInput)

Características-chave para replicação “igual”:

- cada célula representa um tipo de item (ex.: bonus, commission etc.)
- a célula:
  - soma múltiplos itens do mesmo tipo e exibe total absoluto
  - quando editada:
    - se existir exatamente 1 item: faz update desse item
    - se não existir item e valor > 0: cria item com description padrão
    - se existir >1 item: célula fica bloqueada (usa modal/edição manual)
- consolidação (unitId null):
  - bloqueia edição (cursor not-allowed / opacity)

Teclas:

- Enter:
  - salva (blur) e desce uma linha
- Tab:
  - vai para próxima célula (Shift+Tab volta)
- ArrowUp/ArrowDown:
  - navega entre linhas
- ArrowLeft/ArrowRight:
  - navega entre células quando cursor está no começo/fim
- Escape:
  - cancela e restaura valor anterior

Feedback visual:

- spinner pequeno ao salvar
- estado de erro marca célula (visual) e restaura valor anterior
- “valor sugerido” aparece como um ponto sutil (ex.: INSS sugerido)

### 10.7 Modal de lançamento (criar/editar)

O componente também tem um modal de formulário para criar/editar um lançamento específico.

Regras:

- só pode criar/editar se houver `effectiveUnitId` (não consolidado)
- valor:
  - deve ser > 0 no formulário
  - sinal é aplicado automaticamente:
    - itemTypes negativos: inss/discount/alimony/advance => gravar negativo
    - demais => gravar positivo

### 10.8 Duplicar lançamentos do mês anterior

Botão:

- só funciona se `effectiveUnitId` existe (unidade selecionada)

Regra:

- pega o mês anterior e duplica do anterior para o mês atual
- evita duplicatas pelo critério:
  - colaborador + tipo + descrição + valor

Resposta UX:

- alert com quantidade duplicada
- alert “nenhum lançamento” se não havia fonte

### 10.9 Exportar Excel

Service:

- `services/payrollExportService.ts`

O export gera uma planilha com:

- cabeçalho:
  - “MusiClass - Gestão de Folha de Pagamento”
  - unidade
  - mês de referência
- colunas:
  - Colaborador
  - Função
  - Tipo Contrato
  - Unidade Base
  - Salário Base (Rateado)
  - Acréscimos
  - Descontos
  - INSS
  - Líquido a Pagar
- linha TOTAL no final

Observação:

- o export do “Consolidado” é uma soma lógica do que aparece no modo consolidado (prévia), não um payroll_run oficial.

### 10.10 Finalizar e gerar folha (payroll_run)

Botão:

- “Finalizar e Gerar Folha”

Fluxo:

- abre um modal de resumo (showSummaryModal)
- ao confirmar:
  - chama `usePayrollRuns(effectiveUnitId).generate(referenceMonth)`
  - no sucesso:
    - chama callback `onNavigateToPayroll(referenceMonth, unitId)` (do container People)
    - isso troca a aba para “Folha de Pagamento”

Tratamento de erro:

- se RPC falha por folha já existente, abre um modal de erro com título “Folha já existente”

### 10.11 Wireframes detalhados (Lançamentos)

Wireframe (topo + tabs por unidade):

```
LANÇAMENTOS                         [Mês: YYYY-MM] [Exportar] [Duplicar] [Gerar Folha]
----------------------------------------------------------------------------
[Consolidado] [Unidade A] [Unidade B] [Unidade C]
----------------------------------------------------------------------------
```

Wireframe (KPIs):

```
[Base] [Adições] [Descontos] [Líquido]
```

Wireframe (tabela por seção, estilo planilha):

```
Seção: Staff Rateado (colapsável)
---------------------------------------------------------------------------
Nome | Função | Contrato | Base | Bônus | Comissão | Passagem | Reemb. | Desc. | INSS | Total
---------------------------------------------------------------------------
...
TOTAL Staff: ...
```

Wireframe (modal lançamento):

```
Modal: Novo Lançamento
Unidade: (fixa pela aba)
Mês: YYYY-MM-01
Colaborador: [select]
Tipo: [select]
Valor: [input BRL]
Descrição: [input opcional]
[Cancelar] [Salvar]
```

---

## 11) Aba 3 — Folha de Pagamento (especificação completa)

### 11.1 Visão geral

Objetivo:

- mostrar histórico de folhas geradas (payroll_runs)
- permitir abrir uma folha e revisar entries
- permitir aprovar folha (gera despesas no financeiro via RPC)
- permitir visão consolidada (quando permitido)

Componente principal:

- `components/payroll/PayrollManager.tsx`

### 11.2 Modos: Unidade x Consolidado

O componente trabalha em dois modos internos:

- mode = unit
- mode = consolidated

Regras:

- se `activeBusinessUnitId === 'all'`:
  - mode inicial pode ser consolidated
  - há botão “Ver Consolidado”
  - há dropdown de unidade para navegar nas folhas por unidade
- se `activeBusinessUnitId !== 'all'`:
  - mode = unit
  - `unitId` fixo pela unidade ativa

### 11.3 Listagem de payroll_runs

Fonte:

- `usePayrollRuns(unitId?)`

UI:

- cards em grid
- cada card mostra:
  - mês (label)
  - status (chip)
  - colaboradores (count)
  - líquido (totalNet)
  - bruto / descontos (detalhes)

Ações:

- visualizar (Eye) -> abre “viewingRunId”
- excluir (Trash) -> permitido apenas se status != paid

### 11.4 Visualização de um payroll_run (review)

Quando `viewingRunId` está definido:

- mostra header:
  - botão voltar
  - título do mês
  - chip de status
  - colaboratorCount
- mostra botão “Aprovar Folha” se status === draft
- renderiza tabela:
  - `PayrollReviewTable entries={viewingRun.entries}`

### 11.5 Aprovação e geração de despesas

Quando o usuário aprova:

- abre `PayrollApproveModal`
- ao confirmar, chama `usePayrollRuns.approve(runId)`:
  - internamente chama `services/collaboratorService.approvePayroll(runId)`
  - que chama RPC `approve_and_generate_payroll_transactions`

UX:

- botão no card (“Aprovar e Gerar Despesas”) para status draft
- após aprovação:
  - a lista recarrega (refetch)
  - status muda e a folha pode ser “paga”

### 11.6 Consolidado da folha (quando activeBusinessUnitId = all)

Conceito implementado:

- o consolidado tenta achar um payroll_run oficial com:
  - business_unit_id IS NULL
  - reference_month == mês selecionado
- se existir:
  - exibe “Folha Consolidada Gerada”
  - botão “Ver Detalhamento Completo”
- se não existir:
  - soma as folhas por unidade (comportamento atual)
  - mostra cards por unidade com líquido e headcount

### 11.7 Wireframes (Folha)

Wireframe (listagem):

```
FOLHA DE PAGAMENTO
Unidade: [dropdown]   [Ver Consolidado]

[Card Mês] [Card Mês] [Card Mês]
```

Wireframe (card):

```
Mês/Ano
[Status]
Colaboradores: N
Líquido: R$ ...
Bruto: R$ ...
Descontos: R$ ...
[Aprovar e Gerar Despesas] (se draft)
```

Wireframe (visualização):

```
< Voltar     Folha de Mês/Ano    [Status]
[Aprovar Folha] (se draft)

Tabela de revisão:
Nome | Departamento | Base | Adições | Descontos | Líquido | Detalhes
...
```

---

## 12) Aba 4 — Relatórios (especificação completa)

### 12.1 Visão geral

Objetivo:

- gerar relatório mensal de folha (padrão)
- criar relatório personalizado com templates e editor drag & drop
- compartilhar relatório via link público `/r/TOKEN`
- acompanhar visualizações
- (fase 3) aprovação e comentários no link público

Componentes principais:

- `components/reports/ReportsManager.tsx`
- `components/reports/ReportEditorModal.tsx`
- `components/reports/ReportShareModal.tsx`
- `pages/PublicReport.tsx` (público)

### 12.2 Listagem e filtros

Fonte:

- `useReports({ department: 'rh' })`

Filtros:

- busca por título
- agrupamento por mês (`referenceMonth.slice(0,7)`)

### 12.3 Criar relatório padrão (“Gerar Folha” na aba Relatórios)

Botão:

- “Gerar Folha”

Fluxo:

- monta CreateReportInput:
  - title: “Relatorio de Folha - {mês} ({unidade opcional})”
  - referenceMonth = selectedMonth
  - businessUnitId = null se “Todas as Unidades”, senão uuid
  - department = rh
- chama `useReports.add(input)`
- service `reportService.createReport`:
  - chama RPC `get_payroll_report_data`
  - monta `content` (JSON) via `generateMonthlyPayrollContent`
  - insere em `reports`
- abre viewer modal com o relatório criado

### 12.4 Criar relatório personalizado (templates + editor)

Botão:

- ícone (Sparkles) abre seletor de templates

Fluxo:

- TemplateSelector:
  - templates de código (`components/reports/templates`)
  - escolha um template e abre editor com componentes clonados
  - ou começar em branco
- ReportEditorModal:
  - sidebar com componentes disponíveis:
    - title
    - subtitle
    - text
    - kpi_row
    - table
    - chart_donut
    - alert_list
    - divider
  - área central com lista de componentes
  - reorder drag & drop com `@dnd-kit`
  - configurar componente abre modal de configuração
  - “Salvar como template” grava em `report_templates`

### 12.5 Viewer do relatório (interno)

Componente:

- `ReportViewerModal.tsx`

Objetivo:

- visualizar relatório dentro do app
- chamar share

### 12.6 Share modal (gerar link público)

Componente:

- `ReportShareModal.tsx`

Regras:

- se relatório não tem token:
  - chama `generateShareToken(report.id)` (RPC)
  - seta status draft -> sent (no backend)
- monta URL:
  - `${window.location.origin}/r/${token}`
- ações:
  - copiar link (clipboard com fallback)
  - abrir WhatsApp (wa.me)
  - abrir email (mailto)
  - listar visualizações recentes (report_views)
  - abrir em nova aba

### 12.7 Rota pública `/r/TOKEN` (fora do app autenticado)

Boot:

- `index.tsx` detecta `window.location.pathname.startsWith('/r/')`
- se sim:
  - renderiza `PublicReport token={TOKEN}` sem os providers do app
  - mas ainda dentro do `QueryClientProvider`

Página pública:

- `pages/PublicReport.tsx`

Fonte de dados:

- `usePublicReport(token)`:
  - chama `get_report_by_token(token)`
  - registra view `register_report_view(token)`

UI:

- layout mobile-first
- header com gradiente
- conteúdo renderizado por componentes (renderers)
- seção de aprovação e comentários:
  - `ApprovalRenderer`
  - chama RPC `approve_report` quando aprova/revisão
  - comentários entram em `report_comments`

### 12.8 Wireframes (Relatórios)

Wireframe (listagem):

```
RELATÓRIOS
Mês: [MonthPicker]   Unidade: [Todas | Unidade X]
[Gerar Folha] [Criar Personalizado]

Busca: [...........]

Mês AAAA-MM
[Card Relatório] [Card Relatório] [Card Relatório]
```

Wireframe (share modal):

```
Compartilhar Relatório
Link público: [input readonly] [Copiar]
Expira em N dias | Visualizações: N
[WhatsApp] [Email]
Visualizações recentes:
  - Visitante | data/hora
[Abrir em nova aba]
```

Wireframe (público):

```
Header gradiente:
  MusiClass
  Título
  Mês / Unidade / Autor / Data de geração

Conteúdo:
  [KPIs]
  [Tabela por unidade]
  [Donut por categoria]
  [Alertas]

Aprovação/Comentários:
  Status atual
  [Aprovar] [Solicitar revisão]
  Comentários (lista + adicionar)
```

---

## 13) Especificação de backend por aba (resumo rápido por “contrato”)

### 13.1 Colaboradores

Tabelas:

- collaborators
- collaborator_unit_allocations
- collaborator_instruments

Operações:

- list:
  - select com joins
  - filtros opcionais por department/status/contract/unit
- create/update:
  - insert/update colaborador
  - replace allocations
  - replace instruments

### 13.2 Lançamentos

Tabelas:

- collaborator_payroll_items

Operações:

- list do mês:
  - por unidade: `reference_month + business_unit_id`
  - consolidado: `reference_month` (sem unidade)
- create/update/delete:
  - unit-scoped
- duplicate:
  - copiar mês anterior por unidade evitando duplicatas

### 13.3 Folha

Tabelas:

- payroll_runs
- payroll_entries

RPCs:

- generate_payroll_draft
- approve_and_generate_payroll_transactions (requisito)

### 13.4 Relatórios

Tabelas:

- report_templates
- reports
- report_views
- report_comments

RPCs:

- generate_report_share_token
- get_report_by_token
- register_report_view
- get_payroll_report_data
- approve_report

---

## 14) Regras de negócio (o que o novo sistema precisa replicar)

### 14.1 Estrutura de departamentos (3 camadas)

O RH do MusiClass organiza colaboradores em:

- staff
- operational
- teacher

Isso define:

- agrupamento das seções na tabela de lançamentos
- distribuição em relatório (por categoria)
- leitura humana do custo

### 14.2 Rateio (allocation_mode)

Três modos:

- none:
  - custo 100% em uma unidade base
- fixed:
  - custo dividido por unidades com valor/percentual definido
- by_students:
  - custo calculado automaticamente por “quantidade de alunos por unidade” (função backend)

### 14.3 Exceção mensal (override)

Quando existe override para (collab, unit, month):

- ele tem precedência sobre qualquer outra regra para gerar a folha daquele mês/unidade
- exige motivo (auditoria)

### 14.4 Lançamentos por unidade

Lançamentos são por unidade.

Regras principais:

- UI do consolidado é somente leitura
- geração da folha por unidade usa apenas itens daquela unidade
- itens “sem unidade” (legacy) só entram em unidade quando colaborador é “100%” daquela unidade

### 14.5 A folha “oficial” é o payroll_run (auditável)

O MusiClass separa:

- Lançamentos (inputs operacionais)
- Folha (resultado oficial auditável)

E a UI reforça isso:

- se já existe folha, o usuário é orientado a excluir a folha antiga para recalcular

### 14.6 Relatório é derivado de folha aprovada/paga

O relatório usa:

- payroll_runs com status approved/paid
- payroll_entries associadas

Logo:

- para o novo sistema: relatórios devem ser gerados a partir de “fonte oficial” (runs aprovados), não apenas de lançamentos.

---

## 15) Checklist de replicação (para o novo sistema)

### 15.1 Infra

- Banco Postgres com multi-tenant e RLS (ou camada equivalente)
- Autenticação e identificação de tenant do usuário
- RBAC:
  - roles
  - acesso por unidade
  - acesso por conta
  - contexto default

### 15.2 Backend (mínimo funcional para RH)

- Tabelas:
  - collaborators
  - collaborator_unit_allocations
  - collaborator_instruments
  - collaborator_payroll_items (com business_unit_id)
  - collaborator_allocation_overrides
  - payroll_runs (unit + consolidated)
  - payroll_entries (com breakdown JSONB)
  - report_templates
  - reports
  - report_views
  - report_comments
- RPCs:
  - generate_payroll_draft(reference_month, business_unit_id)
  - approve_and_generate_payroll_transactions(payroll_run_id)
  - calculate_teacher_allocation_by_students(collaborator_id, month)
  - get_payroll_report_data(month, unit)
  - generate_report_share_token(report_id)
  - get_report_by_token(token)
  - register_report_view(token, ...)
  - approve_report(report_id, action, comment)
- Índices e constraints:
  - unicidade payroll_run por (tenant, unit, month) e (tenant, month) para consolidado
  - índices por tenant/month/unit em itens e overrides

### 15.3 Frontend (mínimo funcional)

- Página Pessoas/RH com 4 abas e gating por papel
- Contexto operacional (unidade e conta) persistido em localStorage
- Colaboradores:
  - lista com filtros, stats, cards/tabela, modal de cadastro completo
- Lançamentos:
  - tabs por unidade + consolidado
  - planilha com inline editing + teclado
  - duplicar mês anterior
  - exportar excel
  - gerar folha e navegar para aba Folha
- Folha:
  - lista payroll_runs por unidade
  - visualizar e aprovar
  - modo consolidado (quando permitido)
- Relatórios:
  - gerar relatório padrão de folha
  - editor drag & drop simples
  - templates (sistema e usuário)
  - compartilhar com link público
  - rota pública `/r/TOKEN` com renderers e aprovação/comentários

---

## 16) Referências diretas no código (para quem vai implementar)

Página container e abas:

- `pages/People.tsx`

Menu e gating:

- `components/sidebar/Sidebar.tsx`
- `hooks/useRbac.ts`
- `services/rbacService.ts`
- `src/contexts/OperationalContext.tsx`
- `components/OperationalScopeSelector.tsx`

Colaboradores:

- `components/settings/collaborators/CollaboratorsManager.tsx`
- `components/settings/collaborators/CollaboratorModal.tsx`
- `components/settings/collaborators/AllocationEditor.tsx`
- `components/settings/collaborators/PayrollItemsEditor.tsx`
- `components/settings/collaborators/AllocationOverrideEditor.tsx`
- `services/collaboratorService.ts`
- `hooks/useCollaborators.ts`

Lançamentos:

- `components/payroll/PayrollLaunchesManager.tsx`
- `services/payrollExportService.ts`

Folha:

- `components/payroll/PayrollManager.tsx`
- `components/payroll/PayrollReviewTable.tsx`
- `components/payroll/PayrollApproveModal.tsx`

Relatórios:

- `components/reports/ReportsManager.tsx`
- `components/reports/TemplateSelector.tsx`
- `components/reports/ReportEditorModal.tsx`
- `components/reports/ReportShareModal.tsx`
- `pages/PublicReport.tsx`
- `services/reportService.ts`
- `hooks/useReports.ts`
- `supabase/migrations/20260130_create_reports_module.sql`

Payroll migrations:

- `supabase/migrations/20251228_payroll_unit_runs_launches_and_overrides.sql`
- `supabase/migrations/20260108_phase2_collaborators_leads_units.sql`

RBAC migration:

- `supabase/migrations/20260103_rbac_unit_account_scope.sql`

---

## 17) Observações finais (importantes para o novo sistema)

### 17.1 Diferença entre “especificação antiga” e “implementação real”

Este repositório contém documentos antigos com wireframes e ideias mais amplas (ex.: “RELATORIOS-RH.md”, “LANCAMENTOS-RH.md”).

O que vale para replicação é:

- o que está implementado nos componentes e services atuais
- e as migrations de banco versionadas

Neste documento, o foco foi descrever o que está implementado e o que o frontend depende (mesmo quando uma função não está versionada no repo).

### 17.2 Duas dependências críticas não versionadas em migrations

O frontend do RH depende de duas funções:

- `calculate_teacher_allocation_by_students`
- `approve_and_generate_payroll_transactions`

Se o novo sistema quiser ficar “igual”, ele precisa implementar essas funções (ou endpoints equivalentes) com contratos compatíveis.

### 17.3 Rota pública (relatórios) é parte do módulo RH

Apesar de não estar “dentro” da página Pessoas/RH, ela é gerada por ela e faz parte do produto:

- `/r/TOKEN` (público)

O novo sistema deve prever:

- rota pública
- tracking de view
- aprovação e comentários
- expiração do link

---

Fim.

