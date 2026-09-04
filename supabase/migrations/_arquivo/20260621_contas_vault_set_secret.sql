-- C3: RPC set_vault_secret (service_role only — usado pela Edge contas-credencial-vault)
create or replace function public.set_vault_secret(secret_name text, secret_value text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  if secret_name is null or trim(secret_name) = '' then
    raise exception 'secret_name is required';
  end if;
  if secret_value is null or secret_value = '' then
    raise exception 'secret_value is required';
  end if;

  select id into existing_id
  from vault.secrets
  where name = secret_name
  limit 1;

  if existing_id is not null then
    perform vault.update_secret(existing_id, secret_value, secret_name);
    return existing_id;
  end if;

  select vault.create_secret(secret_value, secret_name) into new_id;
  return new_id;
end;
$$;

revoke all on function public.set_vault_secret(text, text) from public;
revoke all on function public.set_vault_secret(text, text) from anon;
revoke all on function public.set_vault_secret(text, text) from authenticated;

grant execute on function public.set_vault_secret(text, text) to service_role;
