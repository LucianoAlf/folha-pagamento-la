-- Fase 2.5 M9: helper de ciclo de fatura de cartao.
-- Casos ancora: Kids 1074 12/25 dia 12 -> ciclo atual; Barra 8516 28/dez/2025 -> fev/2026; Recreio 8641 01/15.

create or replace function public.financeiro_cartao_clamp_dia(p_ano int, p_mes int, p_dia int)
returns date
language sql
immutable
as $$
  select make_date(
    p_ano,
    p_mes,
    least(p_dia, extract(day from (date_trunc('month', make_date(p_ano, p_mes, 1)) + interval '1 month - 1 day'))::int)
  );
$$;

create or replace function public.financeiro_cartao_data_fechamento_por_competencia(p_cartao_id uuid, p_competencia date)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_dia_fechamento int;
  v_dia_vencimento int;
  v_competencia date;
  v_data_vencimento date;
  v_fechamento_mes date;
begin
  select dia_fechamento, dia_vencimento
    into v_dia_fechamento, v_dia_vencimento
    from public.financeiro_cartoes
   where id = p_cartao_id;

  if not found then
    raise exception 'cartao % nao encontrado.', p_cartao_id;
  end if;

  if v_dia_fechamento is null or v_dia_vencimento is null then
    raise exception 'cartao % sem dia de fechamento/vencimento configurado.', p_cartao_id;
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;
  v_data_vencimento := public.financeiro_cartao_clamp_dia(
    extract(year from v_competencia)::int,
    extract(month from v_competencia)::int,
    v_dia_vencimento
  );
  v_fechamento_mes := public.financeiro_cartao_clamp_dia(
    extract(year from v_competencia)::int,
    extract(month from v_competencia)::int,
    v_dia_fechamento
  );

  if v_fechamento_mes < v_data_vencimento then
    return v_fechamento_mes;
  end if;

  return public.financeiro_cartao_clamp_dia(
    extract(year from (v_competencia - interval '1 month'))::int,
    extract(month from (v_competencia - interval '1 month'))::int,
    v_dia_fechamento
  );
end;
$$;
create or replace function public.financeiro_cartao_ciclo(p_cartao_id uuid, p_data date)
returns table (competencia date, data_fechamento date, data_vencimento date)
language plpgsql
stable
set search_path = public
as $$
declare
  v_dia_fechamento int;
  v_dia_vencimento int;
  v_fechamento_atual date;
  v_data_fechamento date;
  v_vencimento_mes date;
  v_data_vencimento date;
  v_mes_fechamento date;
begin
  if p_data is null then
    raise exception 'data da compra obrigatoria para ciclo de cartao.';
  end if;

  select dia_fechamento, dia_vencimento
    into v_dia_fechamento, v_dia_vencimento
    from public.financeiro_cartoes
   where id = p_cartao_id
     and ativo = true;

  if not found then
    raise exception 'cartao % nao encontrado ou inativo.', p_cartao_id;
  end if;

  if v_dia_fechamento is null or v_dia_vencimento is null then
    raise exception 'cartao % sem dia de fechamento/vencimento configurado.', p_cartao_id;
  end if;

  v_fechamento_atual := public.financeiro_cartao_clamp_dia(
    extract(year from p_data)::int,
    extract(month from p_data)::int,
    v_dia_fechamento
  );

  if p_data <= v_fechamento_atual then
    v_data_fechamento := v_fechamento_atual;
  else
    v_data_fechamento := public.financeiro_cartao_clamp_dia(
      extract(year from (date_trunc('month', p_data) + interval '1 month'))::int,
      extract(month from (date_trunc('month', p_data) + interval '1 month'))::int,
      v_dia_fechamento
    );
  end if;

  v_mes_fechamento := date_trunc('month', v_data_fechamento)::date;
  v_vencimento_mes := public.financeiro_cartao_clamp_dia(
    extract(year from v_mes_fechamento)::int,
    extract(month from v_mes_fechamento)::int,
    v_dia_vencimento
  );

  if v_vencimento_mes > v_data_fechamento then
    v_data_vencimento := v_vencimento_mes;
  else
    v_data_vencimento := public.financeiro_cartao_clamp_dia(
      extract(year from (v_mes_fechamento + interval '1 month'))::int,
      extract(month from (v_mes_fechamento + interval '1 month'))::int,
      v_dia_vencimento
    );
  end if;

  competencia := date_trunc('month', v_data_vencimento)::date;
  data_fechamento := v_data_fechamento;
  data_vencimento := v_data_vencimento;
  return next;
end;
$$;
