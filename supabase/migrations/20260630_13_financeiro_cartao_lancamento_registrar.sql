-- Fase 2.5 M13: porta de alto nivel para lancamento de compra no cartao.
-- Delega cada linha a financeiro_cartao_transacao_registrar para manter uma so verdade de dedupe/audit/fingerprint.

create or replace function public.financeiro_cartao_lancamento_registrar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_cartao_id uuid;
  v_data_compra date;
  v_descricao text;
  v_estabelecimento text;
  v_tipo_transacao text;
  v_total_parcelas int;
  v_valor_total numeric;
  v_valor_parcela_base numeric;
  v_valor_parcela numeric;
  v_soma_parcial numeric := 0;
  v_idx int;
  v_data_parcela date;
  v_open jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_compra_parcelada_id uuid;
  v_client_token text;
  v_transacao_payload jsonb;
  v_transacao_result jsonb;
  v_existing_compra_parcelada_id uuid;
  v_parcelas jsonb := '[]'::jsonb;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_cartao_id := nullif(payload->>'cartao_id', '')::uuid;
  v_data_compra := nullif(payload->>'data_compra', '')::date;
  v_descricao := nullif(trim(payload->>'descricao'), '');
  v_estabelecimento := nullif(trim(payload->>'estabelecimento'), '');
  v_tipo_transacao := coalesce(nullif(payload->>'tipo_transacao', ''), 'compra');
  v_total_parcelas := coalesce(nullif(payload->>'total_parcelas', '')::int, 1);
  v_client_token := nullif(trim(payload->>'client_token'), '');

  if v_cartao_id is null then
    raise exception 'cartao_id obrigatorio para lancamento de cartao.';
  end if;
  if v_data_compra is null then
    raise exception 'data_compra obrigatoria para lancamento de cartao.';
  end if;
  if v_descricao is null then
    raise exception 'descricao obrigatoria para lancamento de cartao.';
  end if;
  if v_client_token is null then
    raise exception 'client_token obrigatorio para lancamento de cartao.';
  end if;
  if v_tipo_transacao not in ('compra','estorno','tarifa','anuidade','ajuste') then
    raise exception 'tipo_transacao invalido para lancamento de cartao.';
  end if;
  if v_total_parcelas < 1 then
    raise exception 'total_parcelas deve ser maior ou igual a 1.';
  end if;
  if v_total_parcelas > 1 and v_tipo_transacao <> 'compra' then
    raise exception 'total_parcelas > 1 permitido apenas para compra.';
  end if;

  if nullif(payload->>'valor_total', '') is not null and nullif(payload->>'valor_parcela', '') is not null then
    raise exception 'informe valor_total ou valor_parcela, nao ambos.';
  end if;
  if nullif(payload->>'valor_total', '') is null and nullif(payload->>'valor_parcela', '') is null then
    raise exception 'valor_total ou valor_parcela obrigatorio para lancamento de cartao.';
  end if;

  if nullif(payload->>'valor_total', '') is not null then
    v_valor_total := abs((payload->>'valor_total')::numeric);
    if v_valor_total = 0 then
      raise exception 'valor_total deve ser diferente de zero.';
    end if;
    v_valor_parcela_base := round(v_valor_total / v_total_parcelas, 2);
  else
    v_valor_parcela_base := abs((payload->>'valor_parcela')::numeric);
    if v_valor_parcela_base = 0 then
      raise exception 'valor_parcela deve ser diferente de zero.';
    end if;
    v_valor_total := round(v_valor_parcela_base * v_total_parcelas, 2);
  end if;

  if v_total_parcelas > 1 then
    v_compra_parcelada_id := gen_random_uuid();
  end if;

  for v_idx in 1..v_total_parcelas loop
    v_data_parcela := (v_data_compra + make_interval(months => v_idx - 1))::date;

    if nullif(payload->>'valor_total', '') is not null then
      if v_idx < v_total_parcelas then
        v_valor_parcela := v_valor_parcela_base;
        v_soma_parcial := v_soma_parcial + v_valor_parcela;
      else
        v_valor_parcela := round(v_valor_total - v_soma_parcial, 2);
      end if;
    else
      v_valor_parcela := v_valor_parcela_base;
    end if;

    if v_tipo_transacao = 'estorno' then
      v_valor_parcela := -abs(v_valor_parcela);
    elsif v_tipo_transacao in ('compra','tarifa','anuidade') then
      v_valor_parcela := abs(v_valor_parcela);
    end if;

    v_open := public.financeiro_cartao_fatura_abrir(
      jsonb_build_object('cartao_id', v_cartao_id, 'data_compra', v_data_parcela, 'motivo', payload->>'motivo'),
      ator
    );

    select * into v_fatura
      from public.financeiro_cartao_faturas
     where id = (v_open->>'fatura_id')::uuid
     for update;
    if not found then
      raise exception 'fatura alvo do lancamento de cartao nao encontrada.';
    end if;
    if v_fatura.status <> 'aberta' then
      raise exception 'fatura % nao esta aberta para lancamento de cartao.', v_fatura.id;
    end if;

    v_transacao_payload := jsonb_strip_nulls(jsonb_build_object(
      'fatura_id', v_fatura.id,
      'data_compra', v_data_parcela,
      'descricao', v_descricao,
      'estabelecimento', v_estabelecimento,
      'valor', v_valor_parcela,
      'tipo_transacao', v_tipo_transacao,
      'plano_conta_id', nullif(payload->>'plano_conta_id', ''),
      'centro_custo_id', nullif(payload->>'centro_custo_id', ''),
      'empresa_id', nullif(payload->>'empresa_id', ''),
      'classificacao_status', nullif(payload->>'classificacao_status', ''),
      'compra_parcelada_id', v_compra_parcelada_id,
      'parcela_atual', case when v_total_parcelas > 1 then v_idx else null end,
      'total_parcelas', case when v_total_parcelas > 1 then v_total_parcelas else null end,
      'valor_total_compra', case when v_total_parcelas > 1 then v_valor_total else null end,
      'id_externo', concat(v_client_token, '-', v_idx, '/', v_total_parcelas),
      'fonte_tipo', coalesce(nullif(payload->>'fonte_tipo', ''), v_actor->>'ator_tipo'),
      'observacoes', nullif(payload->>'observacoes', ''),
      'motivo', payload->>'motivo'
    ));

    v_transacao_result := public.financeiro_cartao_transacao_registrar(v_transacao_payload, ator);
    if coalesce((v_transacao_result->>'idempotent')::boolean, false) then
      select compra_parcelada_id
        into v_existing_compra_parcelada_id
        from public.financeiro_cartao_transacoes
       where id = (v_transacao_result->>'transacao_id')::uuid;

      if v_existing_compra_parcelada_id is not null then
        v_compra_parcelada_id := v_existing_compra_parcelada_id;
      end if;
    end if;

    v_parcelas := v_parcelas || jsonb_build_array(jsonb_build_object(
      'parcela', v_idx,
      'fatura_id', v_fatura.id,
      'competencia', v_fatura.competencia,
      'valor', v_valor_parcela,
      'transacao_id', v_transacao_result->>'transacao_id',
      'idempotent', coalesce((v_transacao_result->>'idempotent')::boolean, false)
    ));
  end loop;

  return jsonb_build_object(
    'success', true,
    'compra_parcelada_id', v_compra_parcelada_id,
    'total_parcelas', v_total_parcelas,
    'valor_total', case when v_tipo_transacao = 'estorno' then -abs(v_valor_total) else v_valor_total end,
    'parcelas', v_parcelas
  );
end;
$$;

revoke all on function public.financeiro_cartao_lancamento_registrar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_lancamento_registrar(jsonb, jsonb) to authenticated, service_role;
