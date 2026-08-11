create table if not exists public.financeiro_cartao_recorrencias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  transacao_origem_id uuid not null unique references public.financeiro_cartao_transacoes(id),
  data_inicio date not null,
  dia_base smallint not null check (dia_base between 1 and 31),
  descricao text not null check (btrim(descricao) <> ''),
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'encerrada')),
  pausada_em timestamptz null,
  encerrada_em timestamptz null,
  motivo_status text null,
  ator_tipo text null,
  ator_ref text null,
  created_by uuid null
);

create table if not exists public.financeiro_cartao_recorrencia_previsoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recorrencia_id uuid not null references public.financeiro_cartao_recorrencias(id),
  fatura_id uuid not null references public.financeiro_cartao_faturas(id),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  competencia date not null,
  data_compra date not null,
  descricao text not null,
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'prevista'
    check (status in ('prevista', 'confirmada', 'dispensada')),
  transacao_confirmada_id uuid null references public.financeiro_cartao_transacoes(id),
  decidida_em timestamptz null,
  decidida_por text null,
  motivo_decisao text null,
  unique (recorrencia_id, competencia)
);

create unique index if not exists financeiro_cartao_recorrencia_previsoes_transacao_uidx
  on public.financeiro_cartao_recorrencia_previsoes (transacao_confirmada_id)
  where transacao_confirmada_id is not null;
create index if not exists financeiro_cartao_recorrencias_cartao_status_idx
  on public.financeiro_cartao_recorrencias (cartao_id, status);
create index if not exists financeiro_cartao_recorrencia_previsoes_fatura_idx
  on public.financeiro_cartao_recorrencia_previsoes (fatura_id, status, data_compra);

drop trigger if exists trg_financeiro_cartao_recorrencias_set_updated_at on public.financeiro_cartao_recorrencias;
create trigger trg_financeiro_cartao_recorrencias_set_updated_at
  before update on public.financeiro_cartao_recorrencias
  for each row execute function public.set_updated_at();

drop trigger if exists trg_financeiro_cartao_recorrencia_previsoes_set_updated_at on public.financeiro_cartao_recorrencia_previsoes;
create trigger trg_financeiro_cartao_recorrencia_previsoes_set_updated_at
  before update on public.financeiro_cartao_recorrencia_previsoes
  for each row execute function public.set_updated_at();

alter table public.financeiro_cartao_recorrencias enable row level security;
alter table public.financeiro_cartao_recorrencia_previsoes enable row level security;

drop policy if exists financeiro_cartao_recorrencias_select_authenticated on public.financeiro_cartao_recorrencias;
create policy financeiro_cartao_recorrencias_select_authenticated
  on public.financeiro_cartao_recorrencias
  for select to authenticated
  using (true);

drop policy if exists financeiro_cartao_recorrencia_previsoes_select_authenticated on public.financeiro_cartao_recorrencia_previsoes;
create policy financeiro_cartao_recorrencia_previsoes_select_authenticated
  on public.financeiro_cartao_recorrencia_previsoes
  for select to authenticated
  using (true);

revoke all on public.financeiro_cartao_recorrencias from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_recorrencias to authenticated, service_role;
revoke all on public.financeiro_cartao_recorrencia_previsoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_recorrencia_previsoes to authenticated, service_role;
