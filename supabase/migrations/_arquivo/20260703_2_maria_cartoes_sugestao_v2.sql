-- Fase 4 / Fatia C v2: separa sugestao read-only da aplicacao das sugestoes.
-- Preserva o algoritmo auditado: regras editaveis > historico confirmado > pendente/conflito.

drop function if exists public.maria_cartoes_sugerir_classificacao(
  text,
  text,
  text,
  uuid,
  date,
  boolean,
  numeric,
  text,
  text
);

create or replace function public.maria_cartoes_classificacao_sugestoes_calcular(
  p_cartao_id uuid,
  p_competencia date,
  p_limiar_confianca numeric default 0.80
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cartao public.financeiro_cartoes%rowtype;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_fatura_id uuid;
  v_empresa_id uuid;
  v_centro_custo_id uuid;
  v_total_pendentes int := 0;
  v_sugeridas int := 0;
  v_pendentes int := 0;
  v_conflitos int := 0;
  v_linhas jsonb := '[]'::jsonb;
  v_ordem int := 0;
  v_transacao record;
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
  v_confianca numeric;
  v_origem text;
  v_acao text;
  v_triade_valida boolean;
begin
  if p_cartao_id is null then
    raise exception 'p_cartao_id obrigatorio.';
  end if;

  if p_competencia is null then
    raise exception 'p_competencia obrigatoria.';
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

  select * into v_fatura
    from public.financeiro_cartao_faturas f
   where f.cartao_id = p_cartao_id
     and f.competencia = date_trunc('month', p_competencia)::date;

  if not found then
    return jsonb_build_object(
      'success', true,
      'fatura_id', null,
      'cartao_id', p_cartao_id,
      'competencia', date_trunc('month', p_competencia)::date,
      'empresa_id', v_empresa_id,
      'centro_custo_id', v_centro_custo_id,
      'total_pendentes', 0,
      'sugeridas', 0,
      'pendentes', 0,
      'conflitos', 0,
      'aplicado', false,
      'linhas', '[]'::jsonb
    );
  end if;

  v_fatura_id := v_fatura.id;

  for v_transacao in
    select t.id, t.descricao, t.estabelecimento
      from public.financeiro_cartao_transacoes t
     where t.fatura_id = v_fatura_id
       -- confirmadas permanecem fora do conjunto calculado e aplicavel.
       and t.classificacao_status = 'pendente'
     order by t.data_compra, t.created_at, t.id
  loop
    v_total_pendentes := v_total_pendentes + 1;
    v_ordem := v_ordem + 1;
    v_texto_norm := public.maria_cartoes_normalizar_texto(
      coalesce(v_transacao.descricao, '') || ' ' || coalesce(v_transacao.estabelecimento, '')
    );

    v_regra_encontrada := false;
    v_regra_sem_sugestao := false;
    v_historico_conflito := false;
    v_plano_id := null;
    v_plano_codigo := null;
    v_confianca := null;
    v_origem := null;
    v_acao := 'pendente';
    v_triade_valida := false;
    v_historico_plano_id := null;
    v_historico_top_count := 0;
    v_historico_total := 0;
    v_historico_second_count := 0;

    -- Regra ativa tem precedencia sobre historico. Regra NULL e uma decisao explicita de nao sugerir.
    select
      r.id,
      r.palavra_chave,
      r.plano_conta_id,
      r.confianca_base,
      r.prioridade,
      p.codigo as plano_codigo
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
           and ht.id <> v_transacao.id
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

          select p.codigo into v_plano_codigo
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

    v_linhas := v_linhas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'ordem', v_ordem,
      'transacao_id', v_transacao.id,
      'descricao', v_transacao.descricao,
      'acao', v_acao,
      'plano_conta_id', case when v_acao = 'sugerida' then v_plano_id else null end,
      'plano_sugerido_codigo', case when v_acao = 'sugerida' then v_plano_codigo else null end,
      'confianca', case when v_acao = 'sugerida' then v_confianca else null end,
      'origem', v_origem
    )));
  end loop;

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_fatura_id,
    'cartao_id', p_cartao_id,
    'competencia', date_trunc('month', p_competencia)::date,
    'empresa_id', v_empresa_id,
    'centro_custo_id', v_centro_custo_id,
    'total_pendentes', v_total_pendentes,
    'sugeridas', v_sugeridas,
    'pendentes', v_pendentes,
    'conflitos', v_conflitos,
    'aplicado', false,
    'linhas', v_linhas
  );
end;
$$;

create or replace function public.maria_cartoes_sugerir_classificacao(
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_cartao_id uuid,
  p_competencia date,
  p_limiar_confianca numeric default 0.80,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_calc jsonb;
  v_linhas_publicas jsonb;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_calc := public.maria_cartoes_classificacao_sugestoes_calcular(
    p_cartao_id,
    p_competencia,
    p_limiar_confianca
  );

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'transacao_id', linha.transacao_id,
    'descricao', linha.descricao,
    'acao', linha.acao,
    'plano_sugerido_codigo', case when linha.acao = 'sugerida' then linha.plano_sugerido_codigo else null end,
    'confianca', case when linha.acao = 'sugerida' then linha.confianca else null end,
    'origem', linha.origem
  )) order by linha.ordem), '[]'::jsonb)
    into v_linhas_publicas
    from jsonb_to_recordset(v_calc->'linhas') as linha(
      ordem int,
      transacao_id uuid,
      descricao text,
      acao text,
      plano_conta_id uuid,
      plano_sugerido_codigo text,
      confianca numeric,
      origem text
    );

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_calc->>'fatura_id',
    'total_pendentes', (v_calc->>'total_pendentes')::int,
    'sugeridas', (v_calc->>'sugeridas')::int,
    'pendentes', (v_calc->>'pendentes')::int,
    'conflitos', (v_calc->>'conflitos')::int,
    'aplicado', false,
    'linhas', v_linhas_publicas
  );
