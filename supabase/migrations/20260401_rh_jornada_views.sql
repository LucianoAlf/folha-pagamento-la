create or replace view public.v_rh_processos_resumo
with (security_invoker = true)
as
select
  p.id,
  p.tipo,
  p.status,
  p.titulo,
  p.candidato_id,
  p.colaborador_id,
  p.owner_user_id,
  p.mentor_user_id,
  p.prioridade,
  p.data_inicio,
  p.data_fim_prevista,
  p.data_fim_real,
  coalesce(count(pe.id), 0) as total_etapas,
  coalesce(count(pe.id) filter (where pe.status = 'concluida'), 0) as etapas_concluidas,
  case
    when count(pe.id) = 0 then 0
    else round((count(pe.id) filter (where pe.status = 'concluida')::numeric / count(pe.id)::numeric) * 100, 2)
  end as percentual_conclusao
from public.rh_processos p
left join public.rh_processo_etapas pe on pe.processo_id = p.id
where p.arquivado_em is null
group by p.id;

create or replace view public.v_rh_documentos_pendentes
with (security_invoker = true)
as
select
  d.id,
  d.processo_id,
  p.tipo as processo_tipo,
  p.titulo as processo_titulo,
  d.tipo_documento,
  d.status,
  d.obrigatorio,
  d.candidato_id,
  d.colaborador_id,
  d.created_at,
  d.updated_at
from public.rh_documentos d
join public.rh_processos p on p.id = d.processo_id
where p.arquivado_em is null
  and d.status in ('pendente', 'rejeitado');

create or replace view public.v_rh_alertas_criticos
with (security_invoker = true)
as
select
  pe.id as etapa_id,
  pe.processo_id,
  p.tipo as processo_tipo,
  p.titulo as processo_titulo,
  pe.titulo as etapa_titulo,
  pe.status as etapa_status,
  pe.data_limite,
  case
    when pe.data_limite is null then null
    else (pe.data_limite - current_date)
  end as dias_para_vencimento
from public.rh_processo_etapas pe
join public.rh_processos p on p.id = pe.processo_id
where p.arquivado_em is null
  and pe.status in ('nao_iniciada', 'em_andamento', 'atrasada')
  and pe.data_limite is not null
  and pe.data_limite <= current_date + 5;

create or replace view public.v_rh_dashboard_kpis
with (security_invoker = true)
as
select
  count(*) filter (
    where tipo = 'recrutamento'
      and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao')
      and arquivado_em is null
  ) as recrutamentos_ativos,
  count(*) filter (
    where tipo = 'onboarding'
      and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao')
      and arquivado_em is null
  ) as onboardings_ativos,
  count(*) filter (
    where tipo = 'desligamento'
      and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao')
      and arquivado_em is null
  ) as desligamentos_ativos,
  (
    select count(*)
    from public.rh_documentos d
    join public.rh_processos p2 on p2.id = d.processo_id
    where p2.arquivado_em is null
      and d.status in ('pendente', 'rejeitado')
  ) as documentos_pendentes,
  (
    select count(*)
    from public.rh_processo_etapas pe
    join public.rh_processos p3 on p3.id = pe.processo_id
    where p3.arquivado_em is null
      and pe.data_limite is not null
      and pe.data_limite < current_date
      and pe.status in ('nao_iniciada', 'em_andamento', 'atrasada')
  ) as etapas_atrasadas
from public.rh_processos;
