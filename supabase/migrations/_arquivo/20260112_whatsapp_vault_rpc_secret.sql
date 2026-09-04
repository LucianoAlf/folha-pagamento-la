-- Expor Vault para Edge Functions via RPC em public
-- Motivo: o schema `vault` não é exposto via PostgREST por padrão, então Edge Functions
-- não conseguem ler `vault.decrypted_secrets` diretamente.

create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke all on function public.get_vault_secret(text) from public;
revoke all on function public.get_vault_secret(text) from anon;
revoke all on function public.get_vault_secret(text) from authenticated;

-- service_role (Edge Functions admin client) pode executar
grant execute on function public.get_vault_secret(text) to service_role;

