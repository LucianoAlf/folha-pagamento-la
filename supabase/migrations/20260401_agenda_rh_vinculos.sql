do $$
declare
  v_data_type text;
  v_udt_name text;
  v_constraint_name text;
begin
  select data_type, udt_name
    into v_data_type, v_udt_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'tarefas'
    and column_name = 'vinculo_tipo';

  if v_data_type is null then
    raise notice 'Coluna public.tarefas.vinculo_tipo não encontrada. Migration ignorada.';
    return;
  end if;

  if v_data_type = 'USER-DEFINED' then
    execute format('alter type public.%I add value if not exists ''rh_processo''', v_udt_name);
    execute format('alter type public.%I add value if not exists ''rh_etapa''', v_udt_name);
  else
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
        or vinculo_tipo in ('conta_pagar', 'folha_pagamento', 'reuniao', 'rh_processo', 'rh_etapa')
      );
  end if;
end $$;
