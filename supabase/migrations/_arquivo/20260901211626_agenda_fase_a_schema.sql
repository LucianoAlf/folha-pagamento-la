-- Agenda fase A (item 3 + 4): pacote pai/filha, responsavel, membros da lista, guardas.
-- Spec: Docs/superpowers/specs/2026-09-01-agenda-rotinas-maria-design.md §4.1, §4.3, §4.4, §4.7, §4.8.

alter table public.tarefas
  add column if not exists parent_id uuid null references public.tarefas(id) on delete set null,
  add column if not exists responsavel_id uuid null references public.user_profiles(id),
  add column if not exists concluida_por uuid null references public.user_profiles(id),
  add column if not exists mensagem_origem_id text null;

create index if not exists idx_tarefas_parent on public.tarefas (parent_id);
create index if not exists idx_tarefas_responsavel on public.tarefas (responsavel_id);
create index if not exists idx_tarefas_mensagem_origem on public.tarefas (mensagem_origem_id);

-- 1 espelho por vinculo. Nao-parcial: NULL e distinto, e ON CONFLICT (cols) so infere nao-parcial.
-- Verificado em 01/09: 0 duplicatas em (vinculo_tipo, vinculo_id) — entra sem limpeza.
create unique index if not exists tarefas_vinculo_uniq on public.tarefas (vinculo_tipo, vinculo_id);

-- A lista e o grupo (A1): serve lembrete (responsavel nulo = membros) e autorizacao (fase B).
create table if not exists public.tarefas_listas_membros (
  lista_id uuid not null references public.tarefas_listas(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lista_id, user_id)
);
alter table public.tarefas_listas_membros enable row level security;
-- Fonte de autorizacao da Maria (porta fina, fase B): leitura livre pra logados, escrita so admin.
-- Com `for all authenticated`, qualquer logado se adicionaria a qualquer lista e passaria a opera-la.
-- financeiro_cartoes_is_admin() e a checagem de admin da casa (user_profiles.role = 'admin').
drop policy if exists auth_listas_membros on public.tarefas_listas_membros;
drop policy if exists listas_membros_select on public.tarefas_listas_membros;
drop policy if exists listas_membros_insert_admin on public.tarefas_listas_membros;
drop policy if exists listas_membros_update_admin on public.tarefas_listas_membros;
drop policy if exists listas_membros_delete_admin on public.tarefas_listas_membros;
create policy listas_membros_select on public.tarefas_listas_membros
  for select using ((select auth.role()) = 'authenticated');
create policy listas_membros_insert_admin on public.tarefas_listas_membros
  for insert with check (public.financeiro_cartoes_is_admin());
create policy listas_membros_update_admin on public.tarefas_listas_membros
  for update using (public.financeiro_cartoes_is_admin()) with check (public.financeiro_cartoes_is_admin());
create policy listas_membros_delete_admin on public.tarefas_listas_membros
  for delete using (public.financeiro_cartoes_is_admin());

-- Ator da Maria -> usuario do app (autorizacao por lista na fase B).
alter table public.maria_whatsapp_atores add column if not exists user_id uuid null references public.user_profiles(id);
create unique index if not exists maria_whatsapp_atores_user_id_uniq on public.maria_whatsapp_atores (user_id);

-- Guarda 1: profundidade maxima 1 (vale pro app e pras RPCs — tarefas tem dois escritores).
create or replace function public.tarefas_guard_parent()
returns trigger language plpgsql set search_path = public as $$
declare v_pai_parent uuid;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'tarefa nao pode ser pai de si mesma.' using errcode = 'P0001';
  end if;
  select parent_id into v_pai_parent from public.tarefas where id = new.parent_id;
  if not found then
    raise exception 'pai nao encontrado.' using errcode = 'P0001';
  end if;
  if v_pai_parent is not null then
    raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tarefas where parent_id = new.id) then
    raise exception 'profundidade maxima 1: tarefa com filhas nao pode virar filha.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_guard_parent on public.tarefas;
create trigger tarefas_guard_parent before insert or update of parent_id on public.tarefas
  for each row execute function public.tarefas_guard_parent();

-- Guarda 2: pai com filha ativa nao se apaga (on delete set null e so rede de seguranca).
create or replace function public.tarefas_guard_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.tarefas
     where parent_id = old.id and status in ('pendente', 'em_andamento', 'adiada')
  ) then
    raise exception 'pai com filha ativa nao pode ser excluido.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists tarefas_guard_delete on public.tarefas;
create trigger tarefas_guard_delete before delete on public.tarefas
  for each row execute function public.tarefas_guard_delete();

-- Seed: listas Financeiro/RH (por nome, criadas se faltarem), membros, atores -> user_id.
-- Mapa ator -> user_id verificado pelo chat da Maria em 01/09 (nao casado por nome).
do $seed$
declare v_fin uuid; v_rh uuid;
begin
  select id into v_fin from public.tarefas_listas
   where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_fin is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('Financeiro', '#8b5cf6', '💰', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_fin;
  end if;

  select id into v_rh from public.tarefas_listas
   where lower(nome) = 'rh' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_rh is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('RH', '#a78bfa', '👩‍💼', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_rh;
  end if;

  insert into public.tarefas_listas_membros (lista_id, user_id) values
    (v_fin, 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'),   -- Rose
    (v_fin, '81305959-dc68-4f8e-b54f-dd055dabcfd4'),   -- Ana
    (v_rh,  '81305959-dc68-4f8e-b54f-dd055dabcfd4')    -- Ana
  on conflict do nothing;

  update public.maria_whatsapp_atores set user_id = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4'
   where id = 'c67a8e42-05cf-499b-a249-a34d29c6479f' and user_id is null;   -- Rose
  update public.maria_whatsapp_atores set user_id = '81305959-dc68-4f8e-b54f-dd055dabcfd4'
   where id = '316f156b-3be7-4c44-af16-259f0db7adc3' and user_id is null;   -- Ana
  update public.maria_whatsapp_atores set user_id = '41351a8b-68bf-48d5-a5d1-69c1a2848f5d'
   where id = 'b7f8dbda-1d4c-484e-859c-c33c8cfb2b29' and user_id is null;   -- Luciano Alf
end $seed$;
