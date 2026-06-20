# Decisão de modelo de acesso (RLS) — 2026-06-20

> Registro de decisão (ADR). Origem: item **S1** da auditoria de banco
> (`Docs/auditoria-frontend-2026-06-19.md` + advisors do Supabase).

## Contexto

O projeto tem RLS habilitado em todas as tabelas. Hoje convivem **dois modelos**:

1. **Tabelas core** (27 tabelas: `folhas_mensais`, `lancamentos_folha`,
   `colaboradores`, `bistro_*`, `contas_*`, `ferias_*`, `aniversarios`,
   `auth_*` da agenda, etc.) usam o modelo **amplo**: qualquer usuário
   **autenticado** pode ler/criar/editar/excluir (políticas com
   `USING true` / `with_check true` ou `auth.role() = 'authenticated'`).
   São ~74 políticas "always-true".

2. **Módulo RH** (`rh_*`, 33 tabelas) já usa **RBAC granular** via funções
   auxiliares (`rh_is_admin_or_rh()`, `rh_can_view_process()`,
   `rh_can_manage_*()`, `rh_can_view_colaborador()`), com visibilidade por
   processo/colaborador e gestão restrita a admin/RH.

Fatos de segurança relevantes:
- **Acesso anônimo está bloqueado** — todas as políticas exigem usuário
  autenticado; o front usa apenas a anon key + RLS (nunca service_role).
- Os usuários logados são o proprietário + equipe de confiança (ferramenta
  interna da escola).

## Decisão

**Manter o modelo amplo nas tabelas core** ("autenticado = acesso total"),
sem reescrever políticas. É uma escolha **deliberada e adequada** para uma
ferramenta interna cujos usuários autenticados são todos de confiança, e
evita DDL arriscado em produção (o projeto não tem branch de banco).

O módulo RH permanece com seu RBAC granular.

## Sobre os warnings do advisor

- **`auth_rls_initplan`** — já corrigido na migration
  `20260619_audit_quickwins_rls_searchpath.sql` (envolvendo `auth.*` em
  `(select …)`).
- **`multiple_permissive_policies`** (50 ocorrências) — **49 são
  intencionais**: surgem do RBAC granular do RH (uma política
  `*_manage_*` em `ALL` somada a uma `*_select_visible` em `SELECT`, ou
  `*_operacionais` + `*_allowed`). Consolidá-las significaria refatorar o
  RBAC funcional do RH, com risco alto e ganho de performance desprezível
  numa base interna. **Não serão consolidadas.** (A única fora do RH é
  `lembretes_log`, sobreposição trivial e inofensiva.)
- As políticas "always-true" das tabelas core são **aceitas por design**
  enquanto esta decisão valer.

## Quando revisitar

Reabrir esta decisão (migrando para o modelo **híbrido** ou **RBAC
completo**) se:
- Usuários **fora do círculo de confiança** passarem a ter login (ex.:
  estagiários, terceiros, multi-tenant);
- For preciso **diferenciar permissões** entre equipe (ex.: só admin
  exclui folha/contas);
- Houver requisito de **auditoria/compliance** que exija menor privilégio.

Caminhos prontos para esse momento:
- **Híbrido:** restringir só ações destrutivas (UPDATE/DELETE) em
  `lancamentos_folha`, `folhas_mensais` e `contas_*` a um papel admin
  (reaproveitando o padrão `rh_is_admin_or_rh()`).
- **RBAC completo:** espelhar o rigor do módulo RH nas 27 tabelas core.
