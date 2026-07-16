-- Mantem o rotulo humano da conta pagadora com espacamento simples.

do $migration$
declare
  v_signature regprocedure := 'public.maria_contas_parcelada_criar(text,numeric,numeric,integer,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,boolean)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature::oid)
    into v_definition;

  v_definition := replace(v_definition, '  -  ', ' - ');

  execute v_definition;
end;
$migration$;
