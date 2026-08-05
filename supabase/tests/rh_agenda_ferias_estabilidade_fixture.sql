begin;

do $$
declare
  v_process uuid := gen_random_uuid();
  v_stage uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.tarefas
    where vinculo_tipo in ('rh_processo', 'rh_etapa')
      and vinculo_id in (
        '00000000-0000-0000-0000-000000000091'::uuid,
        '00000000-0000-0000-0000-000000000092'::uuid
      )
  ) then
    raise exception 'fixture: migration nao removeu as tarefas orfas iniciais';
  end if;

  if (select count(*) from public.tarefas where titulo like 'VALIDA:%') <> 2 then
    raise exception 'fixture: migration removeu espelhos validos';
  end if;

  if not exists (select 1 from public.tarefas where titulo = 'GENERICA: preservar') then
    raise exception 'fixture: limpeza atingiu vinculo fora do escopo';
  end if;

  select id into v_stage
  from public.rh_processo_etapas
  where processo_id = '00000000-0000-0000-0000-000000000011'::uuid;

  delete from public.rh_processo_etapas where id = v_stage;
  if exists (select 1 from public.tarefas where titulo = 'VALIDA: etapa') then
    raise exception 'fixture: trigger de etapa nao removeu espelho';
  end if;

  insert into public.rh_processos(id) values (v_process);
  insert into public.rh_processo_etapas(id, processo_id) values (gen_random_uuid(), v_process)
  returning id into v_stage;
  insert into public.tarefas(titulo, vinculo_tipo, vinculo_id) values
    ('TRANSACIONAL: processo', 'rh_processo', v_process),
    ('TRANSACIONAL: etapa', 'rh_etapa', v_stage);

  delete from public.rh_processos where id = v_process;
  if exists (select 1 from public.tarefas where titulo like 'TRANSACIONAL:%') then
    raise exception 'fixture: cascade de processo deixou espelho orfao';
  end if;
end;
$$;

do $$
declare
  v record;
  b record;
begin
  select * into v
  from public.v_ferias_colaboradores_status
  where colaborador_id = 1;

  if v.periodos_ativos <> 1 or v.periodos_vencidos <> 2 or v.total_dias_saldo <> 30 or v.ferias_programadas <> 3 then
    raise exception 'fixture: agregacao incorreta: ativos %, vencidos %, saldo %, programadas %',
      v.periodos_ativos, v.periodos_vencidos, v.total_dias_saldo, v.ferias_programadas;
  end if;

  select * into b from public.ferias_badge_contadores();
  if b.vencidos <> 1 or b.proximos <> 1 then
    raise exception 'fixture: badge incorreto: vencidos %, proximos %', b.vencidos, b.proximos;
  end if;
end;
$$;

rollback;

select 'RH_AGENDA_FERIAS_FIXTURE_OK' as resultado;
