-- Agenda (Kanban) - configuração de colunas por usuário
-- Permite renomear/ordenar/ocultar as colunas do Kanban sem alterar o schema de status.

create table if not exists public.agenda_kanban_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  columns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agenda_kanban_config enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agenda_kanban_config'
      and policyname = 'agenda_kanban_config_select_own'
  ) then
    create policy "agenda_kanban_config_select_own"
      on public.agenda_kanban_config
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agenda_kanban_config'
      and policyname = 'agenda_kanban_config_upsert_own'
  ) then
    create policy "agenda_kanban_config_upsert_own"
      on public.agenda_kanban_config
      for insert
      to authenticated
      with check (auth.uid() = user_id);

    create policy "agenda_kanban_config_update_own"
      on public.agenda_kanban_config
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

