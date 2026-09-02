-- Calendario da Agenda (spec §5.1–5.2). agenda_ajustar_data e o UNICO ponto que sabe de calendario.

-- Data NOMINAL da ocorrencia no mes: ultimo dia, ou dia_mes clampado ao fim do mes (31 em fev = 28/29).
create or replace function public.agenda_resolve_dia(p_competencia date, p_dia_mes integer, p_ultimo_dia boolean)
returns date language sql immutable as $$
  select case
    when coalesce(p_ultimo_dia, false)
      then (date_trunc('month', p_competencia)::date + interval '1 month' - interval '1 day')::date
    else least(
      date_trunc('month', p_competencia)::date + (greatest(coalesce(p_dia_mes, 1), 1) - 1),
      (date_trunc('month', p_competencia)::date + interval '1 month' - interval '1 day')::date
    )
  end;
$$;

-- Ajuste de fim de semana. stable (nao immutable): quando agenda_feriados entrar AQUI, a funcao
-- passa a consultar tabela e a volatilidade ja estara certa.
create or replace function public.agenda_ajustar_data(p_data date, p_regra text)
returns date language plpgsql stable set search_path = public as $$
declare v date := p_data;
begin
  if p_data is null then return null; end if;
  if p_regra = 'proximo_dia_util' then
    while extract(isodow from v) in (6, 7) loop v := v + 1; end loop;     -- sab/dom -> proxima segunda
  elsif p_regra = 'dia_util_anterior' then
    while extract(isodow from v) in (6, 7) loop v := v - 1; end loop;     -- sab/dom -> sexta anterior
  end if;                                                                 -- 'manter' (ou nulo): nao mexe
  -- agenda_feriados entra AQUI (spec §5.1): apos o ajuste de fim de semana, repetir o mesmo laco
  -- enquanto v for feriado, na mesma direcao da regra.
  return v;
end $$;

revoke all on function public.agenda_resolve_dia(date, integer, boolean) from public, anon, authenticated;
grant execute on function public.agenda_resolve_dia(date, integer, boolean) to service_role;
revoke all on function public.agenda_ajustar_data(date, text) from public, anon, authenticated;
grant execute on function public.agenda_ajustar_data(date, text) to service_role;
