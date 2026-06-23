-- PC1: plano de contas Emusys (arvore hierarquica) + centros de custo.
-- Espelha o schema aplicado no Supabase via MCP em 2026-06-23 (idempotente).

create table if not exists public.plano_contas (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nome            text not null,
  nome_completo   text not null,
  parent_id       uuid references public.plano_contas(id),
  nivel           int  not null check (nivel in (1,2,3)),
  grupo_plano     text check (grupo_plano is null or grupo_plano in
                    ('receita','custo_variavel','despesa_fixa','investimento','nao_operacional')),
  natureza        text not null check (natureza in ('entrada','saida')),
  label_educativo text,
  inclui_ebitda   boolean not null default false,
  inclui_margem   boolean not null default false,
  inclui_capex    boolean not null default false,
  emusys_id       text,
  ativo           boolean not null default true,
  ordem           int,
  icone           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_plano_contas_parent   on public.plano_contas(parent_id);
create index if not exists idx_plano_contas_natureza on public.plano_contas(natureza);
create index if not exists idx_plano_contas_ativo    on public.plano_contas(ativo);

create table if not exists public.centros_custo (
  id         uuid primary key default gen_random_uuid(),
  codigo     text,
  nome       text not null,
  tipo       text not null check (tipo in ('unidade','funcional','projeto')),
  ativo      boolean not null default true,
  ordem      int,
  created_at timestamptz not null default now()
);

alter table public.plano_contas enable row level security;
alter table public.centros_custo enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plano_contas' and policyname='plano_contas_authenticated_all') then
    create policy "plano_contas_authenticated_all" on public.plano_contas
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='centros_custo' and policyname='centros_custo_authenticated_all') then
    create policy "centros_custo_authenticated_all" on public.centros_custo
      for all to authenticated using (true) with check (true);
  end if;
end $$;
