-- Fase 4 / Fatia C v2 hotfix: evita colisao entre variavel record e alias de jsonb_to_recordset.

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
  v_linha record;
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

  for v_linha in
    select *
      from jsonb_to_recordset(v_calc->'linhas') as item(
        ordem int,
        transacao_id uuid,
        descricao text,
        acao text,
        plano_conta_id uuid,
        plano_sugerido_codigo text,
        confianca numeric,
        origem text
      )
     where item.acao = 'sugerida'
     order by item.ordem
  loop
    v_classificar_result := public.financeiro_cartao_transacao_classificar(
      jsonb_build_object(
        'transacao_id', v_linha.transacao_id,
        'classificacao_status', 'sugerida',
        'plano_conta_id', v_linha.plano_conta_id,
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
    'transacao_id', item.transacao_id,
    'descricao', item.descricao,
    'acao', item.acao,
    'plano_sugerido_codigo', case when item.acao = 'sugerida' then item.plano_sugerido_codigo else null end,
    'confianca', case when item.acao = 'sugerida' then item.confianca else null end,
    'origem', item.origem
  )) order by item.ordem), '[]'::jsonb)
    into v_linhas_publicas
    from jsonb_to_recordset(v_calc->'linhas') as item(
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

revoke all on function public.maria_cartoes_aplicar_sugestao(
  text, text, text, uuid, date, numeric, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_aplicar_sugestao(
  text, text, text, uuid, date, numeric, text, text
) to maria_operacional;

comment on function public.maria_cartoes_aplicar_sugestao(text, text, text, uuid, date, numeric, text, text) is
  'Maria operational RPC: aplica sugestoes de classificacao de cartao via financeiro_cartao_transacao_classificar; nunca confirma automaticamente.';
