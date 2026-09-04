begin;

create table if not exists public.rh_pdi_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text null,
  ativo boolean not null default true,
  escopo_cargo text null,
  escopo_departamento text null,
  escopo_unidade text null,
  ciclo_tipo text null,
  versao int not null default 1,
  arquivado_em timestamptz null,
  arquivado_por uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_template_competencias (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rh_pdi_templates(id) on delete cascade,
  nome text not null,
  categoria text not null,
  nivel_alvo int not null default 3,
  ordem int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_template_objetivos (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rh_pdi_templates(id) on delete cascade,
  competencia_template_id uuid null references public.rh_pdi_template_competencias(id) on delete set null,
  titulo text not null,
  descricao text null,
  tipo text not null,
  obrigatorio boolean not null default true,
  score_peso numeric(8,2) not null default 10,
  ordem int not null,
  prazo_offset_dias int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_template_checkpoints (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rh_pdi_templates(id) on delete cascade,
  objetivo_template_id uuid null references public.rh_pdi_template_objetivos(id) on delete set null,
  titulo text not null,
  tipo text not null,
  ordem int not null,
  prazo_offset_dias int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_rh_pdi_template_competencias_ordem
  on public.rh_pdi_template_competencias (template_id, ordem);

create unique index if not exists uq_rh_pdi_template_objetivos_ordem
  on public.rh_pdi_template_objetivos (template_id, ordem);

create unique index if not exists uq_rh_pdi_template_checkpoints_ordem
  on public.rh_pdi_template_checkpoints (template_id, ordem);

create index if not exists idx_rh_pdi_templates_escopo_cargo
  on public.rh_pdi_templates (escopo_cargo, ativo);

drop trigger if exists trg_rh_pdi_templates_set_updated_at on public.rh_pdi_templates;
create trigger trg_rh_pdi_templates_set_updated_at
before update on public.rh_pdi_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_template_competencias_set_updated_at on public.rh_pdi_template_competencias;
create trigger trg_rh_pdi_template_competencias_set_updated_at
before update on public.rh_pdi_template_competencias
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_template_objetivos_set_updated_at on public.rh_pdi_template_objetivos;
create trigger trg_rh_pdi_template_objetivos_set_updated_at
before update on public.rh_pdi_template_objetivos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_template_checkpoints_set_updated_at on public.rh_pdi_template_checkpoints;
create trigger trg_rh_pdi_template_checkpoints_set_updated_at
before update on public.rh_pdi_template_checkpoints
for each row execute function public.set_updated_at();

alter table if exists public.rh_pdi_templates enable row level security;
alter table if exists public.rh_pdi_template_competencias enable row level security;
alter table if exists public.rh_pdi_template_objetivos enable row level security;
alter table if exists public.rh_pdi_template_checkpoints enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_templates' and policyname='rh_pdi_templates_select_visible') then
    create policy "rh_pdi_templates_select_visible" on public.rh_pdi_templates
      for select using (public.rh_is_admin_or_rh() or auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_templates' and policyname='rh_pdi_templates_manage_admin_rh') then
    create policy "rh_pdi_templates_manage_admin_rh" on public.rh_pdi_templates
      for all using (public.rh_is_admin_or_rh()) with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_competencias' and policyname='rh_pdi_template_competencias_select_visible') then
    create policy "rh_pdi_template_competencias_select_visible" on public.rh_pdi_template_competencias
      for select using (public.rh_is_admin_or_rh() or auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_competencias' and policyname='rh_pdi_template_competencias_manage_admin_rh') then
    create policy "rh_pdi_template_competencias_manage_admin_rh" on public.rh_pdi_template_competencias
      for all using (public.rh_is_admin_or_rh()) with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_objetivos' and policyname='rh_pdi_template_objetivos_select_visible') then
    create policy "rh_pdi_template_objetivos_select_visible" on public.rh_pdi_template_objetivos
      for select using (public.rh_is_admin_or_rh() or auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_objetivos' and policyname='rh_pdi_template_objetivos_manage_admin_rh') then
    create policy "rh_pdi_template_objetivos_manage_admin_rh" on public.rh_pdi_template_objetivos
      for all using (public.rh_is_admin_or_rh()) with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_checkpoints' and policyname='rh_pdi_template_checkpoints_select_visible') then
    create policy "rh_pdi_template_checkpoints_select_visible" on public.rh_pdi_template_checkpoints
      for select using (public.rh_is_admin_or_rh() or auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_template_checkpoints' and policyname='rh_pdi_template_checkpoints_manage_admin_rh') then
    create policy "rh_pdi_template_checkpoints_manage_admin_rh" on public.rh_pdi_template_checkpoints
      for all using (public.rh_is_admin_or_rh()) with check (public.rh_is_admin_or_rh());
  end if;
end $$;

with inserted as (
  insert into public.rh_pdi_templates (nome, descricao, ativo, escopo_cargo, ciclo_tipo, versao)
  select 'PDI Professor Base', 'Trilha base para professores com foco em didática, cultura e evolução pedagógica.', true, 'Professor', 'trimestral', 1
  where not exists (
    select 1 from public.rh_pdi_templates
    where nome = 'PDI Professor Base' and coalesce(escopo_cargo, '') = 'Professor'
  )
  returning id
)
insert into public.rh_pdi_template_competencias (template_id, nome, categoria, nivel_alvo, ordem)
select inserted.id, v.nome, v.categoria, v.nivel_alvo, v.ordem
from inserted
cross join (
  values
    ('Didática em sala', 'tecnica', 4, 1),
    ('Cultura LA', 'cultura', 4, 2),
    ('Comunicação com famílias', 'comportamental', 4, 3)
) as v(nome, categoria, nivel_alvo, ordem);

with template_row as (
  select id from public.rh_pdi_templates where nome = 'PDI Professor Base' and coalesce(escopo_cargo, '') = 'Professor' limit 1
)
insert into public.rh_pdi_template_objetivos (template_id, titulo, descricao, tipo, obrigatorio, score_peso, ordem, prazo_offset_dias)
select template_row.id, v.titulo, v.descricao, v.tipo, v.obrigatorio, v.score_peso, v.ordem, v.prazo_offset_dias
from template_row
cross join (
  values
    ('Concluir trilha didática inicial', 'Participar das formações e consolidar boas práticas em aula.', 'treinamento', true, 25, 1, 30),
    ('Executar projeto prático com feedback', 'Aplicar uma aula-modelo com devolutiva do mentor.', 'projeto', true, 35, 2, 60),
    ('Elevar satisfação e rotina pedagógica', 'Consolidar rotinas, cultura e comunicação.', 'resultado', true, 40, 3, 90)
) as v(titulo, descricao, tipo, obrigatorio, score_peso, ordem, prazo_offset_dias)
where not exists (
  select 1 from public.rh_pdi_template_objetivos o
  where o.template_id = template_row.id
);

with template_row as (
  select id from public.rh_pdi_templates where nome = 'PDI Professor Base' and coalesce(escopo_cargo, '') = 'Professor' limit 1
)
insert into public.rh_pdi_template_checkpoints (template_id, titulo, tipo, ordem, prazo_offset_dias)
select template_row.id, v.titulo, v.tipo, v.ordem, v.prazo_offset_dias
from template_row
cross join (
  values
    ('Checkpoint 30 dias', '30d', 1, 30),
    ('Checkpoint 60 dias', '60d', 2, 60),
    ('Checkpoint 90 dias', '90d', 3, 90)
) as v(titulo, tipo, ordem, prazo_offset_dias)
where not exists (
  select 1 from public.rh_pdi_template_checkpoints c
  where c.template_id = template_row.id
);

commit;
