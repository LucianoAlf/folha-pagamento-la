-- Fase 2: imutabilidade de faturas fechadas e sincronismo com baixa em contas_pagar.

create or replace function public.financeiro_cartao_transacoes_bloqueia_fatura_fechada()
returns trigger
language plpgsql
as $$
declare
  v_fatura_id uuid;
  v_status text;
begin
  v_fatura_id := coalesce(new.fatura_id, old.fatura_id);

  select status into v_status
    from public.financeiro_cartao_faturas
   where id = v_fatura_id;

  if v_status in ('fechada','paga') then
    raise exception 'transacoes de fatura % nao podem ser alteradas quando status = %', v_fatura_id, v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_cartao_transacoes_bloqueia_fatura_fechada on public.financeiro_cartao_transacoes;
create trigger trg_financeiro_cartao_transacoes_bloqueia_fatura_fechada
  before insert or update or delete on public.financeiro_cartao_transacoes
  for each row execute function public.financeiro_cartao_transacoes_bloqueia_fatura_fechada();

create or replace function public.financeiro_cartao_faturas_sync_pagamento()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_lancamento = 'fatura_cartao'
     and new.status = 'pago'
     and old.status is distinct from 'pago' then
    update public.financeiro_cartao_faturas
       set status = 'paga',
           updated_at = now()
     where conta_pagar_id = new.id
       and status <> 'paga';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_cartao_faturas_sync_pagamento on public.contas_pagar;
create trigger trg_financeiro_cartao_faturas_sync_pagamento
  after update on public.contas_pagar
  for each row execute function public.financeiro_cartao_faturas_sync_pagamento();
