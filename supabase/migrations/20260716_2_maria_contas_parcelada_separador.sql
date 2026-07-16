-- Normaliza o separador do rotulo da conta pagadora para ASCII.
-- A primeira substituicao corrige o mojibake "A-circumflex + middle dot";
-- a segunda garante o mesmo resultado em ambientes que preservaram o middle dot.

do $migration$
declare
  v_signature regprocedure := 'public.maria_contas_parcelada_criar(text,numeric,numeric,integer,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,boolean)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature::oid)
    into v_definition;

  v_definition := replace(v_definition, chr(194) || chr(183), ' - ');
  v_definition := replace(v_definition, chr(183), ' - ');

  execute v_definition;
end;
$migration$;
