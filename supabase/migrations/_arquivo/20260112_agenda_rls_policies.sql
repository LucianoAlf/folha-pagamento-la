-- Agenda - RLS policies (CRUD) para garantir funcionamento do calendário e tarefas
-- Objetivo:
-- - Tarefas/Lists/Subtarefas/Notas: acesso para usuários autenticados (colaboração interna)
-- - notificacao_config: acesso somente ao próprio user_id (config pessoal)

-- Tabelas principais da Agenda (colaboração)
alter table if exists public.tarefas_listas enable row level security;
alter table if exists public.tarefas enable row level security;
alter table if exists public.tarefas_subtarefas enable row level security;
alter table if exists public.notas_rapidas enable row level security;
alter table if exists public.tarefas_templates enable row level security;

-- Config pessoal
alter table if exists public.notificacao_config enable row level security;

do $$
begin
  -- ============================================
  -- tarefas_listas (shared for authenticated)
  -- ============================================
  if to_regclass('public.tarefas_listas') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_listas' and policyname = 'tarefas_listas_select_authenticated'
    ) then
      create policy "tarefas_listas_select_authenticated"
        on public.tarefas_listas
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_listas' and policyname = 'tarefas_listas_insert_authenticated'
    ) then
      create policy "tarefas_listas_insert_authenticated"
        on public.tarefas_listas
        for insert
        to authenticated
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_listas' and policyname = 'tarefas_listas_update_authenticated'
    ) then
      create policy "tarefas_listas_update_authenticated"
        on public.tarefas_listas
        for update
        to authenticated
        using (true)
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_listas' and policyname = 'tarefas_listas_delete_authenticated'
    ) then
      create policy "tarefas_listas_delete_authenticated"
        on public.tarefas_listas
        for delete
        to authenticated
        using (true);
    end if;
  end if;

  -- ============================================
  -- tarefas (shared for authenticated)
  -- ============================================
  if to_regclass('public.tarefas') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas' and policyname = 'tarefas_select_authenticated'
    ) then
      create policy "tarefas_select_authenticated"
        on public.tarefas
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas' and policyname = 'tarefas_insert_authenticated'
    ) then
      create policy "tarefas_insert_authenticated"
        on public.tarefas
        for insert
        to authenticated
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas' and policyname = 'tarefas_update_authenticated'
    ) then
      create policy "tarefas_update_authenticated"
        on public.tarefas
        for update
        to authenticated
        using (true)
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas' and policyname = 'tarefas_delete_authenticated'
    ) then
      create policy "tarefas_delete_authenticated"
        on public.tarefas
        for delete
        to authenticated
        using (true);
    end if;
  end if;

  -- ============================================
  -- tarefas_subtarefas (shared for authenticated)
  -- ============================================
  if to_regclass('public.tarefas_subtarefas') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_subtarefas' and policyname = 'tarefas_subtarefas_select_authenticated'
    ) then
      create policy "tarefas_subtarefas_select_authenticated"
        on public.tarefas_subtarefas
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_subtarefas' and policyname = 'tarefas_subtarefas_insert_authenticated'
    ) then
      create policy "tarefas_subtarefas_insert_authenticated"
        on public.tarefas_subtarefas
        for insert
        to authenticated
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_subtarefas' and policyname = 'tarefas_subtarefas_update_authenticated'
    ) then
      create policy "tarefas_subtarefas_update_authenticated"
        on public.tarefas_subtarefas
        for update
        to authenticated
        using (true)
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_subtarefas' and policyname = 'tarefas_subtarefas_delete_authenticated'
    ) then
      create policy "tarefas_subtarefas_delete_authenticated"
        on public.tarefas_subtarefas
        for delete
        to authenticated
        using (true);
    end if;
  end if;

  -- ============================================
  -- notas_rapidas (shared for authenticated)
  -- ============================================
  if to_regclass('public.notas_rapidas') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notas_rapidas' and policyname = 'notas_rapidas_select_authenticated'
    ) then
      create policy "notas_rapidas_select_authenticated"
        on public.notas_rapidas
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notas_rapidas' and policyname = 'notas_rapidas_insert_authenticated'
    ) then
      create policy "notas_rapidas_insert_authenticated"
        on public.notas_rapidas
        for insert
        to authenticated
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notas_rapidas' and policyname = 'notas_rapidas_update_authenticated'
    ) then
      create policy "notas_rapidas_update_authenticated"
        on public.notas_rapidas
        for update
        to authenticated
        using (true)
        with check (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notas_rapidas' and policyname = 'notas_rapidas_delete_authenticated'
    ) then
      create policy "notas_rapidas_delete_authenticated"
        on public.notas_rapidas
        for delete
        to authenticated
        using (true);
    end if;
  end if;

  -- ============================================
  -- tarefas_templates (read-only for authenticated)
  -- ============================================
  if to_regclass('public.tarefas_templates') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tarefas_templates' and policyname = 'tarefas_templates_select_authenticated'
    ) then
      create policy "tarefas_templates_select_authenticated"
        on public.tarefas_templates
        for select
        to authenticated
        using (true);
    end if;
  end if;

  -- ============================================
  -- notificacao_config (own-only)
  -- ============================================
  if to_regclass('public.notificacao_config') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notificacao_config' and policyname = 'notificacao_config_select_own'
    ) then
      create policy "notificacao_config_select_own"
        on public.notificacao_config
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notificacao_config' and policyname = 'notificacao_config_insert_own'
    ) then
      create policy "notificacao_config_insert_own"
        on public.notificacao_config
        for insert
        to authenticated
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'notificacao_config' and policyname = 'notificacao_config_update_own'
    ) then
      create policy "notificacao_config_update_own"
        on public.notificacao_config
        for update
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    end if;
  end if;
end $$;

