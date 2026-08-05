-- Jornada RH: operacoes atomicas de onboarding e aprovacao de candidato.
-- A reconciliacao dos duplicados produtivos e o indice unico de CPF ficam em
-- etapas posteriores, deliberadamente separadas desta migration reutilizavel.

create or replace function public.rh_cpf_normalizar(p_cpf text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
$$;

create or replace function public.rh_onboarding_materializar(
  p_payload jsonb,
  p_colaborador_id integer,
  p_owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_template public.rh_templates%rowtype;
  v_processo public.rh_processos%rowtype;
  v_template_id uuid := nullif(p_payload ->> 'template_id', '')::uuid;
  v_mentor_user_id uuid := nullif(p_payload ->> 'mentor_user_id', '')::uuid;
  v_candidato_id uuid := nullif(p_payload ->> 'candidato_id', '')::uuid;
  v_data_inicio date := nullif(p_payload ->> 'data_inicio', '')::date;
  v_data_fim_prevista date := nullif(p_payload ->> 'data_fim_prevista', '')::date;
  v_total_etapas integer;
begin
  if p_owner_user_id is null then
    raise exception using errcode = '22023', message = 'Responsavel do onboarding e obrigatorio.';
  end if;

  if v_template_id is null or v_data_inicio is null then
    raise exception using errcode = '22023', message = 'Template e data de inicio sao obrigatorios.';
  end if;

  select *
    into v_template
  from public.rh_templates
  where id = v_template_id
  for share;

  if not found or v_template.tipo_processo <> 'onboarding' or not v_template.ativo or v_template.arquivado_em is not null then
    raise exception using errcode = '22023', message = 'Template de onboarding inexistente ou inativo.';
  end if;

  select count(*)
    into v_total_etapas
  from public.rh_template_etapas
  where template_id = v_template_id;

  if v_total_etapas = 0 then
    raise exception using errcode = '22023', message = 'Template de onboarding deve possuir pelo menos uma etapa.';
  end if;

  insert into public.rh_processos (
    tipo,
    status,
    candidato_id,
    colaborador_id,
    template_id,
    titulo,
    unidade,
    departamento,
    cargo,
    tipo_vinculo,
    owner_user_id,
    mentor_user_id,
    prioridade,
    data_inicio,
    data_fim_prevista,
    observacoes,
    metadata_json
  ) values (
    'onboarding',
    'em_andamento',
    v_candidato_id,
    p_colaborador_id,
    v_template_id,
    coalesce(nullif(trim(p_payload ->> 'titulo'), ''), 'Onboarding - ' || coalesce(nullif(trim(p_payload ->> 'cargo'), ''), 'Colaborador')),
    nullif(trim(p_payload ->> 'unidade'), ''),
    nullif(trim(p_payload ->> 'departamento'), ''),
    nullif(trim(p_payload ->> 'cargo'), ''),
    nullif(trim(p_payload ->> 'tipo_vinculo'), ''),
    p_owner_user_id,
    v_mentor_user_id,
    coalesce(nullif(p_payload ->> 'prioridade', ''), 'media'),
    v_data_inicio,
    v_data_fim_prevista,
    nullif(trim(p_payload ->> 'observacoes'), ''),
    coalesce(p_payload -> 'metadata_json', '{}'::jsonb)
  )
  returning * into v_processo;

  insert into public.rh_processo_participantes (
    processo_id,
    user_id,
    papel,
    principal
  ) values (
    v_processo.id,
    p_owner_user_id,
    'rh',
    true
  );

  if v_mentor_user_id is not null and v_mentor_user_id <> p_owner_user_id then
    insert into public.rh_processo_participantes (
      processo_id,
      user_id,
      papel,
      principal
    ) values (
      v_processo.id,
      v_mentor_user_id,
      'mentor',
      false
    );
  end if;

  insert into public.rh_processo_etapas (
    processo_id,
    template_etapa_id,
    codigo,
    titulo,
    categoria,
    status,
    ordem,
    obrigatoria,
    data_prevista,
    data_limite,
    instrucoes,
    modelo_mensagem,
    link_referencia,
    link_reuniao,
    notificar_responsaveis,
    notificar_colaborador,
    metadata_json
  )
  select
    v_processo.id,
    te.id,
    te.codigo,
    te.titulo,
    te.categoria,
    'nao_iniciada',
    te.ordem,
    te.obrigatoria,
    case when te.prazo_offset_dias is null then null else v_data_inicio + te.prazo_offset_dias end,
    case when te.prazo_offset_dias is null then null else v_data_inicio + te.prazo_offset_dias end,
    te.instrucoes,
    te.modelo_mensagem,
    te.link_referencia,
    te.link_reuniao,
    te.notificar_responsaveis,
    te.notificar_colaborador,
    te.metadata_json
  from public.rh_template_etapas te
  where te.template_id = v_template_id
  order by te.ordem, te.id;

  insert into public.rh_checklist_itens (
    etapa_id,
    titulo,
    descricao,
    link_url,
    obrigatorio,
    ordem,
    metadata_json
  )
  select
    pe.id,
    ci.titulo,
    ci.descricao,
    ci.link_url,
    ci.obrigatorio,
    ci.ordem,
    ci.metadata_json
  from public.rh_processo_etapas pe
  join public.rh_template_checklist_itens ci
    on ci.template_etapa_id = pe.template_etapa_id
  where pe.processo_id = v_processo.id;

  insert into public.rh_etapa_responsaveis (
    etapa_id,
    user_id,
    papel,
    principal
  )
  select
    pe.id,
    case when te.responsavel_padrao_papel = 'mentor' then v_mentor_user_id else p_owner_user_id end,
    te.responsavel_padrao_papel,
    true
  from public.rh_processo_etapas pe
  join public.rh_template_etapas te on te.id = pe.template_etapa_id
  where pe.processo_id = v_processo.id
    and te.responsavel_padrao_papel in ('rh', 'mentor')
    and (te.responsavel_padrao_papel <> 'mentor' or v_mentor_user_id is not null);

  insert into public.rh_documentos (
    processo_id,
    candidato_id,
    colaborador_id,
    tipo_documento,
    obrigatorio,
    status
  )
  select
    v_processo.id,
    v_candidato_id,
    p_colaborador_id,
    td.tipo_documento,
    td.obrigatorio,
    'pendente'
  from public.rh_template_documentos td
  where td.template_id = v_template_id
  order by td.ordem, td.id;

  insert into public.rh_historico_eventos (
    processo_id,
    entidade_tipo,
    entidade_id,
    acao,
    para_json,
    comentario,
    actor_user_id
  ) values (
    v_processo.id,
    'rh_processos',
    v_processo.id,
    'processo_criado',
    to_jsonb(v_processo),
    'Processo onboarding criado a partir de template.',
    p_owner_user_id
  );

  return v_processo.id;
end;
$$;

create or replace function public.rh_onboarding_criar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_processo_id uuid;
  v_colaborador_id integer := nullif(p_payload ->> 'colaborador_id', '')::integer;
begin
  if v_user_id is null or not public.rh_is_admin_or_rh() then
    raise exception using errcode = '42501', message = 'Sem permissao para criar onboarding.';
  end if;

  if v_colaborador_id is null then
    raise exception using errcode = '22023', message = 'Colaborador do onboarding e obrigatorio.';
  end if;

  v_processo_id := public.rh_onboarding_materializar(p_payload, v_colaborador_id, v_user_id);

  return (
    select to_jsonb(p)
    from public.rh_processos p
    where p.id = v_processo_id
  );
end;
$$;

create or replace function public.rh_candidato_aprovar(
  p_payload jsonb,
  p_reutilizar_colaborador_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_candidato public.rh_candidatos%rowtype;
  v_colaborador public.colaboradores%rowtype;
  v_existente public.colaboradores%rowtype;
  v_template public.rh_templates%rowtype;
  v_cpf text := public.rh_cpf_normalizar(p_payload ->> 'cpf');
  v_template_id uuid := nullif(p_payload ->> 'onboardingTemplateId', '')::uuid;
  v_criar_onboarding boolean := coalesce((p_payload ->> 'createOnboardingNow')::boolean, false);
  v_processo_id uuid;
  v_onboarding jsonb := null;
  v_recrutamento record;
begin
  if v_user_id is null or not public.rh_is_admin_or_rh() then
    raise exception using errcode = '42501', message = 'Sem permissao para aprovar candidato.';
  end if;

  select *
    into v_candidato
  from public.rh_candidatos
  where id = nullif(p_payload ->> 'candidateId', '')::uuid
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Candidato nao encontrado.';
  end if;

  if v_candidato.status = 'aprovado' and v_candidato.colaborador_convertido_id is not null then
    select * into v_colaborador
    from public.colaboradores
    where id = v_candidato.colaborador_convertido_id;

    select to_jsonb(p) into v_onboarding
    from public.rh_processos p
    where p.tipo = 'onboarding'
      and p.colaborador_id = v_colaborador.id
      and p.metadata_json ->> 'candidate_id' = v_candidato.id::text
    order by p.created_at desc
    limit 1;

    return jsonb_build_object(
      'status', 'aprovado',
      'candidate', to_jsonb(v_candidato),
      'collaborator', to_jsonb(v_colaborador),
      'onboardingProcess', v_onboarding
    );
  end if;

  if v_criar_onboarding then
    if v_template_id is null then
      raise exception using errcode = '22023', message = 'Template de onboarding e obrigatorio.';
    end if;

    select * into v_template
    from public.rh_templates
    where id = v_template_id
      and tipo_processo = 'onboarding'
      and ativo
      and arquivado_em is null
    for share;

    if not found then
      raise exception using errcode = '22023', message = 'Template de onboarding inexistente ou inativo.';
    end if;

    if not exists (select 1 from public.rh_template_etapas where template_id = v_template_id) then
      raise exception using errcode = '22023', message = 'Template de onboarding deve possuir pelo menos uma etapa.';
    end if;
  end if;

  if v_cpf is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_cpf, 0));

    select * into v_existente
    from public.colaboradores c
    where public.rh_cpf_normalizar(c.cpf) = v_cpf
    order by c.id
    limit 1
    for update;
  end if;

  if v_existente.id is not null and p_reutilizar_colaborador_id is null then
    return jsonb_build_object(
      'status', 'cpf_existente',
      'colaborador_existente', jsonb_build_object(
        'id', v_existente.id,
        'nome', v_existente.nome,
        'funcao', v_existente.funcao,
        'email', v_existente.email
      )
    );
  end if;

  if p_reutilizar_colaborador_id is not null
     and (v_existente.id is null or p_reutilizar_colaborador_id is distinct from v_existente.id) then
    raise exception using errcode = '22023', message = 'Cadastro confirmado nao corresponde ao CPF do candidato.';
  end if;

  if v_existente.id is not null then
    v_colaborador := v_existente;
  else
    insert into public.colaboradores (
      nome,
      nome_completo,
      tipo,
      tipo_contrato,
      departamento,
      funcao,
      salario_base,
      data_admissao,
      unidade_fixa,
      is_rateado,
      ativo,
      status,
      email,
      telefone,
      cpf
    ) values (
      trim(p_payload ->> 'nome'),
      trim(p_payload ->> 'nome'),
      p_payload ->> 'tipo',
      p_payload ->> 'tipo',
      p_payload ->> 'departamento',
      trim(p_payload ->> 'funcao'),
      coalesce((p_payload ->> 'salario_base')::numeric, 0),
      nullif(p_payload ->> 'data_admissao', '')::date,
      case when coalesce((p_payload ->> 'is_rateado')::boolean, false) then null else nullif(p_payload ->> 'unidade_fixa', '') end,
      coalesce((p_payload ->> 'is_rateado')::boolean, false),
      true,
      'active',
      nullif(trim(p_payload ->> 'email'), ''),
      nullif(trim(p_payload ->> 'telefone'), ''),
      nullif(trim(p_payload ->> 'cpf'), '')
    )
    returning * into v_colaborador;
  end if;

  update public.rh_candidatos
  set status = 'aprovado',
      aprovado_em = now(),
      colaborador_convertido_id = v_colaborador.id,
      updated_at = now()
  where id = v_candidato.id
  returning * into v_candidato;

  if v_criar_onboarding then
    v_processo_id := public.rh_onboarding_materializar(
      jsonb_build_object(
        'template_id', v_template_id,
        'candidato_id', v_candidato.id,
        'data_inicio', coalesce(nullif(p_payload ->> 'onboardingDataInicio', ''), current_date::text),
        'data_fim_prevista', nullif(p_payload ->> 'onboardingDataFimPrevista', ''),
        'titulo', 'Onboarding - ' || v_colaborador.nome,
        'cargo', v_colaborador.funcao,
        'departamento', v_colaborador.departamento,
        'tipo_vinculo', coalesce(v_colaborador.tipo_contrato, v_colaborador.tipo),
        'unidade', v_colaborador.unidade_fixa,
        'observacoes', nullif(p_payload ->> 'onboardingObservacoes', ''),
        'metadata_json', jsonb_build_object('origem', 'candidate_approval', 'candidate_id', v_candidato.id)
      ),
      v_colaborador.id,
      v_user_id
    );

    select to_jsonb(p) into v_onboarding
    from public.rh_processos p
    where p.id = v_processo_id;
  end if;

  for v_recrutamento in
    update public.rh_processos
       set status = 'concluido',
           data_fim_real = coalesce(data_fim_real, current_date),
           updated_at = now()
     where tipo = 'recrutamento'
       and candidato_id = v_candidato.id
       and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao')
     returning id
  loop
    insert into public.rh_historico_eventos (
      processo_id,
      entidade_tipo,
      entidade_id,
      acao,
      comentario,
      actor_user_id
    ) values (
      v_recrutamento.id,
      'rh_processos',
      v_recrutamento.id,
      'candidato_aprovado',
      'Candidato aprovado e convertido em colaborador.',
      v_user_id
    );

    update public.tarefas
       set status = 'concluida',
           data_conclusao = coalesce(data_conclusao, now()),
           updated_at = now()
     where vinculo_tipo = 'rh_processo'
       and vinculo_id = v_recrutamento.id
       and status <> 'concluida';

    update public.tarefas
       set status = 'concluida',
           data_conclusao = coalesce(data_conclusao, now()),
           updated_at = now()
     where vinculo_tipo = 'rh_etapa'
       and vinculo_id in (
         select e.id
         from public.rh_processo_etapas e
         where e.processo_id = v_recrutamento.id
       )
       and status <> 'concluida';
  end loop;

  return jsonb_build_object(
    'status', 'aprovado',
    'candidate', to_jsonb(v_candidato),
    'collaborator', to_jsonb(v_colaborador),
    'onboardingProcess', v_onboarding
  );
end;
$$;

create or replace function public.rh_onboarding_excluir_definitivo(
  p_processo_id uuid,
  p_confirmacao_titulo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_processo public.rh_processos%rowtype;
  v_etapas uuid[];
  v_tarefas_etapas integer := 0;
  v_tarefas_processo integer := 0;
begin
  if auth.uid() is null or not public.rh_is_admin_or_rh() then
    raise exception using errcode = '42501', message = 'Sem permissao para excluir onboarding.';
  end if;

  select * into v_processo
  from public.rh_processos
  where id = p_processo_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Onboarding nao encontrado.';
  end if;

  if v_processo.tipo <> 'onboarding' then
    raise exception using errcode = '22023', message = 'Somente onboarding pode ser excluido por esta operacao.';
  end if;

  if v_processo.status = 'concluido' then
    raise exception using errcode = '22023', message = 'Onboarding concluido exige manutencao administrativa.';
  end if;

  if trim(coalesce(p_confirmacao_titulo, '')) <> v_processo.titulo then
    raise exception using errcode = '22023', message = 'Titulo de confirmacao divergente.';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_etapas
  from public.rh_processo_etapas
  where processo_id = p_processo_id;

  delete from public.tarefas
  where vinculo_tipo = 'rh_etapa'
    and vinculo_id = any(v_etapas);
  get diagnostics v_tarefas_etapas = row_count;

  delete from public.tarefas
  where vinculo_tipo = 'rh_processo'
    and vinculo_id = p_processo_id;
  get diagnostics v_tarefas_processo = row_count;

  delete from public.rh_processos
  where id = p_processo_id;

  return jsonb_build_object(
    'processo_id', p_processo_id,
    'titulo', v_processo.titulo,
    'etapas', cardinality(v_etapas),
    'tarefas_removidas', v_tarefas_etapas + v_tarefas_processo
  );
end;
$$;

revoke all on function public.rh_onboarding_materializar(jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.rh_onboarding_criar(jsonb) from public, anon;
revoke all on function public.rh_candidato_aprovar(jsonb, integer) from public, anon;
revoke all on function public.rh_onboarding_excluir_definitivo(uuid, text) from public, anon;

grant execute on function public.rh_onboarding_criar(jsonb) to authenticated, service_role;
grant execute on function public.rh_candidato_aprovar(jsonb, integer) to authenticated, service_role;
grant execute on function public.rh_onboarding_excluir_definitivo(uuid, text) to authenticated, service_role;

comment on function public.rh_onboarding_criar(jsonb)
  is 'Cria onboarding completo de forma atomica a partir de template elegivel.';
comment on function public.rh_candidato_aprovar(jsonb, integer)
  is 'Aprova candidato, reutiliza colaborador confirmado por CPF e cria onboarding opcional na mesma transacao.';
comment on function public.rh_onboarding_excluir_definitivo(uuid, text)
  is 'Exclui onboarding nao concluido e seus espelhos da Agenda mediante confirmacao textual.';
