-- Fase 1: documentos financeiros sanitizados.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.financeiro_documentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('comprovante','fatura','nota','boleto','outro')),
  storage_ref text null,
  origem text null check (origem is null or origem in ('whatsapp','upload','email','manual','asaas')),
  vinculo_tipo text null check (vinculo_tipo is null or vinculo_tipo in ('conta_pagar','cartao_fatura','cartao_transacao')),
  vinculo_id uuid null,
  hash text null,
  observacoes text null
);

create index if not exists financeiro_documentos_vinculo_idx
  on public.financeiro_documentos (vinculo_tipo, vinculo_id);

create index if not exists financeiro_documentos_hash_idx
  on public.financeiro_documentos (hash)
  where hash is not null;

alter table public.financeiro_documentos enable row level security;

drop policy if exists financeiro_documentos_select_authenticated on public.financeiro_documentos;
create policy financeiro_documentos_select_authenticated
  on public.financeiro_documentos
  for select
  to authenticated
  using (true);

revoke all on public.financeiro_documentos from public, anon, maria_operacional, maria_leitura;
grant select on public.financeiro_documentos to authenticated, service_role;

comment on table public.financeiro_documentos is
  'Metadados sanitizados de documentos financeiros. Nao armazena conteudo sensivel bruto.';
