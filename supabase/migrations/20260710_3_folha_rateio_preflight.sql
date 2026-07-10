-- Fase 5 / Fatia A: diagnostico read-only da reconciliacao por conta pagadora.

create or replace function public.folha_rateio_contas_preflight(p_folha_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_folha numeric;
  v_total_lancamentos numeric;
  v_pessoas_total integer;
  v_pessoas_pendentes integer;
  v_sem_conta integer;
  v_incoerentes integer;
  v_conflitos integer;
  v_totais_por_conta jsonb;
  v_problemas jsonb;
begin
  select f.total_geral
    into v_total_folha
    from public.folhas_mensais f
   where f.id = p_folha_id;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  with base as (
    select
      lf.id,
      lf.colaborador_id,
      lf.categoria,
      lf.conta_pagadora_id,
      lf.unidade,
      lf.total,
      b.id as conta_id,
      b.ativo as conta_ativa,
      e.id as empresa_id,
      e.ativo as empresa_ativa,
      cc.id as centro_id,
      cc.codigo as unidade_esperada,
      cc.ativo as centro_ativo
    from public.lancamentos_folha lf
    left join public.financeiro_contas_bancarias b on b.id = lf.conta_pagadora_id
    left join public.financeiro_empresas e on e.id = b.empresa_id
    left join public.centros_custo cc on cc.id = e.unidade_id
    where lf.folha_id = p_folha_id
  ),
  duplicadas as (
    select colaborador_id, categoria, conta_pagadora_id
    from base
    where conta_pagadora_id is not null
    group by colaborador_id, categoria, conta_pagadora_id
    having count(*) > 1
  ),
  marcadas as (
    select
      b.*,
      (
        b.conta_pagadora_id is null
        or b.conta_id is null
        or b.conta_ativa is distinct from true
        or b.empresa_id is null
        or b.empresa_ativa is distinct from true
        or b.centro_id is null
        or b.centro_ativo is distinct from true
        or b.unidade is distinct from b.unidade_esperada
        or exists (
          select 1 from duplicadas d
          where d.colaborador_id = b.colaborador_id
            and d.categoria = b.categoria
            and d.conta_pagadora_id = b.conta_pagadora_id
        )
      ) as pendente
    from base b
  )
  select
    coalesce(sum(total), 0),
    count(distinct colaborador_id),
    count(distinct colaborador_id) filter (where pendente),
    count(*) filter (where conta_pagadora_id is null),
    count(*) filter (
      where conta_pagadora_id is not null
        and (
          conta_id is null
          or conta_ativa is distinct from true
          or empresa_id is null
          or empresa_ativa is distinct from true
          or centro_id is null
          or centro_ativo is distinct from true
          or unidade is distinct from unidade_esperada
        )
    )
    into
      v_total_lancamentos,
      v_pessoas_total,
      v_pessoas_pendentes,
      v_sem_conta,
      v_incoerentes
  from marcadas;

  select count(*)
    into v_conflitos
    from (
      select colaborador_id, categoria, conta_pagadora_id
      from public.lancamentos_folha
      where folha_id = p_folha_id
        and conta_pagadora_id is not null
      group by colaborador_id, categoria, conta_pagadora_id
      having count(*) > 1
    ) conflitos;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'conta_pagadora_id', x.conta_pagadora_id,
        'conta_apelido', x.conta_apelido,
        'empresa', x.empresa,
        'unidade', x.unidade,
        'valor', x.valor
      )
      order by x.empresa, x.conta_apelido
    ),
    '[]'::jsonb
  )
  into v_totais_por_conta
  from (
    select
      lf.conta_pagadora_id,
      b.apelido as conta_apelido,
      coalesce(e.label_operacional, e.nome_fantasia, e.razao_social) as empresa,
      cc.codigo as unidade,
      coalesce(sum(lf.total), 0) as valor
    from public.lancamentos_folha lf
    join public.financeiro_contas_bancarias b on b.id = lf.conta_pagadora_id
    join public.financeiro_empresas e on e.id = b.empresa_id
    join public.centros_custo cc on cc.id = e.unidade_id
    where lf.folha_id = p_folha_id
    group by
      lf.conta_pagadora_id,
      b.apelido,
      e.label_operacional,
      e.nome_fantasia,
      e.razao_social,
      cc.codigo
  ) x;

  select coalesce(
    jsonb_agg(jsonb_build_object('codigo', p.codigo, 'quantidade', p.quantidade)),
    '[]'::jsonb
  )
  into v_problemas
  from (
    select 'fatias_sem_conta'::text as codigo, v_sem_conta as quantidade
    union all select 'incoerencias_fiscais', v_incoerentes
    union all select 'conflitos_chave', v_conflitos
    union all select
      'total_geral_divergente',
      case when v_total_lancamentos is distinct from v_total_folha then 1 else 0 end
  ) p
  where p.quantidade > 0;

  return jsonb_build_object(
    'folha_id', p_folha_id,
    'pronto',
      v_sem_conta = 0
      and v_incoerentes = 0
      and v_conflitos = 0
      and v_total_lancamentos is not distinct from v_total_folha,
    'pessoas_total', v_pessoas_total,
    'pessoas_pendentes', v_pessoas_pendentes,
    'fatias_sem_conta', v_sem_conta,
    'incoerencias_fiscais', v_incoerentes,
    'conflitos_chave', v_conflitos,
    'total_folha', v_total_folha,
    'total_lancamentos', v_total_lancamentos,
    'diferenca', v_total_lancamentos - v_total_folha,
    'totais_por_conta', v_totais_por_conta,
    'problemas', v_problemas
  );
end;
$$;

revoke all on function public.folha_rateio_contas_preflight(integer) from public, anon, authenticated, maria_operacional, maria_leitura;

grant execute on function public.folha_rateio_contas_preflight(integer) to authenticated, service_role;
