-- Fase 2.5 M11: valor_total da fatura segue a soma das transacoes.

create or replace function public.financeiro_cartao_faturas_recalcula_valor(p_fatura_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fatura_id is null then
    return;
  end if;

  update public.financeiro_cartao_faturas
     set valor_total = (
           select round(coalesce(sum(valor), 0), 2)
             from public.financeiro_cartao_transacoes
            where fatura_id = p_fatura_id
         ),
         updated_at = now()
   where id = p_fatura_id;
end;
$$;

create or replace function public.financeiro_cartao_faturas_sync_valor_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.financeiro_cartao_faturas_recalcula_valor(old.fatura_id);
    return old;
  end if;

  perform public.financeiro_cartao_faturas_recalcula_valor(new.fatura_id);

  if tg_op = 'UPDATE' and old.fatura_id is distinct from new.fatura_id then
    perform public.financeiro_cartao_faturas_recalcula_valor(old.fatura_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_cartao_faturas_sync_valor_total on public.financeiro_cartao_transacoes;
create trigger trg_financeiro_cartao_faturas_sync_valor_total
  after insert or delete or update of valor, fatura_id on public.financeiro_cartao_transacoes
  for each row execute function public.financeiro_cartao_faturas_sync_valor_total();
