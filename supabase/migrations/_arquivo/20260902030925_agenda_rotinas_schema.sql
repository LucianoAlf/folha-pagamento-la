-- Agenda fase B1 — molde de rotinas (spec §4.2), instancias (§4.1), registro de rodadas (§4.6).

-- ---------------------------------------------------------------- agenda_rotinas
create table if not exists public.agenda_rotinas (
  id uuid primary key default gen_random_uuid(),
  parent_rotina_id uuid null references public.agenda_rotinas(id) on delete restrict,   -- NULL = pai
  titulo text not null,
  descricao text null,
  lista_id uuid not null references public.tarefas_listas(id) on delete restrict,
  categoria text not null default 'geral',
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel_id uuid null references public.user_profiles(id),
  frequencia text not null default 'mensal' check (frequencia in ('mensal')),          -- semanal: so a coluna
  dia_mes smallint null check (dia_mes between 1 and 31),
  ultimo_dia boolean not null default false,
  se_cair_fim_de_semana text not null default 'manter'
    check (se_cair_fim_de_semana in ('manter','proximo_dia_util','dia_util_anterior')),
  hora time not null default '09:00',
  dia_inteiro boolean not null default true,
  status text not null default 'ativa' check (status in ('ativa','pausada','encerrada')),
  vigencia_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  encerrada_em timestamptz null,
  observacao text null,
  ordem integer not null default 0,
  mensagem_origem_id text null,
  created_by uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_rotinas_dia_check check (ultimo_dia or dia_mes is not null)
);

create index if not exists idx_agenda_rotinas_parent on public.agenda_rotinas (parent_rotina_id);
create index if not exists idx_agenda_rotinas_lista on public.agenda_rotinas (lista_id);
create index if not exists idx_agenda_rotinas_status on public.agenda_rotinas (status);
create index if not exists idx_agenda_rotinas_mensagem_origem on public.agenda_rotinas (mensagem_origem_id);

drop trigger if exists agenda_rotinas_updated on public.agenda_rotinas;
create trigger agenda_rotinas_updated before update on public.agenda_rotinas
  for each row execute function public.set_updated_at();

-- Guarda em trigger (a tabela tem dois escritores: RPCs da Maria e admin pelo app).
create or replace function public.agenda_rotinas_guard_parent()
returns trigger language plpgsql set search_path = public as $$
declare v_pai public.agenda_rotinas%rowtype;
begin
  if new.parent_rotina_id is null then return new; end if;
  if new.parent_rotina_id = new.id then
    raise exception 'rotina nao pode ser pai de si mesma.' using errcode = 'P0001';
  end if;
  select * into v_pai from public.agenda_rotinas where id = new.parent_rotina_id;
  if not found then
    raise exception 'rotina pai nao encontrada.' using errcode = 'P0001';
  end if;
  if v_pai.parent_rotina_id is not null then
    raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agenda_rotinas f where f.parent_rotina_id = new.id) then
    raise exception 'profundidade maxima 1: rotina com filhas nao pode virar filha.' using errcode = 'P0001';
  end if;
  if v_pai.lista_id <> new.lista_id then
    raise exception 'filha deve estar na mesma lista do pai.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists agenda_rotinas_guard_parent on public.agenda_rotinas;
create trigger agenda_rotinas_guard_parent before insert or update of parent_rotina_id, lista_id on public.agenda_rotinas
  for each row execute function public.agenda_rotinas_guard_parent();

alter table public.agenda_rotinas enable row level security;
drop policy if exists agenda_rotinas_select on public.agenda_rotinas;
drop policy if exists agenda_rotinas_insert_admin on public.agenda_rotinas;
drop policy if exists agenda_rotinas_update_admin on public.agenda_rotinas;
drop policy if exists agenda_rotinas_delete_admin on public.agenda_rotinas;
create policy agenda_rotinas_select on public.agenda_rotinas
  for select using ((select auth.role()) = 'authenticated');
create policy agenda_rotinas_insert_admin on public.agenda_rotinas
  for insert with check (public.financeiro_cartoes_is_admin());
create policy agenda_rotinas_update_admin on public.agenda_rotinas
  for update using (public.financeiro_cartoes_is_admin()) with check (public.financeiro_cartoes_is_admin());
create policy agenda_rotinas_delete_admin on public.agenda_rotinas
  for delete using (public.financeiro_cartoes_is_admin());

-- ---------------------------------------------------------------- tarefas: instancia -> molde
alter table public.tarefas
  add column if not exists rotina_id uuid null references public.agenda_rotinas(id) on delete restrict,
  add column if not exists competencia date null;          -- 1o dia do mes (SP)
alter table public.tarefas drop constraint if exists tarefas_rotina_competencia_check;
alter table public.tarefas add constraint tarefas_rotina_competencia_check
  check (rotina_id is null or competencia is not null);
-- A chave da recorrencia. Nao-parcial, sem status: cancelada ocupa a chave (licao de 29/08).
create unique index if not exists tarefas_rotina_competencia_uniq on public.tarefas (rotina_id, competencia);
create index if not exists idx_tarefas_competencia on public.tarefas (competencia);

-- ---------------------------------------------------------------- agenda_materializacoes
create table if not exists public.agenda_materializacoes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('cron','rpc','sync','manual')),
  competencia date null,
  executado_em timestamptz not null default now(),
  duracao_ms integer null,
  pais_criados integer not null default 0,
  filhas_criadas integer not null default 0,
  pulados integer not null default 0,
  criados integer not null default 0,
  atualizados integer not null default 0,
  removidos integer not null default 0,
  erros jsonb not null default '[]'::jsonb,
  detalhes jsonb not null default '{}'::jsonb
);
create index if not exists idx_agenda_materializacoes_exec on public.agenda_materializacoes (executado_em desc);
alter table public.agenda_materializacoes enable row level security;
drop policy if exists agenda_materializacoes_select_app on public.agenda_materializacoes;
drop policy if exists agenda_materializacoes_select_maria on public.agenda_materializacoes;
create policy agenda_materializacoes_select_app on public.agenda_materializacoes
  for select using ((select auth.role()) = 'authenticated');
create policy agenda_materializacoes_select_maria on public.agenda_materializacoes
  for select to maria_leitura, maria_operacional using (true);
-- Sem politica de escrita: so security definer / service_role escrevem.
grant select on public.agenda_materializacoes to maria_leitura, maria_operacional, service_role;
grant select on public.agenda_rotinas to maria_leitura, maria_operacional, service_role;
