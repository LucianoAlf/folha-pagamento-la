-- Hotfix da Fatia 2B-A: canonicaliza percentuais antes de validar e hashear.
-- Migration aditiva: nao altera migrations ja aplicadas nem grava dados.

create or replace function public.folha_alocacao_dre_allocation_hash(p_fatias jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
begin
  if p_fatias is null or jsonb_typeof(p_fatias) <> 'array' then
    raise exception 'p_fatias deve ser um array.';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'categoria', nullif(trim(x.categoria), ''),
              'componente', nullif(trim(x.componente), ''),
              'unidade', lower(trim(x.unidade)),
              'percentual', x.percentual
            )
            order by
              coalesce(nullif(trim(x.categoria), ''), ''),
              coalesce(nullif(trim(x.componente), ''), ''),
              lower(trim(x.unidade))
          ),
          '[]'::jsonb
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
    into v_hash
    from jsonb_to_recordset(p_fatias) as x(
      categoria text,
      componente text,
      unidade text,
      percentual numeric(9,6)
    );

  return v_hash;
end;
$$;
create or replace function public.folha_alocacao_dre_gravar(
  p_folha_id integer,
  p_colaborador_id integer,
  p_fatias jsonb,
  p_source_hash text,
  p_origem text,
  p_confirmado_por text,
  p_backfill_motivo text,
  p_actor jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active public.folha_alocacao_dre_confirmacoes%rowtype;
  v_confirmacao_id uuid;
  v_versao integer;
  v_allocation_hash text;
  v_fatias_normalizadas jsonb;
  v_audit_id uuid;
  v_numero_hash text;
  v_last4 text;
begin
  if p_fatias is null
     or jsonb_typeof(p_fatias) <> 'array'
     or jsonb_array_length(p_fatias) = 0 then
    raise exception 'p_fatias deve ser um array nao vazio.';
  end if;

  drop table if exists pg_temp.folha_alocacao_dre_input;
  create temporary table pg_temp.folha_alocacao_dre_input (
    categoria text,
    componente text,
    unidade text not null,
    percentual numeric(9,6) not null
  ) on commit drop;

  insert into pg_temp.folha_alocacao_dre_input (categoria, componente, unidade, percentual)
  select
    nullif(trim(x.categoria), ''),
    nullif(trim(x.componente), ''),
    lower(trim(x.unidade)),
    x.percentual
  from jsonb_to_recordset(p_fatias) as x(
    categoria text,
    componente text,
    unidade text,
    percentual numeric
  );

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where unidade not in ('cg', 'rec', 'bar')
        or percentual <= 0
        or percentual > 100
        or ((categoria is null) <> (componente is null))
        or (
          componente is not null
          and componente not in ('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos')
        )
  ) then
    raise exception 'fatias contem unidade, percentual ou escopo invalido.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     group by categoria, componente, unidade
    having count(*) > 1
  ) then
    raise exception 'unidade repetida dentro da mesma distribuicao.';
  end if;

  if not exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where categoria is null and componente is null
  ) then
    raise exception 'uma distribuicao-base completa e obrigatoria.';
  end if;

  if (
    select coalesce(sum(percentual), 0)
      from pg_temp.folha_alocacao_dre_input
     where categoria is null and componente is null
  ) <> 100 then
    raise exception 'percentuais da distribuicao-base devem somar 100.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where categoria is not null and componente is not null
     group by categoria, componente
    having sum(percentual) <> 100
  ) then
    raise exception 'percentuais de cada override devem somar 100.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input i
     where i.categoria is not null
       and not exists (
         select 1
           from public.folha_classificacao_dre d
          where d.folha_id = p_folha_id
            and d.colaborador_id = p_colaborador_id
            and d.categoria_usada = i.categoria
            and d.componente = i.componente
       )
  ) then
    raise exception 'override nao corresponde a categoria e componente do snapshot DRE.';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'categoria', categoria,
             'componente', componente,
             'unidade', unidade,
             'percentual', percentual
           )
           order by coalesce(categoria, ''), coalesce(componente, ''), unidade
         )
    into v_fatias_normalizadas
    from pg_temp.folha_alocacao_dre_input;

  v_allocation_hash := public.folha_alocacao_dre_allocation_hash(v_fatias_normalizadas);

  select *
    into v_active
    from public.folha_alocacao_dre_confirmacoes
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id
     and ativa = true
   for update;

  if found
     and v_active.source_hash = p_source_hash
     and v_active.allocation_hash = v_allocation_hash then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'confirmacao_id', v_active.id,
      'versao', v_active.versao,
      'source_hash', v_active.source_hash,
      'allocation_hash', v_active.allocation_hash
    );
  end if;

  select coalesce(max(versao), 0) + 1
    into v_versao
    from public.folha_alocacao_dre_confirmacoes
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id;

  if v_active.id is not null then
    perform set_config('app.folha_alocacao_dre_rpc', 'on', true);
    update public.folha_alocacao_dre_confirmacoes
       set ativa = false
     where id = v_active.id;
  end if;

  insert into public.folha_alocacao_dre_confirmacoes (
    folha_id,
    colaborador_id,
    versao,
    source_hash,
    allocation_hash,
    origem,
    confirmado_por,
    backfill_motivo,
    ativa
  )
  values (
    p_folha_id,
    p_colaborador_id,
    v_versao,
    p_source_hash,
    v_allocation_hash,
    p_origem,
    p_confirmado_por,
    nullif(trim(p_backfill_motivo), ''),
    true
  )
  returning id into v_confirmacao_id;

  insert into public.folha_alocacao_dre_fatias (
    confirmacao_id, categoria, componente, unidade, percentual
  )
  select v_confirmacao_id, categoria, componente, unidade, percentual
    from pg_temp.folha_alocacao_dre_input
   order by coalesce(categoria, ''), coalesce(componente, ''), unidade;

  v_numero_hash := encode(
    extensions.digest(coalesce(p_actor->>'ref', p_actor->>'tipo', 'sistema'), 'sha256'),
    'hex'
  );
  v_last4 := right(regexp_replace(coalesce(p_actor->>'ref', ''), '\D', '', 'g'), 4);
  if v_last4 = '' then
    v_last4 := 'n/a';
  end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  )
  values (
    case when p_actor->>'tipo' = 'web' then 'Super Folha Web' else 'Sistema' end,
    p_actor->>'ref',
    v_numero_hash,
    v_last4,
    p_actor->>'tipo',
    'folha',
    p_actor->>'tipo',
    p_actor->>'role',
    'folha_alocacao_dre_confirmacoes',
    'folha_alocacao_dre',
    v_confirmacao_id,
    'ALOCACAO_DRE',
    case when v_active.id is null then null else to_jsonb(v_active) end,
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'confirmacao_id', v_confirmacao_id,
      'versao', v_versao,
      'source_hash', p_source_hash,
      'allocation_hash', v_allocation_hash,
      'origem', p_origem,
      'fatias', v_fatias_normalizadas
    ),
    nullif(trim(p_backfill_motivo), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'confirmacao_id', v_confirmacao_id,
    'versao', v_versao,
    'source_hash', p_source_hash,
    'allocation_hash', v_allocation_hash,
    'audit_id', v_audit_id
  );
