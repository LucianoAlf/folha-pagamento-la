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

-- Revalida no servidor os campos que o cliente usa para localizar a ocorrência.
-- O mês anterior é aceito porque itens "removidos" carregam a conta da base.
create or replace function public.validate_contas_anomalia_nota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  competencia_anterior text;
begin
  if new.competencia_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'competencia_ym invalida';
  end if;

  if new.unidade not in ('cg', 'rec', 'bar', 'todas') then
    raise exception 'unidade invalida';
  end if;

  if length(coalesce(new.nota, '')) > 2000 then
    raise exception 'justificativa excede 2.000 caracteres';
  end if;

  -- Consolidado pode receber a chave de qualquer unidade; filtros unitários não.
  if new.unidade <> 'todas' and left(new.anomaly_key, length(new.unidade) + 1) <> new.unidade || '|' then
    raise exception 'chave de anomalia nao pertence a unidade informada';
  end if;

  competencia_anterior := to_char(to_date(new.competencia_ym || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM');

  if new.conta_id is not null and not exists (
    select 1
      from public.contas_pagar c
     where c.id = new.conta_id
       and left(c.competencia::text, 7) in (new.competencia_ym, competencia_anterior)
       and (new.unidade = 'todas' or c.unidade in (new.unidade, 'todas'))
  ) then
    raise exception 'conta da anomalia nao pertence ao periodo ou unidade informados';
  end if;

  if new.recorrente_modelo_id is not null and not exists (
    select 1
      from public.contas_pagar c
     where c.recorrente_modelo_id = new.recorrente_modelo_id
       and (new.unidade = 'todas' or c.unidade in (new.unidade, 'todas'))
  ) then
    raise exception 'modelo recorrente da anomalia nao pertence a unidade informada';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_contas_anomalia_nota on public.contas_anomalia_notas;
create trigger validate_contas_anomalia_nota
before insert or update on public.contas_anomalia_notas
for each row execute function public.validate_contas_anomalia_nota();
