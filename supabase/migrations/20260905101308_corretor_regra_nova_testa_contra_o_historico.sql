create or replace function public.maria_corretor_aplicar_regra(
  p_palavra_chave text,
  p_plano_conta_id uuid,
  p_unidade text,
  p_prioridade integer,
  p_confianca numeric,
  p_observacao text default null::text,
  p_supersedes uuid default null::uuid
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_conflitos int;
  v_exemplos text;
begin
  if exists (select 1 from maria_classificacao_regras
             where palavra_chave = p_palavra_chave and plano_conta_id = p_plano_conta_id
               and coalesce(unidade,'') = coalesce(p_unidade,'') and ativo) then
    return 'idempotente';
  end if;

  select count(*), left(string_agg(distinct descricao, ' | '), 180)
    into v_conflitos, v_exemplos
    from (
      select c.descricao from contas_pagar c
       where c.plano_conta_id is not null
         and c.plano_conta_id <> p_plano_conta_id
         and c.descricao ilike '%' || p_palavra_chave || '%'
      union all
      select t.descricao from financeiro_cartao_transacoes t
       where t.plano_conta_id is not null
         and t.plano_conta_id <> p_plano_conta_id
         and t.descricao ilike '%' || p_palavra_chave || '%'
    ) q;

  if p_supersedes is not null and v_conflitos = 0 then
    update maria_classificacao_regras set ativo = false, updated_at = now()
     where id = p_supersedes and ativo;
  end if;

  insert into maria_classificacao_regras(palavra_chave, plano_conta_id, unidade, escopo, prioridade,
      confianca_base, ativo, origem, aprovado_por, aprovado_em, supersedes, observacao)
    values (p_palavra_chave, p_plano_conta_id, p_unidade, 'geral', p_prioridade,
      p_confianca, v_conflitos = 0, 'corretor-v1', 'corretor-v1', now(),
      case when v_conflitos = 0 then p_supersedes else null end,
      case when v_conflitos = 0 then p_observacao
           else concat_ws(' | ', p_observacao,
                format('INATIVA por conflito: contradiz %s registro(s) ja classificado(s) por humano. Ex.: %s',
                       v_conflitos, coalesce(v_exemplos,'-'))) end)
    returning id into v_id;

  if v_conflitos > 0 then
    return 'conflito';
  end if;
  return 'aplicada';
end $function$;