end;
$$;

create or replace function public.folha_alocacao_dre_resolver(
  p_folha_id integer,
  p_colaborador_id integer default null
)
returns table (
  folha_id integer,
  lancamento_folha_id integer,
  sequencia integer,
  colaborador_id integer,
  competencia date,
  categoria_usada text,
  tipo_usado text,
  funcao_usada text,
  componente text,
  tipo_efeito text,
  valor_original numeric,
  valor_assinado_original numeric,
  valor_assinado_rateado numeric,
  plano_conta_id uuid,
  plano_codigo_usado text,
  plano_nome_usado text,
  tratamento text,
  escopo_dre text,
  regra_id uuid,
  ruleset_version integer,
  motivo text,
  bistro_competencia_id uuid,
  bistro_ref_ym text,
  hash_origem text,
  unidade_dre text,
  percentual_aplicado numeric,
  confirmacao_id uuid,
  source_hash text,
  allocation_hash text,
  estado_alocacao text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    with hashes as (
      select
        d.colaborador_id,
        public.folha_alocacao_dre_source_hash(p_folha_id, d.colaborador_id) as source_hash
      from public.folha_classificacao_dre d
      where d.folha_id = p_folha_id
        and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
      group by d.colaborador_id
    ),
    confirmacoes as (
      select
        h.colaborador_id,
        h.source_hash,
        c.id,
        c.allocation_hash,
        case
          when c.id is null then 'sem_alocacao'
          when c.source_hash <> h.source_hash then 'desatualizada'
          else 'pronto'
        end as estado
      from hashes h
      left join public.folha_alocacao_dre_confirmacoes c
        on c.folha_id = p_folha_id
       and c.colaborador_id = h.colaborador_id
       and c.ativa = true
    ),
    escolhidas as (
      select
        d.*,
        c.id as confirmacao_id,
        c.source_hash,
        c.allocation_hash,
        c.estado,
        f.unidade,
        f.percentual
      from public.folha_classificacao_dre d
      join confirmacoes c on c.colaborador_id = d.colaborador_id
      left join lateral (
        select f.unidade, f.percentual
          from public.folha_alocacao_dre_fatias f
         where c.estado = 'pronto'
           and f.confirmacao_id = c.id
           and (
             (
               exists (
                 select 1
                   from public.folha_alocacao_dre_fatias override_f
                  where override_f.confirmacao_id = c.id
                    and override_f.categoria = d.categoria_usada
                    and override_f.componente = d.componente
               )
               and d.categoria_usada = f.categoria
               and d.componente = f.componente
             )
             or (
               not exists (
                 select 1
                   from public.folha_alocacao_dre_fatias override_f
                  where override_f.confirmacao_id = c.id
                    and override_f.categoria = d.categoria_usada
                    and override_f.componente = d.componente
               )
               and f.categoria is null
               and f.componente is null
             )
           )
      ) f on true
      where d.folha_id = p_folha_id
        and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
    ),
    calculo as (
      select
        e.*,
        round(abs(e.valor_assinado) * 100)::bigint as valor_centavos,
        floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)::bigint as centavos_base,
        (
          round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100
          - floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)
        ) as resto
      from escolhidas e
      where e.estado = 'pronto'
        and e.unidade is not null
    ),
    ranqueado as (
      select
        c.*,
        c.valor_centavos - sum(c.centavos_base) over (
          partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
        ) as centavos_faltantes,
        row_number() over (
          partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
          order by c.resto desc, c.unidade asc
        ) as ordem_resto
      from calculo c
    )
    select 1
      from ranqueado r
     where r.centavos_faltantes < 0
  ) then
    raise exception 'rateio DRE gerou centavos_faltantes negativo; distribuicao invalida.';
  end if;

  return query
  with hashes as (
    select
      d.colaborador_id,
      public.folha_alocacao_dre_source_hash(p_folha_id, d.colaborador_id) as source_hash
    from public.folha_classificacao_dre d
    where d.folha_id = p_folha_id
      and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
    group by d.colaborador_id
  ),
  confirmacoes as (
    select
      h.colaborador_id,
      h.source_hash,
      c.id,
      c.allocation_hash,
      case
        when c.id is null then 'sem_alocacao'
        when c.source_hash <> h.source_hash then 'desatualizada'
        else 'pronto'
      end as estado
    from hashes h
    left join public.folha_alocacao_dre_confirmacoes c
      on c.folha_id = p_folha_id
     and c.colaborador_id = h.colaborador_id
     and c.ativa = true
  ),
  escolhidas as (
    select
      d.*,
      c.id as confirmacao_id,
      c.source_hash,
      c.allocation_hash,
      c.estado,
      f.unidade,
      f.percentual
    from public.folha_classificacao_dre d
    join confirmacoes c on c.colaborador_id = d.colaborador_id
    left join lateral (
      select f.unidade, f.percentual
        from public.folha_alocacao_dre_fatias f
       where c.estado = 'pronto'
         and f.confirmacao_id = c.id
         and (
           (
             exists (
               select 1
                 from public.folha_alocacao_dre_fatias override_f
                where override_f.confirmacao_id = c.id
                  and override_f.categoria = d.categoria_usada
                  and override_f.componente = d.componente
             )
             and d.categoria_usada = f.categoria
             and d.componente = f.componente
           )
           or (
             not exists (
               select 1
                 from public.folha_alocacao_dre_fatias override_f
                where override_f.confirmacao_id = c.id
                  and override_f.categoria = d.categoria_usada
                  and override_f.componente = d.componente
             )
             and f.categoria is null
             and f.componente is null
           )
         )
    ) f on true
    where d.folha_id = p_folha_id
      and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
  ),
  calculo as (
    select
      e.*,
      round(abs(e.valor_assinado) * 100)::bigint as valor_centavos,
      floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)::bigint as centavos_base,
      (
        round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100
        - floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)
      ) as resto
    from escolhidas e
    where e.estado = 'pronto'
      and e.unidade is not null
  ),
  ranqueado as (
    select
      c.*,
      c.valor_centavos - sum(c.centavos_base) over (
        partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
      ) as centavos_faltantes,
      row_number() over (
        partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
        order by c.resto desc, c.unidade asc
      ) as ordem_resto
    from calculo c
  ),
  resolvidas as (
    select
      r.folha_id,
      r.lancamento_folha_id,
      r.sequencia,
      r.colaborador_id,
      r.competencia,
      r.categoria_usada,
      r.tipo_usado,
      r.funcao_usada,
      r.componente,
      r.tipo_efeito,
      r.valor_original,
      r.valor_assinado as valor_assinado_original,
      (
        case when r.valor_assinado < 0 then -1 else 1 end
        * (
          r.centavos_base
          + case when r.ordem_resto <= r.centavos_faltantes then 1 else 0 end
        )::numeric / 100
      ) as valor_assinado_rateado,
      r.plano_conta_id,
      r.plano_codigo_usado,
      r.plano_nome_usado,
      r.tratamento,
      r.escopo_dre,
      r.regra_id,
      r.ruleset_version,
      r.motivo,
      r.bistro_competencia_id,
      r.bistro_ref_ym,
      r.hash_origem,
      r.unidade as unidade_dre,
      r.percentual as percentual_aplicado,
      r.confirmacao_id,
      r.source_hash,
      r.allocation_hash,
      'pronto'::text as estado_alocacao
    from ranqueado r
  ),
  sem_alocacao as (
    select
      e.folha_id,
      e.lancamento_folha_id,
      e.sequencia,
      e.colaborador_id,
      e.competencia,
      e.categoria_usada,
      e.tipo_usado,
      e.funcao_usada,
      e.componente,
      e.tipo_efeito,
      e.valor_original,
      e.valor_assinado as valor_assinado_original,
      e.valor_assinado as valor_assinado_rateado,
      e.plano_conta_id,
      e.plano_codigo_usado,
      e.plano_nome_usado,
      e.tratamento,
      e.escopo_dre,
      e.regra_id,
      e.ruleset_version,
      e.motivo,
      e.bistro_competencia_id,
      e.bistro_ref_ym,
      e.hash_origem,
      null::text as unidade_dre,
      null::numeric as percentual_aplicado,
      e.confirmacao_id,
      e.source_hash,
      e.allocation_hash,
      e.estado as estado_alocacao
    from escolhidas e
    where e.estado <> 'pronto'
  )
  select resultado.*
    from (
      select * from resolvidas
      union all
      select * from sem_alocacao
    ) resultado
   order by
     resultado.colaborador_id,
     resultado.lancamento_folha_id,
     resultado.componente,
     resultado.sequencia,
     resultado.unidade_dre nulls last;
end;
$$;
