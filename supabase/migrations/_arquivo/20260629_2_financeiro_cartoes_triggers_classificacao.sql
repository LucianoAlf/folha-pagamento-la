-- Fase 2: invariantes de coerencia fiscal dos cartoes e classificacao das transacoes.

create or replace function public.financeiro_cartoes_valida_coerencia()
returns trigger
language plpgsql
as $$
declare
  v_empresa_conta uuid;
  v_unidade_conta uuid;
  v_unidade_empresa uuid;
begin
  if new.conta_pagadora_id is not null then
    select b.empresa_id, e.unidade_id
      into v_empresa_conta, v_unidade_conta
      from public.financeiro_contas_bancarias b
      join public.financeiro_empresas e on e.id = b.empresa_id
     where b.id = new.conta_pagadora_id;

    if v_empresa_conta is null then
      raise exception 'conta_pagadora_id % nao encontrada em financeiro_contas_bancarias', new.conta_pagadora_id;
    end if;

    if new.empresa_id is not null and v_empresa_conta <> new.empresa_id then
      raise exception 'conta_pagadora_id % pertence a empresa %, nao a empresa %',
        new.conta_pagadora_id, v_empresa_conta, new.empresa_id;
    end if;

    if new.centro_custo_id is not null and v_unidade_conta <> new.centro_custo_id then
      raise exception 'conta_pagadora_id % pertence a unidade %, nao ao centro_custo_id %',
        new.conta_pagadora_id, v_unidade_conta, new.centro_custo_id;
    end if;
  end if;

  if new.empresa_id is not null and new.centro_custo_id is not null then
    select unidade_id into v_unidade_empresa
      from public.financeiro_empresas
     where id = new.empresa_id;

    if v_unidade_empresa is null then
      raise exception 'empresa_id % nao encontrada em financeiro_empresas', new.empresa_id;
    end if;

    if v_unidade_empresa <> new.centro_custo_id then
      raise exception 'centro_custo_id % nao corresponde a unidade % da empresa %',
        new.centro_custo_id, v_unidade_empresa, new.empresa_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_cartoes_valida_coerencia on public.financeiro_cartoes;
create trigger trg_financeiro_cartoes_valida_coerencia
  before insert or update on public.financeiro_cartoes
  for each row execute function public.financeiro_cartoes_valida_coerencia();

create or replace function public.financeiro_cartao_transacoes_valida_classificacao()
returns trigger
language plpgsql
as $$
declare
  v_plano_ok boolean;
begin
  if new.classificacao_status = 'confirmada' then
    if new.plano_conta_id is null then
      raise exception 'plano_conta_id obrigatorio para classificacao confirmada.';
    end if;

    if new.centro_custo_id is null then
      raise exception 'centro_custo_id obrigatorio para classificacao confirmada.';
    end if;

    select true into v_plano_ok
      from public.plano_contas p
     where p.id = new.plano_conta_id
       and p.nivel = 3
       and p.natureza = 'saida'
       and p.ativo = true;

    if coalesce(v_plano_ok, false) is not true then
      raise exception 'plano_conta_id deve ser folha de saida ativa para classificacao confirmada.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financeiro_cartao_transacoes_valida_classificacao on public.financeiro_cartao_transacoes;
create trigger trg_financeiro_cartao_transacoes_valida_classificacao
  before insert or update on public.financeiro_cartao_transacoes
  for each row execute function public.financeiro_cartao_transacoes_valida_classificacao();
