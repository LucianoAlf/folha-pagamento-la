insert into storage.buckets (id, name, public)
values ('rh-documentos', 'rh-documentos', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_select_admin_rh'
  ) then
    create policy "rh_documentos_select_admin_rh"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and public.rh_is_admin_or_rh()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_insert_admin_rh'
  ) then
    create policy "rh_documentos_insert_admin_rh"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'rh-documentos'
        and public.rh_is_admin_or_rh()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_update_admin_rh'
  ) then
    create policy "rh_documentos_update_admin_rh"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and public.rh_is_admin_or_rh()
      )
      with check (
        bucket_id = 'rh-documentos'
        and public.rh_is_admin_or_rh()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_delete_admin_rh'
  ) then
    create policy "rh_documentos_delete_admin_rh"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and public.rh_is_admin_or_rh()
      );
  end if;
end $$;
