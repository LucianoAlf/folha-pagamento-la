-- Fase 1: liga contas_pagar a empresa/conta pagadora e libera tipo eventual.

alter table public.contas_pagar
  add column if not exists empresa_id uuid null,
  add column if not exists conta_pagadora_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_empresa_id_fkey') then
    alter table public.contas_pagar
      add constraint contas_pagar_empresa_id_fkey foreign key (empresa_id) references public.financeiro_empresas(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_conta_pagadora_id_fkey') then
    alter table public.contas_pagar
      add constraint contas_pagar_conta_pagadora_id_fkey foreign key (conta_pagadora_id) references public.financeiro_contas_bancarias(id);
  end if;
end $$;

alter table public.contas_pagar
  drop constraint if exists contas_pagar_tipo_lancamento_check;

alter table public.contas_pagar
  add constraint contas_pagar_tipo_lancamento_check
  check (tipo_lancamento in ('unica','recorrente','parcelada','eventual'));

create index if not exists idx_contas_pagar_empresa
  on public.contas_pagar (empresa_id);

create index if not exists idx_contas_pagar_conta_pagadora
  on public.contas_pagar (conta_pagadora_id);

comment on column public.contas_pagar.empresa_id is
  'Empresa fiscal associada ao lancamento. Nullable para retrocompatibilidade.';

comment on column public.contas_pagar.conta_pagadora_id is
  'Conta bancaria/caixa de onde saiu ou sairá o pagamento. Nullable para retrocompatibilidade.';
