-- Fase 5 / Fatia 0: conta pagadora padrao do colaborador.
-- A conta define empresa e centro; o preenchimento permanece humano e nullable.

alter table public.colaboradores
  add column if not exists conta_pagadora_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.colaboradores'::regclass
       and conname = 'colaboradores_conta_pagadora_id_fkey'
  ) then
    alter table public.colaboradores
      add constraint colaboradores_conta_pagadora_id_fkey
      foreign key (conta_pagadora_id) references public.financeiro_contas_bancarias(id);
  end if;
end
$$;

create index if not exists colaboradores_conta_pagadora_id_idx
  on public.colaboradores (conta_pagadora_id);
