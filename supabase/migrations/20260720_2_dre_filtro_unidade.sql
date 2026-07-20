-- Fatia 2B-B: DRE read-only com filtro por unidade operacional.
-- As funcoes externas sao removidas antes da normalizadora, sem CASCADE,
-- para permitir a alteracao segura do contrato retornado.

drop function if exists public.dre_detalhes(date, text, text, text, jsonb, integer);
drop function if exists public.dre_consultar(date, text);
drop function if exists public.dre_linhas_normalizadas(date, text);

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
  status_classificacao text,
  colaborador_id integer,
  unidade_operacional text,
  qualidade_unidade text,
  motivo_sem_unidade text
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
  folhas_alvo as (
    select fm.id as folha_id
    from public.folhas_mensais fm
    cross join parametros p
    where p_regime = 'competencia'
      and fm.ano = extract(year from p.inicio)::integer
      and fm.mes = extract(month from p.inicio)::integer

    union

    select distinct
      cp.fonte_identificador::numeric::integer as folha_id
    from public.contas_pagar cp
    join public.folhas_mensais fm
      on fm.id::numeric = case
        when trim(cp.fonte_identificador) ~ '^[0-9]+$'
          then trim(cp.fonte_identificador)::numeric
        else null
      end
    cross join parametros p
    where p_regime = 'caixa'
      and cp.fonte_tipo = 'folha_pagamento'
      and cp.status = 'pago'
      and cp.data_pagamento::date >= p.inicio
      and cp.data_pagamento::date < p.fim
  ),
  folha_raw as (
    select
      'folha'::text as fonte,
      r.lancamento_folha_id::text as origem_id,
      lpad(r.sequencia::text, 6, '0') || ':' || r.componente as origem_sequencia,
      r.competencia as competencia_origem,
      cp_folha.data_pagamento::date as data_caixa,
      case when p_regime = 'caixa' then cp_folha.data_pagamento::date else r.competencia end as data_referencia,
      d.conta_pagadora_id_usada as conta_pagadora_id,
      coalesce(
        nullif(trim(fe.label_operacional), ''),
        nullif(trim(fe.nome_fantasia), ''),
        nullif(trim(fe.razao_social), '')
      ) || case
        when fcb.conta is not null then ' · conta ' || fcb.conta
        else ''
      end as conta_pagadora_label,
      'Folha · ' || r.componente || ' · ' || r.categoria_usada as descricao,
      coalesce(
        nullif(trim(c.nome_completo), ''),
        nullif(trim(c.nome), ''),
        'Colaborador #' || r.colaborador_id::text
      ) as contraparte,
      r.plano_codigo_usado as plano_codigo,
      r.plano_nome_usado as plano_nome,
      case
        when r.plano_codigo_usado = '3' or r.plano_codigo_usado like '3.%' then 'entrada'
        when r.plano_codigo_usado = '7.1' or r.plano_codigo_usado like '7.1.%' then 'entrada'
        when split_part(coalesce(r.plano_codigo_usado, ''), '.', 1) in ('4', '5', '6', '7') then 'saida'
        else null
      end as natureza,
      split_part(coalesce(r.plano_codigo_usado, ''), '.', 1) as grupo_codigo,
      r.valor_assinado_rateado as valor_origem,
      r.escopo_dre,
      coalesce(cp_folha.status, fm.status) as status_financeiro,
      case
        when r.tratamento = 'pendente' then 'em_revisao'
        when r.plano_conta_id is null or r.plano_codigo_usado is null then 'sem_plano'
        when r.escopo_dre = 'nenhum' or r.tratamento in ('excluido', 'liquidacao') then 'excluido'
        when split_part(r.plano_codigo_usado, '.', 1) not in ('3', '4', '5', '6', '7') then 'em_revisao'
        else 'classificado_dre'
      end as status_classificacao,
      r.colaborador_id,
      case
        when r.estado_alocacao = 'pronto' and r.unidade_dre in ('cg', 'rec', 'bar')
          then r.unidade_dre
        else null
      end as unidade_operacional,
      case
        when r.estado_alocacao = 'pronto' and r.unidade_dre in ('cg', 'rec', 'bar')
          then 'exata'
        else null
      end as qualidade_unidade,
      case
        when r.estado_alocacao = 'sem_alocacao' then 'folha_sem_alocacao'
        when r.estado_alocacao = 'desatualizada' then 'folha_desatualizada'
        when r.estado_alocacao = 'pronto'
          and (r.unidade_dre is null or r.unidade_dre not in ('cg', 'rec', 'bar'))
          then 'fonte_sem_unidade'
        when r.estado_alocacao = 'pronto' then null
        else 'fonte_sem_unidade'
      end as motivo_sem_unidade
    from folhas_alvo fa
    join lateral public.folha_alocacao_dre_resolver(fa.folha_id, null) r on true
    join public.folha_classificacao_dre d
      on d.folha_id = r.folha_id
     and d.lancamento_folha_id = r.lancamento_folha_id
     and d.componente = r.componente
     and d.sequencia = r.sequencia
    join public.folhas_mensais fm on fm.id = r.folha_id
    left join public.colaboradores c on c.id = r.colaborador_id
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
      and r.competencia >= p.inicio
      and r.competencia < p.fim
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
      end as status_classificacao,
      null::integer as colaborador_id,
      case
        when lower(coalesce(nullif(trim(cc_cp.codigo), ''), nullif(trim(cp.unidade), ''))) in ('cg', 'rec', 'bar')
          then lower(coalesce(nullif(trim(cc_cp.codigo), ''), nullif(trim(cp.unidade), '')))
        else null
      end as unidade_operacional,
      case
        when lower(coalesce(nullif(trim(cc_cp.codigo), ''), nullif(trim(cp.unidade), ''))) in ('cg', 'rec', 'bar')
          then 'aproximada_fiscal_pagadora'
        else null
      end as qualidade_unidade,
      case
        when lower(coalesce(nullif(trim(cc_cp.codigo), ''), nullif(trim(cp.unidade), ''))) is null
          or lower(coalesce(nullif(trim(cc_cp.codigo), ''), nullif(trim(cp.unidade), ''))) not in ('cg', 'rec', 'bar')
          then 'fonte_sem_unidade'
        else null
      end as motivo_sem_unidade
    from public.contas_pagar cp
    left join public.plano_contas pc on pc.id = cp.plano_conta_id
    left join public.centros_custo cc_cp on cc_cp.id = cp.centro_custo_id
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
      end as status_classificacao,
      null::integer as colaborador_id,
      case
        when t.classificacao_status = 'confirmada'
          and lower(nullif(trim(cc_cartao.codigo), '')) in ('cg', 'rec', 'bar')
          then lower(nullif(trim(cc_cartao.codigo), ''))
        else null
      end as unidade_operacional,
      case
        when t.classificacao_status = 'confirmada'
          and lower(nullif(trim(cc_cartao.codigo), '')) in ('cg', 'rec', 'bar')
          then 'exata'
        else null
      end as qualidade_unidade,
      case
        when t.classificacao_status is distinct from 'confirmada' then 'cartao_nao_confirmado'
        when t.classificacao_status = 'confirmada'
          and (
            lower(nullif(trim(cc_cartao.codigo), '')) is null
            or lower(nullif(trim(cc_cartao.codigo), '')) not in ('cg', 'rec', 'bar')
          ) then 'fonte_sem_unidade'
        else null
      end as motivo_sem_unidade
    from public.financeiro_cartao_transacoes t
    join public.financeiro_cartao_faturas f on f.id = t.fatura_id
    join public.financeiro_cartoes ca on ca.id = t.cartao_id
    left join public.contas_pagar cp_cartao on f.conta_pagar_id = cp_cartao.id
    left join public.plano_contas pc on pc.id = t.plano_conta_id
    left join public.centros_custo cc_cartao on cc_cartao.id = t.centro_custo_id
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
      end as status_classificacao,
      null::integer as colaborador_id,
      case
        when lower(coalesce(nullif(trim(cc_cr.codigo), ''), nullif(trim(cr.unidade), ''))) in ('cg', 'rec', 'bar')
          then lower(coalesce(nullif(trim(cc_cr.codigo), ''), nullif(trim(cr.unidade), '')))
        else null
      end as unidade_operacional,
      case
        when lower(coalesce(nullif(trim(cc_cr.codigo), ''), nullif(trim(cr.unidade), ''))) in ('cg', 'rec', 'bar')
          then 'exata'
        else null
      end as qualidade_unidade,
      case
        when lower(coalesce(nullif(trim(cc_cr.codigo), ''), nullif(trim(cr.unidade), ''))) is null
          or lower(coalesce(nullif(trim(cc_cr.codigo), ''), nullif(trim(cr.unidade), ''))) not in ('cg', 'rec', 'bar')
          then 'fonte_sem_unidade'
        else null
      end as motivo_sem_unidade
    from public.contas_receber cr
    left join public.plano_contas pc on pc.id = cr.plano_conta_id
    left join public.centros_custo cc_cr on cc_cr.id = cr.centro_custo_id
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
    raw.status_classificacao,
    raw.colaborador_id,
    case
      when raw.unidade_operacional in ('cg', 'rec', 'bar') then raw.unidade_operacional
      else null
    end as unidade_operacional,
    case
      when raw.unidade_operacional in ('cg', 'rec', 'bar') then raw.qualidade_unidade
      else null
    end as qualidade_unidade,
    case
      when raw.unidade_operacional in ('cg', 'rec', 'bar') then null
      else coalesce(raw.motivo_sem_unidade, 'fonte_sem_unidade')
    end as motivo_sem_unidade
  from raw;
$$;

create or replace function public.dre_consultar(
  p_competencia date,
  p_regime text,
  p_unidade text default 'consolidado'
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

  if p_regime is null or p_regime not in ('competencia', 'caixa') then
    raise exception 'regime deve ser competencia ou caixa.';
  end if;

  if p_unidade is null or p_unidade not in ('consolidado', 'cg', 'rec', 'bar') then
    raise exception 'unidade deve ser consolidado, cg, rec ou bar.';
  end if;

  with linhas_base as materialized (
    select *
    from public.dre_linhas_normalizadas(date_trunc('month', p_competencia)::date, p_regime)
  ),
  linhas_filtradas as materialized (
    select *
    from linhas_base
    where p_unidade = 'consolidado'
      or unidade_operacional = p_unidade
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
    from linhas_filtradas
  ),
  grupos as (
    select
      gc.codigo,
      gc.nome,
      gc.ordem,
      coalesce(sum(l.valor_resultado), 0) as valor_resultado,
      count(l.origem_id) filter (where l.status_classificacao = 'classificado_dre') as linhas_classificadas
    from grupos_catalogo gc
    left join linhas_filtradas l
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
      from linhas_filtradas
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
    left join linhas_base l on l.fonte = f.fonte
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
    left join linhas_base l on l.fonte = f.fonte
    group by f.fonte, f.label
  ),
  sem_unidade_operacional as (
    select jsonb_build_object(
      'valor_origem', coalesce(sum(l.valor_origem), 0),
      'valor_resultado', coalesce(sum(l.valor_resultado), 0),
      'linhas', count(*),
      'colaboradores_folha', count(distinct l.colaborador_id) filter (where l.fonte = 'folha'),
      'por_motivo', jsonb_build_object(
        'folha_sem_alocacao', jsonb_build_object(
          'valor_origem', coalesce(sum(l.valor_origem) filter (where l.motivo_sem_unidade = 'folha_sem_alocacao'), 0),
          'valor_resultado', coalesce(sum(l.valor_resultado) filter (where l.motivo_sem_unidade = 'folha_sem_alocacao'), 0),
          'linhas', count(*) filter (where l.motivo_sem_unidade = 'folha_sem_alocacao'),
          'colaboradores_folha', count(distinct l.colaborador_id) filter (where l.fonte = 'folha' and l.motivo_sem_unidade = 'folha_sem_alocacao')
        ),
        'folha_desatualizada', jsonb_build_object(
          'valor_origem', coalesce(sum(l.valor_origem) filter (where l.motivo_sem_unidade = 'folha_desatualizada'), 0),
          'valor_resultado', coalesce(sum(l.valor_resultado) filter (where l.motivo_sem_unidade = 'folha_desatualizada'), 0),
          'linhas', count(*) filter (where l.motivo_sem_unidade = 'folha_desatualizada'),
          'colaboradores_folha', count(distinct l.colaborador_id) filter (where l.fonte = 'folha' and l.motivo_sem_unidade = 'folha_desatualizada')
        ),
        'cartao_nao_confirmado', jsonb_build_object(
          'valor_origem', coalesce(sum(l.valor_origem) filter (where l.motivo_sem_unidade = 'cartao_nao_confirmado'), 0),
          'valor_resultado', coalesce(sum(l.valor_resultado) filter (where l.motivo_sem_unidade = 'cartao_nao_confirmado'), 0),
          'linhas', count(*) filter (where l.motivo_sem_unidade = 'cartao_nao_confirmado'),
          'colaboradores_folha', count(distinct l.colaborador_id) filter (where l.fonte = 'folha' and l.motivo_sem_unidade = 'cartao_nao_confirmado')
        ),
        'fonte_sem_unidade', jsonb_build_object(
          'valor_origem', coalesce(sum(l.valor_origem) filter (where l.motivo_sem_unidade = 'fonte_sem_unidade'), 0),
          'valor_resultado', coalesce(sum(l.valor_resultado) filter (where l.motivo_sem_unidade = 'fonte_sem_unidade'), 0),
          'linhas', count(*) filter (where l.motivo_sem_unidade = 'fonte_sem_unidade'),
          'colaboradores_folha', count(distinct l.colaborador_id) filter (where l.fonte = 'folha' and l.motivo_sem_unidade = 'fonte_sem_unidade')
        )
      )
    ) as resumo
    from linhas_base l
    where l.unidade_operacional is null
  )
  select jsonb_build_object(
    'success', true,
    'competencia', date_trunc('month', p_competencia)::date,
    'regime', p_regime,
    'unidade', p_unidade,
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
    ), '[]'::jsonb),
    'sem_unidade_operacional', (
      select s.resumo
      from sem_unidade_operacional s
    )
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
  p_unidade text default 'consolidado',
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

  if p_regime is null or p_regime not in ('competencia', 'caixa') then
    raise exception 'regime deve ser competencia ou caixa.';
  end if;

  if p_fonte is not null and p_fonte not in ('contas_receber', 'contas_pagar', 'cartao', 'folha') then
    raise exception 'fonte invalida.';
  end if;

  if p_unidade is null or p_unidade not in ('consolidado', 'cg', 'rec', 'bar') then
    raise exception 'unidade deve ser consolidado, cg, rec ou bar.';
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
      and (p_unidade = 'consolidado' or l.unidade_operacional = p_unidade)
      and (
        p_cursor is null
        or (
          coalesce(l.plano_codigo, '~'),
          l.fonte,
          l.origem_id,
          l.origem_sequencia,
          coalesce(l.unidade_operacional, '~')
        ) > (
          coalesce(p_cursor->>'plano_codigo', '~'),
          coalesce(p_cursor->>'fonte', ''),
          coalesce(p_cursor->>'origem_id', ''),
          coalesce(p_cursor->>'origem_sequencia', ''),
          coalesce(p_cursor->>'unidade_operacional', '~')
        )
      )
  ),
  ordenadas as (
    select *
    from filtradas
    order by coalesce(plano_codigo, '~'), fonte, origem_id, origem_sequencia, coalesce(unidade_operacional, '~')
    limit v_limite + 1
  ),
  pagina as (
    select *, row_number() over (
      order by coalesce(plano_codigo, '~'), fonte, origem_id, origem_sequencia, coalesce(unidade_operacional, '~')
    ) as numero_linha
    from ordenadas
  ),
  ultimo as (
    select *
    from pagina
    where numero_linha <= v_limite
    order by coalesce(plano_codigo, '~') desc, fonte desc, origem_id desc, origem_sequencia desc, coalesce(unidade_operacional, '~') desc
    limit 1
  )
  select jsonb_build_object(
    'success', true,
    'unidade', p_unidade,
    'itens', coalesce((
      select jsonb_agg(
        to_jsonb(p) - 'numero_linha'
        order by coalesce(p.plano_codigo, '~'), p.fonte, p.origem_id, p.origem_sequencia, coalesce(p.unidade_operacional, '~')
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
          'origem_sequencia', u.origem_sequencia,
          'unidade_operacional', u.unidade_operacional
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

revoke all on function public.dre_consultar(date, text, text) from public, anon;
grant execute on function public.dre_consultar(date, text, text) to authenticated, service_role;

revoke all on function public.dre_detalhes(date, text, text, text, text, jsonb, integer) from public, anon;
grant execute on function public.dre_detalhes(date, text, text, text, text, jsonb, integer) to authenticated, service_role;

comment on function public.dre_consultar(date, text, text) is
  'DRE read-only por competencia, regime e unidade, com diagnosticos consolidados.';
comment on function public.dre_detalhes(date, text, text, text, text, jsonb, integer) is
  'Drill-down read-only do DRE por unidade com cursor deterministico.';
