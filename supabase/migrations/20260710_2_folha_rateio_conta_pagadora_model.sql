-- Fase 5 / Fatia A: conta pagadora pertence a fatia mensal, nao ao cadastro fixo.
-- Sem backfill: toda reconciliacao e humana e por competencia.

do $$
begin
  if exists (
    select 1
    from public.colaboradores
    where conta_pagadora_id is not null
  ) then
    raise exception 'recusa remover colaboradores.conta_pagadora_id: existem atribuicoes preenchidas.';
  end if;
end
$$;

drop index if exists public.colaboradores_conta_pagadora_id_idx;

alter table public.colaboradores
  drop constraint if exists colaboradores_conta_pagadora_id_fkey;

alter table public.colaboradores
  drop column if exists conta_pagadora_id;

alter table public.lancamentos_folha
  add column if not exists conta_pagadora_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.lancamentos_folha'::regclass
       and conname = 'lancamentos_folha_conta_pagadora_id_fkey'
  ) then
    alter table public.lancamentos_folha
      add constraint lancamentos_folha_conta_pagadora_id_fkey
      foreign key (conta_pagadora_id)
      references public.financeiro_contas_bancarias(id);
  end if;
end
$$;

create index if not exists lancamentos_folha_folha_conta_pagadora_idx
  on public.lancamentos_folha (folha_id, conta_pagadora_id);

create unique index if not exists lancamentos_folha_rateio_canonico_uidx
  on public.lancamentos_folha (folha_id,
    colaborador_id,
    categoria,
    conta_pagadora_id)
  where conta_pagadora_id is not null;

create or replace function public.folha_lancamento_valida_conta_pagadora()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade text;
  v_role text;
  v_rpc_marker text;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
  v_rpc_marker := coalesce(current_setting('app.folha_rateio_rpc', true), '');

  if (
    (tg_op = 'INSERT' and new.conta_pagadora_id is not null)
    or
    (tg_op = 'UPDATE' and new.conta_pagadora_id is distinct from old.conta_pagadora_id)
  ) and v_role = 'authenticated' and v_rpc_marker <> 'on' then
    raise exception 'alteracao de conta pagadora exige a RPC de rateio.'
      using errcode = '42501';
  end if;

  if new.conta_pagadora_id is null then
    return new;
  end if;

  select cc.codigo
    into v_unidade
    from public.financeiro_contas_bancarias b
    join public.financeiro_empresas e
      on e.id = b.empresa_id
     and e.ativo = true
    join public.centros_custo cc
      on cc.id = e.unidade_id
     and cc.ativo = true
   where b.id = new.conta_pagadora_id
     and b.ativo = true;

  if v_unidade is null then
    raise exception 'conta_pagadora_id nao encontrada, inativa ou sem unidade ativa.';
  end if;

  if v_unidade not in ('cg', 'rec', 'bar') then
    raise exception 'unidade derivada da conta pagadora e invalida: %', v_unidade;
  end if;

  if new.unidade is distinct from v_unidade then
    raise exception 'unidade % nao corresponde a unidade % da conta pagadora.',
      new.unidade, v_unidade;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_folha_lancamento_valida_conta_pagadora
  on public.lancamentos_folha;

create trigger trg_folha_lancamento_valida_conta_pagadora
  before insert or update of conta_pagadora_id, unidade
  on public.lancamentos_folha
  for each row
  execute function public.folha_lancamento_valida_conta_pagadora();

revoke all on function public.folha_lancamento_valida_conta_pagadora()
  from public, anon, authenticated, maria_operacional, maria_leitura;
