create or replace function public.rh_can_manage_process_access(p_processo_id uuid)
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
          where pp.processo_id = pe.processo_id
            and pp.user_id = auth.uid()
            and pp.papel in ('rh', 'gestor', 'mentor', 'financeiro')
        )
      )
  );
$$;

create or replace function public.rh_can_manage_evaluation_access(p_processo_id uuid)
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
        public.rh_can_manage_process_access(p.id)
        or exists (
          select 1
          from public.rh_processo_participantes pp
          where pp.processo_id = p.id
            and pp.user_id = auth.uid()
            and pp.papel = 'avaliador'
        )
      )
  );
$$;

create or replace function public.rh_can_view_colaborador(p_colaborador_id int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.rh_is_admin_or_rh()
    or exists (
      select 1
      from public.rh_colaborador_jornadas j
      where j.colaborador_id = p_colaborador_id
        and (j.gestor_user_id = auth.uid() or j.mentor_user_id = auth.uid())
    )
    or exists (
      select 1
      from public.rh_pdi_planos p
      where p.colaborador_id = p_colaborador_id
        and (
          p.owner_user_id = auth.uid()
          or p.gestor_user_id = auth.uid()
          or p.mentor_user_id = auth.uid()
        )
    );
$$;

drop policy if exists "rh_processo_participantes_manage_admin_rh" on public.rh_processo_participantes;
create policy "rh_processo_participantes_manage_allowed"
  on public.rh_processo_participantes
  for all
  to authenticated
  using (public.rh_can_manage_process_access(processo_id))
  with check (public.rh_can_manage_process_access(processo_id));

drop policy if exists "rh_etapa_responsaveis_manage_admin_rh" on public.rh_etapa_responsaveis;
create policy "rh_etapa_responsaveis_manage_allowed"
  on public.rh_etapa_responsaveis
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.rh_processo_etapas pe
      where pe.id = etapa_id
        and public.rh_can_manage_process_access(pe.processo_id)
    )
  )
  with check (
    exists (
      select 1
      from public.rh_processo_etapas pe
      where pe.id = etapa_id
        and public.rh_can_manage_process_access(pe.processo_id)
    )
  );

drop policy if exists "rh_processo_etapas_manage_admin_rh" on public.rh_processo_etapas;
drop policy if exists "rh_processo_etapas_manage_allowed" on public.rh_processo_etapas;
create policy "rh_processo_etapas_insert_allowed"
  on public.rh_processo_etapas
  for insert
  to authenticated
  with check (public.rh_can_manage_process_access(processo_id));

create policy "rh_processo_etapas_update_delete_allowed"
  on public.rh_processo_etapas
  for update
  to authenticated
  using (public.rh_can_manage_stage(id))
  with check (public.rh_can_manage_stage(id));

create policy "rh_processo_etapas_delete_allowed"
  on public.rh_processo_etapas
  for delete
  to authenticated
  using (public.rh_can_manage_stage(id));

drop policy if exists "rh_checklist_manage_admin_rh" on public.rh_checklist_itens;
create policy "rh_checklist_manage_allowed"
  on public.rh_checklist_itens
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.rh_processo_etapas pe
      where pe.id = etapa_id
        and public.rh_can_manage_stage(pe.id)
    )
  )
  with check (
    exists (
      select 1
      from public.rh_processo_etapas pe
      where pe.id = etapa_id
        and public.rh_can_manage_stage(pe.id)
    )
  );

drop policy if exists "rh_documentos_manage_admin_rh" on public.rh_documentos;
create policy "rh_documentos_manage_allowed"
  on public.rh_documentos
  for all
  to authenticated
  using (public.rh_can_manage_process_access(processo_id))
  with check (public.rh_can_manage_process_access(processo_id));

drop policy if exists "rh_avaliacoes_manage_admin_rh" on public.rh_avaliacoes;
create policy "rh_avaliacoes_manage_allowed"
  on public.rh_avaliacoes
  for all
  to authenticated
  using (public.rh_can_manage_evaluation_access(processo_id))
  with check (public.rh_can_manage_evaluation_access(processo_id));

drop policy if exists "rh_pdi_ciclos_select_visible" on public.rh_pdi_ciclos;
create policy "rh_pdi_ciclos_select_visible"
  on public.rh_pdi_ciclos
  for select
  to authenticated
  using (true);
