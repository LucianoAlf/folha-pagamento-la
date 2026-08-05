\set ON_ERROR_STOP on

begin;

do $$
begin
  if current_setting('app.rh_onboarding_fixture_guard', true) is distinct from 'local_ci_only' then
    raise exception 'REFUSED: app.rh_onboarding_fixture_guard=local_ci_only e obrigatorio.';
  end if;
  if current_database() is distinct from 'rh_onboarding_fixture' then
    raise exception 'REFUSED: banco inesperado para fixture RH.';
  end if;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

insert into public.user_profiles (id, nome, role)
values ('00000000-0000-0000-0000-000000000001', 'RH Fixture', 'rh');

insert into public.colaboradores (
  id, nome, nome_completo, tipo, tipo_contrato, departamento, funcao,
  cpf, email, ativo, status
) values (
  910001, 'Pessoa Existente', 'Pessoa Existente', 'pj', 'pj',
  'equipe_operacional', 'Analista', '111.222.333-44',
  'existente@example.test', true, 'active'
);

insert into public.rh_templates (id, tipo_processo, nome, ativo)
values
  ('00000000-0000-0000-0000-000000000101', 'onboarding', 'Template vazio', true),
  ('00000000-0000-0000-0000-000000000102', 'onboarding', 'Template completo', true);

insert into public.rh_template_etapas (
  id, template_id, codigo, titulo, categoria, ordem, obrigatoria,
  prazo_offset_dias, responsavel_padrao_papel
) values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000102',
  'boas-vindas', 'Boas-vindas', 'cultura', 1, true, 1, 'rh'
);

insert into public.rh_template_checklist_itens (
  id, template_etapa_id, titulo, obrigatorio, ordem
) values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  'Apresentar equipe', true, 1
);

insert into public.rh_template_documentos (
  id, template_id, tipo_documento, obrigatorio, ordem
) values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000102',
  'identidade', true, 1
);

insert into public.rh_candidatos (
  id, nome, cpf, status, created_by
) values
  (
    '00000000-0000-0000-0000-000000000501',
    'Candidata CPF Existente', '11122233344', 'novo',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    'Candidato CPF Novo', '55566677788', 'novo',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    'Candidato Template Vazio', '99988877766', 'novo',
    '00000000-0000-0000-0000-000000000001'
  );

do $$
declare
  v_result jsonb;
  v_before integer;
