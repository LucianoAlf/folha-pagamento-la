-- Histórico diário de saldo bancário via Open Finance (Pluggy). Um snapshot por
-- conta_bancaria_id + dia. Base para: (1) popular o rodapé "SALDO EM CONTAS" do relatório
-- diário de contas a pagar, (2) futuro fluxo de caixa. Escrita só via service_role
-- (Edge Function de sync); autenticado só lê, seguindo o padrão de financeiro_contas_bancarias.

create table public.financeiro_conta_saldos_diarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conta_bancaria_id uuid not null references public.financeiro_contas_bancarias(id),
  data_referencia date not null,
  saldo numeric(14,2) not null,
  origem text not null default 'openfinance' check (origem in ('openfinance', 'manual')),
  pluggy_item_id text,
  pluggy_account_id text,
  capturado_em timestamptz not null default now(),
  unique (conta_bancaria_id, data_referencia)
);

create trigger trg_financeiro_conta_saldos_diarios_set_updated_at
  before update on public.financeiro_conta_saldos_diarios
  for each row execute function public.set_updated_at();

alter table public.financeiro_conta_saldos_diarios enable row level security;

create policy financeiro_conta_saldos_diarios_select_authenticated
  on public.financeiro_conta_saldos_diarios
  for select
  to authenticated
  using (true);

comment on table public.financeiro_conta_saldos_diarios is
  'Snapshot diário de saldo por conta bancária, alimentado pelo sync Open Finance (Pluggy). RLS: autenticado só lê; escrita via service_role (Edge Function).';

-- View sanitizada no formato que _shared/relatorioContasDia.ts espera (RelatorioSaldos:
-- rec/bar/kids_cg/emla_cg), saldo de hoje por unidade operacional.
create view public.vw_maria_openfinance_saldos_resumo as
select
  fe.label_operacional,
  fcs.saldo,
  fcs.data_referencia,
  fcs.capturado_em
from public.financeiro_conta_saldos_diarios fcs
join public.financeiro_contas_bancarias fcb on fcb.id = fcs.conta_bancaria_id
join public.financeiro_empresas fe on fe.id = fcb.empresa_id
where fcs.data_referencia = current_date;

comment on view public.vw_maria_openfinance_saldos_resumo is
  'Saldo de hoje por unidade (label_operacional), sanitizado para a role maria_leitura e outros consumidores restritos. Fonte: financeiro_conta_saldos_diarios.';

grant select on public.vw_maria_openfinance_saldos_resumo to authenticated, maria_leitura, maria_operacional;
