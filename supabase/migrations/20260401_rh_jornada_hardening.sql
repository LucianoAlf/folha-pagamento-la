create or replace function public.rh_can_manage_process(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_processos p
    where p.id = p_processo_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
        or exists (
          select 1
          from public.rh_processo_participantes pp
          where pp.processo_id = p.id
            and pp.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.rh_processo_etapas pe
          join public.rh_etapa_responsaveis er on er.etapa_id = pe.id
          where pe.processo_id = p.id
            and er.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.rh_can_manage_process_participants(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_processos p
    where p.id = p_processo_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
      )
  );
$$;

create or replace function public.rh_can_manage_stage(p_etapa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_processo_etapas pe
    join public.rh_processos p on p.id = pe.processo_id
    where pe.id = p_etapa_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
        or exists (
          select 1
          from public.rh_etapa_responsaveis er
          where er.etapa_id = pe.id
            and er.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.rh_processo_participantes pp
          where pp.processo_id = p.id
            and pp.user_id = auth.uid()
            and pp.papel in ('rh', 'gestor', 'mentor')
        )
      )
  );
$$;

create or replace function public.rh_can_manage_checklist(p_etapa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rh_can_manage_stage(p_etapa_id);
$$;

create or replace function public.rh_can_manage_evaluation(
  p_processo_id uuid,
  p_etapa_id uuid,
  p_avaliador_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_processos p
    where p.id = p_processo_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
        or exists (
          select 1
          from public.rh_processo_participantes pp
          where pp.processo_id = p.id
            and pp.user_id = auth.uid()
            and pp.papel in ('rh', 'gestor', 'mentor', 'avaliador')
        )
        or (
          p_etapa_id is not null
          and exists (
            select 1
            from public.rh_etapa_responsaveis er
            where er.etapa_id = p_etapa_id
              and er.user_id = auth.uid()
          )
        )
        or (
          coalesce(p_avaliador_user_id, auth.uid()) = auth.uid()
          and exists (
            select 1
            from public.rh_processo_participantes pp
            where pp.processo_id = p.id
              and pp.user_id = auth.uid()
              and pp.papel = 'avaliador'
          )
        )
      )
  );
$$;

