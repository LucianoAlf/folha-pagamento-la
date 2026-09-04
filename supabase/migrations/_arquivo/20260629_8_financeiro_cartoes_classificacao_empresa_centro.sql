-- Hotfix M8: classificacao confirmada de transacao de cartao exige empresa coerente com centro.
-- Preventivo: a tabela de transacoes ainda esta vazia; nao toca estrutura nem dados.

create or replace function public.financeiro_cartao_transacoes_valida_classificacao()
returns trigger
language plpgsql
as $$
declare
  v_plano_ok boolean;
  v_unidade_empresa uuid;
begin
  if new.classificacao_status = 'confirmada' then
    if new.plano_conta_id is null then
      raise exception 'plano_conta_id obrigatorio para classificacao confirmada.';
    end if;

    if new.centro_custo_id is null then
      raise exception 'centro_custo_id obrigatorio para classificacao confirmada.';
    end if;

    if new.empresa_id is null then
      raise exception 'empresa_id obrigatorio para classificacao confirmada.';
    end if;

    select unidade_id into v_unidade_empresa
      from public.financeiro_empresas
     where id = new.empresa_id;

    if v_unidade_empresa is null or v_unidade_empresa <> new.centro_custo_id then
      raise exception 'centro_custo_id incoerente com a empresa para classificacao confirmada.';
    end if;

    select true into v_plano_ok
      from public.plano_contas p
     where p.id = new.plano_conta_id
       and p.nivel = 3
       and p.natureza = 'saida'
       and p.ativo = true;

    if coalesce(v_plano_ok, false) is not true then
      raise exception 'plano_conta_id deve ser folha de saida ativa para classificacao confirmada.';
    end if;
  end if;

  return new;
end;
$$;
