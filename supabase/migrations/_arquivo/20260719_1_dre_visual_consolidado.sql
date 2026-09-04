-- Fatia 2A: DRE consolidado, read-only, com regimes de competencia e caixa.
-- A camada normalizada preserva o valor da origem para reconciliacao e calcula
-- separadamente o efeito assinado no resultado contabil.

create or replace function public.dre_linhas_normalizadas(
  p_competencia date,
  p_regime text
)
returns table (
  fonte text,
  origem_id text,
  origem_sequencia text,
  competencia_origem date,
  data_caixa date,
  data_referencia date,
  conta_pagadora_id uuid,
  conta_pagadora_label text,
  descricao text,
  contraparte text,
  plano_codigo text,
  plano_nome text,
  natureza text,
  grupo_codigo text,
  valor_origem numeric,
  valor_resultado numeric,
  escopo_dre text,
  status_financeiro text,
  status_classificacao text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with parametros as (
    select
      date_trunc('month', p_competencia)::date as inicio,
      (date_trunc('month', p_competencia) + interval '1 month')::date as fim
  ),
  folha_raw as (
    select
      'folha'::text as fonte,
      d.lancamento_folha_id::text as origem_id,
      lpad(d.sequencia::text, 6, '0') || ':' || d.componente as origem_sequencia,
      d.competencia as competencia_origem,
      cp_folha.data_pagamento::date as data_caixa,
      case when p_regime = 'caixa' then cp_folha.data_pagamento::date else d.competencia end as data_referencia,
      d.conta_pagadora_id_usada as conta_pagadora_id,
      coalesce(
        nullif(trim(fe.label_operacional), ''),
        nullif(trim(fe.nome_fantasia), ''),
        nullif(trim(fe.razao_social), '')
      ) || case
        when fcb.conta is not null then ' · conta ' || fcb.conta
        else ''
      end as conta_pagadora_label,
      'Folha · ' || d.componente || ' · ' || d.categoria_usada as descricao,
      coalesce(nullif(trim(c.nome_completo), ''), nullif(trim(c.nome), ''), 'Colaborador #' || d.colaborador_id::text) as contraparte,
      d.plano_codigo_usado as plano_codigo,
      d.plano_nome_usado as plano_nome,
      case
        when d.plano_codigo_usado = '3' or d.plano_codigo_usado like '3.%' then 'entrada'
        when d.plano_codigo_usado = '7.1' or d.plano_codigo_usado like '7.1.%' then 'entrada'
        when split_part(coalesce(d.plano_codigo_usado, ''), '.', 1) in ('4', '5', '6', '7') then 'saida'
        else null
      end as natureza,
      split_part(coalesce(d.plano_codigo_usado, ''), '.', 1) as grupo_codigo,
      d.valor_assinado as valor_origem,
      d.escopo_dre,
      coalesce(cp_folha.status, fm.status) as status_financeiro,
      case
        when d.tratamento = 'pendente' then 'em_revisao'
        when d.plano_conta_id is null or d.plano_codigo_usado is null then 'sem_plano'
        when d.escopo_dre = 'nenhum' or d.tratamento in ('excluido', 'liquidacao') then 'excluido'
        when split_part(d.plano_codigo_usado, '.', 1) not in ('3', '4', '5', '6', '7') then 'em_revisao'
        else 'classificado_dre'
      end as status_classificacao
    from public.folha_classificacao_dre d
    join public.folhas_mensais fm on fm.id = d.folha_id
    left join public.colaboradores c on c.id = d.colaborador_id
    left join public.financeiro_contas_bancarias fcb on fcb.id = d.conta_pagadora_id_usada
    left join public.financeiro_empresas fe on fe.id = fcb.empresa_id
    left join lateral (
      select cp_folha.*
      from public.contas_pagar cp_folha
      where cp_folha.fonte_tipo = 'folha_pagamento'
        and cp_folha.fonte_identificador = d.folha_id::text
        and cp_folha.conta_pagadora_id = d.conta_pagadora_id_usada
        and cp_folha.status <> 'cancelado'
      order by
        case when cp_folha.status = 'pago' then 0 else 1 end,
        cp_folha.updated_at desc nulls last,
        cp_folha.id
      limit 1
    ) cp_folha on true
    cross join parametros p
    where (
      p_regime = 'competencia'
      and d.competencia >= p.inicio
      and d.competencia < p.fim
    ) or (
      p_regime = 'caixa'
      and cp_folha.status = 'pago'
      and cp_folha.data_pagamento::date >= p.inicio
      and cp_folha.data_pagamento::date < p.fim
    )
  ),
  contas_pagar_raw as (
    select
      'contas_pagar'::text as fonte,
      cp.id::text as origem_id,
      '000001'::text as origem_sequencia,
      cp.competencia as competencia_origem,
      cp.data_pagamento::date as data_caixa,
      case when p_regime = 'caixa' then cp.data_pagamento::date else cp.competencia end as data_referencia,
      cp.conta_pagadora_id,
      coalesce(
        nullif(trim(fe.label_operacional), ''),
        nullif(trim(fe.nome_fantasia), ''),
        nullif(trim(fe.razao_social), '')
      ) || case
        when fcb.conta is not null then ' · conta ' || fcb.conta
        else ''
      end as conta_pagadora_label,
      cp.descricao,
      coalesce(nullif(trim(cp.fonte_identificador), ''), cp.descricao) as contraparte,
      pc.codigo as plano_codigo,
      coalesce(pc.nome_completo, pc.nome) as plano_nome,
      case
        when pc.codigo = '3' or pc.codigo like '3.%' then 'entrada'
        when pc.codigo = '7.1' or pc.codigo like '7.1.%' then 'entrada'
        when split_part(coalesce(pc.codigo, ''), '.', 1) in ('4', '5', '6', '7') then 'saida'
        else null
      end as natureza,
      split_part(coalesce(pc.codigo, ''), '.', 1) as grupo_codigo,
      cp.valor as valor_origem,
      case when pc.codigo = '7' or pc.codigo like '7.%' then 'fora_operacional' else 'operacional' end as escopo_dre,
      cp.status as status_financeiro,
      case
        when cp.status = 'cancelado' then 'cancelado'
        when cp.fonte_tipo in ('folha_pagamento', 'cartao') then 'excluido'::text
        when cp.plano_conta_id is null then 'sem_plano'
        when split_part(coalesce(pc.codigo, ''), '.', 1) not in ('3', '4', '5', '6', '7') then 'em_revisao'
        else 'classificado_dre'
      end as status_classificacao
    from public.contas_pagar cp
    left join public.plano_contas pc on pc.id = cp.plano_conta_id
    left join public.financeiro_contas_bancarias fcb on fcb.id = cp.conta_pagadora_id
    left join public.financeiro_empresas fe on fe.id = fcb.empresa_id
    cross join parametros p
    where (
      p_regime = 'competencia'
      and cp.competencia >= p.inicio
      and cp.competencia < p.fim
    ) or (
      p_regime = 'caixa'
      and cp.status = 'pago'
      and cp.data_pagamento::date >= p.inicio
      and cp.data_pagamento::date < p.fim
    )
  ),
  cartao_raw as (
    select
      'cartao'::text as fonte,
      t.id::text as origem_id,
      '000001'::text as origem_sequencia,
      f.competencia as competencia_origem,
      cp_cartao.data_pagamento::date as data_caixa,
      case when p_regime = 'caixa' then cp_cartao.data_pagamento::date else f.competencia end as data_referencia,
      ca.conta_pagadora_id,
      coalesce(
        nullif(trim(fe.label_operacional), ''),
        nullif(trim(fe.nome_fantasia), ''),
        nullif(trim(fe.razao_social), '')
      ) || case
        when fcb.conta is not null then ' · conta ' || fcb.conta
        else ''
      end as conta_pagadora_label,
      t.descricao,
      coalesce(nullif(trim(t.estabelecimento), ''), ca.apelido) as contraparte,
      pc.codigo as plano_codigo,
      coalesce(pc.nome_completo, pc.nome) as plano_nome,
      case
        when pc.codigo = '3' or pc.codigo like '3.%' then 'entrada'
        when pc.codigo = '7.1' or pc.codigo like '7.1.%' then 'entrada'
        when split_part(coalesce(pc.codigo, ''), '.', 1) in ('4', '5', '6', '7') then 'saida'
        else null
      end as natureza,
      split_part(coalesce(pc.codigo, ''), '.', 1) as grupo_codigo,
      t.valor as valor_origem,
      case when pc.codigo = '7' or pc.codigo like '7.%' then 'fora_operacional' else 'operacional' end as escopo_dre,
      f.status as status_financeiro,
      case
        when f.status = 'cancelada' then 'cancelado'
        when t.plano_conta_id is null then 'sem_plano'
        when t.classificacao_status is distinct from 'confirmada' then 'em_revisao'
        when split_part(coalesce(pc.codigo, ''), '.', 1) not in ('3', '4', '5', '6', '7') then 'em_revisao'
        else 'classificado_dre'
      end as status_classificacao
    from public.financeiro_cartao_transacoes t
    join public.financeiro_cartao_faturas f on f.id = t.fatura_id
    join public.financeiro_cartoes ca on ca.id = t.cartao_id
    left join public.contas_pagar cp_cartao on f.conta_pagar_id = cp_cartao.id
    left join public.plano_contas pc on pc.id = t.plano_conta_id
    left join public.financeiro_contas_bancarias fcb on fcb.id = ca.conta_pagadora_id
    left join public.financeiro_empresas fe on fe.id = fcb.empresa_id
    cross join parametros p
    where (
      p_regime = 'competencia'
      and f.competencia >= p.inicio
      and f.competencia < p.fim
    ) or (
      p_regime = 'caixa'
      and cp_cartao.status = 'pago'
      and cp_cartao.data_pagamento::date >= p.inicio
      and cp_cartao.data_pagamento::date < p.fim
    )
  ),
  contas_receber_raw as (
    select
      'contas_receber'::text as fonte,
      cr.id::text as origem_id,
      '000001'::text as origem_sequencia,
      cr.competencia as competencia_origem,
      cr.data_recebimento as data_caixa,
      case when p_regime = 'caixa' then cr.data_recebimento else cr.competencia end as data_referencia,
      null::uuid as conta_pagadora_id,
      null::text as conta_pagadora_label,
      cr.descricao,
      coalesce(nullif(trim(cr.aluno_nome), ''), 'Fatura Emusys #' || cr.emusys_fatura_id::text) as contraparte,
      pc.codigo as plano_codigo,
      coalesce(pc.nome_completo, pc.nome) as plano_nome,
      case
        when pc.codigo = '3' or pc.codigo like '3.%' then 'entrada'
        when pc.codigo = '7.1' or pc.codigo like '7.1.%' then 'entrada'
        when split_part(coalesce(pc.codigo, ''), '.', 1) in ('4', '5', '6', '7') then 'saida'
        else null
      end as natureza,
      split_part(coalesce(pc.codigo, ''), '.', 1) as grupo_codigo,
      case
        when p_regime = 'caixa' then coalesce(cr.valor_pago, 0)
        else cr.valor_liquido
      end as valor_origem,
      case when pc.codigo = '7' or pc.codigo like '7.%' then 'fora_operacional' else 'operacional' end as escopo_dre,
      cr.status as status_financeiro,
      case
        when cr.status = 'cancelado' then 'cancelado'
        when cr.excluido_da_receita or cr.classificacao_status = 'excluida' then 'excluido'
        when cr.status = 'revisar' /* source_missing */ then 'em_revisao'
        when cr.classificacao_status is distinct from 'confirmada'
          or cr.cadastro_match_status is distinct from 'unico' then 'em_revisao'
        when cr.plano_conta_id is null then 'sem_plano'
        when split_part(coalesce(pc.codigo, ''), '.', 1) not in ('3', '4', '5', '6', '7') then 'em_revisao'
        else 'classificado_dre'
      end as status_classificacao
    from public.contas_receber cr
    left join public.plano_contas pc on pc.id = cr.plano_conta_id
    cross join parametros p
    where (
      p_regime = 'competencia'
      and cr.competencia >= p.inicio
      and cr.competencia < p.fim
    ) or (
      p_regime = 'caixa'
      and cr.status = 'recebido'
      and cr.data_recebimento >= p.inicio
      and cr.data_recebimento < p.fim
    )
  ),
  raw as (
    select * from folha_raw
    union all
    select * from contas_pagar_raw
    union all
    select * from cartao_raw
    union all
    select * from contas_receber_raw
  )
  select
    raw.fonte,
    raw.origem_id,
    raw.origem_sequencia,
    raw.competencia_origem,
    raw.data_caixa,
    raw.data_referencia,
    raw.conta_pagadora_id,
    raw.conta_pagadora_label,
    raw.descricao,
    raw.contraparte,
    raw.plano_codigo,
    raw.plano_nome,
    raw.natureza,
    raw.grupo_codigo,
    raw.valor_origem,
    case
      when raw.status_classificacao <> 'classificado_dre' then 0::numeric
      when raw.natureza = 'entrada' then raw.valor_origem
      else -raw.valor_origem
    end as valor_resultado,
    raw.escopo_dre,
    raw.status_financeiro,
    raw.status_classificacao
  from raw;
$$;

create or replace function public.dre_consultar(
  p_competencia date,
  p_regime text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_competencia is null then
    raise exception 'competencia obrigatoria.';
  end if;

  if p_regime not in ('competencia', 'caixa') then
    raise exception 'regime deve ser competencia ou caixa.';
  end if;

  with linhas as materialized (
    select *
    from public.dre_linhas_normalizadas(date_trunc('month', p_competencia)::date, p_regime)
  ),
  fontes(fonte, label) as (
    values
      ('contas_receber'::text, 'Contas a Receber'::text),
      ('contas_pagar'::text, 'Contas a Pagar'::text),
      ('cartao'::text, 'Cartões'::text),
      ('folha'::text, 'Folha de Pagamento'::text)
  ),
  grupos_catalogo(codigo, nome, ordem) as (
    values
      ('3'::text, 'Receitas'::text, 1),
      ('4'::text, 'Despesas variáveis'::text, 2),
      ('5'::text, 'Despesas fixas'::text, 3),
      ('6'::text, 'Investimentos'::text, 4),
      ('7'::text, 'Não operacional'::text, 5)
  ),
  kpis as (
    select
      coalesce(sum(valor_resultado) filter (where grupo_codigo = '3'), 0) as receita,
      -coalesce(sum(valor_resultado) filter (where grupo_codigo in ('4', '5')), 0) as despesa,
      coalesce(sum(valor_resultado) filter (where grupo_codigo in ('3', '4', '5')), 0) as lucro_operacional,
      -coalesce(sum(valor_resultado) filter (where grupo_codigo = '6'), 0) as investimentos,
      coalesce(sum(valor_resultado) filter (where grupo_codigo = '7' and natureza = 'entrada'), 0) as entradas_nao_operacionais,
      -coalesce(sum(valor_resultado) filter (where grupo_codigo = '7' and natureza = 'saida'), 0) as saidas_nao_operacionais,
      coalesce(sum(valor_resultado), 0) as lucro_liquido
    from linhas
  ),
  grupos as (
    select
      gc.codigo,
      gc.nome,
      gc.ordem,
      coalesce(sum(l.valor_resultado), 0) as valor_resultado,
      count(l.origem_id) filter (where l.status_classificacao = 'classificado_dre') as linhas_classificadas
    from grupos_catalogo gc
    left join linhas l
      on l.grupo_codigo = gc.codigo
     and l.status_classificacao = 'classificado_dre'
    group by gc.codigo, gc.nome, gc.ordem
  ),
  planos as (
    select
      l.grupo_codigo,
      l.plano_codigo,
      max(l.plano_nome) as plano_nome,
      max(l.natureza) as natureza,
      sum(l.valor_fonte) as valor_resultado,
      jsonb_object_agg(l.fonte, l.valor_fonte order by l.fonte) as por_fonte
    from (
      select
        grupo_codigo,
        plano_codigo,
        plano_nome,
        natureza,
        fonte,
        sum(valor_resultado) as valor_fonte
      from linhas
      where status_classificacao = 'classificado_dre'
        and plano_codigo is not null
      group by grupo_codigo, plano_codigo, plano_nome, natureza, fonte
    ) l
    group by l.grupo_codigo, l.plano_codigo
  ),
  cobertura as (
    select
      f.fonte,
      f.label,
      case when count(l.origem_id) = 0 then 'sem_dados' else 'ok' end as estado,
      count(l.origem_id) as linhas,
      count(l.origem_id) filter (where l.status_classificacao = 'classificado_dre') as classificadas,
      coalesce(sum(l.valor_origem), 0) as total_origem
    from fontes f
    left join linhas l on l.fonte = f.fonte
    group by f.fonte, f.label
  ),
  reconciliacao as (
    select
      f.fonte,
      f.label,
      coalesce(sum(l.valor_origem) filter (where l.status_classificacao = 'classificado_dre'), 0) as classificado_dre,
      coalesce(sum(l.valor_origem) filter (where l.status_classificacao = 'em_revisao'), 0) as em_revisao,
      coalesce(sum(l.valor_origem) filter (where l.status_classificacao = 'sem_plano'), 0) as sem_plano,
      coalesce(sum(l.valor_origem) filter (where l.status_classificacao = 'cancelado'), 0) as cancelado,
      coalesce(sum(l.valor_origem) filter (where l.status_classificacao = 'excluido'), 0) as excluido,
      coalesce(sum(l.valor_origem), 0) as total_origem
    from fontes f
    left join linhas l on l.fonte = f.fonte
    group by f.fonte, f.label
  )
  select jsonb_build_object(
    'success', true,
    'competencia', date_trunc('month', p_competencia)::date,
    'regime', p_regime,
    'kpis', jsonb_build_object(
      'receita', k.receita,
      'despesa', k.despesa,
      'lucro_operacional', k.lucro_operacional,
      'investimentos', k.investimentos,
      'entradas_nao_operacionais', k.entradas_nao_operacionais,
      'saidas_nao_operacionais', k.saidas_nao_operacionais,
      'lucro_liquido', k.lucro_liquido
    ),
    'grupos', coalesce((
      select jsonb_agg(to_jsonb(g) - 'ordem' order by g.ordem)
      from grupos g
    ), '[]'::jsonb),
    'planos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.plano_codigo)
      from planos p
    ), '[]'::jsonb),
    'cobertura', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.fonte)
      from cobertura c
    ), '[]'::jsonb),
    'reconciliacao', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.fonte)
      from reconciliacao r
    ), '[]'::jsonb)
  )
  into v_result
  from kpis k;

  return v_result;
