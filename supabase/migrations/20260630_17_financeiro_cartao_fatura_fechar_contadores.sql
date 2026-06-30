-- Fase 2.5 M17: fechamento de fatura retorna contadores de classificacao sem bloquear pendencias.

create or replace function public.financeiro_cartao_fatura_fechar(p_fatura_id uuid, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_cartao public.financeiro_cartoes%rowtype;
  v_conta public.contas_pagar%rowtype;
  v_centro public.centros_custo%rowtype;
  v_total numeric;
  v_count_total int;
  v_count_confirmadas int;
  v_count_sugeridas int;
  v_count_pendentes int;
  v_dre_incompleto boolean;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = p_fatura_id
   for update;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  select
    count(*)::int as total,
    (count(*) filter (where classificacao_status = 'confirmada'))::int as confirmadas,
    (count(*) filter (where classificacao_status = 'sugerida'))::int as sugeridas,
    (count(*) filter (where classificacao_status = 'pendente'))::int as pendentes
    into v_count_total, v_count_confirmadas, v_count_sugeridas, v_count_pendentes
    from public.financeiro_cartao_transacoes
   where fatura_id = v_fatura.id;
  v_dre_incompleto := coalesce(v_count_sugeridas, 0) > 0 or coalesce(v_count_pendentes, 0) > 0;

  if v_fatura.conta_pagar_id is not null then
    select * into v_conta from public.contas_pagar where id = v_fatura.conta_pagar_id;
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'fatura_id', v_fatura.id,
      'conta_pagar_id', v_fatura.conta_pagar_id,
      'status', v_fatura.status,
      'classificacao', jsonb_build_object(
        'total', v_count_total,
        'confirmadas', v_count_confirmadas,
        'sugeridas', v_count_sugeridas,
        'pendentes', v_count_pendentes,
        'dre_incompleto', v_dre_incompleto
      )
    );
  end if;

  if v_fatura.status not in ('aberta','fechada') then
    raise exception 'status da fatura nao permite fechamento: %', v_fatura.status;
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = v_fatura.cartao_id
   for update;
  if not found then
    raise exception 'cartao da fatura nao encontrado.';
  end if;

  if v_cartao.empresa_id is null or v_cartao.conta_pagadora_id is null or v_cartao.centro_custo_id is null then
    raise exception 'cartao sem empresa, conta pagadora ou centro; fechamento fiscal bloqueado.';
  end if;

  select * into v_centro
    from public.centros_custo
   where id = v_cartao.centro_custo_id;
  if not found then
    raise exception 'centro de custo do cartao nao encontrado.';
  end if;

  select coalesce(sum(valor), 0) into v_total
    from public.financeiro_cartao_transacoes
   where fatura_id = v_fatura.id;

  insert into public.contas_pagar (
    descricao,
    unidade,
    valor,
    data_lancamento,
    data_vencimento,
    competencia,
    status,
    data_pagamento,
    metodo_pagamento,
    tipo_lancamento,
    parcela_atual,
    total_parcelas,
    observacoes,
    fonte_tipo,
    plano_conta_id,
    centro_custo_id,
    empresa_id,
    conta_pagadora_id
  )
  values (
    concat('Fatura ', v_cartao.apelido, ' ', to_char(v_fatura.competencia, 'YYYY-MM')),
    v_centro.codigo,
    round(v_total, 2),
    (now() at time zone 'America/Sao_Paulo')::date,
    v_fatura.data_vencimento,
    date_trunc('month', v_fatura.competencia)::date,
    'pendente',
    null,
    null,
    'fatura_cartao',
    null,
    null,
    'Conta a pagar gerada pelo fechamento de fatura de cartao. DRE/plano somam as transacoes, nao esta fatura.',
    'cartao',
    null,
    v_cartao.centro_custo_id,
    v_cartao.empresa_id,
    v_cartao.conta_pagadora_id
  )
  returning * into v_conta;

  update public.financeiro_cartao_faturas
     set valor_total = round(v_total, 2),
         status = 'fechada',
         conta_pagar_id = v_conta.id,
         updated_at = now()
   where id = v_fatura.id
   returning * into v_fatura;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_faturas',
    'cartao_fatura',
    v_fatura.id,
    'fechar_fatura_cartao',
    null,
    to_jsonb(v_fatura),
    ator->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_fatura.id,
    'conta_pagar_id', v_conta.id,
    'valor_total', v_fatura.valor_total,
    'status', v_fatura.status,
    'classificacao', jsonb_build_object(
      'total', v_count_total,
      'confirmadas', v_count_confirmadas,
      'sugeridas', v_count_sugeridas,
      'pendentes', v_count_pendentes,
      'dre_incompleto', v_dre_incompleto
    )
  );
end;
$$;
