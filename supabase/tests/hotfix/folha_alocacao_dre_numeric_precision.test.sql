begin;

insert into public.folhas_mensais (id, status)
values (910001, 'rascunho');

insert into public.colaboradores (id, nome, is_rateado, unidade_fixa)
values (910001, 'Teste Precisao Numerica', true, null);

insert into public.folha_classificacao_dre (
  folha_id, lancamento_folha_id, sequencia, colaborador_id, competencia,
  categoria_usada, tipo_usado, funcao_usada, unidade_usada,
  conta_pagadora_id_usada, componente, tipo_efeito, valor_original,
  valor_assinado, plano_conta_id, plano_codigo_usado, plano_nome_usado,
  tratamento, escopo_dre, regra_id, ruleset_version, motivo,
  bistro_competencia_id, bistro_ref_ym, classificado_por, hash_origem
)
values (
  910001, 920001, 1, 910001, date '2026-07-01',
  'professor', 'clt', 'professor', 'cg',
  null, 'salario', 'provento', 1000000.00,
  1000000.00, null, null, null,
  'automatico', 'operacional', null, 1, 'fixture de precisao',
  null, '2026-07', 'fixture-precisao', repeat('a', 64)
);

do $$
declare
  v_source_hash text;
  v_rejeitado boolean := false;
begin
  v_source_hash := public.folha_alocacao_dre_source_hash(910001, 910001);

  begin
    perform public.folha_alocacao_dre_salvar(
      910001,
      910001,
      jsonb_build_array(
        jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'cg',  'percentual', 33.3333335),
        jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'rec', 'percentual', 33.3333335),
        jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'bar', 'percentual', 33.333333)
      ),
      v_source_hash,
      jsonb_build_object('ref', 'teste-precisao'),
      null
    );
  exception
    when others then
      if sqlerrm = 'percentuais da distribuicao-base devem somar 100.' then
        v_rejeitado := true;
      else
        raise;
      end if;
  end;

  if not v_rejeitado then
    raise exception 'cenario patologico deveria ser rejeitado apos canonicalizacao';
  end if;

  perform public.folha_alocacao_dre_salvar(
    910001,
    910001,
    jsonb_build_array(
      jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'cg',  'percentual', 33.333333),
      jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'rec', 'percentual', 33.333333),
      jsonb_build_object('categoria', null, 'componente', null, 'unidade', 'bar', 'percentual', 33.333334)
    ),
    v_source_hash,
    jsonb_build_object('ref', 'teste-precisao'),
    null
  );
end;
$$;

do $$
declare
  v_total numeric;
  v_hash_gravado text;
  v_hash_recalculado text;
begin
  select sum(valor_assinado_rateado)
    into v_total
    from public.folha_alocacao_dre_resolver(910001, 910001);

  if v_total <> 1000000.00::numeric then
    raise exception 'resolver perdeu centavos: total %', v_total;
  end if;

  select
    c.allocation_hash,
    public.folha_alocacao_dre_allocation_hash(
      jsonb_agg(
        jsonb_build_object(
          'categoria', f.categoria,
          'componente', f.componente,
          'unidade', f.unidade,
          'percentual', f.percentual
        )
        order by coalesce(f.categoria, ''), coalesce(f.componente, ''), f.unidade
      )
    )
    into v_hash_gravado, v_hash_recalculado
    from public.folha_alocacao_dre_confirmacoes c
    join public.folha_alocacao_dre_fatias f on f.confirmacao_id = c.id
   where c.folha_id = 910001
     and c.colaborador_id = 910001
     and c.ativa = true
   group by c.allocation_hash;

  if v_hash_gravado is distinct from v_hash_recalculado then
    raise exception 'allocation_hash nao corresponde as fatias persistidas';
  end if;
end;
$$;

do $$
declare
  v_invalid_id uuid;
  v_source_hash text;
  v_rejeitado boolean := false;
begin
  perform set_config('app.folha_alocacao_dre_rpc', 'on', true);
  update public.folha_alocacao_dre_confirmacoes
     set ativa = false
   where folha_id = 910001
     and colaborador_id = 910001
     and ativa = true;

  v_source_hash := public.folha_alocacao_dre_source_hash(910001, 910001);

  insert into public.folha_alocacao_dre_confirmacoes (
    folha_id, colaborador_id, versao, source_hash, allocation_hash,
    origem, confirmado_por, ativa
  )
  values (
    910001, 910001, 2, v_source_hash, repeat('0', 64),
    'confirmada_operador', 'fixture-invalida', true
  )
  returning id into v_invalid_id;

  insert into public.folha_alocacao_dre_fatias (
    confirmacao_id, categoria, componente, unidade, percentual
  )
  values
    (v_invalid_id, null, null, 'cg', 50.000001),
    (v_invalid_id, null, null, 'rec', 50.000000);

  begin
    perform 1
      from public.folha_alocacao_dre_resolver(910001, 910001);
  exception
    when others then
      if sqlerrm = 'rateio DRE gerou centavos_faltantes negativo; distribuicao invalida.' then
        v_rejeitado := true;
      else
        raise;
      end if;
  end;

  if not v_rejeitado then
    raise exception 'resolver deveria rejeitar centavos_faltantes negativo';
  end if;
end;
$$;

do $$
declare
  v_ok integer;
begin
  select count(*)
    into v_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (
       (p.proname = 'folha_alocacao_dre_allocation_hash' and p.provolatile = 'i')
       or (p.proname = 'folha_alocacao_dre_gravar' and p.provolatile = 'v')
       or (p.proname = 'folha_alocacao_dre_resolver' and p.provolatile = 's')
     )
     and p.prosecdef = true
     and p.proconfig @> array['search_path=public, pg_temp'];

  if v_ok <> 3 then
    raise exception 'atributos pg_proc incorretos; esperadas 3 funcoes, encontradas %', v_ok;
  end if;

  if has_function_privilege('anon', 'public.folha_alocacao_dre_allocation_hash(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.folha_alocacao_dre_allocation_hash(jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.folha_alocacao_dre_allocation_hash(jsonb)', 'execute') then
    raise exception 'ACL de allocation_hash foi ampliada';
  end if;

  if has_function_privilege('anon', 'public.folha_alocacao_dre_gravar(integer,integer,jsonb,text,text,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.folha_alocacao_dre_gravar(integer,integer,jsonb,text,text,text,text,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.folha_alocacao_dre_gravar(integer,integer,jsonb,text,text,text,text,jsonb)', 'execute') then
    raise exception 'ACL de gravar foi ampliada';
  end if;

  if has_function_privilege('anon', 'public.folha_alocacao_dre_resolver(integer,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.folha_alocacao_dre_resolver(integer,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.folha_alocacao_dre_resolver(integer,integer)', 'execute') then
    raise exception 'ACL publica de resolver regrediu';
  end if;
end;
$$;

rollback;
