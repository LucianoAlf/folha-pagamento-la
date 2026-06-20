-- =====================================================
-- S1 (auditoria 2026-06): documenta a decisão de modelo de acesso RLS.
--
-- Decisão: as tabelas core mantêm o modelo "autenticado = acesso total"
-- por escolha deliberada (ferramenta interna, usuários de confiança;
-- acesso anônimo já bloqueado). O módulo RH mantém seu RBAC granular.
-- Os warnings multiple_permissive_policies (49/50) são do RBAC do RH e
-- são intencionais; não serão consolidados.
--
-- Detalhes e critérios para revisitar:
--   Docs/decisao-modelo-acesso-rls-2026-06.md
--
-- COMMENT é metadado (sem lock, sem alteração de dados/políticas).
-- =====================================================

COMMENT ON TABLE public.lancamentos_folha IS
  'RLS: autenticado = acesso total (por design — ferramenta interna; anon bloqueado). Decisão S1: ver Docs/decisao-modelo-acesso-rls-2026-06.md';

COMMENT ON TABLE public.folhas_mensais IS
  'RLS: autenticado = acesso total (por design — ferramenta interna; anon bloqueado). Decisão S1: ver Docs/decisao-modelo-acesso-rls-2026-06.md';

COMMENT ON TABLE public.contas_pagar IS
  'RLS: autenticado = acesso total (por design — ferramenta interna; anon bloqueado). Decisão S1: ver Docs/decisao-modelo-acesso-rls-2026-06.md';

COMMENT ON TABLE public.colaboradores IS
  'RLS: autenticado = acesso total (por design — ferramenta interna; anon bloqueado). Decisão S1: ver Docs/decisao-modelo-acesso-rls-2026-06.md';
