-- FECHA VAZAMENTO: anon (chave pública, vai no bundle do front) conseguia ler
-- vw_maria_openfinance_cartoes_resumo (5 linhas de dado de cartão) — grant anon padrão do
-- Supabase + view não-security_invoker furando o RLS da tabela. Alinha as 2 views e as 2
-- tabelas do Open Finance ao padrão estrito: só maria_leitura/maria_operacional (gateway
-- sanitizado da Maria) + service_role (Edge Functions). Sem anon, sem authenticated.
-- Supera a escolha "authenticated lê" de 14/08 — decisão de segurança, sem consumidor front hoje.

revoke all on public.vw_maria_openfinance_cartoes_resumo from anon, authenticated;
revoke all on public.vw_maria_openfinance_saldos_resumo from anon, authenticated;
grant select on public.vw_maria_openfinance_cartoes_resumo to maria_leitura, maria_operacional;
grant select on public.vw_maria_openfinance_saldos_resumo to maria_leitura, maria_operacional;

revoke all on public.financeiro_cartao_saldos_diarios from anon, authenticated;
revoke all on public.financeiro_conta_saldos_diarios from anon, authenticated;

drop policy if exists financeiro_cartao_saldos_diarios_select_authenticated on public.financeiro_cartao_saldos_diarios;
drop policy if exists financeiro_conta_saldos_diarios_select_authenticated on public.financeiro_conta_saldos_diarios;
