-- Snapshot diário de cartão via Open Finance (Pluggy). Um registro por cartão + dia.
-- Captura "tudo que o /accounts entrega" para cartão de crédito: limite, disponível, usado
-- (fatura em aberto), vencimento, mínimo, marca, nível — mais o objeto bruto completo em
-- payload (jsonb), para a Maria conseguir consultar qualquer campo futuro sem migration nova.
-- RLS: modelo do app (authenticated lê), decisão do Alf 14/08/2026.
-- (Endurecido depois na migration openfinance_fechar_vazamento_anon_views.)

create table public.financeiro_cartao_saldos_diarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  data_referencia date not null,
  limite numeric(14,2),
  disponivel numeric(14,2),
  usado numeric(14,2),
  vencimento date,
  pagamento_minimo numeric(14,2),
  marca text,
  nivel text,
  moeda text,
  origem text not null default 'openfinance' check (origem in ('openfinance', 'manual')),
  pluggy_item_id text,
  pluggy_account_id text,
  payload jsonb,
  capturado_em timestamptz not null default now(),
  unique (cartao_id, data_referencia)
);

create trigger trg_financeiro_cartao_saldos_diarios_set_updated_at
  before update on public.financeiro_cartao_saldos_diarios
  for each row execute function public.set_updated_at();

alter table public.financeiro_cartao_saldos_diarios enable row level security;

create policy financeiro_cartao_saldos_diarios_select_authenticated
  on public.financeiro_cartao_saldos_diarios
  for select to authenticated using (true);

comment on table public.financeiro_cartao_saldos_diarios is
  'Snapshot diário por cartão via Open Finance (Pluggy): limite/disponível/usado/vencimento/mínimo + payload bruto. RLS: authenticated lê; escrita via service_role (Edge Function).';

-- "Tudo" também para conta corrente: guardar o objeto bruto da account BANK, sem quebrar o
-- caminho atual (o relatório continua lendo a coluna saldo).
alter table public.financeiro_conta_saldos_diarios
  add column if not exists payload jsonb;

comment on column public.financeiro_conta_saldos_diarios.payload is
  'Objeto bruto da account BANK retornado pela Pluggy (bankData completo etc.). saldo continua sendo o número primário que o relatório usa.';

-- View sanitizada de cartão (sem payload bruto) para maria_leitura e demais consumidores restritos.
create view public.vw_maria_openfinance_cartoes_resumo as
select
  fe.label_operacional,
  fc.apelido as cartao,
  fc.final,
  fc.bandeira,
  fcs.limite,
  fcs.disponivel,
  fcs.usado,
  fcs.vencimento,
  fcs.pagamento_minimo,
  fcs.data_referencia,
  fcs.capturado_em
from public.financeiro_cartao_saldos_diarios fcs
join public.financeiro_cartoes fc on fc.id = fcs.cartao_id
join public.financeiro_empresas fe on fe.id = fc.empresa_id
where fcs.data_referencia = current_date;

comment on view public.vw_maria_openfinance_cartoes_resumo is
  'Snapshot de hoje por cartão (limite/disponível/usado/vencimento/mínimo), sanitizado para maria_leitura. Fonte: financeiro_cartao_saldos_diarios (sem expor payload bruto).';

grant select on public.vw_maria_openfinance_cartoes_resumo to authenticated, maria_leitura, maria_operacional;
