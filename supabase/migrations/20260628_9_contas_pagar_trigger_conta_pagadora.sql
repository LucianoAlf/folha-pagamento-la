create or replace function public.contas_pagar_valida_empresa_centro()
returns trigger
language plpgsql
as $$
declare
  v_unidade_empresa uuid;
  v_empresa_conta uuid;
  v_unidade_conta uuid;
begin
  -- Arestas 1 e 2: conta pagadora e fonte da verdade (define empresa e unidade)
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

  -- Aresta 3: empresa <-> centro (cobre o caso sem conta pagadora)
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
