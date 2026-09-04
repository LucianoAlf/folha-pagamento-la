-- Fase 1: contas bancarias das empresas fiscais.
-- A conta pagadora permite inferir empresa/unidade de forma deterministica.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.financeiro_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id uuid not null references public.financeiro_empresas(id),
  banco text not null,
  banco_codigo text null,
  agencia text not null,
  conta text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente','poupanca','pagamento')),
  apelido text null,
  ativo boolean not null default true,
  observacoes text null,
  unique (banco, agencia, conta)
);

create index if not exists financeiro_contas_bancarias_empresa_idx
  on public.financeiro_contas_bancarias (empresa_id);

alter table public.financeiro_contas_bancarias enable row level security;

drop trigger if exists trg_financeiro_contas_bancarias_set_updated_at on public.financeiro_contas_bancarias;
create trigger trg_financeiro_contas_bancarias_set_updated_at
  before update on public.financeiro_contas_bancarias
  for each row execute function public.set_updated_at();

with seed (cnpj, banco, banco_codigo, agencia, conta, apelido, observacoes) as (
  values
    ('26707112000170', 'Santander', '033', '1534', '13002360-2', 'Kids CG Santander 1534', 'Conta operacional Kids CG'),
    ('19672908000170', 'Santander', '033', '1534', '13002359-2', 'EMLA CG Santander 1534', 'Conta operacional EMLA CG'),
    ('32134891000165', 'Santander', '033', '1534', '13002361-9', 'Recreio Santander 1534', 'Conta operacional Recreio'),
    ('42681170000129', 'Santander', '033', '1534', '13002358-5', 'Barra Santander 1534', 'Conta operacional Barra')
)
insert into public.financeiro_contas_bancarias (
  empresa_id,
  banco,
  banco_codigo,
  agencia,
  conta,
  tipo,
  apelido,
  observacoes
)
select
  e.id,
  s.banco,
  s.banco_codigo,
  s.agencia,
  s.conta,
  'corrente',
  s.apelido,
  s.observacoes
from seed s
join public.financeiro_empresas e
  on e.cnpj = s.cnpj
on conflict (banco, agencia, conta) do update
set empresa_id = excluded.empresa_id,
    banco_codigo = excluded.banco_codigo,
    tipo = excluded.tipo,
    apelido = excluded.apelido,
    observacoes = excluded.observacoes,
    ativo = true,
    updated_at = now();

drop policy if exists financeiro_contas_bancarias_select_authenticated on public.financeiro_contas_bancarias;
create policy financeiro_contas_bancarias_select_authenticated
  on public.financeiro_contas_bancarias
  for select
  to authenticated
  using (true);

revoke all on public.financeiro_contas_bancarias from public, anon, maria_operacional, maria_leitura;
grant select on public.financeiro_contas_bancarias to authenticated, service_role;

comment on table public.financeiro_contas_bancarias is
  'Contas bancarias operacionais por empresa. Usadas para inferir empresa/caixa pagador nos lancamentos financeiros.';
