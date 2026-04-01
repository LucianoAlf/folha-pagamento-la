create or replace function public.rh_storage_process_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_match text;
begin
  v_match := substring(coalesce(p_name, '') from '^processos/([0-9a-fA-F-]{36})/');
  if v_match is null then
    return null;
  end if;
  return v_match::uuid;
exception
  when others then
    return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_select_process_visible'
  ) then
    create policy "rh_documentos_select_process_visible"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and (
          (
            public.rh_storage_process_id(name) is not null
            and public.rh_can_view_process(public.rh_storage_process_id(name))
          )
          or (
            name like 'candidatos/%'
            and public.rh_is_admin_or_rh()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_insert_process_manage'
  ) then
    create policy "rh_documentos_insert_process_manage"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'rh-documentos'
        and (
          (
            public.rh_storage_process_id(name) is not null
            and public.rh_can_manage_document(public.rh_storage_process_id(name))
          )
          or (
            name like 'candidatos/%'
            and public.rh_is_admin_or_rh()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_update_process_manage'
  ) then
    create policy "rh_documentos_update_process_manage"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and (
          (
            public.rh_storage_process_id(name) is not null
            and public.rh_can_manage_document(public.rh_storage_process_id(name))
          )
          or (
            name like 'candidatos/%'
            and public.rh_is_admin_or_rh()
          )
        )
      )
      with check (
        bucket_id = 'rh-documentos'
        and (
          (
            public.rh_storage_process_id(name) is not null
            and public.rh_can_manage_document(public.rh_storage_process_id(name))
          )
          or (
            name like 'candidatos/%'
            and public.rh_is_admin_or_rh()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rh_documentos_delete_process_manage'
  ) then
    create policy "rh_documentos_delete_process_manage"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'rh-documentos'
        and (
          (
            public.rh_storage_process_id(name) is not null
            and public.rh_can_manage_document(public.rh_storage_process_id(name))
          )
          or (
            name like 'candidatos/%'
            and public.rh_is_admin_or_rh()
          )
        )
      );
  end if;
end $$;
