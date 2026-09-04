-- A snapshot DRE generated before valor_pago_direto existed remains valid proof
-- only when its frozen Bistro liquidation reconciles exactly with the current
-- payroll-applicable Bistro amount. The snapshot itself stays immutable.

create or replace function public.folha_duplicar_lancamentos_preflight(
  p_folha_origem_id integer,
  p_folha_destino_id integer,
  p_unidades text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_origem_status text;
  v_origem_ano integer;
  v_origem_mes integer;
  v_destino_status text;
  v_ref_date date;
  v_ref_ym text;
  v_bistro_competencia_id uuid;
  v_unidades text[];
  v_origem_linhas integer;
  v_destino_ocupado integer;
  v_hash_origem_atual text;
  v_hash_origem_legacy text;
  v_snapshot_hash text;
  v_snapshot_hashes integer;
  v_snapshot_linhas integer;
  v_snapshot_liquidacao numeric;
  v_bistro_aplicavel numeric;
  v_snapshot_valido boolean;
  v_ambiguos jsonb;
  v_insercoes jsonb;
  v_conflitos jsonb;
  v_source_hash text;
  v_pode_duplicar boolean;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role not in ('service_role', 'postgres') then
    raise exception 'papel nao autorizado para preflight de duplicacao: %', v_role
      using errcode = '42501';
  end if;

  if p_folha_origem_id = p_folha_destino_id then
    raise exception 'folha de origem e destino devem ser diferentes.';
  end if;

  if p_unidades is null or cardinality(p_unidades) = 0 then
    raise exception 'p_unidades deve conter ao menos uma unidade.';
  end if;

  if exists (
    select 1 from unnest(p_unidades) as u(unidade)
    where u.unidade is null or u.unidade not in ('cg', 'rec', 'bar')
  ) then
    raise exception 'unidades devem ser subconjunto de {cg,rec,bar}.';
  end if;

  if (select count(*) from unnest(p_unidades))
     <> (select count(distinct unidade) from unnest(p_unidades) as u(unidade)) then
    raise exception 'unidades repetidas ou duplicadas nao sao permitidas.';
  end if;

  select array_agg(u.unidade order by u.unidade)
    into v_unidades
    from unnest(p_unidades) as u(unidade);

  select f.status, f.ano, f.mes
    into v_origem_status, v_origem_ano, v_origem_mes
    from public.folhas_mensais f
   where f.id = p_folha_origem_id;

  if not found then
    raise exception 'folha de origem % nao encontrada.', p_folha_origem_id;
  end if;

  select f.status
    into v_destino_status
    from public.folhas_mensais f
   where f.id = p_folha_destino_id;

  if not found then
    raise exception 'folha de destino % nao encontrada.', p_folha_destino_id;
  end if;

  v_ref_date := (
    make_date(v_origem_ano, v_origem_mes, 1) - interval '1 month'
  )::date;
  v_ref_ym := to_char(v_ref_date, 'YYYY-MM');

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_ref_date)::integer
     and bc.mes = extract(month from v_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1;

  select count(*)::integer
    into v_origem_linhas
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_origem_id
     and lf.unidade = any(v_unidades);

  select count(*)::integer
    into v_destino_ocupado
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_destino_id
     and lf.unidade = any(v_unidades);

  v_hash_origem_atual := public.folha_dre_hash_origem(
    p_folha_origem_id,
    true
  );
  v_hash_origem_legacy := public.folha_dre_hash_origem(
    p_folha_origem_id,
    false
  );

  select
    count(*)::integer,
    count(distinct s.hash_origem)::integer,
    min(s.hash_origem),
    round(coalesce(sum(s.valor_original) filter (
      where s.tipo_efeito = 'liquidacao'
    ), 0), 2)
  into
    v_snapshot_linhas,
    v_snapshot_hashes,
    v_snapshot_hash,
    v_snapshot_liquidacao
  from public.folha_classificacao_dre s
  where s.folha_id = p_folha_origem_id;

  select round(coalesce(sum(
    greatest(bc.valor - bc.valor_pago_direto, 0)
  ), 0), 2)
    into v_bistro_aplicavel
    from public.bistro_consumos bc
   where bc.competencia_id = v_bistro_competencia_id;

  v_snapshot_valido := v_snapshot_linhas > 0
    and v_snapshot_hashes = 1
    and (
      v_snapshot_hash = v_hash_origem_atual
      or (
        v_snapshot_hash = v_hash_origem_legacy
        and v_snapshot_liquidacao = v_bistro_aplicavel
      )
    );

  with origem_raw as (
    select
      lf.id as lancamento_id,
      lf.colaborador_id,
      lf.unidade,
      lf.categoria,
      lf.salario,
      lf.bonus,
      lf.comissao,
      lf.passagem,
      lf.reembolso,
      lf.inss,
      round(coalesce(lf.descontos, 0), 2) as descontos,
      lf.observacoes,
      coalesce(lf.detalhamento, '{}'::jsonb)
        - '__bistro' - '__rateio' - 'rateio' - 'conta_pagadora_id'
        as detalhamento_limpo,
      coalesce(lf.detalhamento, '{}'::jsonb) ? '__bistro' as tem_meta,
      lf.detalhamento->'__bistro'->>'ref_ym' as meta_ref_ym,
      case
        when jsonb_typeof(lf.detalhamento->'__bistro'->'valor') = 'number'
          then (lf.detalhamento->'__bistro'->>'valor')::numeric
        when coalesce(lf.detalhamento->'__bistro'->>'valor', '')
             ~ '^-?[0-9]+([.,][0-9]+)?$'
          then replace(lf.detalhamento->'__bistro'->>'valor', ',', '.')::numeric
        else null
      end as meta_valor
    from public.lancamentos_folha lf
    where lf.folha_id = p_folha_origem_id
      and lf.unidade = any(v_unidades)
  ), dre_liquidacao as (
    select
      s.lancamento_folha_id as lancamento_id,
      round(sum(s.valor_original), 2) as valor_bistro
    from public.folha_classificacao_dre s
    where s.folha_id = p_folha_origem_id
      and s.tipo_efeito = 'liquidacao'
      and s.hash_origem = v_snapshot_hash
    group by s.lancamento_folha_id
  ), linhas_meta as (
    select
      o.*,
      (
        o.tem_meta
        and o.meta_ref_ym = v_ref_ym
        and o.meta_valor is not null
        and o.meta_valor >= 0
        and round(o.meta_valor, 2) <= o.descontos
      ) as meta_valida,
      coalesce(dl.valor_bistro, 0) as dre_bistro
    from origem_raw o
    left join dre_liquidacao dl on dl.lancamento_id = o.lancamento_id
  ), pessoa_prova as (
    select
      lm.colaborador_id,
      count(*)::integer as linhas,
      count(*) filter (where lm.meta_valida)::integer as meta_validas,
      round(sum(lm.descontos), 2) as descontos_total,
      round(sum(lm.dre_bistro), 2) as dre_bistro_total,
      case
        when count(*) filter (where lm.meta_valida) = count(*)
          then 'metadata'
        when v_snapshot_valido and round(sum(lm.dre_bistro), 2) <= round(sum(lm.descontos), 2)
          then 'snapshot_dre'
        when round(sum(lm.descontos), 2) = 0 then 'sem_desconto'
        else 'ambiguo'
      end as prova
    from linhas_meta lm
    group by lm.colaborador_id
  ), linhas_provadas as (
    select
      lm.*,
      pp.prova,
      round(case
        when pp.prova = 'metadata' then coalesce(lm.meta_valor, 0)
        when pp.prova = 'snapshot_dre' then lm.dre_bistro
        else 0
      end, 2) as bistro_remover
    from linhas_meta lm
    join pessoa_prova pp on pp.colaborador_id = lm.colaborador_id
  ), grupos as (
    select
      lp.colaborador_id,
      lp.unidade,
      lp.categoria,
      round(sum(coalesce(lp.salario, 0)), 2) as salario,
      round(sum(coalesce(lp.bonus, 0)), 2) as bonus,
      round(sum(coalesce(lp.comissao, 0)), 2) as comissao,
      round(sum(coalesce(lp.passagem, 0)), 2) as passagem,
      round(sum(coalesce(lp.reembolso, 0)), 2) as reembolso,
      round(sum(coalesce(lp.inss, 0)), 2) as inss,
      round(sum(lp.descontos - lp.bistro_remover), 2) as descontos,
      count(distinct nullif(trim(lp.observacoes), ''))::integer
        as observacoes_distintas,
      min(nullif(trim(lp.observacoes), '')) as observacoes,
      count(distinct lp.detalhamento_limpo)::integer as detalhes_distintos,
      (jsonb_agg(lp.detalhamento_limpo order by lp.lancamento_id))->0
        as detalhamento,
      min(lp.lancamento_id) as primeiro_lancamento_id
    from linhas_provadas lp
    group by lp.colaborador_id, lp.unidade, lp.categoria
  ), ambiguos_raw as (
    select
      pp.colaborador_id,
      'desconto sem prova Bistro por metadata completa ou snapshot DRE vigente'
        as motivo
    from pessoa_prova pp
    where pp.prova = 'ambiguo'
    union all
    select
      g.colaborador_id,
      'observacoes/detalhamento nao podem ser consolidados sem perda'
    from grupos g
    where g.observacoes_distintas > 1 or g.detalhes_distintos > 1
  ), ambiguos_agrupados as (
    select
      ar.colaborador_id,
      jsonb_agg(to_jsonb(ar.motivo) order by ar.motivo) as motivos
    from ambiguos_raw ar
    group by ar.colaborador_id
  ), insercoes_rows as (
    select g.*
    from grupos g
    where not exists (
      select 1
      from ambiguos_agrupados a
      where a.colaborador_id = g.colaborador_id
    )
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'colaborador_id', a.colaborador_id,
        'nome', coalesce(c.nome_completo, c.nome),
        'motivos', a.motivos
      ) order by coalesce(c.nome_completo, c.nome), a.colaborador_id)
      from ambiguos_agrupados a
      join public.colaboradores c on c.id = a.colaborador_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'colaborador_id', i.colaborador_id,
        'unidade', i.unidade,
        'categoria', i.categoria,
        'conta_pagadora_id', null,
        'salario', i.salario,
        'bonus', i.bonus,
        'comissao', i.comissao,
        'passagem', i.passagem,
        'reembolso', i.reembolso,
        'inss', i.inss,
        'descontos', i.descontos,
        'observacoes', i.observacoes,
        'detalhamento', i.detalhamento,
        'alert_checked', false
      ) order by i.colaborador_id, i.unidade, i.categoria)
      from insercoes_rows i
    ), '[]'::jsonb)
  into v_ambiguos, v_insercoes;

  v_conflitos := '[]'::jsonb;
  if v_destino_status <> 'rascunho' then
    v_conflitos := v_conflitos || jsonb_build_array(
      'destino deve estar em rascunho'
    );
  end if;
  if v_destino_ocupado > 0 then
    v_conflitos := v_conflitos || jsonb_build_array(
      'destino parcialmente preenchido nas unidades pedidas'
    );
  end if;
  if v_origem_linhas = 0 then
    v_conflitos := v_conflitos || jsonb_build_array(
      'origem sem lancamentos nas unidades pedidas'
    );
  end if;

  v_pode_duplicar := jsonb_array_length(v_ambiguos) = 0
    and jsonb_array_length(v_conflitos) = 0;

  select encode(extensions.digest(jsonb_build_object(
    'allocation_version', 'folha-duplicate-v1',
    'origem_folha_id', p_folha_origem_id,
    'destino_folha_id', p_folha_destino_id,
    'unidades', to_jsonb(v_unidades),
    'hash_origem_atual', v_hash_origem_atual,
    'hash_origem_legacy', v_hash_origem_legacy,
    'snapshot_hash_origem', v_snapshot_hash,
    'snapshot_valido', v_snapshot_valido,
    'snapshot_liquidacao', v_snapshot_liquidacao,
    'bistro_aplicavel', v_bistro_aplicavel,
    'origem_linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lancamento_id', x.lancamento_id,
        'colaborador_id', x.colaborador_id,
        'unidade', x.unidade,
        'categoria', x.categoria,
        'conta_pagadora_id', x.conta_pagadora_id,
        'salario', x.salario,
        'bonus', x.bonus,
        'comissao', x.comissao,
        'passagem', x.passagem,
        'reembolso', x.reembolso,
        'inss', x.inss,
        'descontos', x.descontos,
        'observacoes', x.observacoes,
        'detalhamento', x.detalhamento
      ) order by x.lancamento_id)
      from (
        select
          lf.id as lancamento_id,
          lf.colaborador_id,
          lf.unidade,
          lf.categoria,
          lf.conta_pagadora_id,
          lf.salario,
          lf.bonus,
          lf.comissao,
          lf.passagem,
          lf.reembolso,
          lf.inss,
          lf.descontos,
          lf.observacoes,
          lf.detalhamento
        from public.lancamentos_folha lf
        where lf.folha_id = p_folha_origem_id
          and lf.unidade = any(v_unidades)
      ) x
    ), '[]'::jsonb),
    'destino_linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lancamento_id', lf.id,
        'unidade', lf.unidade,
        'colaborador_id', lf.colaborador_id
      ) order by lf.id)
      from public.lancamentos_folha lf
      where lf.folha_id = p_folha_destino_id
        and lf.unidade = any(v_unidades)
    ), '[]'::jsonb),
    'ambiguos', v_ambiguos,
    'conflitos', v_conflitos,
    'insercoes', v_insercoes
  )::text, 'sha256'), 'hex')
    into v_source_hash;

  return jsonb_build_object(
    'success', true,
    'origem_folha_id', p_folha_origem_id,
    'destino_folha_id', p_folha_destino_id,
    'unidades', to_jsonb(v_unidades),
    'source_hash', v_source_hash,
    'pode_duplicar', v_pode_duplicar,
    'ambiguos', v_ambiguos,
    'conflitos', v_conflitos,
    'insercoes', v_insercoes,
    'snapshot_dre', jsonb_build_object(
      'hash_origem', v_snapshot_hash,
      'hash_atual', v_hash_origem_atual,
      'hash_legacy', v_hash_origem_legacy,
      'valido', v_snapshot_valido,
      'linhas', v_snapshot_linhas,
      'liquidacao', v_snapshot_liquidacao,
      'bistro_aplicavel', v_bistro_aplicavel
    )
  );
end;
$$;

revoke all on function public.folha_duplicar_lancamentos_preflight(
  integer, integer, text[]
) from public, anon;
grant execute on function public.folha_duplicar_lancamentos_preflight(
  integer, integer, text[]
) to authenticated, service_role;
