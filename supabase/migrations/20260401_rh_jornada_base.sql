create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rh_templates (
  id uuid primary key default gen_random_uuid(),
  tipo_processo text not null check (tipo_processo in ('recrutamento', 'onboarding', 'desligamento')),
  nome text not null,
  descricao text null,
  ativo boolean not null default true,
  escopo_cargo text null,
  escopo_contrato text null,
  escopo_departamento text null,
  escopo_unidade text null,
  versao int not null default 1,
  arquivado_em timestamptz null,
  arquivado_por uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_candidatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text null,
  telefone text null,
  cpf text null,
  cargo_pretendido text null,
  tipo_vinculo_pretendido text null,
  origem text null,
  status text not null check (
    status in (
      'novo',
      'questionario_pendente',
      'questionario_recebido',
      'entrevista',
      'aula_teste',
      'aprovado',
      'reprovado',
      'arquivado'
    )
  ),
  questionario_resumo text null,
  questionario_respostas jsonb not null default '{}'::jsonb,
  curriculo_storage_path text null,
  curriculo_texto_extraido text null,
  observacoes text null,
  aprovado_em timestamptz null,
  reprovado_em timestamptz null,
  colaborador_convertido_id int null references public.colaboradores(id),
  arquivado_em timestamptz null,
  arquivado_por uuid null references public.user_profiles(id),
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_processos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('recrutamento', 'onboarding', 'desligamento')),
  status text not null check (
    status in (
      'rascunho',
      'em_andamento',
      'aguardando_documentos',
      'aguardando_avaliacao',
      'aguardando_aprovacao',
      'concluido',
      'cancelado'
    )
  ),
  candidato_id uuid null references public.rh_candidatos(id) on delete set null,
  colaborador_id int null references public.colaboradores(id) on delete set null,
  template_id uuid null references public.rh_templates(id) on delete set null,
  titulo text not null,
  unidade text null,
  departamento text null,
  cargo text null,
  tipo_vinculo text null,
  owner_user_id uuid not null references public.user_profiles(id),
  mentor_user_id uuid null references public.user_profiles(id),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  data_inicio date not null,
  data_fim_prevista date null,
  data_fim_real date null,
  observacoes text null,
  metadata_json jsonb not null default '{}'::jsonb,
  arquivado_em timestamptz null,
  arquivado_por uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_processo_participantes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  papel text not null check (papel in ('rh', 'gestor', 'mentor', 'avaliador', 'financeiro')),
  principal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_template_etapas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rh_templates(id) on delete cascade,
  codigo text not null,
  titulo text not null,
  categoria text not null,
  ordem int not null,
  obrigatoria boolean not null default true,
  prazo_offset_dias int null,
  responsavel_padrao_papel text null,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.rh_processo_etapas (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  template_etapa_id uuid null references public.rh_template_etapas(id) on delete set null,
  codigo text not null,
  titulo text not null,
  categoria text not null check (
    categoria in (
      'entrevista',
      'aula_teste',
      'documentacao',
      'admissional',
      'sistema',
      'financeiro',
      'cultura',
      'acessos',
      'treinamento',
      'feedback',
      'saida',
      'documento_oficial',
      'encerramento'
    )
  ),
  status text not null check (
    status in (
      'nao_iniciada',
      'em_andamento',
      'bloqueada',
      'concluida',
      'dispensada',
      'atrasada'
    )
  ),
  ordem int not null,
  obrigatoria boolean not null default true,
  data_prevista date null,
  data_limite date null,
  data_realizada date null,
  observacoes text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_etapa_responsaveis (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.rh_processo_etapas(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  papel text not null check (papel in ('rh', 'gestor', 'mentor', 'avaliador', 'financeiro')),
  principal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_template_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  template_etapa_id uuid not null references public.rh_template_etapas(id) on delete cascade,
  titulo text not null,
  obrigatorio boolean not null default true,
  ordem int not null,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.rh_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.rh_processo_etapas(id) on delete cascade,
  titulo text not null,
  descricao text null,
  obrigatorio boolean not null default true,
  concluido boolean not null default false,
  concluido_em timestamptz null,
  concluido_por uuid null references public.user_profiles(id),
  ordem int not null,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.rh_template_documentos (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rh_templates(id) on delete cascade,
  tipo_documento text not null,
  obrigatorio boolean not null default true,
  ordem int not null,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.rh_documentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  etapa_id uuid null references public.rh_processo_etapas(id) on delete set null,
  candidato_id uuid null references public.rh_candidatos(id) on delete set null,
  colaborador_id int null references public.colaboradores(id) on delete set null,
  tipo_documento text not null,
  obrigatorio boolean not null default true,
  status text not null check (status in ('pendente', 'enviado', 'em_analise', 'conferido', 'rejeitado')),
  storage_path text null,
  nome_arquivo text null,
  mime_type text null,
  tamanho_bytes bigint null,
  enviado_em timestamptz null,
  conferido_em timestamptz null,
  conferido_por uuid null references public.user_profiles(id),
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_documentos_gerados (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  tipo_documento text not null,
  template_slug text not null,
  template_id uuid null references public.rh_templates(id) on delete set null,
  template_versao int null,
  storage_path text not null,
  gerado_por uuid not null references public.user_profiles(id),
  gerado_em timestamptz not null default now()
);

create table if not exists public.rh_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  etapa_id uuid null references public.rh_processo_etapas(id) on delete set null,
  tipo text not null check (
    tipo in (
      'entrevista',
      'aula_teste',
      'feedback_7d',
      'feedback_30d',
      'feedback_45d',
      'feedback_90d',
      'entrevista_saida'
    )
  ),
  avaliador_user_id uuid null references public.user_profiles(id),
  nota numeric null,
  decisao text null check (decisao in ('aprovado', 'reprovado', 'ajustes', 'neutro')),
  resumo text null,
  respostas_json jsonb not null default '{}'::jsonb,
  observacoes text null,
  realizada_em timestamptz not null default now()
);

create table if not exists public.rh_desligamentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null unique references public.rh_processos(id) on delete cascade,
  motivo_tipo text not null check (
    motivo_tipo in (
      'pedido_demissao',
      'sem_justa_causa',
      'justa_causa',
      'termino_contrato',
      'acordo',
      'encerramento_pj'
    )
  ),
  motivo_detalhado text null,
  aviso_previo_tipo text not null check (aviso_previo_tipo in ('trabalhado', 'indenizado', 'nao_aplica')),
  aviso_previo_inicio date null,
  aviso_previo_fim date null,
  opcao_reducao_jornada text null check (opcao_reducao_jornada in ('2h_dia', '7_dias', 'nao_aplica')),
  bloqueio_acessos_em date null,
  devolucao_materiais_em date null,
  entrevista_saida_realizada boolean not null default false,
  status_financeiro text not null default 'pendente',
  status_documental text not null default 'pendente',
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_processo_comentarios (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  etapa_id uuid null references public.rh_processo_etapas(id) on delete cascade,
  autor_user_id uuid not null references public.user_profiles(id),
  comentario text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_historico_eventos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.rh_processos(id) on delete cascade,
  entidade_tipo text not null,
  entidade_id uuid null,
  acao text not null,
  de_json jsonb null,
  para_json jsonb null,
  comentario text null,
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.rh_regras_alerta (
  id uuid primary key default gen_random_uuid(),
  tipo_processo text not null check (tipo_processo in ('recrutamento', 'onboarding', 'desligamento')),
  tipo_etapa text null,
  dias_antes int not null,
  canal text not null check (canal in ('sistema', 'agenda', 'whatsapp')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rh_candidatos_set_updated_at on public.rh_candidatos;
create trigger trg_rh_candidatos_set_updated_at
before update on public.rh_candidatos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_templates_set_updated_at on public.rh_templates;
create trigger trg_rh_templates_set_updated_at
before update on public.rh_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_processos_set_updated_at on public.rh_processos;
create trigger trg_rh_processos_set_updated_at
before update on public.rh_processos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_processo_etapas_set_updated_at on public.rh_processo_etapas;
create trigger trg_rh_processo_etapas_set_updated_at
before update on public.rh_processo_etapas
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_documentos_set_updated_at on public.rh_documentos;
create trigger trg_rh_documentos_set_updated_at
before update on public.rh_documentos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_desligamentos_set_updated_at on public.rh_desligamentos;
create trigger trg_rh_desligamentos_set_updated_at
before update on public.rh_desligamentos
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_processo_comentarios_set_updated_at on public.rh_processo_comentarios;
create trigger trg_rh_processo_comentarios_set_updated_at
before update on public.rh_processo_comentarios
for each row execute function public.set_updated_at();

drop trigger if exists trg_rh_regras_alerta_set_updated_at on public.rh_regras_alerta;
create trigger trg_rh_regras_alerta_set_updated_at
before update on public.rh_regras_alerta
for each row execute function public.set_updated_at();
