-- C4: códigos de barras/PIX coletados por mês
create table if not exists public.contas_pagar_codigo_mes (
  id uuid primary key default gen_random_uuid(),
  conta_pagar_id uuid not null references public.contas_pagar(id) on delete cascade,
  competencia date not null,
  codigo_barras text null,
  chave_pix text null,
  qr_pix_payload text null,
  valor_coletado numeric(12,2) null,
  coletado_em timestamptz null,
  coletado_por text null,
  status_coleta text not null default 'pendente'
    check (status_coleta in ('pendente', 'coletado', 'indisponivel')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conta_pagar_id, competencia)
);

create index if not exists contas_pagar_codigo_mes_competencia_idx
  on public.contas_pagar_codigo_mes (competencia);

create index if not exists contas_pagar_codigo_mes_conta_idx
  on public.contas_pagar_codigo_mes (conta_pagar_id);

alter table public.contas_pagar_codigo_mes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_codigo_mes'
      and policyname = 'contas_pagar_codigo_mes_select_authenticated'
  ) then
    create policy contas_pagar_codigo_mes_select_authenticated
      on public.contas_pagar_codigo_mes for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_codigo_mes'
      and policyname = 'contas_pagar_codigo_mes_insert_authenticated'
  ) then
    create policy contas_pagar_codigo_mes_insert_authenticated
      on public.contas_pagar_codigo_mes for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_codigo_mes'
      and policyname = 'contas_pagar_codigo_mes_update_authenticated'
  ) then
    create policy contas_pagar_codigo_mes_update_authenticated
      on public.contas_pagar_codigo_mes for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_codigo_mes'
      and policyname = 'contas_pagar_codigo_mes_delete_authenticated'
  ) then
    create policy contas_pagar_codigo_mes_delete_authenticated
      on public.contas_pagar_codigo_mes for delete to authenticated using (true);
  end if;
end $$;

drop trigger if exists trg_contas_pagar_codigo_mes_set_updated_at on public.contas_pagar_codigo_mes;
create trigger trg_contas_pagar_codigo_mes_set_updated_at
  before update on public.contas_pagar_codigo_mes
  for each row execute function public.set_updated_at();
