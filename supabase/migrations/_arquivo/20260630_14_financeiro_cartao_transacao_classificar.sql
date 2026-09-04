-- Fase 2.5 M14: porta unica de classificacao/reclassificacao de transacao.

create or replace function public.financeiro_cartao_transacao_classificar(payload jsonb, ator jsonb default '{}'::jsonb)
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
  v_status text;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_transacao_id := nullif(payload->>'transacao_id', '')::uuid;
  if v_transacao_id is null then
    raise exception 'transacao_id obrigatorio para classificar transacao de cartao.';
  end if;

  v_status := coalesce(nullif(payload->>'classificacao_status', ''), 'confirmada');
  if v_status not in ('pendente','sugerida','confirmada') then
    raise exception 'classificacao_status invalido.';
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
   where id = v_before.fatura_id;
  if not found then
    raise exception 'fatura da transacao nao encontrada.';
  end if;
  if v_fatura.status = 'cancelada' then
    raise exception 'fatura cancelada nao permite reclassificacao.';
  end if;

  update public.financeiro_cartao_transacoes
     set plano_conta_id = coalesce(nullif(payload->>'plano_conta_id', '')::uuid, plano_conta_id),
         centro_custo_id = coalesce(nullif(payload->>'centro_custo_id', '')::uuid, centro_custo_id),
         empresa_id = coalesce(nullif(payload->>'empresa_id', '')::uuid, empresa_id),
         classificacao_status = v_status,
         classificado_por = v_actor->>'ator_tipo',
         classificado_em = now()
   where id = v_transacao_id
   returning * into v_after;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_transacoes',
    'cartao_transacao',
    v_after.id,
    'classificar_transacao_cartao',
    to_jsonb(v_before),
    to_jsonb(v_after),
    payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'transacao_id', v_after.id,
    'classificacao_status', v_after.classificacao_status
  );
end;
$$;

revoke all on function public.financeiro_cartao_transacao_classificar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_transacao_classificar(jsonb, jsonb) to authenticated, service_role;
