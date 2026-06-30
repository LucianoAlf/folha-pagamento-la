-- Fase 2.5 M16: cancelamento fisico auditado de transacoes ainda em fatura aberta.

create or replace function public.financeiro_cartao_transacao_cancelar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_transacao_id uuid;
  v_compra_parcelada_id uuid;
  v_ids uuid[];
  v_row public.financeiro_cartao_transacoes%rowtype;
  v_before jsonb;
  v_canceladas int;
  v_bloqueadas jsonb;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_transacao_id := nullif(payload->>'transacao_id', '')::uuid;
  v_compra_parcelada_id := nullif(payload->>'compra_parcelada_id', '')::uuid;

  if v_transacao_id is null and v_compra_parcelada_id is null then
    raise exception 'transacao_id ou compra_parcelada_id obrigatorio para cancelar transacao de cartao.';
  end if;
  if v_transacao_id is not null and v_compra_parcelada_id is not null then
    raise exception 'informe transacao_id ou compra_parcelada_id, nao ambos.';
  end if;

  with alvo as (
    select t.*
      from public.financeiro_cartao_transacoes t
     where (v_transacao_id is not null and t.id = v_transacao_id)
        or (v_compra_parcelada_id is not null and t.compra_parcelada_id = v_compra_parcelada_id)
     for update
  )
  select array_agg(alvo.id order by alvo.data_compra, alvo.parcela_atual nulls first),
         jsonb_agg(to_jsonb(alvo) order by alvo.data_compra, alvo.parcela_atual nulls first)
    into v_ids, v_before
    from alvo;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'transacao de cartao nao encontrada para cancelamento.';
  end if;

  if exists (
    select 1
      from public.financeiro_cartao_transacoes t
      join public.financeiro_cartao_faturas f on f.id = t.fatura_id
     where t.id = any(v_ids)
       and f.status <> 'aberta'
  ) then
    select jsonb_agg(jsonb_build_object('transacao_id', t.id, 'fatura_id', f.id, 'status', f.status))
      into v_bloqueadas
      from public.financeiro_cartao_transacoes t
      join public.financeiro_cartao_faturas f on f.id = t.fatura_id
     where t.id = any(v_ids)
       and f.status <> 'aberta';

    raise exception 'parcelas em fatura nao-aberta impedem cancelamento: %', v_bloqueadas;
  end if;

  for v_row in
    select *
      from public.financeiro_cartao_transacoes
     where id = any(v_ids)
  loop
    perform public.financeiro_cartoes_audit_insert(
      v_actor,
      'financeiro_cartao_transacoes',
      'cartao_transacao',
      v_row.id,
      'cancelar_transacao_cartao',
      to_jsonb(v_row),
      null,
      payload->>'motivo'
    );
  end loop;

  delete from public.financeiro_cartao_transacoes
   where id = any(v_ids);

  get diagnostics v_canceladas = row_count;

  return jsonb_build_object(
    'success', true,
    'canceladas', v_canceladas,
    'transacao_ids', to_jsonb(v_ids),
    'antes', v_before
  );
end;
$$;

revoke all on function public.financeiro_cartao_transacao_cancelar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_transacao_cancelar(jsonb, jsonb) to authenticated, service_role;
