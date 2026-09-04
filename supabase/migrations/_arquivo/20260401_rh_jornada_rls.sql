create or replace function public.rh_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select up.role::text from public.user_profiles up where up.id = auth.uid()), 'user');
$$;

create or replace function public.rh_is_admin_or_rh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rh_current_role() in ('admin', 'rh');
$$;

create or replace function public.rh_can_view_process(p_processo_id uuid)
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

alter table if exists public.rh_templates enable row level security;
alter table if exists public.rh_candidatos enable row level security;
alter table if exists public.rh_processos enable row level security;
alter table if exists public.rh_processo_participantes enable row level security;
alter table if exists public.rh_template_etapas enable row level security;
alter table if exists public.rh_processo_etapas enable row level security;
alter table if exists public.rh_etapa_responsaveis enable row level security;
alter table if exists public.rh_template_checklist_itens enable row level security;
alter table if exists public.rh_checklist_itens enable row level security;
alter table if exists public.rh_template_documentos enable row level security;
alter table if exists public.rh_documentos enable row level security;
alter table if exists public.rh_documentos_gerados enable row level security;
alter table if exists public.rh_avaliacoes enable row level security;
alter table if exists public.rh_desligamentos enable row level security;
alter table if exists public.rh_processo_comentarios enable row level security;
alter table if exists public.rh_historico_eventos enable row level security;
alter table if exists public.rh_regras_alerta enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_templates' and policyname = 'rh_templates_select_visible'
  ) then
    create policy "rh_templates_select_visible"
      on public.rh_templates
      for select
      to authenticated
      using (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_templates' and policyname = 'rh_templates_manage_admin_rh'
  ) then
    create policy "rh_templates_manage_admin_rh"
      on public.rh_templates
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_candidatos' and policyname = 'rh_candidatos_manage_admin_rh'
  ) then
    create policy "rh_candidatos_manage_admin_rh"
      on public.rh_candidatos
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processos' and policyname = 'rh_processos_select_visible'
  ) then
    create policy "rh_processos_select_visible"
      on public.rh_processos
      for select
      to authenticated
      using (public.rh_can_view_process(id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processos' and policyname = 'rh_processos_manage_admin_rh'
  ) then
    create policy "rh_processos_manage_admin_rh"
      on public.rh_processos
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_participantes' and policyname = 'rh_processo_participantes_select_visible'
  ) then
    create policy "rh_processo_participantes_select_visible"
      on public.rh_processo_participantes
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_participantes' and policyname = 'rh_processo_participantes_manage_admin_rh'
  ) then
    create policy "rh_processo_participantes_manage_admin_rh"
      on public.rh_processo_participantes
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_etapas' and policyname = 'rh_template_etapas_select_visible'
  ) then
    create policy "rh_template_etapas_select_visible"
      on public.rh_template_etapas
      for select
      to authenticated
      using (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_etapas' and policyname = 'rh_template_etapas_manage_admin_rh'
  ) then
    create policy "rh_template_etapas_manage_admin_rh"
      on public.rh_template_etapas
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_etapas' and policyname = 'rh_processo_etapas_select_visible'
  ) then
    create policy "rh_processo_etapas_select_visible"
      on public.rh_processo_etapas
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_etapas' and policyname = 'rh_processo_etapas_manage_admin_rh'
  ) then
    create policy "rh_processo_etapas_manage_admin_rh"
      on public.rh_processo_etapas
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_etapa_responsaveis' and policyname = 'rh_etapa_responsaveis_select_visible'
  ) then
    create policy "rh_etapa_responsaveis_select_visible"
      on public.rh_etapa_responsaveis
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.rh_processo_etapas pe
          where pe.id = etapa_id
            and public.rh_can_view_process(pe.processo_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_etapa_responsaveis' and policyname = 'rh_etapa_responsaveis_manage_admin_rh'
  ) then
    create policy "rh_etapa_responsaveis_manage_admin_rh"
      on public.rh_etapa_responsaveis
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_checklist_itens' and policyname = 'rh_template_checklist_select_visible'
  ) then
    create policy "rh_template_checklist_select_visible"
      on public.rh_template_checklist_itens
      for select
      to authenticated
      using (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_checklist_itens' and policyname = 'rh_template_checklist_manage_admin_rh'
  ) then
    create policy "rh_template_checklist_manage_admin_rh"
      on public.rh_template_checklist_itens
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_checklist_itens' and policyname = 'rh_checklist_select_visible'
  ) then
    create policy "rh_checklist_select_visible"
      on public.rh_checklist_itens
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.rh_processo_etapas pe
          where pe.id = etapa_id
            and public.rh_can_view_process(pe.processo_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_checklist_itens' and policyname = 'rh_checklist_manage_admin_rh'
  ) then
    create policy "rh_checklist_manage_admin_rh"
      on public.rh_checklist_itens
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_documentos' and policyname = 'rh_template_documentos_select_visible'
  ) then
    create policy "rh_template_documentos_select_visible"
      on public.rh_template_documentos
      for select
      to authenticated
      using (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_template_documentos' and policyname = 'rh_template_documentos_manage_admin_rh'
  ) then
    create policy "rh_template_documentos_manage_admin_rh"
      on public.rh_template_documentos
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_documentos' and policyname = 'rh_documentos_select_visible'
  ) then
    create policy "rh_documentos_select_visible"
      on public.rh_documentos
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_documentos' and policyname = 'rh_documentos_manage_admin_rh'
  ) then
    create policy "rh_documentos_manage_admin_rh"
      on public.rh_documentos
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_documentos_gerados' and policyname = 'rh_documentos_gerados_select_visible'
  ) then
    create policy "rh_documentos_gerados_select_visible"
      on public.rh_documentos_gerados
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_documentos_gerados' and policyname = 'rh_documentos_gerados_manage_admin_rh'
  ) then
    create policy "rh_documentos_gerados_manage_admin_rh"
      on public.rh_documentos_gerados
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_avaliacoes' and policyname = 'rh_avaliacoes_select_visible'
  ) then
    create policy "rh_avaliacoes_select_visible"
      on public.rh_avaliacoes
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_avaliacoes' and policyname = 'rh_avaliacoes_manage_admin_rh'
  ) then
    create policy "rh_avaliacoes_manage_admin_rh"
      on public.rh_avaliacoes
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_desligamentos' and policyname = 'rh_desligamentos_select_visible'
  ) then
    create policy "rh_desligamentos_select_visible"
      on public.rh_desligamentos
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.rh_processos p
          where p.id = processo_id
            and public.rh_can_view_process(p.id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_desligamentos' and policyname = 'rh_desligamentos_manage_admin_rh'
  ) then
    create policy "rh_desligamentos_manage_admin_rh"
      on public.rh_desligamentos
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_comentarios' and policyname = 'rh_comentarios_select_visible'
  ) then
    create policy "rh_comentarios_select_visible"
      on public.rh_processo_comentarios
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_comentarios' and policyname = 'rh_comentarios_insert_visible'
  ) then
    create policy "rh_comentarios_insert_visible"
      on public.rh_processo_comentarios
      for insert
      to authenticated
      with check (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_processo_comentarios' and policyname = 'rh_comentarios_update_own_or_admin'
  ) then
    create policy "rh_comentarios_update_own_or_admin"
      on public.rh_processo_comentarios
      for update
      to authenticated
      using (autor_user_id = auth.uid() or public.rh_is_admin_or_rh())
      with check (autor_user_id = auth.uid() or public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_historico_eventos' and policyname = 'rh_historico_select_visible'
  ) then
    create policy "rh_historico_select_visible"
      on public.rh_historico_eventos
      for select
      to authenticated
      using (public.rh_can_view_process(processo_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_historico_eventos' and policyname = 'rh_historico_insert_admin_rh'
  ) then
    create policy "rh_historico_insert_admin_rh"
      on public.rh_historico_eventos
      for insert
      to authenticated
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_regras_alerta' and policyname = 'rh_regras_alerta_select_visible'
  ) then
    create policy "rh_regras_alerta_select_visible"
      on public.rh_regras_alerta
      for select
      to authenticated
      using (public.rh_is_admin_or_rh());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rh_regras_alerta' and policyname = 'rh_regras_alerta_manage_admin_rh'
  ) then
    create policy "rh_regras_alerta_manage_admin_rh"
      on public.rh_regras_alerta
      for all
      to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;
end $$;
