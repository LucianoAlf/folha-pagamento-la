-- WhatsApp (UAZAPI): ajustar schema existente de lembretes_log + garantir extensões
-- Observação: esta migration assume que `public.lembretes_log` já existe (usada no sistema).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- notificacao_config já existe; apenas reforçamos defaults de forma idempotente (sem quebrar dados existentes)
alter table public.notificacao_config
  alter column whatsapp_ativo set default false,
  alter column resumo_diario_ativo set default true,
  alter column resumo_semanal_ativo set default true,
  alter column lembrete_padrao_minutos set default 30;

-- lembretes_log: estender com user_id + provider_message_id (para auditoria e rastreio)
alter table public.lembretes_log
  add column if not exists user_id uuid null,
  add column if not exists provider_message_id text null;

create index if not exists lembretes_log_user_id_idx on public.lembretes_log(user_id);
create index if not exists lembretes_log_tarefa_id_idx on public.lembretes_log(tarefa_id);
create index if not exists lembretes_log_conta_pagar_id_idx on public.lembretes_log(conta_pagar_id);
create index if not exists lembretes_log_scheduled_for_idx on public.lembretes_log(scheduled_for);

-- Idempotência (cobre tarefa_id/conta_pagar_id/destinatario nulos)
create unique index if not exists lembretes_log_idempotency_uq
  on public.lembretes_log (
    canal,
    tipo,
    (coalesce(tarefa_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(conta_pagar_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    scheduled_for,
    (coalesce(destinatario, ''))
  );

alter table public.lembretes_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lembretes_log'
      and policyname = 'lembretes_log_select_own'
  ) then
    create policy lembretes_log_select_own
      on public.lembretes_log
      for select
      to authenticated
      using (user_id is not null and user_id = auth.uid());
  end if;
end $$;

