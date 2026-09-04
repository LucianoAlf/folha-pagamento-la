-- Notificações centralizadas: flags por módulo + overrides por conta (contas_pagar)

-- 1) Campos adicionais em notificacao_config
alter table public.notificacao_config
  add column if not exists agenda_lembrete_tarefas_ativo boolean not null default true,

  add column if not exists contas_alerta_3d boolean not null default false,
  add column if not exists contas_alerta_1d boolean not null default false,
  add column if not exists contas_alerta_no_dia boolean not null default false,
  add column if not exists contas_alerta_hora time without time zone not null default '08:00',

  add column if not exists contas_resumo_semanal_ativo boolean not null default false,
  add column if not exists contas_resumo_semanal_dia text not null default 'segunda',
  add column if not exists contas_resumo_semanal_hora time without time zone not null default '08:00',

  add column if not exists folha_alerta_fechamento_ativo boolean not null default false,
  add column if not exists folha_alerta_fechamento_dia integer not null default 25,
  add column if not exists folha_alerta_aprovacao_pendente_ativo boolean not null default false;

-- 2) Overrides por conta
create table if not exists public.contas_pagar_notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conta_pagar_id uuid not null references public.contas_pagar(id) on delete cascade,

  alerta_3d boolean null,
  alerta_1d boolean null,
  alerta_no_dia boolean null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, conta_pagar_id)
);

alter table public.contas_pagar_notificacoes enable row level security;

-- 3) Policies
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contas_pagar_notificacoes' AND policyname='contas_pagar_notif_select_own'
  ) THEN
    CREATE POLICY contas_pagar_notif_select_own
      ON public.contas_pagar_notificacoes
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contas_pagar_notificacoes' AND policyname='contas_pagar_notif_insert_own'
  ) THEN
    CREATE POLICY contas_pagar_notif_insert_own
      ON public.contas_pagar_notificacoes
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contas_pagar_notificacoes' AND policyname='contas_pagar_notif_update_own'
  ) THEN
    CREATE POLICY contas_pagar_notif_update_own
      ON public.contas_pagar_notificacoes
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contas_pagar_notificacoes' AND policyname='contas_pagar_notif_delete_own'
  ) THEN
    CREATE POLICY contas_pagar_notif_delete_own
      ON public.contas_pagar_notificacoes
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $do$;

-- 4) updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contas_pagar_notificacoes_updated_at'
  ) THEN
    CREATE TRIGGER trg_contas_pagar_notificacoes_updated_at
    BEFORE UPDATE ON public.contas_pagar_notificacoes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $do$;

