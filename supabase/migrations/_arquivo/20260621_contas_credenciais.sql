-- C2: contas_credenciais — metadados operacionais (sem segredo exposto)
create table if not exists public.contas_credenciais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  portal text not null,
  login_hint text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contas_credenciais_ativo_idx
  on public.contas_credenciais (ativo);

create index if not exists contas_credenciais_portal_idx
  on public.contas_credenciais (portal);

alter table public.contas_credenciais enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_credenciais'
      and policyname = 'contas_credenciais_select_authenticated'
  ) then
    create policy contas_credenciais_select_authenticated
      on public.contas_credenciais for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_credenciais'
      and policyname = 'contas_credenciais_insert_authenticated'
  ) then
    create policy contas_credenciais_insert_authenticated
      on public.contas_credenciais for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_credenciais'
      and policyname = 'contas_credenciais_update_authenticated'
  ) then
    create policy contas_credenciais_update_authenticated
      on public.contas_credenciais for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_credenciais'
      and policyname = 'contas_credenciais_delete_authenticated'
  ) then
    create policy contas_credenciais_delete_authenticated
      on public.contas_credenciais for delete to authenticated using (true);
  end if;
end $$;

drop trigger if exists trg_contas_credenciais_set_updated_at on public.contas_credenciais;
create trigger trg_contas_credenciais_set_updated_at
  before update on public.contas_credenciais
  for each row execute function public.set_updated_at();

comment on table public.contas_credenciais is
  'Metadados de credenciais de portais (senha no Vault via Edge). RLS: autenticado = acesso total.';
