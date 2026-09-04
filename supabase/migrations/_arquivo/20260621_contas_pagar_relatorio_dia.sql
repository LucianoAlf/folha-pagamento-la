-- C5: snapshot de relatório diário (WhatsApp / copiar manual)
create table if not exists public.contas_pagar_relatorio_dia (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  unidade text not null,
  mensagem_texto text not null,
  gerado_por text not null,
  status_envio text not null default 'rascunho'
    check (status_envio in ('rascunho', 'copiado', 'enviado', 'erro')),
  hash_mensagem text not null,
  payload_json jsonb null,
  canal text null,
  provider_message_id text null,
  enviado_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contas_pagar_relatorio_dia_data_unidade_idx
  on public.contas_pagar_relatorio_dia (data_referencia, unidade);

create index if not exists contas_pagar_relatorio_dia_status_idx
  on public.contas_pagar_relatorio_dia (status_envio);

alter table public.contas_pagar_relatorio_dia enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_relatorio_dia'
      and policyname = 'contas_pagar_relatorio_dia_select_authenticated'
  ) then
    create policy contas_pagar_relatorio_dia_select_authenticated
      on public.contas_pagar_relatorio_dia for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_relatorio_dia'
      and policyname = 'contas_pagar_relatorio_dia_insert_authenticated'
  ) then
    create policy contas_pagar_relatorio_dia_insert_authenticated
      on public.contas_pagar_relatorio_dia for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_relatorio_dia'
      and policyname = 'contas_pagar_relatorio_dia_update_authenticated'
  ) then
    create policy contas_pagar_relatorio_dia_update_authenticated
      on public.contas_pagar_relatorio_dia for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contas_pagar_relatorio_dia'
      and policyname = 'contas_pagar_relatorio_dia_delete_authenticated'
  ) then
    create policy contas_pagar_relatorio_dia_delete_authenticated
      on public.contas_pagar_relatorio_dia for delete to authenticated using (true);
  end if;
end $$;

drop trigger if exists trg_contas_pagar_relatorio_dia_set_updated_at on public.contas_pagar_relatorio_dia;
create trigger trg_contas_pagar_relatorio_dia_set_updated_at
  before update on public.contas_pagar_relatorio_dia
  for each row execute function public.set_updated_at();
