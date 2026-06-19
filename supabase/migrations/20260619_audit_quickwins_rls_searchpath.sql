-- Auditoria do dashboard — quick-wins de banco (2026-06-19)
-- Origem: Supabase advisors (security + performance) no projeto la-music-folha (ubdvtjbitozhkuvvqkxj)
-- Baixo risco. Não altera dados; apenas metadados de funções, políticas e um índice redundante.
--
--   S2  function_search_path_mutable  -> fixa search_path = public (14 funções)
--   P1  auth_rls_initplan             -> envolve auth.<fn>() em (select ...) (37 políticas)
--   P3  duplicate_index               -> remove índice gêmeo em lembretes_log (1)

begin;

-- =====================================================================
-- S2 — Function Search Path Mutable (hardening)
-- Fixa search_path em `public` (pg_catalog é implícito; pg_temp fica de fora).
-- =====================================================================
alter function public.atualizar_status_periodos_ferias()                   set search_path = public;
alter function public.calcular_periodos_aquisitivos(integer)               set search_path = public;
alter function public.compare_folhas_colaborador(integer,integer)          set search_path = public;
alter function public.get_ferias_vencidas(uuid)                            set search_path = public;
alter function public.upsert_colaborador_variacao_nota(integer,integer,text) set search_path = public;
alter function public.atualizar_totais_folha(integer)                      set search_path = public;
alter function public.calcular_valor_ferias(integer,integer,integer)       set search_path = public;
alter function public.recalc_folha_totais(integer)                         set search_path = public;
alter function public.set_updated_at()                                     set search_path = public;
alter function public.trg_lancamentos_recalc_folha()                       set search_path = public;
alter function public.update_contas_pagar_timestamp()                      set search_path = public;
alter function public.update_ferias_periodos_before_write()                set search_path = public;
alter function public.update_periodo_aquisitivo_saldos()                   set search_path = public;
alter function public.update_updated_at_only()                             set search_path = public;

-- =====================================================================
-- P3 — Duplicate Index
-- idx_lembretes_scheduled e lembretes_log_scheduled_for_idx são idênticos
-- (btree em scheduled_for). Mantém idx_lembretes_scheduled.
-- =====================================================================
drop index if exists public.lembretes_log_scheduled_for_idx;

-- =====================================================================
-- P1 — Auth RLS Initialization Plan (performance)
-- Reescreve auth.uid()/auth.role() como (select ...) para avaliar 1x por query.
-- =====================================================================
alter policy agenda_kanban_config_select_own on public.agenda_kanban_config using (((select auth.uid()) = user_id));
alter policy agenda_kanban_config_update_own on public.agenda_kanban_config using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy agenda_kanban_config_upsert_own on public.agenda_kanban_config with check (((select auth.uid()) = user_id));
alter policy contas_pagar_notif_delete_own on public.contas_pagar_notificacoes using ((user_id = (select auth.uid())));
alter policy contas_pagar_notif_insert_own on public.contas_pagar_notificacoes with check ((user_id = (select auth.uid())));
alter policy contas_pagar_notif_select_own on public.contas_pagar_notificacoes using ((user_id = (select auth.uid())));
alter policy contas_pagar_notif_update_own on public.contas_pagar_notificacoes using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "Usuários autenticados podem inserir insights" on public.ferias_ai_insights with check (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem visualizar insights" on public.ferias_ai_insights using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem inserir no histórico" on public.ferias_historico_acoes with check (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem visualizar histórico" on public.ferias_historico_acoes using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem atualizar períodos aquisitivos" on public.ferias_periodos_aquisitivos using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem deletar períodos aquisitivos" on public.ferias_periodos_aquisitivos using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem inserir períodos aquisitivos" on public.ferias_periodos_aquisitivos with check (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem visualizar períodos aquisitivos" on public.ferias_periodos_aquisitivos using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem atualizar programações" on public.ferias_programacoes using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem deletar programações" on public.ferias_programacoes using (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem inserir programações" on public.ferias_programacoes with check (((select auth.role()) = 'authenticated'::text));
alter policy "Usuários autenticados podem visualizar programações" on public.ferias_programacoes using (((select auth.role()) = 'authenticated'::text));
alter policy auth_lembretes on public.lembretes_log using (((select auth.role()) = 'authenticated'::text));
alter policy lembretes_log_select_own on public.lembretes_log using (((user_id is not null) and (user_id = (select auth.uid()))));
alter policy auth_notas on public.notas_rapidas using (((select auth.role()) = 'authenticated'::text));
alter policy auth_config on public.notificacao_config using (((select auth.role()) = 'authenticated'::text));
alter policy rh_historico_insert_operacional on public.rh_historico_eventos with check (((actor_user_id = (select auth.uid())) and rh_can_manage_process(processo_id)));
alter policy rh_pdi_planos_manage_allowed on public.rh_pdi_planos using ((rh_is_admin_or_rh() or (owner_user_id = (select auth.uid())) or (gestor_user_id = (select auth.uid())) or (mentor_user_id = (select auth.uid())))) with check ((rh_is_admin_or_rh() or (owner_user_id = (select auth.uid())) or (gestor_user_id = (select auth.uid())) or (mentor_user_id = (select auth.uid()))));
alter policy rh_pdi_template_checkpoints_select_visible on public.rh_pdi_template_checkpoints using ((rh_is_admin_or_rh() or ((select auth.role()) = 'authenticated'::text)));
alter policy rh_pdi_template_competencias_select_visible on public.rh_pdi_template_competencias using ((rh_is_admin_or_rh() or ((select auth.role()) = 'authenticated'::text)));
alter policy rh_pdi_template_objetivos_select_visible on public.rh_pdi_template_objetivos using ((rh_is_admin_or_rh() or ((select auth.role()) = 'authenticated'::text)));
alter policy rh_pdi_templates_select_visible on public.rh_pdi_templates using ((rh_is_admin_or_rh() or ((select auth.role()) = 'authenticated'::text)));
alter policy rh_comentarios_update_own_or_admin on public.rh_processo_comentarios using (((autor_user_id = (select auth.uid())) or rh_is_admin_or_rh())) with check (((autor_user_id = (select auth.uid())) or rh_is_admin_or_rh()));
alter policy auth_tarefas on public.tarefas using (((select auth.role()) = 'authenticated'::text));
alter policy auth_tarefas_listas on public.tarefas_listas using (((select auth.role()) = 'authenticated'::text));
alter policy auth_subtarefas on public.tarefas_subtarefas using (((select auth.role()) = 'authenticated'::text));
alter policy auth_templates on public.tarefas_templates using (((select auth.role()) = 'authenticated'::text));
alter policy "Users can insert own profile" on public.user_profiles with check (((select auth.uid()) = id));
alter policy "Users can update own profile" on public.user_profiles using (((select auth.uid()) = id)) with check (((select auth.uid()) = id));
alter policy "Users can view own profile" on public.user_profiles using (((select auth.uid()) = id));

commit;