end;
$$;

create or replace function public.maria_cartoes_aplicar_sugestao(
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_cartao_id uuid,
  p_competencia date,
  p_limiar_confianca numeric default 0.80,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_ator_numero text;
  v_cartao_ator jsonb;
  v_calc jsonb;
  v_linhas_publicas jsonb;
  v_classificar_result jsonb;
  linha record;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_ator_numero := public.maria_normalizar_numero(p_ator_numero);
  v_cartao_ator := jsonb_build_object('tipo', 'maria', 'ref', v_ator_numero);

  v_calc := public.maria_cartoes_classificacao_sugestoes_calcular(
    p_cartao_id,
    p_competencia,
    p_limiar_confianca
  );

  for linha in
    select *
      from jsonb_to_recordset(v_calc->'linhas') as linha(
        ordem int,
        transacao_id uuid,
        descricao text,
        acao text,
        plano_conta_id uuid,
        plano_sugerido_codigo text,
        confianca numeric,
        origem text
      )
     where linha.acao = 'sugerida'
     order by linha.ordem
  loop
    v_classificar_result := public.financeiro_cartao_transacao_classificar(
      jsonb_build_object(
        'transacao_id', linha.transacao_id,
        'classificacao_status', 'sugerida',
        'plano_conta_id', linha.plano_conta_id,
        'empresa_id', (v_calc->>'empresa_id')::uuid,
        'centro_custo_id', (v_calc->>'centro_custo_id')::uuid,
        'motivo', coalesce(nullif(p_motivo, ''), 'Sugestao de classificacao da Maria')
      ),
      v_cartao_ator
    );
  end loop;

  if (v_calc->>'fatura_id') is not null then
    perform public.maria_audit_insert(
      v_actor,
      p_ator_numero,
      p_canal,
      'financeiro_cartao_faturas',
      'cartao_fatura',
      (v_calc->>'fatura_id')::uuid,
      'aplicar_sugestao_classificacao_cartao',
      null,
      jsonb_build_object(
        'cartao_id', p_cartao_id,
        'competencia', (v_calc->>'competencia')::date,
        'total_pendentes', (v_calc->>'total_pendentes')::int,
        'sugeridas', (v_calc->>'sugeridas')::int,
        'pendentes', (v_calc->>'pendentes')::int,
        'conflitos', (v_calc->>'conflitos')::int,
        'aplicado', true
      ),
      p_motivo,
      p_texto_original
    );
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'transacao_id', linha.transacao_id,
    'descricao', linha.descricao,
    'acao', linha.acao,
    'plano_sugerido_codigo', case when linha.acao = 'sugerida' then linha.plano_sugerido_codigo else null end,
    'confianca', case when linha.acao = 'sugerida' then linha.confianca else null end,
    'origem', linha.origem
  )) order by linha.ordem), '[]'::jsonb)
    into v_linhas_publicas
    from jsonb_to_recordset(v_calc->'linhas') as linha(
      ordem int,
      transacao_id uuid,
      descricao text,
      acao text,
      plano_conta_id uuid,
      plano_sugerido_codigo text,
      confianca numeric,
      origem text
    );

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_calc->>'fatura_id',
    'total_pendentes', (v_calc->>'total_pendentes')::int,
    'sugeridas', (v_calc->>'sugeridas')::int,
    'pendentes', (v_calc->>'pendentes')::int,
    'conflitos', (v_calc->>'conflitos')::int,
    'aplicado', true,
    'linhas', v_linhas_publicas
  );
end;
$$;

revoke all on function public.maria_cartoes_classificacao_sugestoes_calcular(
  uuid, date, numeric
) from public, anon, authenticated, maria_operacional, maria_leitura;

revoke all on function public.maria_cartoes_sugerir_classificacao(
  text, text, text, uuid, date, numeric, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_sugerir_classificacao(
  text, text, text, uuid, date, numeric, text, text
) to maria_operacional;

revoke all on function public.maria_cartoes_aplicar_sugestao(
  text, text, text, uuid, date, numeric, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_aplicar_sugestao(
  text, text, text, uuid, date, numeric, text, text
) to maria_operacional;

comment on function public.maria_cartoes_classificacao_sugestoes_calcular(uuid, date, numeric) is
  'Helper interno da Maria: calcula sugestoes de classificacao de cartao sem gravar; sem grant operacional direto.';

comment on function public.maria_cartoes_sugerir_classificacao(text, text, text, uuid, date, numeric, text, text) is
  'Maria operational RPC read-only: calcula sugestoes de classificacao de cartao sem gravar e sem audit.';

comment on function public.maria_cartoes_aplicar_sugestao(text, text, text, uuid, date, numeric, text, text) is
  'Maria operational RPC: aplica sugestoes de classificacao de cartao via financeiro_cartao_transacao_classificar; nunca confirma automaticamente.';
