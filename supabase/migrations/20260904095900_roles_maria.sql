-- Roles que os GRANTs da baseline referenciam.
-- `supabase db dump` (schema) NAO dumpa roles: sem este arquivo, um banco reconstruido do zero
-- para no primeiro `GRANT ... TO maria_operacional` (descoberto rodando o rebuild, 04/09/2026).
-- Precisa vir ANTES da baseline — dai o timestamp 0959 contra o 1000 dela.
--
-- Sem senha de proposito: senha e segredo de ambiente. Num banco novo, definir fora do repo com
-- `alter role maria_operacional with password '...'` (o mesmo vale para maria_leitura).
-- NOINHERIT e o mesmo atributo da producao: o papel so age via `set role` explicito.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'maria_leitura') then
    create role maria_leitura with login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'maria_operacional') then
    create role maria_operacional with login noinherit;
  end if;
end $$;
