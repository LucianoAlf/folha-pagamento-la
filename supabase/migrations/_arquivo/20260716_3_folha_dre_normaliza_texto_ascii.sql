-- Keep the accent map transport-safe across shells and migration runners.
create or replace function public.folha_normaliza_texto(p_valor text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(p_valor, '')),
        U&'\00E1\00E0\00E2\00E3\00E4\00E9\00E8\00EA\00EB\00ED\00EC\00EE\00EF\00F3\00F2\00F4\00F5\00F6\00FA\00F9\00FB\00FC\00E7\00F1',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;
