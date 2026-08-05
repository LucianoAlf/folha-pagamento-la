-- Reconciliacao unica dos duplicados criados pela aprovacao de candidatos.
-- Este arquivo e deliberadamente operacional: os IDs produtivos nao pertencem
-- a migrations reutilizaveis. Qualquer desvio do snapshot confirmado aborta.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_ref record;
  v_count bigint;
begin
  perform 1
  from public.colaboradores
  where id in (106, 107, 108, 109)
  order by id
  for update;

  if (select count(*) from public.colaboradores where id in (106, 107, 108, 109)) <> 4 then
    raise exception 'REFUSED: um dos quatro colaboradores esperados nao existe mais.';
  end if;

  if public.rh_cpf_normalizar((select cpf from public.colaboradores where id = 107))
       is distinct from public.rh_cpf_normalizar((select cpf from public.colaboradores where id = 109))
     or public.rh_cpf_normalizar((select cpf from public.colaboradores where id = 106))
       is distinct from public.rh_cpf_normalizar((select cpf from public.colaboradores where id = 108)) then
    raise exception 'REFUSED: CPFs dos pares deixaram de coincidir.';
  end if;

  if (select count(*) from public.rh_candidatos where colaborador_convertido_id = 109) <> 1
     or (select count(*) from public.rh_processos where colaborador_id = 109) <> 1
     or (select count(*) from public.rh_documentos where colaborador_id = 109) <> 0 then
    raise exception 'REFUSED: vinculo novo ou contagem divergente para colaborador 109.';
  end if;

  if (select count(*) from public.rh_candidatos where colaborador_convertido_id = 108) <> 1
     or (select count(*) from public.rh_processos where colaborador_id = 108) <> 1
     or (select count(*) from public.rh_documentos where colaborador_id = 108) <> 6 then
    raise exception 'REFUSED: vinculo novo ou contagem divergente para colaborador 108.';
  end if;

  for v_ref in
    select
      ns.nspname as schema_name,
      rel.relname as table_name,
      att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join unnest(con.conkey) with ordinality key_col(attnum, ord) on true
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = key_col.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.colaboradores'::regclass
  loop
    execute format(
      'select count(*) from %I.%I where %I in (108, 109)',
      v_ref.schema_name,
      v_ref.table_name,
      v_ref.column_name
    ) into v_count;

    if v_count > 0 and not (
      (v_ref.table_name = 'rh_candidatos' and v_ref.column_name = 'colaborador_convertido_id' and v_count = 2)
      or (v_ref.table_name = 'rh_processos' and v_ref.column_name = 'colaborador_id' and v_count = 2)
      or (v_ref.table_name = 'rh_documentos' and v_ref.column_name = 'colaborador_id' and v_count = 6)
    ) then
      raise exception 'REFUSED: vinculo novo em %.%(%): % linha(s).',
        v_ref.schema_name, v_ref.table_name, v_ref.column_name, v_count;
    end if;
  end loop;

  if not exists (
    select 1
    from public.rh_candidatos
    where id = 'ae711d78-cfba-48a6-b3e3-457d9a68daaf'
      and colaborador_convertido_id = 109
  ) then
    raise exception 'REFUSED: candidato da Adriana nao esta no vinculo esperado.';
  end if;

  if not exists (
    select 1
    from public.rh_processos p
    where p.id = 'b3657225-b33a-481b-a7f8-6f169fa7c6a1'
      and p.colaborador_id = 109
      and p.tipo = 'onboarding'
      and p.status <> 'concluido'
      and not exists (select 1 from public.rh_processo_etapas e where e.processo_id = p.id)
      and not exists (select 1 from public.rh_documentos d where d.processo_id = p.id)
  ) then
    raise exception 'REFUSED: onboarding vazio da Adriana mudou ou recebeu conteudo.';
  end if;

  if (select count(*) from public.tarefas where vinculo_tipo = 'rh_processo' and vinculo_id = 'b3657225-b33a-481b-a7f8-6f169fa7c6a1') <> 1 then
    raise exception 'REFUSED: espelho de Agenda da Adriana divergiu.';
  end if;

  if not exists (
    select 1
    from public.rh_candidatos
    where id = 'a5d3efcb-a2fd-4e68-b6de-08d615a0d95e'
      and colaborador_convertido_id = 108
  ) then
    raise exception 'REFUSED: candidato da Vitoria nao esta no vinculo esperado.';
  end if;

  if not exists (
    select 1
    from public.rh_processos p
    where p.id = 'b3d2d29a-b7c1-4d27-9228-64cc1e1c7a32'
      and p.colaborador_id = 108
      and p.tipo = 'onboarding'
      and (select count(*) from public.rh_processo_etapas e where e.processo_id = p.id) = 11
  ) then
    raise exception 'REFUSED: onboarding valido da Vitoria mudou de estrutura.';
  end if;
end;
$$;

update public.rh_candidatos
set colaborador_convertido_id = 107,
    updated_at = now()
where id = 'ae711d78-cfba-48a6-b3e3-457d9a68daaf'
  and colaborador_convertido_id = 109;

delete from public.tarefas
where vinculo_tipo = 'rh_processo'
  and vinculo_id = 'b3657225-b33a-481b-a7f8-6f169fa7c6a1';

delete from public.rh_processos
where id = 'b3657225-b33a-481b-a7f8-6f169fa7c6a1'
  and colaborador_id = 109;

delete from public.colaboradores
where id = 109;

update public.rh_candidatos
set colaborador_convertido_id = 106,
    updated_at = now()
where id = 'a5d3efcb-a2fd-4e68-b6de-08d615a0d95e'
  and colaborador_convertido_id = 108;

update public.rh_processos
set colaborador_id = 106,
    updated_at = now()
where colaborador_id = 108;

update public.rh_documentos
set colaborador_id = 106,
    updated_at = now()
where colaborador_id = 108;

delete from public.colaboradores
where id = 108;

do $$
begin
  if exists (
    select 1
    from public.colaboradores c
    where public.rh_cpf_normalizar(c.cpf) is not null
    group by public.rh_cpf_normalizar(c.cpf)
    having count(*) > 1
  ) then
    raise exception 'REFUSED: reconciliacao terminou com CPF duplicado.';
  end if;

  if exists (
    select 1
    from public.tarefas t
    where (t.vinculo_tipo = 'rh_processo' and not exists (
      select 1 from public.rh_processos p where p.id = t.vinculo_id
    ))
    or (t.vinculo_tipo = 'rh_etapa' and not exists (
      select 1 from public.rh_processo_etapas e where e.id = t.vinculo_id
    ))
  ) then
    raise exception 'REFUSED: reconciliacao deixou tarefa RH orfa.';
  end if;

  if exists (select 1 from public.colaboradores where id in (108, 109)) then
    raise exception 'REFUSED: colaboradores duplicados nao foram removidos.';
  end if;
end;
$$;

commit;
