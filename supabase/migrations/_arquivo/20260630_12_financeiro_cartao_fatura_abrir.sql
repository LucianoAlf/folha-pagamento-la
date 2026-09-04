-- Fase 2.5 M12: abrir/resolver fatura por data_compra ou competencia.

create or replace function public.financeiro_cartao_fatura_abrir(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_cartao_id uuid;
  v_cartao public.financeiro_cartoes%rowtype;
  v_data_compra date;
  v_competencia date;
  v_data_fechamento date;
  v_data_vencimento date;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_inserted int;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_cartao_id := nullif(payload->>'cartao_id', '')::uuid;
  if v_cartao_id is null then
    raise exception 'cartao_id obrigatorio para abrir fatura de cartao.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = v_cartao_id
     and ativo = true;
  if not found then
    raise exception 'cartao nao encontrado ou inativo.';
  end if;

  v_data_compra := nullif(payload->>'data_compra', '')::date;
  v_competencia := nullif(payload->>'competencia', '')::date;
  if v_data_compra is null and v_competencia is null then
    raise exception 'data_compra ou competencia obrigatoria para abrir fatura de cartao.';
  end if;

  if v_data_compra is not null then
    select c.competencia, c.data_fechamento, c.data_vencimento
      into v_competencia, v_data_fechamento, v_data_vencimento
      from public.financeiro_cartao_ciclo(v_cartao_id, v_data_compra) c;
  else
    v_competencia := date_trunc('month', v_competencia)::date;
    v_data_fechamento := public.financeiro_cartao_data_fechamento_por_competencia(v_cartao_id, v_competencia);
    v_data_vencimento := public.financeiro_cartao_clamp_dia(
      extract(year from v_competencia)::int,
      extract(month from v_competencia)::int,
      v_cartao.dia_vencimento
    );
  end if;

  insert into public.financeiro_cartao_faturas (
    cartao_id,
    competencia,
    data_fechamento,
    data_vencimento,
    valor_total,
    status,
    observacoes
  )
  values (
    v_cartao_id,
    v_competencia,
    v_data_fechamento,
    v_data_vencimento,
    0,
    'aberta',
    nullif(payload->>'observacoes', '')
  )
  on conflict (cartao_id, competencia) do nothing;

  get diagnostics v_inserted = row_count;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where cartao_id = v_cartao_id
     and competencia = v_competencia;
  if not found then
    raise exception 'falha ao resolver fatura de cartao.';
  end if;

  if v_inserted = 1 then
    perform public.financeiro_cartoes_audit_insert(
      v_actor,
      'financeiro_cartao_faturas',
      'cartao_fatura',
      v_fatura.id,
      'abrir_fatura_cartao',
      null,
      to_jsonb(v_fatura),
      payload->>'motivo'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_fatura.id,
    'competencia', v_fatura.competencia,
    'data_fechamento', v_fatura.data_fechamento,
    'data_vencimento', v_fatura.data_vencimento,
    'status', v_fatura.status,
    'criada', v_inserted = 1
  );
end;
$$;

revoke all on function public.financeiro_cartao_fatura_abrir(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_fatura_abrir(jsonb, jsonb) to authenticated, service_role;
