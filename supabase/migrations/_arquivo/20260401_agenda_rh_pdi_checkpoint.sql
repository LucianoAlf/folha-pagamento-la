do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tarefas'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%vinculo_tipo%'
  loop
    execute format('alter table public.tarefas drop constraint %I', v_constraint_name);
  end loop;

  alter table public.tarefas
    add constraint tarefas_vinculo_tipo_check
    check (
      vinculo_tipo is null
      or vinculo_tipo in (
        'conta_pagar',
        'folha_pagamento',
        'reuniao',
        'rh_processo',
        'rh_etapa',
        'rh_pdi_checkpoint'
      )
    );
end $$;
