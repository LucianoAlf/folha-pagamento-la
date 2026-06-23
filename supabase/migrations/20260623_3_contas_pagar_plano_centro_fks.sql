-- PC3: liga contas_pagar ao plano de contas e ao centro de custo (aditivo, idempotente).
alter table public.contas_pagar
  add column if not exists plano_conta_id       uuid null,
  add column if not exists centro_custo_id      uuid null,
  add column if not exists emusys_lancamento_id text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='contas_pagar_plano_conta_id_fkey') then
    alter table public.contas_pagar
      add constraint contas_pagar_plano_conta_id_fkey
      foreign key (plano_conta_id) references public.plano_contas(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='contas_pagar_centro_custo_id_fkey') then
    alter table public.contas_pagar
      add constraint contas_pagar_centro_custo_id_fkey
      foreign key (centro_custo_id) references public.centros_custo(id);
  end if;
end $$;

create index if not exists idx_contas_pagar_plano_conta  on public.contas_pagar (plano_conta_id);
create index if not exists idx_contas_pagar_centro_custo on public.contas_pagar (centro_custo_id);