begin
  select count(*) into v_before from public.colaboradores;

  begin
    perform public.rh_candidato_aprovar(
      jsonb_build_object(
        'candidateId', '00000000-0000-0000-0000-000000000503',
        'nome', 'Candidato Template Vazio',
        'funcao', 'Analista',
        'departamento', 'equipe_operacional',
        'tipo', 'pj',
        'salario_base', 0,
        'is_rateado', false,
        'cpf', '99988877766',
        'createOnboardingNow', true,
        'onboardingTemplateId', '00000000-0000-0000-0000-000000000101'
      ),
      null
    );
    raise exception 'fixture: template vazio foi aceito';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%pelo menos uma etapa%' then raise; end if;
  end;

  if (select count(*) from public.colaboradores) <> v_before
     or (select status from public.rh_candidatos where id = '00000000-0000-0000-0000-000000000503') <> 'novo' then
    raise exception 'fixture: template vazio deixou escrita parcial';
  end if;

  v_result := public.rh_candidato_aprovar(
    jsonb_build_object(
      'candidateId', '00000000-0000-0000-0000-000000000501',
      'nome', 'Candidata CPF Existente',
      'funcao', 'Analista',
      'departamento', 'equipe_operacional',
      'tipo', 'pj',
      'salario_base', 0,
      'is_rateado', false,
      'cpf', '11122233344',
      'createOnboardingNow', true,
      'onboardingTemplateId', '00000000-0000-0000-0000-000000000102',
      'onboardingDataInicio', '2026-08-05'
    ),
    null
  );

  if v_result ->> 'status' <> 'cpf_existente'
     or (v_result #>> '{colaborador_existente,id}')::integer <> 910001 then
    raise exception 'fixture: conflito de CPF nao foi devolvido';
  end if;

  if (select status from public.rh_candidatos where id = '00000000-0000-0000-0000-000000000501') <> 'novo' then
    raise exception 'fixture: conflito de CPF alterou candidato';
  end if;

  v_result := public.rh_candidato_aprovar(
    jsonb_build_object(
      'candidateId', '00000000-0000-0000-0000-000000000501',
      'nome', 'Candidata CPF Existente',
      'funcao', 'Analista',
      'departamento', 'equipe_operacional',
      'tipo', 'pj',
      'salario_base', 0,
      'is_rateado', false,
      'cpf', '11122233344',
      'createOnboardingNow', true,
      'onboardingTemplateId', '00000000-0000-0000-0000-000000000102',
      'onboardingDataInicio', '2026-08-05'
    ),
    910001
  );

  if v_result ->> 'status' <> 'aprovado'
     or (v_result #>> '{collaborator,id}')::integer <> 910001
     or (select count(*) from public.rh_processo_etapas where processo_id = (v_result #>> '{onboardingProcess,id}')::uuid) <> 1
     or (select count(*) from public.rh_checklist_itens) <> 1
     or (select count(*) from public.rh_documentos where processo_id = (v_result #>> '{onboardingProcess,id}')::uuid) <> 1 then
    raise exception 'fixture: reutilizacao nao materializou onboarding completo';
  end if;

  v_result := public.rh_candidato_aprovar(
    jsonb_build_object(
      'candidateId', '00000000-0000-0000-0000-000000000502',
      'nome', 'Candidato CPF Novo',
      'funcao', 'Assistente',
      'departamento', 'equipe_operacional',
      'tipo', 'pj',
      'salario_base', 1000,
      'is_rateado', false,
      'unidade_fixa', 'cg',
      'cpf', '555.666.777-88',
      'createOnboardingNow', false
    ),
    null
  );

  if v_result ->> 'status' <> 'aprovado'
     or (select count(*) from public.colaboradores where public.rh_cpf_normalizar(cpf) = '55566677788') <> 1 then
    raise exception 'fixture: CPF novo nao criou exatamente um colaborador';
  end if;
end;
$$;

do $$
declare
  v_process jsonb;
  v_process_id uuid;
  v_stage_id uuid;
  v_result jsonb;
begin
  v_process := public.rh_onboarding_criar(jsonb_build_object(
    'template_id', '00000000-0000-0000-0000-000000000102',
    'colaborador_id', 910001,
    'data_inicio', '2026-08-05',
    'titulo', 'Onboarding descartavel',
    'cargo', 'Analista'
  ));
  v_process_id := (v_process ->> 'id')::uuid;
  select id into v_stage_id from public.rh_processo_etapas where processo_id = v_process_id;

  insert into public.tarefas (titulo, vinculo_tipo, vinculo_id)
  values
    ('Espelho processo', 'rh_processo', v_process_id),
    ('Espelho etapa', 'rh_etapa', v_stage_id);

  begin
    perform public.rh_onboarding_excluir_definitivo(v_process_id, 'titulo incorreto');
    raise exception 'fixture: titulo incorreto excluiu processo';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%confirmacao divergente%' then raise; end if;
  end;

  v_result := public.rh_onboarding_excluir_definitivo(v_process_id, 'Onboarding descartavel');
  if (v_result ->> 'tarefas_removidas')::integer <> 2
     or exists (select 1 from public.rh_processos where id = v_process_id)
     or exists (select 1 from public.tarefas where vinculo_id in (v_process_id, v_stage_id)) then
    raise exception 'fixture: exclusao definitiva deixou processo ou tarefa orfa';
  end if;

  v_process := public.rh_onboarding_criar(jsonb_build_object(
    'template_id', '00000000-0000-0000-0000-000000000102',
    'colaborador_id', 910001,
    'data_inicio', '2026-08-05',
    'titulo', 'Onboarding concluido',
    'cargo', 'Analista'
  ));
  v_process_id := (v_process ->> 'id')::uuid;
  update public.rh_processos set status = 'concluido' where id = v_process_id;

  begin
    perform public.rh_onboarding_excluir_definitivo(v_process_id, 'Onboarding concluido');
    raise exception 'fixture: processo concluido foi excluido';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%concluido%' then raise; end if;
  end;

  if not exists (select 1 from public.rh_processos where id = v_process_id) then
    raise exception 'fixture: bloqueio de concluido nao preservou processo';
  end if;
end;
$$;

rollback;

select 'RH_ONBOARDING_FIXTURE_OK' as resultado;
