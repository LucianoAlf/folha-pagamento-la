-- Hardening: authenticated so deve ler as tabelas base.
-- Escrita operacional acontece por RPC SECURITY DEFINER ou backend service_role.
--
-- Padrao para novas tabelas financeiro_* da Fase 2:
--   revoke all from public, anon, authenticated, maria_operacional, maria_leitura;
--   grant select to authenticated, service_role;
-- Nao usar ALTER DEFAULT PRIVILEGES global.

revoke all on public.financeiro_empresas from authenticated;
grant select on public.financeiro_empresas to authenticated;

revoke all on public.financeiro_contas_bancarias from authenticated;
grant select on public.financeiro_contas_bancarias to authenticated;

revoke all on public.financeiro_documentos from authenticated;
grant select on public.financeiro_documentos to authenticated;
