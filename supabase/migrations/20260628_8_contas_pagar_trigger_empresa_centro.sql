create or replace function public.contas_pagar_valida_empresa_centro()
returns trigger
language plpgsql
as $$
declare
  v_unidade_empresa uuid;
begin
  if new.empresa_id is not null and new.centro_custo_id is not null then
    select unidade_id into v_unidade_empresa
      from public.financeiro_empresas
     where id = new.empresa_id;

    if v_unidade_empresa is null then
      raise exception 'empresa_id % nao encontrada em financeiro_empresas', new.empresa_id;
    end if;

    if v_unidade_empresa <> new.centro_custo_id then
      raise exception 'centro_custo_id % nao corresponde a unidade % da empresa %',
        new.centro_custo_id, v_unidade_empresa, new.empresa_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contas_pagar_valida_empresa_centro on public.contas_pagar;
create trigger trg_contas_pagar_valida_empresa_centro
  before insert or update on public.contas_pagar
  for each row execute function public.contas_pagar_valida_empresa_centro();
