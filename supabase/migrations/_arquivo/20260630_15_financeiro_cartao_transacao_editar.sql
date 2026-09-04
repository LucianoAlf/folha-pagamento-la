-- Fase 2.5 M15: edicao factual de transacao avulsa em fatura aberta.

create or replace function public.financeiro_cartao_transacao_editar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_transacao_id uuid;
  v_before public.financeiro_cartao_transacoes%rowtype;
  v_after public.financeiro_cartao_transacoes%rowtype;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_nova_data date;
  v_nova_competencia date;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_transacao_id := nullif(payload->>'transacao_id', '')::uuid;
  if v_transacao_id is null then
    raise exception 'transacao_id obrigatorio para editar transacao de cartao.';
  end if;

  select * into v_before
    from public.financeiro_cartao_transacoes
   where id = v_transacao_id
   for update;
  if not found then
    raise exception 'transacao de cartao nao encontrada.';
  end if;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = v_before.fatura_id
   for update;
  if not found then
    raise exception 'fatura da transacao nao encontrada.';
  end if;
  if v_fatura.status <> 'aberta' then
    raise exception 'transacao so pode ser editada com fatura aberta.';
  end if;

  if v_before.compra_parcelada_id is not null then
    raise exception 'transacao parcelada deve ser cancelada e relancada para alterar dados factuais.';
  end if;

  if payload ? 'data_compra' then
    v_nova_data := nullif(payload->>'data_compra', '')::date;
    if v_nova_data is null then
      raise exception 'data_compra invalida.';
    end if;

    select c.competencia into v_nova_competencia
      from public.financeiro_cartao_ciclo(v_before.cartao_id, v_nova_data) c;

    if v_nova_competencia <> v_fatura.competencia then
      raise exception 'mudar data_compra para outra competencia exige cancelar e relancar.';
    end if;
  else
    v_nova_data := v_before.data_compra;
  end if;

  update public.financeiro_cartao_transacoes
     set data_compra = v_nova_data,
         descricao = coalesce(nullif(trim(payload->>'descricao'), ''), descricao),
         estabelecimento = case
           when payload ? 'estabelecimento' then nullif(trim(payload->>'estabelecimento'), '')
           else estabelecimento
         end,
         valor = case
           when payload ? 'valor' then round(nullif(payload->>'valor', '')::numeric, 2)
           else valor
         end
   where id = v_transacao_id
   returning * into v_after;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_transacoes',
    'cartao_transacao',
    v_after.id,
    'editar_transacao_cartao',
    to_jsonb(v_before),
    to_jsonb(v_after),
    payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'transacao_id', v_after.id
  );
end;
$$;

revoke all on function public.financeiro_cartao_transacao_editar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_transacao_editar(jsonb, jsonb) to authenticated, service_role;
