create or replace function public.maria_codigo_barras_texto_valido(p_text text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_codigo text;
  v_digitos text;
begin
  v_codigo := nullif(trim(p_text), '');
  if v_codigo is null then
    return true;
  end if;

  if v_codigo ~ E'[\r\n]' then
    return false;
  end if;

  if v_codigo !~ '^[0-9 .-]+$' then
    return false;
  end if;

  v_digitos := regexp_replace(v_codigo, '\D', '', 'g');
  return length(v_digitos) in (44, 47, 48);
end;
$function$;
