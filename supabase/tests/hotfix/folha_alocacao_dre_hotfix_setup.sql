create schema extensions;
create extension pgcrypto with schema extensions;

create schema auth;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create role maria_operacional nologin;
  create role maria_leitura nologin;
end;
$$;

create table public.folhas_mensais (
  id integer primary key,
  status text not null
);

create table public.colaboradores (
  id integer primary key,
  nome text not null,
  is_rateado boolean,
  unidade_fixa text
);

create table public.folha_classificacao_dre (
  folha_id integer not null,
  lancamento_folha_id integer not null,
  sequencia integer not null,
  colaborador_id integer not null,
  competencia date not null,
  categoria_usada text not null,
  tipo_usado text not null,
  funcao_usada text not null,
  unidade_usada text not null,
  conta_pagadora_id_usada uuid,
  componente text not null,
  tipo_efeito text not null,
  valor_original numeric not null,
  valor_assinado numeric not null,
  plano_conta_id uuid,
  plano_codigo_usado text,
  plano_nome_usado text,
  tratamento text not null,
  escopo_dre text not null,
  regra_id uuid,
  ruleset_version integer not null,
  motivo text not null,
  bistro_competencia_id uuid,
  bistro_ref_ym text not null,
  classificado_em timestamptz not null default now(),
  classificado_por text not null,
  hash_origem text not null,
  primary key (folha_id, lancamento_folha_id, componente, sequencia)
);

create table public.maria_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ator_nome text not null,
  ator_numero text not null,
  ator_numero_hash text not null,
  ator_numero_last4 text not null,
  papel text not null,
  origem text not null,
  canal text,
  invoker_role text,
  tabela text not null,
  entidade_tipo text not null,
  entidade_id uuid,
  operacao text not null,
  antes jsonb,
  depois jsonb,
  motivo text,
  texto_original text
);
