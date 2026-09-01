-- notificacao_config: de `authenticated ALL` para `user_id = auth.uid()`.
-- Corrige a raiz do `.maybeSingle()` sem filtro (2 linhas = PGRST116) e do "Somente Ana" nos jobs.
-- service_role continua vendo todas (bypass RLS) — os jobs iteram por usuario.
-- upsertNotificacaoConfig (services/agendaService.ts) ja envia user_id no insert; o with_check exige isso.

drop policy if exists auth_config on public.notificacao_config;
drop policy if exists notificacao_config_select_own on public.notificacao_config;
drop policy if exists notificacao_config_insert_own on public.notificacao_config;
drop policy if exists notificacao_config_update_own on public.notificacao_config;
drop policy if exists notificacao_config_delete_own on public.notificacao_config;

create policy notificacao_config_select_own on public.notificacao_config
  for select using (user_id = (select auth.uid()));
create policy notificacao_config_insert_own on public.notificacao_config
  for insert with check (user_id = (select auth.uid()));
create policy notificacao_config_update_own on public.notificacao_config
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notificacao_config_delete_own on public.notificacao_config
  for delete using (user_id = (select auth.uid()));

-- lembretes_log: a chave sem destinatario dedupicaria a segunda pessoa pela primeira.
-- Fica lembretes_log_idempotency_uq (canal, tipo, tarefa, conta, scheduled_for, destinatario).
-- unique_lembrete_envio e um UNIQUE CONSTRAINT: o indice so cai junto com a constraint
-- (drop index sozinho da 2BP01). O drop index abaixo fica como rede pra bases onde e indice puro.
alter table public.lembretes_log drop constraint if exists unique_lembrete_envio;
drop index if exists public.unique_lembrete_envio;
