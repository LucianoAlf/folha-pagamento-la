-- Corrige falso positivo no preflight de duplicidade da Maria.
-- Krissya Barra eventual != iFood Kids CG recorrente: mesmo valor/plano fraco nao bloqueia.

create or replace function public.maria_conferencia_lancamento_preflight(
  p_conferencia_id uuid,
  p_janela_dias integer default 3
)
returns table (
  item_id uuid,
  item_numero integer,
  descricao text,
  data_operacional date,
  valor_centavos integer,
  unidade text,
  plano_codigo text,
  plano_nome text,
  plano_origem text,
  item_status text,
  pendencias text[],
  duplicidade_candidatos jsonb,
  duplicidade_count integer,
  pode_lancar boolean
)
language sql
security definer
set search_path = public
as $$
  with itens as (
    select
      i.*,
      coalesce(p_janela_dias, 3) as janela_dias,
      case
        when lower(trim(coalesce(i.unidade, ''))) in ('rec', 'recreio', 'la kids recreio') then 'rec'
        when lower(trim(coalesce(i.unidade, ''))) in ('bar', 'barra') then 'bar'
        when lower(trim(coalesce(i.unidade, ''))) in ('cg', 'campo grande', 'campo_grande', 'emla cg', 'emla_cg', 'kids cg', 'kids_cg') then 'cg'
        else lower(trim(coalesce(i.unidade, '')))
      end as unidade_codigo
    from public.maria_conferencia_lancamento_itens i
    where i.conferencia_id = p_conferencia_id
  ), avaliados as (
    select
      i.id as item_id,
      i.item_numero,
      i.descricao,
      i.data_operacional,
      i.valor_centavos,
      i.unidade,
      i.plano_codigo,
      i.plano_nome,
      i.plano_origem,
      i.status as item_status,
      array_remove(array[
        case when i.data_operacional is null then 'data_operacional ausente' end,
        case when i.valor_centavos is null or i.valor_centavos <= 0 then 'valor ausente/invalido' end,
        case when nullif(trim(i.descricao), '') is null then 'descricao ausente' end,
        case when i.plano_codigo is null and i.plano_nome is null then 'plano de contas pendente' end,
        case when i.plano_origem not in ('humano', 'regra_aprendida', 'ledger') then 'origem do plano nao confiavel' end
      ], null)::text[] as pendencias,
      coalesce(c.candidatos, '[]'::jsonb) as duplicidade_candidatos,
      coalesce(jsonb_array_length(c.candidatos), 0) as duplicidade_count
    from itens i
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'conta_id', cp.id,
          'descricao', cp.descricao,
          'valor', cp.valor,
          'valor_centavos', public.maria_fluxo_valor_para_centavos(cp.valor),
          'data_lancamento', cp.data_lancamento,
          'data_vencimento', cp.data_vencimento,
          'data_pagamento', cp.data_pagamento,
          'status', cp.status,
          'tipo_lancamento', cp.tipo_lancamento,
          'unidade', cp.unidade,
          'created_at', cp.created_at,
          'motivo_match', concat_ws('; ',
            'mesmo valor',
            case when cp.v_descricao_match then 'descricao/fornecedor compativel' end,
            case when cp.v_unidade_match then 'mesma unidade/centro' end,
            case when cp.v_data_match then 'data/competencia proxima' end,
            case when cp.v_tipo_match then 'tipo_lancamento compativel' end
          )
        ) order by cp.created_at desc
      ) as candidatos
      from (
        select matched.*
        from (
          select
            cp.*,
            norm.v_item_descricao_norm,
            norm.v_cp_descricao_norm,
            flags.v_descricao_match,
            flags.v_unidade_match,
            flags.v_data_match,
            flags.v_tipo_match
          from public.contas_pagar cp
          left join public.centros_custo cc on cc.id = cp.centro_custo_id
          cross join lateral (
            select
              public.maria_cartoes_normalizar_texto(i.descricao) as v_item_descricao_norm,
              public.maria_cartoes_normalizar_texto(cp.descricao) as v_cp_descricao_norm,
              public.maria_cartoes_normalizar_texto(i.conta_origem) as v_item_fornecedor_norm,
              public.maria_cartoes_normalizar_texto(cp.fonte_identificador) as v_cp_fornecedor_norm,
              coalesce(nullif(lower(trim(coalesce(cp.unidade, ''))), ''), lower(trim(coalesce(cc.codigo, '')))) as v_cp_unidade_codigo
          ) norm
          cross join lateral (
            select
              (
                (
                  length(norm.v_item_descricao_norm) >= 8
                  and length(norm.v_cp_descricao_norm) >= 8
                  and (
                    position(norm.v_item_descricao_norm in norm.v_cp_descricao_norm) > 0
                    or position(norm.v_cp_descricao_norm in norm.v_item_descricao_norm) > 0
                  )
                )
                or (
                  length(norm.v_item_fornecedor_norm) >= 4
                  and norm.v_item_fornecedor_norm = norm.v_cp_fornecedor_norm
                )
              ) as v_descricao_match,
              (
                i.unidade_codigo <> ''
                and norm.v_cp_unidade_codigo = i.unidade_codigo
              ) as v_unidade_match,
              (
                i.data_operacional is not null
                and (
                  (cp.data_vencimento is not null and abs(cp.data_vencimento - i.data_operacional) <= i.janela_dias)
                  or (cp.data_lancamento is not null and abs(cp.data_lancamento - i.data_operacional) <= i.janela_dias)
                  or (cp.data_pagamento is not null and abs((cp.data_pagamento at time zone 'America/Sao_Paulo')::date - i.data_operacional) <= i.janela_dias)
                  or (cp.competencia is not null and cp.competencia = date_trunc('month', i.data_operacional)::date)
                )
              ) as v_data_match,
              (
                coalesce(cp.tipo_lancamento, '') in ('eventual', 'unica')
                or (
                  coalesce(cp.tipo_lancamento, '') = 'recorrente'
                  and norm.v_cp_unidade_codigo = i.unidade_codigo
                  and (
                    (
                      length(norm.v_item_descricao_norm) >= 8
                      and length(norm.v_cp_descricao_norm) >= 8
                      and (
                        position(norm.v_item_descricao_norm in norm.v_cp_descricao_norm) > 0
                        or position(norm.v_cp_descricao_norm in norm.v_item_descricao_norm) > 0
                      )
                    )
                    or (
                      length(norm.v_item_fornecedor_norm) >= 4
                      and norm.v_item_fornecedor_norm = norm.v_cp_fornecedor_norm
                    )
                  )
                )
              ) as v_tipo_match
          ) flags
          where i.valor_centavos is not null
            and public.maria_fluxo_valor_para_centavos(cp.valor) = i.valor_centavos
        ) matched
        where matched.v_descricao_match
          and matched.v_unidade_match
          and matched.v_data_match
          and matched.v_tipo_match
          -- Um eventual novo contra recorrente so bloqueia quando tambem bate descricao/fornecedor,
          -- unidade e data. Valor/plano isolados nao sao duplicidade forte.
        order by matched.created_at desc
        limit 5
      ) cp
    ) c on true
  )
  select
    a.item_id,
    a.item_numero,
    a.descricao,
    a.data_operacional,
    a.valor_centavos,
    a.unidade,
    a.plano_codigo,
    a.plano_nome,
    a.plano_origem,
    a.item_status,
    a.pendencias,
    a.duplicidade_candidatos,
    a.duplicidade_count,
    cardinality(a.pendencias) = 0 and a.duplicidade_count = 0 as pode_lancar
  from avaliados a
  order by a.item_numero;
$$;

revoke all on function public.maria_conferencia_lancamento_preflight(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.maria_conferencia_lancamento_preflight(uuid, integer)
  to maria_leitura, maria_operacional, service_role;

comment on function public.maria_conferencia_lancamento_preflight(uuid, integer)
is 'Preflight de conferencias Maria: pendencias e duplicidade forte para lancamentos eventuais; nao bloqueia por coincidencia fraca de valor/plano.';
