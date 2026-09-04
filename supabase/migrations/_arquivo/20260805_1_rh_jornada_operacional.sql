begin;

create or replace function public.user_profile_on_auth_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (id, nome, role, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuario'
    ),
    'user',
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.user_profile_on_auth_insert() from public, anon, authenticated;

drop trigger if exists user_profile_after_auth_insert on auth.users;
create trigger user_profile_after_auth_insert
after insert on auth.users
for each row execute function public.user_profile_on_auth_insert();

insert into public.user_profiles (id, nome, role, avatar_url)
select
  u.id,
  case
    when lower(u.email) = 'rh@lamusicschool.com.br' then 'Ana Paula'
    else coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Usuario'
    )
  end,
  case when lower(u.email) = 'rh@lamusicschool.com.br' then 'rh' else 'user' end,
  nullif(u.raw_user_meta_data ->> 'avatar_url', '')
from auth.users u
where not exists (
  select 1 from public.user_profiles up where up.id = u.id
);

update public.user_profiles up
set role = 'rh',
    nome = case when btrim(up.nome) in ('', 'rh') then 'Ana Paula' else up.nome end
from auth.users u
where u.id = up.id
  and lower(u.email) = 'rh@lamusicschool.com.br';

drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "RH can view operational profiles" on public.user_profiles;

create policy "Users can view own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "RH can view operational profiles"
on public.user_profiles
for select
to authenticated
using (public.rh_is_admin_or_rh());

revoke all on table public.user_profiles from anon, authenticated;
grant select on table public.user_profiles to authenticated;

create or replace function public.user_profile_self_update(
  p_nome text,
  p_avatar_url text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.user_profiles;
begin
  if v_user_id is null then
    raise exception 'Sessao autenticada obrigatoria.' using errcode = '42501';
  end if;

  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome obrigatorio.' using errcode = '22023';
  end if;

  insert into public.user_profiles (id, nome, role, avatar_url)
  values (v_user_id, btrim(p_nome), 'user', nullif(p_avatar_url, ''))
  on conflict (id) do update set
    nome = excluded.nome,
    avatar_url = excluded.avatar_url
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.user_profile_self_update(text, text) from public, anon;
grant execute on function public.user_profile_self_update(text, text) to authenticated;

commit;
