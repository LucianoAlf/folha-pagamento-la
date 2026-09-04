-- Dashboard RH: reduz o primeiro quadro a uma unica chamada autenticada.
-- SECURITY INVOKER preserva o RLS de todas as tabelas e views consultadas.

create index if not exists idx_rh_processo_participantes_user_processo
  on public.rh_processo_participantes (user_id, processo_id);

create index if not exists idx_rh_etapa_responsaveis_user_etapa
  on public.rh_etapa_responsaveis (user_id, etapa_id);

create index if not exists idx_rh_historico_eventos_created_at_desc
  on public.rh_historico_eventos (created_at desc);

create or replace function public.rh_dashboard_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with current_actor as (
    select auth.uid() as user_id
  ),
  queue_process_ids as (
    select summary.id as processo_id
    from public.v_rh_processos_resumo summary
    cross join current_actor actor
    where summary.owner_user_id = actor.user_id
       or summary.mentor_user_id = actor.user_id

    union

    select participant.processo_id
    from public.rh_processo_participantes participant
    cross join current_actor actor
    where participant.user_id = actor.user_id

    union

    select stage.processo_id
    from public.rh_etapa_responsaveis responsible
    join public.rh_processo_etapas stage on stage.id = responsible.etapa_id
    cross join current_actor actor
    where responsible.user_id = actor.user_id
  ),
  queue_rows as (
    select summary.*
    from public.v_rh_processos_resumo summary
    where summary.id in (select processo_id from queue_process_ids)
    order by summary.data_inicio desc
    limit 6
  ),
  alert_rows as (
    select alert.*
    from public.v_rh_alertas_criticos alert
    order by alert.data_limite asc
    limit 8
  ),
  pending_document_rows as (
    select document.*
    from public.v_rh_documentos_pendentes document
    order by document.updated_at desc
    limit 8
  ),
  recent_event_rows as (
    select
      event.id,
      event.processo_id,
      event.acao,
      event.comentario,
      event.created_at,
      process.id as processo_public_id,
      process.titulo as processo_titulo,
      process.tipo as processo_tipo,
      process.status as processo_status
    from public.rh_historico_eventos event
    left join public.rh_processos process on process.id = event.processo_id
    order by event.created_at desc
    limit 8
  )
  select jsonb_build_object(
    'kpis', coalesce((select to_jsonb(kpis) from public.v_rh_dashboard_kpis kpis), '{}'::jsonb),
    'pdi_kpis', coalesce((select to_jsonb(kpis) from public.v_rh_pdi_dashboard_kpis kpis), '{}'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(alert) order by alert.data_limite asc) from alert_rows alert), '[]'::jsonb),
    'pending_documents', coalesce((select jsonb_agg(to_jsonb(document) order by document.updated_at desc) from pending_document_rows document), '[]'::jsonb),
    'my_queue', coalesce((select jsonb_agg(to_jsonb(summary) order by summary.data_inicio desc) from queue_rows summary), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'processo_id', event.processo_id,
          'acao', event.acao,
          'comentario', event.comentario,
          'created_at', event.created_at,
          'processo', case
            when event.processo_public_id is null then null
            else jsonb_build_object(
              'id', event.processo_public_id,
              'titulo', event.processo_titulo,
              'tipo', event.processo_tipo,
              'status', event.processo_status
            )
          end
        )
        order by event.created_at desc
      )
      from recent_event_rows event
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.rh_dashboard_bootstrap() from public, anon;
grant execute on function public.rh_dashboard_bootstrap() to authenticated;
