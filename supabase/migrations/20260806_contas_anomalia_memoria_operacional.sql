alter table public.contas_anomalia_notas
  add column if not exists recorrente_modelo_id uuid null,
  add column if not exists plano_conta_id uuid null;

alter table public.contas_anomalia_notas
  alter column status drop not null;

alter table public.contas_anomalia_notas
  drop constraint if exists contas_anomalia_notas_status_check;

alter table public.contas_anomalia_notas
  add constraint contas_anomalia_notas_status_check
  check (status is null or status in ('pendente', 'justificada', 'corrigir_lancamento', 'monitorar', 'verificado'));

create index if not exists contas_anomalia_notas_recorrente_idx
  on public.contas_anomalia_notas (competencia_ym, unidade, recorrente_modelo_id, plano_conta_id)
  where recorrente_modelo_id is not null;

create index if not exists contas_anomalia_notas_conta_idx
  on public.contas_anomalia_notas (competencia_ym, unidade, conta_id)
  where conta_id is not null;

create unique index if not exists contas_anomalia_notas_unique
  on public.contas_anomalia_notas (competencia_ym, unidade, anomaly_key);

alter table public.contas_anomalia_notas enable row level security;