create or replace function public.rh_can_manage_document(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_processos p
    where p.id = p_processo_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
        or exists (
          select 1
          from public.rh_processo_participantes pp
          where pp.processo_id = p.id
            and pp.user_id = auth.uid()
            and pp.papel in ('rh', 'gestor', 'mentor', 'financeiro')
        )
      )
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processos' and policyname = 'rh_processos_update_operacionais'
  ) then
    create policy "rh_processos_update_operacionais"
      on public.rh_processos
      for update
      to authenticated
      using (public.rh_can_manage_process(id))
      with check (public.rh_can_manage_process(id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_participantes' and policyname = 'rh_processo_participantes_insert_operacionais'
  ) then
    create policy "rh_processo_participantes_insert_operacionais"
      on public.rh_processo_participantes
      for insert
      to authenticated
      with check (public.rh_can_manage_process_participants(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_participantes' and policyname = 'rh_processo_participantes_update_operacionais'
  ) then
    create policy "rh_processo_participantes_update_operacionais"
      on public.rh_processo_participantes
      for update
      to authenticated
      using (public.rh_can_manage_process_participants(processo_id))
      with check (public.rh_can_manage_process_participants(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_participantes' and policyname = 'rh_processo_participantes_delete_operacionais'
  ) then
    create policy "rh_processo_participantes_delete_operacionais"
      on public.rh_processo_participantes
      for delete
      to authenticated
      using (public.rh_can_manage_process_participants(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_etapas' and policyname = 'rh_processo_etapas_update_operacionais'
  ) then
    create policy "rh_processo_etapas_update_operacionais"
      on public.rh_processo_etapas
      for update
      to authenticated
      using (public.rh_can_manage_stage(id))
      with check (public.rh_can_manage_stage(id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_etapa_responsaveis' and policyname = 'rh_etapa_responsaveis_insert_operacionais'
  ) then
    create policy "rh_etapa_responsaveis_insert_operacionais"
      on public.rh_etapa_responsaveis
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.rh_processo_etapas pe
          where pe.id = etapa_id
            and public.rh_can_manage_process_participants(pe.processo_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_etapa_responsaveis' and policyname = 'rh_etapa_responsaveis_delete_operacionais'
  ) then
    create policy "rh_etapa_responsaveis_delete_operacionais"
      on public.rh_etapa_responsaveis
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.rh_processo_etapas pe
          where pe.id = etapa_id
            and public.rh_can_manage_process_participants(pe.processo_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_checklist_itens' and policyname = 'rh_checklist_insert_operacionais'
  ) then
    create policy "rh_checklist_insert_operacionais"
      on public.rh_checklist_itens
      for insert
      to authenticated
      with check (public.rh_can_manage_checklist(etapa_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_checklist_itens' and policyname = 'rh_checklist_update_operacionais'
  ) then
    create policy "rh_checklist_update_operacionais"
      on public.rh_checklist_itens
      for update
      to authenticated
      using (public.rh_can_manage_checklist(etapa_id))
      with check (public.rh_can_manage_checklist(etapa_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_checklist_itens' and policyname = 'rh_checklist_delete_operacionais'
  ) then
    create policy "rh_checklist_delete_operacionais"
      on public.rh_checklist_itens
      for delete
      to authenticated
      using (public.rh_can_manage_checklist(etapa_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_avaliacoes' and policyname = 'rh_avaliacoes_insert_operacionais'
  ) then
    create policy "rh_avaliacoes_insert_operacionais"
      on public.rh_avaliacoes
      for insert
      to authenticated
      with check (public.rh_can_manage_evaluation(processo_id, etapa_id, avaliador_user_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_avaliacoes' and policyname = 'rh_avaliacoes_update_operacionais'
  ) then
    create policy "rh_avaliacoes_update_operacionais"
      on public.rh_avaliacoes
      for update
      to authenticated
      using (public.rh_can_manage_evaluation(processo_id, etapa_id, avaliador_user_id))
      with check (public.rh_can_manage_evaluation(processo_id, etapa_id, avaliador_user_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_documentos' and policyname = 'rh_documentos_update_operacionais'
  ) then
    create policy "rh_documentos_update_operacionais"
      on public.rh_documentos
      for update
      to authenticated
      using (public.rh_can_manage_document(processo_id))
      with check (public.rh_can_manage_document(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_historico_eventos' and policyname = 'rh_historico_insert_operacional'
  ) then
    create policy "rh_historico_insert_operacional"
      on public.rh_historico_eventos
      for insert
      to authenticated
      with check (
        actor_user_id = auth.uid()
        and public.rh_can_manage_process(processo_id)
      );
  end if;
end $$;

with checklist_seed as (
  select *
  from (
    values
      ('Recrutamento Padrão', 'questionario', 1, 'Confirmar recebimento do questionário inicial', true),
      ('Recrutamento Padrão', 'questionario', 2, 'Registrar resumo com pontos de atenção', true),
      ('Recrutamento Padrão', 'entrevista', 1, 'Agendar entrevista com RH', true),
      ('Recrutamento Padrão', 'entrevista', 2, 'Registrar avaliação da entrevista', true),
      ('Recrutamento Padrão', 'aula_teste', 1, 'Agendar aula teste com avaliador', true),
      ('Recrutamento Padrão', 'aula_teste', 2, 'Consolidar parecer do avaliador', true),
      ('Recrutamento Padrão', 'decisao', 1, 'Consolidar decisão final do pipeline', true),
      ('Recrutamento Padrão', 'decisao', 2, 'Comunicar aprovação ou reprovação', true),

      ('Onboarding Padrão', 'entrevista', 1, 'Registrar entrevista de entrada', true),
      ('Onboarding Padrão', 'boas_vindas_apresentacoes', 1, 'Apresentar time e rotina inicial', true),
      ('Onboarding Padrão', 'mensagem_boas_vindas_mentor', 1, 'Compartilhar mensagem e canais do mentor', true),
      ('Onboarding Padrão', 'documentacoes_formalidades_administrativas', 1, 'Conferir documentação admissional obrigatória', true),
      ('Onboarding Padrão', 'documentacoes_formalidades_administrativas', 2, 'Registrar aceite das formalidades administrativas', true),
      ('Onboarding Padrão', 'cultura_organizacional', 1, 'Apresentar cultura e combinados da escola', true),
      ('Onboarding Padrão', 'configuracao_ferramentas_acessos', 1, 'Criar e validar acessos às ferramentas', true),
      ('Onboarding Padrão', 'treinamento_funcional', 1, 'Executar treinamento funcional inicial', true),
      ('Onboarding Padrão', 'treinamentos_especificos', 1, 'Concluir treinamentos específicos da função', true),
      ('Onboarding Padrão', 'revisao_desempenho', 1, 'Registrar feedback de 30 dias', true),
      ('Onboarding Padrão', 'metas_planejamentos', 1, 'Definir metas e próximos marcos', true),
      ('Onboarding Padrão', 'celebracao_integracao', 1, 'Formalizar encerramento da integração', true),

      ('Desligamento Padrão', 'abertura_desligamento', 1, 'Registrar abertura formal do desligamento', true),
      ('Desligamento Padrão', 'motivo_saida', 1, 'Consolidar motivo e contexto da saída', true),
      ('Desligamento Padrão', 'aviso_previo', 1, 'Definir tipo e datas do aviso prévio', true),
      ('Desligamento Padrão', 'documento_aviso_previo', 1, 'Gerar documento oficial de aviso prévio', true),
      ('Desligamento Padrão', 'bloqueio_acessos', 1, 'Bloquear acessos e sistemas críticos', true),
      ('Desligamento Padrão', 'devolucao_materiais', 1, 'Confirmar devolução de materiais e equipamentos', true),
      ('Desligamento Padrão', 'checklist_documental', 1, 'Conferir checklist documental rescisório', true),
      ('Desligamento Padrão', 'rescisao', 1, 'Preparar documentos rescisórios', true),
      ('Desligamento Padrão', 'alinhamento_financeiro', 1, 'Validar pendências e acertos financeiros', true),
      ('Desligamento Padrão', 'entrevista_saida', 1, 'Registrar entrevista de saída', true),
      ('Desligamento Padrão', 'encerramento', 1, 'Encerrar jornada e atualizar status final', true)
  ) as x(template_name, stage_code, ordem, titulo, obrigatorio)
),
target_stages as (
  select
    te.id as template_etapa_id,
    t.nome as template_name,
    te.codigo as stage_code
  from public.rh_template_etapas te
  join public.rh_templates t on t.id = te.template_id
  where t.nome in ('Recrutamento Padrão', 'Onboarding Padrão', 'Desligamento Padrão')
)
insert into public.rh_template_checklist_itens (
  template_etapa_id,
  titulo,
  obrigatorio,
  ordem,
  metadata_json
)
select
  ts.template_etapa_id,
  cs.titulo,
  cs.obrigatorio,
  cs.ordem,
  jsonb_build_object('seed', '20260401_rh_jornada_hardening')
from checklist_seed cs
join target_stages ts
  on ts.template_name = cs.template_name
 and ts.stage_code = cs.stage_code
where not exists (
  select 1
  from public.rh_template_checklist_itens tci
  where tci.template_etapa_id = ts.template_etapa_id
    and tci.ordem = cs.ordem
);
