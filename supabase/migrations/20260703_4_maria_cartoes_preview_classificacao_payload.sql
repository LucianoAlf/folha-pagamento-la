-- Maria Cartões — pré-classificação read-only de linhas de preview WhatsApp.
-- Objetivo: mostrar plano sugerido/pendente antes de lançar, usando regras + histórico confirmado.
-- Guardrail: não grava nada, não confirma classificação, não cria regra automaticamente.

create or replace function public.maria_cartoes_preview_classificar_linhas(
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_cartao_id uuid,
  p_linhas jsonb,
  p_limiar_confianca numeric default 0.80
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_cartao public.financeiro_cartoes%rowtype;
  v_empresa_id uuid;
  v_centro_custo_id uuid;
  v_linha record;
  v_ordem int := 0;
  v_total int := 0;
  v_sugeridas int := 0;
  v_pendentes int := 0;
  v_conflitos int := 0;
  v_result jsonb := '[]'::jsonb;
  v_texto_norm text;
  v_regra record;
  v_regra_encontrada boolean;
  v_regra_sem_sugestao boolean;
  v_historico_plano_id uuid;
  v_historico_top_count int;
  v_historico_total int;
  v_historico_second_count int;
  v_historico_conflito boolean;
  v_plano_id uuid;
  v_plano_codigo text;
  v_plano_nome text;
  v_confianca numeric;
  v_origem text;
  v_acao text;
  v_triade_valida boolean;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_cartao_id is null then
    raise exception 'p_cartao_id obrigatorio.';
  end if;

  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'p_linhas deve ser array jsonb.';
  end if;

  if p_limiar_confianca is null or p_limiar_confianca < 0 or p_limiar_confianca > 1 then
    raise exception 'p_limiar_confianca deve estar entre 0 e 1.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = p_cartao_id
     and ativo = true;

  if not found then
    raise exception 'cartao nao encontrado ou inativo.';
  end if;

  v_empresa_id := v_cartao.empresa_id;
  v_centro_custo_id := v_cartao.centro_custo_id;

  for v_linha in
    select *
      from jsonb_to_recordset(p_linhas) as x(
        numero_linha int,
        descricao text,
        estabelecimento text,
        valor numeric,
        data_compra date,
        tipo_transacao text
      )
  loop
    v_ordem := v_ordem + 1;
    v_total := v_total + 1;
    v_texto_norm := public.maria_cartoes_normalizar_texto(
      coalesce(v_linha.descricao, '') || ' ' || coalesce(v_linha.estabelecimento, '')
    );

    v_regra_encontrada := false;
    v_regra_sem_sugestao := false;
    v_historico_conflito := false;
    v_plano_id := null;
    v_plano_codigo := null;
    v_plano_nome := null;
    v_confianca := null;
    v_origem := null;
    v_acao := 'pendente';
    v_triade_valida := false;
    v_historico_plano_id := null;
    v_historico_top_count := 0;
    v_historico_total := 0;
    v_historico_second_count := 0;

    select
      r.id,
      r.palavra_chave,
      r.plano_conta_id,
      r.confianca_base,
      r.prioridade,
      p.codigo as plano_codigo,
      p.nome as plano_nome
      into v_regra
      from public.maria_classificacao_regras r
      left join public.plano_contas p on p.id = r.plano_conta_id
     where r.ativo = true
       and r.escopo in ('cartao','geral')
       and position(r.palavra_chave in v_texto_norm) > 0
     order by r.prioridade desc, r.confianca_base desc, r.created_at asc
     limit 1;

    v_regra_encontrada := found;

    if v_regra_encontrada and v_regra.plano_conta_id is null then
      v_regra_sem_sugestao := true;
    end if;

    if v_regra_sem_sugestao then
      v_acao := 'pendente';
      v_origem := 'regra_sem_sugestao';
    elsif v_regra_encontrada then
      v_plano_id := v_regra.plano_conta_id;
      v_plano_codigo := v_regra.plano_codigo;
      v_plano_nome := v_regra.plano_nome;
      v_confianca := v_regra.confianca_base;
      v_origem := 'regra';
    end if;

    if v_plano_id is null and not v_regra_sem_sugestao then
      with tokens as (
        select distinct token
          from regexp_split_to_table(v_texto_norm, ' ') as token
         where length(token) >= 4
      ),
      historico_plano as (
        select ht.plano_conta_id, count(*)::int as ocorrencias
          from public.financeiro_cartao_transacoes ht
         where ht.plano_conta_id is not null
           and ht.classificacao_status = 'confirmada'
           and exists (
             select 1
               from tokens tk
              where position(tk.token in public.maria_cartoes_normalizar_texto(coalesce(ht.descricao, '') || ' ' || coalesce(ht.estabelecimento, ''))) > 0
           )
         group by ht.plano_conta_id
        union all
        select cp.plano_conta_id, count(*)::int as ocorrencias
          from public.contas_pagar cp
         where cp.plano_conta_id is not null
           and coalesce(cp.status, '') <> 'cancelado'
           and exists (
             select 1
               from tokens tk
              where position(tk.token in public.maria_cartoes_normalizar_texto(coalesce(cp.descricao, '') || ' ' || coalesce(cp.observacoes, ''))) > 0
           )
         group by cp.plano_conta_id
      ),
      historico_agg as (
        select plano_conta_id, sum(ocorrencias)::int as ocorrencias
          from historico_plano
         group by plano_conta_id
      ),
      ranked as (
        select
          plano_conta_id,
          ocorrencias,
          sum(ocorrencias) over ()::int as total,
          row_number() over (order by ocorrencias desc, plano_conta_id) as rn
        from historico_agg
      )
      select r1.plano_conta_id,
             r1.ocorrencias,
             r1.total,
             coalesce(r2.ocorrencias, 0)
        into v_historico_plano_id,
             v_historico_top_count,
             v_historico_total,
             v_historico_second_count
        from ranked r1
        left join ranked r2 on r2.rn = 2
       where r1.rn = 1;

      if v_historico_plano_id is not null then
        if v_historico_second_count > 0
           and (v_historico_second_count::numeric / greatest(v_historico_total, 1)) >= 0.35 then
          v_historico_conflito := true;
          v_acao := 'conflito';
          v_origem := 'historico_conflito';
        else
          v_plano_id := v_historico_plano_id;
          v_confianca := round(least(0.90, 0.65 + (v_historico_top_count::numeric / greatest(v_historico_total, 1)) * 0.25), 2);
          v_origem := 'historico';

          select p.codigo, p.nome
            into v_plano_codigo, v_plano_nome
            from public.plano_contas p
           where p.id = v_plano_id;
        end if;
      else
        v_origem := coalesce(v_origem, 'sem_historico');
      end if;
    end if;

    if v_plano_id is not null and not v_historico_conflito then
      select exists (
        select 1
          from public.plano_contas p
          join public.financeiro_empresas e on e.id = v_empresa_id
         where p.id = v_plano_id
           and p.nivel = 3
           and p.natureza = 'saida'
           and p.ativo = true
           and e.ativo = true
           and e.unidade_id = v_centro_custo_id
      ) into v_triade_valida;

      if v_triade_valida and v_confianca >= p_limiar_confianca then
        v_acao := 'sugerida';
      elsif v_confianca < p_limiar_confianca then
        v_acao := 'pendente';
        v_origem := coalesce(v_origem, 'baixa_confianca');
      else
        v_acao := 'pendente';
        v_origem := coalesce(v_origem, 'triade_invalida');
      end if;
    end if;

    if v_acao = 'sugerida' then
      v_sugeridas := v_sugeridas + 1;
    elsif v_acao = 'conflito' then
      v_conflitos := v_conflitos + 1;
    else
      v_pendentes := v_pendentes + 1;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'numero_linha', coalesce(v_linha.numero_linha, v_ordem),
      'descricao', v_linha.descricao,
      'valor', v_linha.valor,
      'acao', v_acao,
      'plano_sugerido_id', case when v_acao = 'sugerida' then v_plano_id else null end,
      'plano_sugerido_codigo', case when v_acao = 'sugerida' then v_plano_codigo else null end,
      'plano_sugerido_nome', case when v_acao = 'sugerida' then v_plano_nome else null end,
      'confianca', case when v_acao = 'sugerida' then v_confianca else null end,
      'origem', v_origem
    )));
  end loop;

  return jsonb_build_object(
    'success', true,
    'total_linhas', v_total,
    'sugeridas', v_sugeridas,
    'pendentes', v_pendentes,
    'conflitos', v_conflitos,
    'linhas', v_result
  );
end;
$$;

revoke all on function public.maria_cartoes_preview_classificar_linhas(
  text, text, text, uuid, jsonb, numeric
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_preview_classificar_linhas(
  text, text, text, uuid, jsonb, numeric
) to maria_operacional;

comment on function public.maria_cartoes_preview_classificar_linhas(text, text, text, uuid, jsonb, numeric) is
  'Maria operational RPC read-only: classifica linhas de preview de fatura de cartão por regras e histórico confirmado; não grava e nunca confirma automaticamente.';
