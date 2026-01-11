-- AI Insights (Contas - Comparativo)
create extension if not exists pgcrypto;

create table if not exists public.contas_comparativo_ai_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  competencia_ym text not null,
  base_ym text not null,
  unidade text not null,
  filtros jsonb not null default '{}'::jsonb,
  model text null,
  input_hash text not null,
  summary text null,
  response_json jsonb null
);

create unique index if not exists contas_comparativo_ai_insights_input_hash_key
  on public.contas_comparativo_ai_insights (input_hash);

create index if not exists contas_comparativo_ai_insights_periodo_unidade_idx
  on public.contas_comparativo_ai_insights (competencia_ym, base_ym, unidade);

alter table public.contas_comparativo_ai_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_comparativo_ai_insights' and policyname = 'contas_comparativo_ai_insights_select_authenticated'
  ) then
    create policy "contas_comparativo_ai_insights_select_authenticated"
      on public.contas_comparativo_ai_insights
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_comparativo_ai_insights' and policyname = 'contas_comparativo_ai_insights_insert_authenticated'
  ) then
    create policy "contas_comparativo_ai_insights_insert_authenticated"
      on public.contas_comparativo_ai_insights
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_comparativo_ai_insights' and policyname = 'contas_comparativo_ai_insights_update_authenticated'
  ) then
    create policy "contas_comparativo_ai_insights_update_authenticated"
      on public.contas_comparativo_ai_insights
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- Notas gerais do mês (Comparativo Contas) — memória da Ana
alter table public.folhas_mensais
  add column if not exists contas_comparativo_notas_rh text null;

