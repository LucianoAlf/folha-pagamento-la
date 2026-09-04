-- Fase 2.5 M10: evolucao do T1.
-- Somente fatura aberta aceita escrita factual. Fechada/paga aceitam apenas reclassificacao gerencial.

create or replace function public.financeiro_cartao_transacoes_bloqueia_fatura_fechada()
returns trigger
language plpgsql
as $$
declare
  v_fatura_id uuid;
  v_status text;
  v_apenas_reclassificacao boolean;
begin
  v_fatura_id := coalesce(new.fatura_id, old.fatura_id);

  select status into v_status
    from public.financeiro_cartao_faturas
   where id = v_fatura_id;

  if v_status is null then
    raise exception 'fatura % nao encontrada para transacao de cartao.', v_fatura_id;
  end if;

  if v_status = 'aberta' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_status = 'cancelada' then
    raise exception 'fatura % nao permite alterar transacoes quando status = %', v_fatura_id, v_status;
  end if;

  if tg_op = 'UPDATE' and v_status in ('fechada','paga') then
    v_apenas_reclassificacao :=
      new.fatura_id is not distinct from old.fatura_id and
      new.cartao_id is not distinct from old.cartao_id and
      new.importacao_id is not distinct from old.importacao_id and
      new.data_compra is not distinct from old.data_compra and
      new.descricao is not distinct from old.descricao and
      new.estabelecimento is not distinct from old.estabelecimento and
      new.valor is not distinct from old.valor and
      new.tipo_transacao is not distinct from old.tipo_transacao and
      new.compra_parcelada_id is not distinct from old.compra_parcelada_id and
      new.parcela_atual is not distinct from old.parcela_atual and
      new.total_parcelas is not distinct from old.total_parcelas and
      new.valor_total_compra is not distinct from old.valor_total_compra and
      new.fingerprint is not distinct from old.fingerprint and
      new.possivel_duplicata is not distinct from old.possivel_duplicata and
      new.id_externo is not distinct from old.id_externo and
      new.fonte_tipo is not distinct from old.fonte_tipo and
      new.ator_tipo is not distinct from old.ator_tipo and
      new.ator_ref is not distinct from old.ator_ref and
      new.created_by is not distinct from old.created_by and
      new.observacoes is not distinct from old.observacoes;

    if v_apenas_reclassificacao then
      return new;
    end if;

    raise exception 'fatura % permite apenas reclassificacao quando status = %', v_fatura_id, v_status;
  end if;

  raise exception 'fatura % nao permite alterar transacoes quando status = %', v_fatura_id, v_status;
end;
$$;
