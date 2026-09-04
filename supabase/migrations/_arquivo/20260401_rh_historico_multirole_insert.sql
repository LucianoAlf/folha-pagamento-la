drop policy if exists "rh_historico_insert_admin_rh" on public.rh_historico_eventos;
drop policy if exists "rh_historico_insert_visible" on public.rh_historico_eventos;

create policy "rh_historico_insert_visible"
  on public.rh_historico_eventos
  for insert
  to authenticated
  with check (public.rh_can_view_process(processo_id));
