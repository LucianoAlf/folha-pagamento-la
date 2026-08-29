-- Recorrência semanal em contas a pagar: frequência no modelo + identidade por data.
-- A identidade da instância passa de (modelo, competência-mês) para (modelo, data_vencimento),
-- o que suporta mensal (datas de meses diferentes) e semanal (várias no mesmo mês).
alter table public.contas_pagar
  add column if not exists recorrente_frequencia text not null default 'mensal'
  check (recorrente_frequencia in ('mensal','semanal'));

comment on column public.contas_pagar.recorrente_frequencia is
  'Frequência de um lançamento recorrente: mensal (default) ou semanal. Relevante no modelo (recorrente_modelo_id null); instâncias herdam por cópia.';

create unique index if not exists contas_pagar_modelo_venc_uniq
  on public.contas_pagar (recorrente_modelo_id, data_vencimento)
  where recorrente_modelo_id is not null;
