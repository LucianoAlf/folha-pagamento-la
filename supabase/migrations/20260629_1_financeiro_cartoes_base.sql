-- Fase 2: fundacao backend de cartoes.
-- Tabelas base para cadastro, faturas, importacoes e transacoes granulares.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.financeiro_cartoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id uuid null references public.financeiro_empresas(id),
  conta_pagadora_id uuid null references public.financeiro_contas_bancarias(id),
  centro_custo_id uuid null references public.centros_custo(id),
  titularidade_tipo text not null default 'pj' check (titularidade_tipo in ('pj','pf')),
  titular text null,
  apelido text not null,
  final text not null,
  bandeira text null,
  dia_fechamento int null check (dia_fechamento between 1 and 31),
  dia_vencimento int null check (dia_vencimento between 1 and 31),
  limite numeric null,
  ativo boolean not null default true,
  observacoes text null,
  unique (apelido)
);

create unique index if not exists financeiro_cartoes_empresa_final_uidx
  on public.financeiro_cartoes (empresa_id, final)
  where empresa_id is not null;

create index if not exists financeiro_cartoes_empresa_idx
  on public.financeiro_cartoes (empresa_id);

create index if not exists financeiro_cartoes_conta_pagadora_idx
  on public.financeiro_cartoes (conta_pagadora_id);

create table if not exists public.financeiro_cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  competencia date not null,
  data_fechamento date null,
  data_vencimento date not null,
  valor_total numeric not null default 0,
  status text not null default 'aberta' check (status in ('aberta','fechada','paga','cancelada')),
  conta_pagar_id uuid null references public.contas_pagar(id),
  observacoes text null,
  unique (cartao_id, competencia)
);

create index if not exists financeiro_cartao_faturas_cartao_idx
  on public.financeiro_cartao_faturas (cartao_id);

create index if not exists financeiro_cartao_faturas_conta_pagar_idx
  on public.financeiro_cartao_faturas (conta_pagar_id);

create table if not exists public.financeiro_cartao_importacoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid null references public.financeiro_cartoes(id),
  fatura_id uuid null references public.financeiro_cartao_faturas(id),
  documento_id uuid null references public.financeiro_documentos(id),
  origem text not null check (origem in ('upload','whatsapp','openfinance','manual')),
  status text not null default 'processando' check (status in ('processando','concluida','parcial','erro')),
  total_linhas int not null default 0,
  linhas_importadas int not null default 0,
  linhas_classificadas int not null default 0,
  linhas_pendentes int not null default 0,
  linhas_erro int not null default 0,
  ator_tipo text null,
  ator_ref text null,
  created_by uuid null,
  mensagem_erro text null
);

create index if not exists financeiro_cartao_importacoes_cartao_idx
  on public.financeiro_cartao_importacoes (cartao_id);

create index if not exists financeiro_cartao_importacoes_fatura_idx
  on public.financeiro_cartao_importacoes (fatura_id);

create index if not exists financeiro_cartao_importacoes_documento_idx
  on public.financeiro_cartao_importacoes (documento_id);

create table if not exists public.financeiro_cartao_transacoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fatura_id uuid not null references public.financeiro_cartao_faturas(id),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  importacao_id uuid null references public.financeiro_cartao_importacoes(id),
  data_compra date not null,
  descricao text not null,
  estabelecimento text null,
  valor numeric not null,
  tipo_transacao text not null check (tipo_transacao in ('compra','estorno','tarifa','anuidade','ajuste')),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente' check (classificacao_status in ('pendente','sugerida','confirmada')),
  classificado_por text null,
  classificado_em timestamptz null,
  compra_parcelada_id uuid null,
  parcela_atual int null,
  total_parcelas int null,
  valor_total_compra numeric null,
  fingerprint text null,
  possivel_duplicata boolean not null default false,
  id_externo text null,
  fonte_tipo text null,
  ator_tipo text null,
  ator_ref text null,
  created_by uuid null,
  observacoes text null
);

create unique index if not exists financeiro_cartao_transacoes_id_externo_uidx
  on public.financeiro_cartao_transacoes (cartao_id, id_externo)
  where id_externo is not null;

create index if not exists financeiro_cartao_transacoes_fatura_idx
  on public.financeiro_cartao_transacoes (fatura_id);

create index if not exists financeiro_cartao_transacoes_cartao_idx
  on public.financeiro_cartao_transacoes (cartao_id);

create index if not exists financeiro_cartao_transacoes_importacao_idx
  on public.financeiro_cartao_transacoes (importacao_id);

create index if not exists financeiro_cartao_transacoes_fingerprint_idx
  on public.financeiro_cartao_transacoes (fatura_id, fingerprint)
  where fingerprint is not null;

drop trigger if exists trg_financeiro_cartoes_set_updated_at on public.financeiro_cartoes;
create trigger trg_financeiro_cartoes_set_updated_at
  before update on public.financeiro_cartoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_financeiro_cartao_faturas_set_updated_at on public.financeiro_cartao_faturas;
create trigger trg_financeiro_cartao_faturas_set_updated_at
  before update on public.financeiro_cartao_faturas
  for each row execute function public.set_updated_at();

drop trigger if exists trg_financeiro_cartao_importacoes_set_updated_at on public.financeiro_cartao_importacoes;
create trigger trg_financeiro_cartao_importacoes_set_updated_at
  before update on public.financeiro_cartao_importacoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_financeiro_cartao_transacoes_set_updated_at on public.financeiro_cartao_transacoes;
create trigger trg_financeiro_cartao_transacoes_set_updated_at
  before update on public.financeiro_cartao_transacoes
  for each row execute function public.set_updated_at();

alter table public.financeiro_cartoes enable row level security;
alter table public.financeiro_cartao_faturas enable row level security;
alter table public.financeiro_cartao_importacoes enable row level security;
alter table public.financeiro_cartao_transacoes enable row level security;

drop policy if exists financeiro_cartoes_select_authenticated on public.financeiro_cartoes;
create policy financeiro_cartoes_select_authenticated
  on public.financeiro_cartoes
  for select
  to authenticated
  using (true);

drop policy if exists financeiro_cartao_faturas_select_authenticated on public.financeiro_cartao_faturas;
create policy financeiro_cartao_faturas_select_authenticated
  on public.financeiro_cartao_faturas
  for select
  to authenticated
  using (true);

drop policy if exists financeiro_cartao_importacoes_select_authenticated on public.financeiro_cartao_importacoes;
create policy financeiro_cartao_importacoes_select_authenticated
  on public.financeiro_cartao_importacoes
  for select
  to authenticated
  using (true);

drop policy if exists financeiro_cartao_transacoes_select_authenticated on public.financeiro_cartao_transacoes;
create policy financeiro_cartao_transacoes_select_authenticated
  on public.financeiro_cartao_transacoes
  for select
  to authenticated
  using (true);

revoke all on public.financeiro_cartoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartoes to authenticated, service_role;

revoke all on public.financeiro_cartao_faturas from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_faturas to authenticated, service_role;

revoke all on public.financeiro_cartao_importacoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_importacoes to authenticated, service_role;

revoke all on public.financeiro_cartao_transacoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_transacoes to authenticated, service_role;

comment on table public.financeiro_cartoes is
  'Cartoes financeiros do Super Folha. Guarda instrumento, pagador e titularidade; transacoes carregam a natureza economica.';

comment on table public.financeiro_cartao_importacoes is
  'Lotes de ingestao/conciliacao de faturas de cartao vindos do front, WhatsApp/Maria, manual ou Open Finance.';
