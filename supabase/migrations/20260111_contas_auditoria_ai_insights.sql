-- AI Insights (Contas - Auditoria)
-- Source of truth: applied in Supabase migration `contas_auditoria_ai_insights_v2`
create extension if not exists pgcrypto;

create table if not exists public.contas_ai_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  competencia_ym text not null,
  unidade text not null,
  filtros jsonb not null default '{}'::jsonb,
  model text null,
  input_hash text not null,
  summary text null,
  response_json jsonb null
);

create unique index if not exists contas_ai_insights_input_hash_key
  on public.contas_ai_insights (input_hash);

create index if not exists contas_ai_insights_competencia_unidade_idx
  on public.contas_ai_insights (competencia_ym, unidade);

alter table public.contas_ai_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_ai_insights' and policyname = 'contas_ai_insights_select_authenticated'
  ) then
    create policy "contas_ai_insights_select_authenticated"
      on public.contas_ai_insights
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_ai_insights' and policyname = 'contas_ai_insights_insert_authenticated'
  ) then
    create policy "contas_ai_insights_insert_authenticated"
      on public.contas_ai_insights
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_ai_insights' and policyname = 'contas_ai_insights_update_authenticated'
  ) then
    create policy "contas_ai_insights_update_authenticated"
      on public.contas_ai_insights
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- Notas por anomalia (memória da Ana)
create table if not exists public.contas_anomalia_notas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competencia_ym text not null,
  unidade text not null,
  anomaly_key text not null,
  conta_id uuid null,
  nota text not null default '',
  status text not null default 'pendente' check (status in ('pendente','verificado')),
  created_by uuid null references auth.users(id)
);

create unique index if not exists contas_anomalia_notas_unique
  on public.contas_anomalia_notas (competencia_ym, unidade, anomaly_key);

create index if not exists contas_anomalia_notas_competencia_idx
  on public.contas_anomalia_notas (competencia_ym, unidade);

alter table public.contas_anomalia_notas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_anomalia_notas' and policyname = 'contas_anomalia_notas_select_authenticated'
  ) then
    create policy "contas_anomalia_notas_select_authenticated"
      on public.contas_anomalia_notas
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_anomalia_notas' and policyname = 'contas_anomalia_notas_insert_authenticated'
  ) then
    create policy "contas_anomalia_notas_insert_authenticated"
      on public.contas_anomalia_notas
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_anomalia_notas' and policyname = 'contas_anomalia_notas_update_authenticated'
  ) then
    create policy "contas_anomalia_notas_update_authenticated"
      on public.contas_anomalia_notas
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- updated_at trigger helper
create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_contas_anomalia_notas on public.contas_anomalia_notas;
create trigger set_updated_at_contas_anomalia_notas
before update on public.contas_anomalia_notas
for each row execute function public.set_updated_at();

