create or replace view public.vw_maria_conferencias_pendentes_lancamento as
with ultima_por_grupo as (
  select distinct on (c.chat_id, c.titulo)
         c.id, c.chat_id, c.titulo, c.status, c.versao,
         c.aprovado_por_nome, c.aprovado_at, c.created_at
    from maria_conferencias_lancamento c
   order by c.chat_id, c.titulo, c.created_at desc
),
item_situacao as (
  select i.conferencia_id, i.id as item_id, i.valor_centavos,
         (i.conta_pagar_id is not null
          or exists (select 1 from contas_pagar cp
                      where round(cp.valor * 100) = i.valor_centavos
                        and lower(btrim(cp.descricao)) = lower(btrim(i.descricao))
                        and cp.status in ('pago', 'pendente'))) as lancado
    from maria_conferencia_lancamento_itens i
)
select u.id as conferencia_id,
       u.chat_id,
       u.titulo,
       u.status,
       u.aprovado_por_nome,
       u.aprovado_at,
       u.created_at,
       (select count(*) from item_situacao s where s.conferencia_id = u.id) as n_itens,
       (select coalesce(sum(s.valor_centavos), 0) from item_situacao s where s.conferencia_id = u.id) as valor_total_centavos,
       (select count(*) from item_situacao s where s.conferencia_id = u.id and not s.lancado) as itens_pendentes,
       (select coalesce(sum(s.valor_centavos), 0) from item_situacao s where s.conferencia_id = u.id and not s.lancado) as valor_pendente_centavos
  from ultima_por_grupo u
 where u.status = 'aprovada'
   and exists (select 1 from item_situacao s where s.conferencia_id = u.id and not s.lancado);
