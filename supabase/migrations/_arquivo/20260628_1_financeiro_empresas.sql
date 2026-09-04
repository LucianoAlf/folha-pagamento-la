-- Fase 1: fundacao fiscal para despesas eventuais/cartoes.
-- Empresas/CNPJs operacionais do Super Folha. Campo Grande tem duas empresas:
-- Kids CG e EMLA CG; o rotulo operacional vem da empresa, nao do centro de custo.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.financeiro_empresas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  razao_social text not null,
  nome_fantasia text null,
  label_operacional text null,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  unidade_id uuid not null references public.centros_custo(id),
  ativo boolean not null default true,
  observacoes text null
);

create index if not exists financeiro_empresas_unidade_idx
  on public.financeiro_empresas (unidade_id);

create index if not exists financeiro_empresas_label_operacional_idx
  on public.financeiro_empresas (label_operacional);

alter table public.financeiro_empresas enable row level security;

drop trigger if exists trg_financeiro_empresas_set_updated_at on public.financeiro_empresas;
create trigger trg_financeiro_empresas_set_updated_at
  before update on public.financeiro_empresas
  for each row execute function public.set_updated_at();

with seed (razao_social, nome_fantasia, label_operacional, cnpj, centro_codigo, observacoes) as (
  values
    ('LA Music Kids LTDA', 'Kids CG', 'Kids CG', '26707112000170', 'cg', 'Campo Grande / Kids CG'),
    ('Escola de Musica LA LTDA', 'Escola LA', 'EMLA CG', '19672908000170', 'cg', 'Campo Grande / EMLA CG'),
    ('Escola de Musica LA Kids LTDA', 'LA Kids (Recreio)', 'Recreio', '32134891000165', 'rec', 'Recreio'),
    ('Music School LA LTDA', 'Music School LA', 'Barra', '42681170000129', 'bar', 'Barra')
)
insert into public.financeiro_empresas (
  razao_social,
  nome_fantasia,
  label_operacional,
  cnpj,
  unidade_id,
  observacoes
)
select
  s.razao_social,
  s.nome_fantasia,
  s.label_operacional,
  s.cnpj,
  c.id,
  s.observacoes
from seed s
join public.centros_custo c
  on c.codigo = s.centro_codigo
 and c.tipo = 'unidade'
on conflict (cnpj) do update
set razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia,
    label_operacional = excluded.label_operacional,
    unidade_id = excluded.unidade_id,
    observacoes = excluded.observacoes,
    ativo = true,
    updated_at = now();

drop policy if exists financeiro_empresas_select_authenticated on public.financeiro_empresas;
create policy financeiro_empresas_select_authenticated
  on public.financeiro_empresas
  for select
  to authenticated
  using (true);

revoke all on public.financeiro_empresas from public, anon, maria_operacional, maria_leitura;
grant select on public.financeiro_empresas to authenticated, service_role;

comment on table public.financeiro_empresas is
  'Empresas fiscais do financeiro Super Folha. O label_operacional alimenta UI/Maria: Barra, Recreio, Kids CG, EMLA CG.';
