drop function if exists public.maria_gov_ctl_regras_em_conflito();
drop view if exists public.vw_maria_classificacao_regras_em_conflito;

create view public.vw_maria_classificacao_regras_em_conflito as
with base as (
  select r.id as regra_id, r.palavra_chave, r.origem, r.prioridade, r.plano_conta_id, r.created_at,
         (select codigo from plano_contas where id = r.plano_conta_id) as plano_regra
    from maria_classificacao_regras r
   where r.ativo and r.plano_conta_id is not null
),
achados as (
  select b.regra_id, c.descricao, c.status::text as situacao, c.created_at as entrou_em
    from base b
    join contas_pagar c
      on c.plano_conta_id is not null
     and c.plano_conta_id <> b.plano_conta_id
     and c.descricao ilike '%' || b.palavra_chave || '%'
  union all
  select b.regra_id, t.descricao, 'cartao'::text, t.created_at
    from base b
    join financeiro_cartao_transacoes t
      on t.plano_conta_id is not null
     and t.plano_conta_id <> b.plano_conta_id
     and t.descricao ilike '%' || b.palavra_chave || '%'
)
select b.regra_id, b.palavra_chave, b.origem, b.prioridade, b.plano_regra,
       b.created_at::date                                          as regra_criada,
       count(a.*)                                                  as registros_total,
       count(*) filter (where a.entrou_em >= b.created_at)          as discordancias,
       count(*) filter (where a.entrou_em <  b.created_at)          as passivo_anterior,
       count(*) filter (where a.situacao = 'pendente')              as pendentes_em_risco,
       left(string_agg(distinct left(a.descricao, 40), ' | '), 160) as exemplos
  from base b
  join achados a on a.regra_id = b.regra_id
 group by b.regra_id, b.palavra_chave, b.origem, b.prioridade, b.plano_regra, b.created_at
 order by 8 desc, 7 desc;

revoke all on public.vw_maria_classificacao_regras_em_conflito from public, anon, authenticated;
grant select on public.vw_maria_classificacao_regras_em_conflito to maria_operacional, maria_leitura;

create function public.maria_gov_ctl_regras_em_conflito()
returns table (
  regras_com_discordancia bigint,
  discordancias           bigint,
  pendentes_em_risco      bigint,
  passivo_a_reclassificar bigint,
  regras_suspensas        bigint,
  detalhe                 text
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from vw_maria_classificacao_regras_em_conflito where discordancias > 0),
    (select coalesce(sum(discordancias), 0) from vw_maria_classificacao_regras_em_conflito),
    (select coalesce(sum(pendentes_em_risco), 0) from vw_maria_classificacao_regras_em_conflito),
    (select coalesce(sum(passivo_anterior), 0) from vw_maria_classificacao_regras_em_conflito),
    (select count(*) from maria_classificacao_regras
      where not ativo and observacao ilike '%INATIVA por conflito%'),
    coalesce((select left(string_agg(palavra_chave || ' -> ' || plano_regra ||
                                     ' (' || discordancias || ' apos a regra)', ', '), 300)
                from vw_maria_classificacao_regras_em_conflito
               where discordancias > 0), '');
$$;

revoke all on function public.maria_gov_ctl_regras_em_conflito() from public;
grant execute on function public.maria_gov_ctl_regras_em_conflito() to maria_operacional, maria_leitura;
