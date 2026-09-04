begin;

create or replace view public.v_ferias_colaboradores_status
with (security_invoker = true)
as
with periodos_agregados as (
  select
    pa.colaborador_id,
    count(pa.id) filter (where pa.status = 'ativo') as periodos_ativos,
    count(pa.id) filter (where pa.status = 'vencido') as periodos_vencidos,
    sum(pa.dias_saldo) filter (where pa.status in ('ativo', 'em_gozo')) as total_dias_saldo,
    bool_or(pa.esta_vencido) as tem_ferias_vencidas,
    min(pa.concessivo_fim) filter (
      where pa.status = 'ativo' and pa.dias_saldo > 0
    ) as proxima_expiracao
  from public.ferias_periodos_aquisitivos pa
  group by pa.colaborador_id
),
programacoes_agregadas as (
  select
    fp.colaborador_id,
    count(fp.id) filter (
      where fp.status in ('programado', 'aprovado')
    ) as ferias_programadas,
    min(fp.data_inicio) filter (
      where fp.status in ('programado', 'aprovado')
        and fp.data_inicio >= current_date
    ) as proximas_ferias_inicio
  from public.ferias_programacoes fp
  group by fp.colaborador_id
)
select
  c.id as colaborador_id,
  c.nome,
  c.nome_completo,
  c.foto_url,
  c.funcao,
  c.departamento,
  c.data_admissao,
  c.status as colaborador_status,
  c.salario_base,
  coalesce(pa.periodos_ativos, 0::bigint) as periodos_ativos,
  coalesce(pa.periodos_vencidos, 0::bigint) as periodos_vencidos,
  pa.total_dias_saldo,
  pa.tem_ferias_vencidas,
  pa.proxima_expiracao,
  coalesce(fp.ferias_programadas, 0::bigint) as ferias_programadas,
  fp.proximas_ferias_inicio,
  case
    when pa.tem_ferias_vencidas then 'critico'
    when pa.proxima_expiracao < current_date + interval '30 days' then 'alerta'
    when pa.proxima_expiracao < current_date + interval '60 days' then 'atencao'
    else 'ok'
  end as status_ferias
from public.colaboradores c
left join periodos_agregados pa on pa.colaborador_id = c.id
left join programacoes_agregadas fp on fp.colaborador_id = c.id
where c.tipo = 'clt' and c.status = 'active';

comment on view public.v_ferias_colaboradores_status is
  'Status consolidado de ferias por colaborador CLT ativo, sem fanout entre periodos e programacoes';

create or replace function public.ferias_badge_contadores()
returns table (
  vencidos bigint,
  proximos bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    count(*) filter (where coalesce(v.tem_ferias_vencidas, false)) as vencidos,
    count(*) filter (
      where not coalesce(v.tem_ferias_vencidas, false)
        and v.proxima_expiracao > current_date
        and v.proxima_expiracao <= current_date + 30
    ) as proximos
  from public.v_ferias_colaboradores_status v;
$$;

revoke all on function public.ferias_badge_contadores() from public, anon;
grant execute on function public.ferias_badge_contadores() to authenticated, service_role;

create or replace function public.rh_agenda_excluir_espelho_removido()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'rh_processos' then
    delete from public.tarefas
    where vinculo_tipo = 'rh_processo'
      and vinculo_id = old.id;
  elsif tg_table_name = 'rh_processo_etapas' then
    delete from public.tarefas
    where vinculo_tipo = 'rh_etapa'
      and vinculo_id = old.id;
  end if;
  return old;
end;
$$;

revoke all on function public.rh_agenda_excluir_espelho_removido() from public, anon, authenticated;

drop trigger if exists trg_rh_processos_agenda_excluir_espelho on public.rh_processos;
create trigger trg_rh_processos_agenda_excluir_espelho
after delete on public.rh_processos
for each row
execute function public.rh_agenda_excluir_espelho_removido();

drop trigger if exists trg_rh_processo_etapas_agenda_excluir_espelho on public.rh_processo_etapas;
create trigger trg_rh_processo_etapas_agenda_excluir_espelho
after delete on public.rh_processo_etapas
for each row
execute function public.rh_agenda_excluir_espelho_removido();

delete from public.tarefas t
where (
  t.vinculo_tipo = 'rh_processo'
  and not exists (
    select 1
    from public.rh_processos p
    where p.id = t.vinculo_id
  )
) or (
  t.vinculo_tipo = 'rh_etapa'
  and not exists (
    select 1
    from public.rh_processo_etapas pe
    where pe.id = t.vinculo_id
  )
);

commit;
