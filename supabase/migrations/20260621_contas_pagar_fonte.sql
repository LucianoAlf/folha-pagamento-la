-- C1: campos de fonte/origem em contas_pagar (FK para contas_credenciais)
alter table public.contas_pagar
  add column if not exists fonte_tipo text null,
  add column if not exists fonte_url text null,
  add column if not exists fonte_instrucoes text null,
  add column if not exists fonte_identificador text null,
  add column if not exists credencial_id uuid null,
  add column if not exists pix_chave_fixa text null,
  add column if not exists email_pagamento text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contas_pagar_fonte_tipo_check'
  ) then
    alter table public.contas_pagar
      add constraint contas_pagar_fonte_tipo_check
      check (fonte_tipo is null or fonte_tipo in (
        'site', 'email', 'pix_fixo', 'banco', 'whatsapp', 'manual'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contas_pagar_credencial_id_fkey'
  ) then
    alter table public.contas_pagar
      add constraint contas_pagar_credencial_id_fkey
      foreign key (credencial_id) references public.contas_credenciais(id)
      on delete set null;
  end if;
end $$;

create index if not exists contas_pagar_credencial_id_idx
  on public.contas_pagar (credencial_id);

create index if not exists contas_pagar_fonte_tipo_idx
  on public.contas_pagar (fonte_tipo);