end;
$$;

create or replace function public.dre_detalhes(
  p_competencia date,
  p_regime text,
  p_plano_codigo text default null,
  p_fonte text default null,
  p_cursor jsonb default null,
  p_limite integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_result jsonb;
begin
  if p_competencia is null then
    raise exception 'competencia obrigatoria.';
  end if;

  if p_regime not in ('competencia', 'caixa') then
    raise exception 'regime deve ser competencia ou caixa.';
  end if;

  if p_fonte is not null and p_fonte not in ('contas_receber', 'contas_pagar', 'cartao', 'folha') then
    raise exception 'fonte invalida.';
  end if;

  with filtradas as (
    select *
    from public.dre_linhas_normalizadas(date_trunc('month', p_competencia)::date, p_regime) l
    where (
      p_plano_codigo is null
      or l.plano_codigo = p_plano_codigo
      or l.plano_codigo like p_plano_codigo || '.%'
    )
      and (p_fonte is null or l.fonte = p_fonte)
      and (
        p_cursor is null
        or (
          coalesce(l.plano_codigo, '~'),
          l.fonte,
          l.origem_id,
          l.origem_sequencia
        ) > (
          coalesce(p_cursor->>'plano_codigo', '~'),
          coalesce(p_cursor->>'fonte', ''),
          coalesce(p_cursor->>'origem_id', ''),
          coalesce(p_cursor->>'origem_sequencia', '')
        )
      )
  ),
  ordenadas as (
    select *
    from filtradas
    order by plano_codigo nulls last, fonte, origem_id, origem_sequencia
    limit v_limite + 1
  ),
  pagina as (
    select *, row_number() over (
      order by plano_codigo nulls last, fonte, origem_id, origem_sequencia
    ) as numero_linha
    from ordenadas
  ),
  ultimo as (
    select *
    from pagina
    where numero_linha <= v_limite
    order by plano_codigo desc nulls first, fonte desc, origem_id desc, origem_sequencia desc
    limit 1
  )
  select jsonb_build_object(
    'success', true,
    'itens', coalesce((
      select jsonb_agg(
        to_jsonb(p) - 'numero_linha'
        order by p.plano_codigo nulls last, p.fonte, p.origem_id, p.origem_sequencia
      )
      from pagina p
      where p.numero_linha <= v_limite
    ), '[]'::jsonb),
    'next_cursor', case
      when (select count(*) from pagina) <= v_limite then null
      else (
        select jsonb_build_object(
          'plano_codigo', u.plano_codigo,
          'fonte', u.fonte,
          'origem_id', u.origem_id,
          'origem_sequencia', u.origem_sequencia
        )
        from ultimo u
      )
    end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.dre_linhas_normalizadas(date, text)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.dre_linhas_normalizadas(date, text)
  to service_role;

revoke all on function public.dre_consultar(date, text) from public, anon;
grant execute on function public.dre_consultar(date, text) to authenticated, service_role;

revoke all on function public.dre_detalhes(date, text, text, text, jsonb, integer) from public, anon;
grant execute on function public.dre_detalhes(date, text, text, text, jsonb, integer) to authenticated, service_role;

comment on function public.dre_consultar(date, text) is
  'DRE consolidado read-only por competencia ou caixa, com cobertura e reconciliacao por fonte.';
comment on function public.dre_detalhes(date, text, text, text, jsonb, integer) is
  'Drill-down read-only do DRE com cursor deterministico.';
