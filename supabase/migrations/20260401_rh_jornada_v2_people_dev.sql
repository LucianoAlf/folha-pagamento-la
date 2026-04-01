create table if not exists public.rh_colaborador_jornadas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  status text not null check (status in ('ativa', 'pausada', 'encerrada')),
  etapa_atual text not null check (etapa_atual in ('onboarding', 'adaptacao', 'performance', 'desenvolvimento', 'lideranca', 'transicao', 'desligamento')),
  gestor_user_id uuid null references public.user_profiles(id),
  mentor_user_id uuid null references public.user_profiles(id),
  nivel_carreira_id uuid null,
  data_inicio date not null default current_date,
  data_fim date null,
  proximo_checkpoint date null,
  score_jornada numeric not null default 0,
  badges_count int not null default 0,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_colaborador_documentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  jornada_id uuid null references public.rh_colaborador_jornadas(id) on delete set null,
  categoria text not null check (categoria in ('pessoal', 'contrato', 'aditivo', 'certificado', 'treinamento', 'avaliacao', 'advertencia', 'comprovante', 'outro')),
  titulo text not null,
  tipo_documento text not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'em_analise', 'conferido', 'rejeitado')),
  storage_path text null,
  nome_arquivo text null,
  mime_type text null,
  tamanho_bytes bigint null,
  observacao text null,
  enviado_em timestamptz null,
  conferido_em timestamptz null,
  conferido_por uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_colaborador_marcos (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.rh_colaborador_jornadas(id) on delete cascade,
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  tipo text not null check (tipo in ('onboarding_concluido', 'checkpoint', 'trilha_concluida', 'competencia_validada', 'promocao', 'mudanca_funcao', 'mudanca_unidade', 'reconhecimento')),
  titulo text not null,
  descricao text null,
  celebrado boolean not null default false,
  celebrado_em timestamptz null,
  referencia_tipo text null,
  referencia_id text null,
  created_by uuid null references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_badges (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text null,
  icon_key text null,
  categoria text not null check (categoria in ('cultura', 'treinamento', 'performance', 'lideranca', 'colaboracao', 'carreira')),
  cor text null,
  score_base int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_colaborador_conquistas (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.rh_colaborador_jornadas(id) on delete cascade,
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  badge_id uuid null references public.rh_pdi_badges(id) on delete set null,
  titulo text not null,
  descricao text null,
  score_impacto int not null default 0,
  concedida_por uuid null references public.user_profiles(id),
  concedida_em timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.rh_pdi_ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('trimestral', 'semestral', 'anual', 'personalizado')),
  data_inicio date not null,
  data_fim date not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_carreira_niveis (
  id uuid primary key default gen_random_uuid(),
  cargo_base text not null,
  nivel_codigo text not null,
  titulo text not null,
  descricao text null,
  ordem int not null,
  score_minimo int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rh_colaborador_jornadas
  add constraint rh_colaborador_jornadas_nivel_fk
  foreign key (nivel_carreira_id) references public.rh_carreira_niveis(id) on delete set null;

create table if not exists public.rh_pdi_planos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  jornada_id uuid null references public.rh_colaborador_jornadas(id) on delete set null,
  ciclo_id uuid null references public.rh_pdi_ciclos(id) on delete set null,
  template_nome text null,
  status text not null check (status in ('rascunho', 'em_andamento', 'em_revisao', 'concluido', 'congelado')),
  titulo text not null,
  objetivo_geral text null,
  owner_user_id uuid not null references public.user_profiles(id),
  gestor_user_id uuid null references public.user_profiles(id),
  mentor_user_id uuid null references public.user_profiles(id),
  score_progresso numeric not null default 0,
  data_inicio date not null,
  data_fim_prevista date null,
  data_conclusao date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_competencias (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_pdi_planos(id) on delete cascade,
  nome text not null,
  categoria text not null check (categoria in ('tecnica', 'comportamental', 'lideranca', 'cultura')),
  nivel_atual int not null default 0,
  nivel_alvo int not null default 1,
  status text not null default 'pendente' check (status in ('pendente', 'em_desenvolvimento', 'consolidada')),
  ordem int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_objetivos (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_pdi_planos(id) on delete cascade,
  competencia_id uuid null references public.rh_pdi_competencias(id) on delete set null,
  titulo text not null,
  descricao text null,
  tipo text not null check (tipo in ('tecnico', 'comportamental', 'treinamento', 'projeto', 'resultado')),
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'concluido', 'atrasado', 'cancelado')),
  obrigatorio boolean not null default true,
  score_peso int not null default 10,
  data_inicio date null,
  data_limite date null,
  concluido_em timestamptz null,
  ordem int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_checkpoints (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_pdi_planos(id) on delete cascade,
  objetivo_id uuid null references public.rh_pdi_objetivos(id) on delete set null,
  titulo text not null,
  tipo text not null check (tipo in ('7d', '30d', '60d', '90d', 'semestral', 'anual', 'custom')),
  status text not null default 'agendado' check (status in ('agendado', 'realizado', 'atrasado', 'cancelado')),
  responsavel_user_id uuid null references public.user_profiles(id),
  data_prevista date not null,
  data_realizada date null,
  celebracao_gerada boolean not null default false,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_evidencias (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_pdi_planos(id) on delete cascade,
  objetivo_id uuid null references public.rh_pdi_objetivos(id) on delete set null,
  checkpoint_id uuid null references public.rh_pdi_checkpoints(id) on delete set null,
  tipo text not null check (tipo in ('arquivo', 'link', 'texto')),
  titulo text not null,
  descricao text null,
  storage_path text null,
  link_url text null,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.rh_pdi_feedbacks (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_pdi_planos(id) on delete cascade,
  checkpoint_id uuid null references public.rh_pdi_checkpoints(id) on delete set null,
  tipo text not null check (tipo in ('gestor', 'mentor', 'autoavaliacao', 'rh', 'pares')),
  autor_user_id uuid null references public.user_profiles(id),
  resumo text not null,
  pontos_fortes text null,
  pontos_desenvolver text null,
  nota numeric null,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_carreira_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id int not null references public.colaboradores(id) on delete cascade,
  jornada_id uuid null references public.rh_colaborador_jornadas(id) on delete set null,
  nivel_origem_id uuid null references public.rh_carreira_niveis(id) on delete set null,
  nivel_destino_id uuid null references public.rh_carreira_niveis(id) on delete set null,
  titulo text not null,
  motivo text null,
  efetivado_em date not null,
  aprovado_por uuid null references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_rh_colaborador_jornada_ativa
  on public.rh_colaborador_jornadas (colaborador_id)
  where status in ('ativa', 'pausada');

create unique index if not exists uq_rh_pdi_plano_ativo_por_colaborador
  on public.rh_pdi_planos (colaborador_id)
  where status in ('rascunho', 'em_andamento', 'em_revisao');

create unique index if not exists uq_rh_carreira_niveis_cargo_ordem
  on public.rh_carreira_niveis (cargo_base, ordem);

create index if not exists idx_rh_colaborador_documentos_colaborador
  on public.rh_colaborador_documentos (colaborador_id, categoria, status);

create index if not exists idx_rh_colaborador_marcos_jornada
  on public.rh_colaborador_marcos (jornada_id, created_at desc);

create index if not exists idx_rh_colaborador_conquistas_jornada
  on public.rh_colaborador_conquistas (jornada_id, concedida_em desc);

create index if not exists idx_rh_pdi_planos_colaborador
  on public.rh_pdi_planos (colaborador_id, status);

create index if not exists idx_rh_pdi_objetivos_plano
  on public.rh_pdi_objetivos (plano_id, status, data_limite);

create index if not exists idx_rh_pdi_checkpoints_plano
  on public.rh_pdi_checkpoints (plano_id, status, data_prevista);

create index if not exists idx_rh_pdi_feedbacks_plano
  on public.rh_pdi_feedbacks (plano_id, created_at desc);

create index if not exists idx_rh_carreira_movimentacoes_colaborador
  on public.rh_carreira_movimentacoes (colaborador_id, efetivado_em desc);

drop trigger if exists trg_rh_colaborador_jornadas_set_updated_at on public.rh_colaborador_jornadas;
create trigger trg_rh_colaborador_jornadas_set_updated_at
before update on public.rh_colaborador_jornadas
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_colaborador_documentos_set_updated_at on public.rh_colaborador_documentos;
create trigger trg_rh_colaborador_documentos_set_updated_at
before update on public.rh_colaborador_documentos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_badges_set_updated_at on public.rh_pdi_badges;
create trigger trg_rh_pdi_badges_set_updated_at
before update on public.rh_pdi_badges
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_ciclos_set_updated_at on public.rh_pdi_ciclos;
create trigger trg_rh_pdi_ciclos_set_updated_at
before update on public.rh_pdi_ciclos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_carreira_niveis_set_updated_at on public.rh_carreira_niveis;
create trigger trg_rh_carreira_niveis_set_updated_at
before update on public.rh_carreira_niveis
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_planos_set_updated_at on public.rh_pdi_planos;
create trigger trg_rh_pdi_planos_set_updated_at
before update on public.rh_pdi_planos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_competencias_set_updated_at on public.rh_pdi_competencias;
create trigger trg_rh_pdi_competencias_set_updated_at
before update on public.rh_pdi_competencias
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_objetivos_set_updated_at on public.rh_pdi_objetivos;
create trigger trg_rh_pdi_objetivos_set_updated_at
before update on public.rh_pdi_objetivos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_pdi_checkpoints_set_updated_at on public.rh_pdi_checkpoints;
create trigger trg_rh_pdi_checkpoints_set_updated_at
before update on public.rh_pdi_checkpoints
for each row execute function public.set_updated_at();

create or replace function public.rh_can_view_colaborador(p_colaborador_id int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.rh_is_admin_or_rh()
    or exists (
      select 1
      from public.rh_processos p
      where p.colaborador_id = p_colaborador_id
        and public.rh_can_view_process(p.id)
    )
    or exists (
      select 1
      from public.rh_colaborador_jornadas j
      where j.colaborador_id = p_colaborador_id
        and (j.gestor_user_id = auth.uid() or j.mentor_user_id = auth.uid())
    );
$$;

create or replace function public.rh_can_manage_pdi(p_plano_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rh_pdi_planos p
    where p.id = p_plano_id
      and (
        public.rh_is_admin_or_rh()
        or p.owner_user_id = auth.uid()
        or p.gestor_user_id = auth.uid()
        or p.mentor_user_id = auth.uid()
      )
  );
$$;

alter table if exists public.rh_colaborador_jornadas enable row level security;
alter table if exists public.rh_colaborador_documentos enable row level security;
alter table if exists public.rh_colaborador_marcos enable row level security;
alter table if exists public.rh_colaborador_conquistas enable row level security;
alter table if exists public.rh_pdi_badges enable row level security;
alter table if exists public.rh_pdi_ciclos enable row level security;
alter table if exists public.rh_carreira_niveis enable row level security;
alter table if exists public.rh_pdi_planos enable row level security;
alter table if exists public.rh_pdi_competencias enable row level security;
alter table if exists public.rh_pdi_objetivos enable row level security;
alter table if exists public.rh_pdi_checkpoints enable row level security;
alter table if exists public.rh_pdi_evidencias enable row level security;
alter table if exists public.rh_pdi_feedbacks enable row level security;
alter table if exists public.rh_carreira_movimentacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_jornadas' and policyname='rh_colaborador_jornadas_select_visible') then
    create policy "rh_colaborador_jornadas_select_visible" on public.rh_colaborador_jornadas
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_jornadas' and policyname='rh_colaborador_jornadas_manage_admin_rh') then
    create policy "rh_colaborador_jornadas_manage_admin_rh" on public.rh_colaborador_jornadas
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_documentos' and policyname='rh_colaborador_documentos_select_visible') then
    create policy "rh_colaborador_documentos_select_visible" on public.rh_colaborador_documentos
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_documentos' and policyname='rh_colaborador_documentos_manage_admin_rh') then
    create policy "rh_colaborador_documentos_manage_admin_rh" on public.rh_colaborador_documentos
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_marcos' and policyname='rh_colaborador_marcos_select_visible') then
    create policy "rh_colaborador_marcos_select_visible" on public.rh_colaborador_marcos
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_marcos' and policyname='rh_colaborador_marcos_manage_admin_rh') then
    create policy "rh_colaborador_marcos_manage_admin_rh" on public.rh_colaborador_marcos
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_conquistas' and policyname='rh_colaborador_conquistas_select_visible') then
    create policy "rh_colaborador_conquistas_select_visible" on public.rh_colaborador_conquistas
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_colaborador_conquistas' and policyname='rh_colaborador_conquistas_manage_admin_rh') then
    create policy "rh_colaborador_conquistas_manage_admin_rh" on public.rh_colaborador_conquistas
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_badges' and policyname='rh_pdi_badges_select_visible') then
    create policy "rh_pdi_badges_select_visible" on public.rh_pdi_badges
      for select to authenticated
      using (public.rh_can_view_process((select id from public.rh_processos limit 1)) or public.rh_is_admin_or_rh() or true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_badges' and policyname='rh_pdi_badges_manage_admin_rh') then
    create policy "rh_pdi_badges_manage_admin_rh" on public.rh_pdi_badges
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_ciclos' and policyname='rh_pdi_ciclos_select_visible') then
    create policy "rh_pdi_ciclos_select_visible" on public.rh_pdi_ciclos
      for select to authenticated
      using (public.rh_is_admin_or_rh());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_ciclos' and policyname='rh_pdi_ciclos_manage_admin_rh') then
    create policy "rh_pdi_ciclos_manage_admin_rh" on public.rh_pdi_ciclos
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_carreira_niveis' and policyname='rh_carreira_niveis_select_visible') then
    create policy "rh_carreira_niveis_select_visible" on public.rh_carreira_niveis
      for select to authenticated
      using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_carreira_niveis' and policyname='rh_carreira_niveis_manage_admin_rh') then
    create policy "rh_carreira_niveis_manage_admin_rh" on public.rh_carreira_niveis
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_planos' and policyname='rh_pdi_planos_select_visible') then
    create policy "rh_pdi_planos_select_visible" on public.rh_pdi_planos
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_planos' and policyname='rh_pdi_planos_manage_allowed') then
    create policy "rh_pdi_planos_manage_allowed" on public.rh_pdi_planos
      for all to authenticated
      using (public.rh_is_admin_or_rh() or owner_user_id = auth.uid() or gestor_user_id = auth.uid() or mentor_user_id = auth.uid())
      with check (public.rh_is_admin_or_rh() or owner_user_id = auth.uid() or gestor_user_id = auth.uid() or mentor_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_competencias' and policyname='rh_pdi_competencias_select_visible') then
    create policy "rh_pdi_competencias_select_visible" on public.rh_pdi_competencias
      for select to authenticated
      using (public.rh_can_manage_pdi(plano_id) or exists (select 1 from public.rh_pdi_planos p where p.id = plano_id and public.rh_can_view_colaborador(p.colaborador_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_competencias' and policyname='rh_pdi_competencias_manage_allowed') then
    create policy "rh_pdi_competencias_manage_allowed" on public.rh_pdi_competencias
      for all to authenticated
      using (public.rh_can_manage_pdi(plano_id))
      with check (public.rh_can_manage_pdi(plano_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_objetivos' and policyname='rh_pdi_objetivos_select_visible') then
    create policy "rh_pdi_objetivos_select_visible" on public.rh_pdi_objetivos
      for select to authenticated
      using (public.rh_can_manage_pdi(plano_id) or exists (select 1 from public.rh_pdi_planos p where p.id = plano_id and public.rh_can_view_colaborador(p.colaborador_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_objetivos' and policyname='rh_pdi_objetivos_manage_allowed') then
    create policy "rh_pdi_objetivos_manage_allowed" on public.rh_pdi_objetivos
      for all to authenticated
      using (public.rh_can_manage_pdi(plano_id))
      with check (public.rh_can_manage_pdi(plano_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_checkpoints' and policyname='rh_pdi_checkpoints_select_visible') then
    create policy "rh_pdi_checkpoints_select_visible" on public.rh_pdi_checkpoints
      for select to authenticated
      using (public.rh_can_manage_pdi(plano_id) or exists (select 1 from public.rh_pdi_planos p where p.id = plano_id and public.rh_can_view_colaborador(p.colaborador_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_checkpoints' and policyname='rh_pdi_checkpoints_manage_allowed') then
    create policy "rh_pdi_checkpoints_manage_allowed" on public.rh_pdi_checkpoints
      for all to authenticated
      using (public.rh_can_manage_pdi(plano_id))
      with check (public.rh_can_manage_pdi(plano_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_evidencias' and policyname='rh_pdi_evidencias_select_visible') then
    create policy "rh_pdi_evidencias_select_visible" on public.rh_pdi_evidencias
      for select to authenticated
      using (public.rh_can_manage_pdi(plano_id) or exists (select 1 from public.rh_pdi_planos p where p.id = plano_id and public.rh_can_view_colaborador(p.colaborador_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_evidencias' and policyname='rh_pdi_evidencias_manage_allowed') then
    create policy "rh_pdi_evidencias_manage_allowed" on public.rh_pdi_evidencias
      for all to authenticated
      using (public.rh_can_manage_pdi(plano_id))
      with check (public.rh_can_manage_pdi(plano_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_feedbacks' and policyname='rh_pdi_feedbacks_select_visible') then
    create policy "rh_pdi_feedbacks_select_visible" on public.rh_pdi_feedbacks
      for select to authenticated
      using (public.rh_can_manage_pdi(plano_id) or exists (select 1 from public.rh_pdi_planos p where p.id = plano_id and public.rh_can_view_colaborador(p.colaborador_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_pdi_feedbacks' and policyname='rh_pdi_feedbacks_manage_allowed') then
    create policy "rh_pdi_feedbacks_manage_allowed" on public.rh_pdi_feedbacks
      for all to authenticated
      using (public.rh_can_manage_pdi(plano_id))
      with check (public.rh_can_manage_pdi(plano_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_carreira_movimentacoes' and policyname='rh_carreira_movimentacoes_select_visible') then
    create policy "rh_carreira_movimentacoes_select_visible" on public.rh_carreira_movimentacoes
      for select to authenticated
      using (public.rh_can_view_colaborador(colaborador_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_carreira_movimentacoes' and policyname='rh_carreira_movimentacoes_manage_admin_rh') then
    create policy "rh_carreira_movimentacoes_manage_admin_rh" on public.rh_carreira_movimentacoes
      for all to authenticated
      using (public.rh_is_admin_or_rh())
      with check (public.rh_is_admin_or_rh());
  end if;
end $$;

create or replace view public.v_rh_colaborador_jornadas_resumo
with (security_invoker = true)
as
select
  j.id,
  j.colaborador_id,
  c.nome as colaborador_nome,
  c.funcao as colaborador_funcao,
  c.tipo as colaborador_vinculo,
  j.status,
  j.etapa_atual,
  j.gestor_user_id,
  j.mentor_user_id,
  j.data_inicio,
  j.data_fim,
  j.proximo_checkpoint,
  j.score_jornada,
  j.badges_count,
  coalesce(count(distinct p.id) filter (where p.status in ('rascunho', 'em_andamento', 'em_revisao')), 0) as pdis_ativos,
  coalesce(count(distinct m.id), 0) as marcos_total,
  coalesce(count(distinct q.id), 0) as conquistas_total
from public.rh_colaborador_jornadas j
join public.colaboradores c on c.id = j.colaborador_id
left join public.rh_pdi_planos p on p.jornada_id = j.id
left join public.rh_colaborador_marcos m on m.jornada_id = j.id
left join public.rh_colaborador_conquistas q on q.jornada_id = j.id
group by j.id, c.nome, c.funcao, c.tipo;

create or replace view public.v_rh_pdi_dashboard_kpis
with (security_invoker = true)
as
select
  count(*) filter (where status in ('rascunho', 'em_andamento', 'em_revisao')) as pdis_ativos,
  count(*) filter (where status = 'concluido') as pdis_concluidos,
  (
    select count(*)
    from public.rh_pdi_checkpoints cp
    join public.rh_pdi_planos p on p.id = cp.plano_id
    where cp.status in ('agendado', 'atrasado')
      and cp.data_prevista < current_date
      and p.status in ('rascunho', 'em_andamento', 'em_revisao')
  ) as checkpoints_atrasados,
  (
    select count(*)
    from public.rh_colaborador_conquistas
    where concedida_em >= current_date - 30
  ) as conquistas_mes
from public.rh_pdi_planos;

insert into public.rh_pdi_ciclos (nome, tipo, data_inicio, data_fim, ativo)
select *
from (
  values
    ('Ciclo Trimestral Atual', 'trimestral', date_trunc('quarter', current_date)::date, (date_trunc('quarter', current_date) + interval '3 months - 1 day')::date, true),
    ('Ciclo Semestral Atual', 'semestral', date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '6 months - 1 day')::date, true),
    ('Ciclo Anual Atual', 'anual', date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date, true)
) as x(nome, tipo, data_inicio, data_fim, ativo)
where not exists (
  select 1 from public.rh_pdi_ciclos c
  where c.nome = x.nome
);

insert into public.rh_pdi_badges (codigo, nome, descricao, icon_key, categoria, cor, score_base, ativo)
select *
from (
  values
    ('cultura_la', 'Cultura LA', 'Concluiu marcos importantes da cultura organizacional.', 'sparkles', 'cultura', 'violet', 20, true),
    ('treinamento_master', 'Treinamento Master', 'Concluiu trilhas e treinamentos essenciais.', 'graduation-cap', 'treinamento', 'cyan', 25, true),
    ('checkpoint_hero', 'Checkpoint Hero', 'Mantém checkpoints em dia com consistência.', 'flag', 'performance', 'amber', 15, true),
    ('lideranca_em_formacao', 'Liderança em Formação', 'Avanço consistente em competências de liderança.', 'crown', 'lideranca', 'rose', 30, true),
    ('colaboracao_destaque', 'Colaboração Destaque', 'Reconhecido por colaboração e apoio transversal.', 'users', 'colaboracao', 'emerald', 18, true),
    ('proximo_nivel', 'Próximo Nível', 'Atingiu a pontuação mínima para mudança de nível.', 'arrow-up-right', 'carreira', 'indigo', 40, true)
) as x(codigo, nome, descricao, icon_key, categoria, cor, score_base, ativo)
where not exists (
  select 1 from public.rh_pdi_badges b
  where b.codigo = x.codigo
);

insert into public.rh_carreira_niveis (cargo_base, nivel_codigo, titulo, descricao, ordem, score_minimo, ativo)
select *
from (
  values
    ('Professor', 'jr', 'Professor Júnior', 'Base da trilha pedagógica.', 1, 0, true),
    ('Professor', 'pl', 'Professor Pleno', 'Domina a operação pedagógica e conduz rotina com autonomia.', 2, 60, true),
    ('Professor', 'sr', 'Professor Sênior', 'Referência técnica, apoio de trilha e mentoria.', 3, 120, true),
    ('Staff', 'jr', 'Staff Júnior', 'Entrada na trilha operacional.', 1, 0, true),
    ('Staff', 'pl', 'Staff Pleno', 'Autonomia operacional e domínio de processos.', 2, 60, true),
    ('Staff', 'sr', 'Staff Sênior', 'Referência operacional e desenvolvimento de pares.', 3, 120, true)
) as x(cargo_base, nivel_codigo, titulo, descricao, ordem, score_minimo, ativo)
where not exists (
  select 1 from public.rh_carreira_niveis n
  where n.cargo_base = x.cargo_base
    and n.nivel_codigo = x.nivel_codigo
);
