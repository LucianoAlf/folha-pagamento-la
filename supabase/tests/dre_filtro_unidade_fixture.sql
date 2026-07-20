-- Fixture comportamental do filtro de unidade DRE.
-- SOMENTE LOCAL/CI: execute exclusivamente pelo harness PostgreSQL 17 efemero
-- supabase/tests/run_dre_filtro_unidade_fixture.mjs. Nunca aponte para Supabase
-- remoto ou para um banco que contenha dados persistentes.
\set ON_ERROR_STOP on

begin;

do $$
begin
  if current_setting('app.dre_fixture_guard', true) is distinct from 'local_ci_only' then
    raise exception
      'REFUSED: app.dre_fixture_guard=local_ci_only e obrigatorio para este fixture local/CI.';
  end if;

  if current_database() is distinct from 'dre_filtro_unidade_fixture' then
    raise exception
      'REFUSED: banco % nao e o banco efemero dre_filtro_unidade_fixture.',
      current_database();
  end if;
end;
$$;

insert into public.centros_custo (id, codigo, nome)
values
  ('00000000-0000-0000-0000-000000000001', 'cg', 'Campo Grande'),
  ('00000000-0000-0000-0000-000000000002', 'rec', 'Recreio'),
  ('00000000-0000-0000-0000-000000000003', 'bar', 'Barra');

insert into public.plano_contas (id, codigo, nome, nome_completo)
values (
  '00000000-0000-0000-0000-000000000100',
  '5.1.01',
  'Pessoal',
  'Despesas fixas > Pessoal'
);

insert into public.financeiro_empresas (
  id, razao_social, nome_fantasia, label_operacional
)
values (
  '00000000-0000-0000-0000-000000000200',
  'Empresa Fixture LTDA',
  'Fixture',
  'Fixture CG'
);

insert into public.financeiro_contas_bancarias (id, empresa_id, conta)
values (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000200',
  'fixture-001'
);

insert into public.folhas_mensais (id, ano, mes, status)
values (910001, 2026, 6, 'fechada');

insert into public.colaboradores (id, nome, nome_completo)
values
  (930001, 'Colaborador Rateado', 'Colaborador Rateado'),
  (930002, 'Colaborador Sem Rateio', 'Colaborador Sem Rateio');

insert into public.folha_classificacao_dre (
  folha_id,
  lancamento_folha_id,
  componente,
  sequencia,
  conta_pagadora_id_usada
)
values
  (
    910001,
    920001,
    'salario',
    1,
    '00000000-0000-0000-0000-000000000300'
  ),
  (
    910001,
    920002,
    'bonus',
    2,
    '00000000-0000-0000-0000-000000000300'
  );

insert into public.fixture_folha_alocacao_dre_resolvida (
  folha_id,
  lancamento_folha_id,
  sequencia,
  colaborador_id,
  competencia,
  categoria_usada,
  tipo_usado,
  funcao_usada,
  componente,
  tipo_efeito,
  valor_original,
  valor_assinado_original,
  valor_assinado_rateado,
  plano_conta_id,
  plano_codigo_usado,
  plano_nome_usado,
  tratamento,
  escopo_dre,
  regra_id,
  ruleset_version,
  motivo,
  bistro_competencia_id,
  bistro_ref_ym,
  hash_origem,
  unidade_dre,
  percentual_aplicado,
  confirmacao_id,
  source_hash,
  allocation_hash,
  estado_alocacao
)
values
  (
    910001, 920001, 1, 930001, date '2026-06-01',
    'professor', 'clt', 'professor', 'salario', 'provento',
    300.00, 300.00, 100.00,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture rateado',
    null, '2026-06', repeat('a', 64),
    'cg', 33.333333,
    '00000000-0000-0000-0000-000000000601',
    repeat('b', 64), repeat('c', 64), 'pronto'
  ),
  (
    910001, 920001, 1, 930001, date '2026-06-01',
    'professor', 'clt', 'professor', 'salario', 'provento',
    300.00, 300.00, 100.00,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture rateado',
    null, '2026-06', repeat('a', 64),
    'rec', 33.333333,
    '00000000-0000-0000-0000-000000000601',
    repeat('b', 64), repeat('c', 64), 'pronto'
  ),
  (
    910001, 920001, 1, 930001, date '2026-06-01',
    'professor', 'clt', 'professor', 'salario', 'provento',
    300.00, 300.00, 100.00,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture rateado',
    null, '2026-06', repeat('a', 64),
    'bar', 33.333334,
    '00000000-0000-0000-0000-000000000601',
    repeat('b', 64), repeat('c', 64), 'pronto'
  ),
  (
    910001, 920002, 2, 930002, date '2026-06-01',
    'administrativo', 'clt', 'administrativo', 'bonus', 'provento',
    90.00, 90.00, 90.00,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture sem rateio',
    null, '2026-06', repeat('d', 64),
    null, null, null, repeat('e', 64), null, 'sem_alocacao'
  );

-- Tres candidatos da mesma folha/conta: o pago de julho e o unico elegivel
-- para Caixa/2026-07. O pago de agosto e mais novo; o terceiro nao foi pago.
insert into public.contas_pagar (
  id,
  competencia,
  data_pagamento,
  conta_pagadora_id,
  descricao,
  fonte_tipo,
  fonte_identificador,
  valor,
  status,
  plano_conta_id,
  centro_custo_id,
  unidade,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    date '2026-06-01', timestamptz '2026-07-10 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Folha paga em julho', 'folha_pagamento', '910001', 390.00, 'pago',
    null, '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-07-10 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    date '2026-06-01', timestamptz '2026-08-02 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Folha concorrente paga em agosto', 'folha_pagamento', '910001', 390.00, 'pago',
    null, '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-09-01 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000403',
    date '2026-06-01', null,
    '00000000-0000-0000-0000-000000000300',
    'Folha concorrente ainda pendente', 'folha_pagamento', '910001', 123.45, 'pendente',
    null, '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-10-01 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000404',
    date '2026-06-01', timestamptz '2026-07-08 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Fornecedor CG', 'fornecedor', 'fornecedor-cg', 60.00, 'pago',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-07-08 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000405',
    date '2026-06-01', timestamptz '2026-07-09 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Fatura cartao', 'cartao', 'fatura-fixture', 40.00, 'pago',
    null, '00000000-0000-0000-0000-000000000002', null,
    timestamptz '2026-07-09 13:00:00+00'
  );

insert into public.financeiro_cartoes (id, conta_pagadora_id, apelido)
values (
  '00000000-0000-0000-0000-000000000500',
  '00000000-0000-0000-0000-000000000300',
  'Cartao fixture'
);

insert into public.financeiro_cartao_faturas (
  id, cartao_id, competencia, status, conta_pagar_id
)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000500',
  date '2026-06-01',
  'fechada',
  '00000000-0000-0000-0000-000000000405'
);

insert into public.financeiro_cartao_transacoes (
  id,
  fatura_id,
  cartao_id,
  descricao,
  estabelecimento,
  valor,
  plano_conta_id,
  centro_custo_id,
  classificacao_status
)
values (
  '00000000-0000-0000-0000-000000000502',
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000500',
  'Compra nao confirmada',
  'Loja fixture',
  40.00,
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002',
  'pendente'
);

do $$
declare
  v_count integer;
  v_result jsonb;
begin
  select count(*)
    into v_count
    from public.contas_pagar cp
   where cp.fonte_tipo = 'folha_pagamento'
     and cp.fonte_identificador = '910001'
     and cp.conta_pagadora_id = '00000000-0000-0000-0000-000000000300';

  if v_count <> 3 then
    raise exception 'cenario A invalido: esperados 3 candidatos de folha, encontrados %', v_count;
  end if;

  if not (
    (select updated_at from public.contas_pagar where id = '00000000-0000-0000-0000-000000000402')
    >
    (select updated_at from public.contas_pagar where id = '00000000-0000-0000-0000-000000000401')
  ) then
    raise exception 'cenario A invalido: o candidato fora do mes deveria ser mais novo';
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
   where l.fonte = 'folha';

  if v_count <> 4 then
    raise exception 'cenario A caixa: esperadas 4 linhas de folha, encontradas %', v_count;
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
   where l.fonte = 'folha'
     and l.origem_id = '920001'
     and l.data_caixa = date '2026-07-10'
     and l.valor_origem = 100.00;

  if v_count <> 3 then
    raise exception
      'cenario A caixa: as 3 fatias exatas do pagamento de julho nao foram preservadas; encontradas %',
      v_count;
  end if;

  if exists (
    select 1
      from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
     where l.fonte = 'folha'
       and l.data_caixa is distinct from date '2026-07-10'
  ) then
    raise exception 'cenario A caixa: folha vinculada ao pagamento fora de julho ou nao pago';
  end if;

  if not exists (
    select 1
      from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
     where l.fonte = 'contas_pagar'
       and l.origem_id = '00000000-0000-0000-0000-000000000401'
  ) then
    raise exception 'cenario A caixa: titulo de folha pago em julho deveria estar na reconciliacao';
  end if;

  if exists (
    select 1
      from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
     where l.fonte = 'contas_pagar'
       and l.origem_id in (
         '00000000-0000-0000-0000-000000000402',
         '00000000-0000-0000-0000-000000000403'
       )
  ) then
    raise exception 'cenario A caixa: titulo fora do mes ou nao pago entrou no normalizador';
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-06-01', 'competencia') l
   where l.fonte = 'folha'
     and l.data_referencia = date '2026-06-01';

  if v_count <> 4 then
    raise exception
      'cenario A competencia: folha economica de junho dependeu indevidamente do pagamento; linhas %',
      v_count;
  end if;

  select public.dre_consultar(date '2026-07-01', 'caixa') into v_result;
  if (v_result #>> '{kpis,lucro_liquido}')::numeric <> -450.00 then
    raise exception
      'cenario A dre_consultar: lucro liquido caixa esperado -450.00, recebido %',
      v_result #>> '{kpis,lucro_liquido}';
  end if;

  raise notice 'PASS cenario A: caixa escolheu julho antes do LIMIT e competencia permaneceu economica';
end;
$$;

do $$
declare
  v_cursor jsonb := null;
  v_page jsonb;
  v_item jsonb;
  v_units text[] := array[]::text[];
  v_pages integer := 0;
  v_items integer := 0;
  v_count integer;
begin
  loop
    v_pages := v_pages + 1;
    if v_pages > 10 then
      raise exception 'cenario B paginacao: cursor nao terminou em ate 10 paginas';
    end if;

    v_page := public.dre_detalhes(
      date '2026-07-01',
      'caixa',
      '5.1.01',
      'folha',
      'consolidado',
      v_cursor,
      1
    );

    if jsonb_array_length(v_page->'itens') <> 1 then
      raise exception
        'cenario B paginacao: pagina % deveria conter 1 item; resposta %',
        v_pages,
        v_page;
    end if;

    v_item := v_page->'itens'->0;
    v_items := v_items + 1;

    if v_item->>'unidade_operacional' is not null then
      if v_item->>'plano_codigo' <> '5.1.01'
         or v_item->>'fonte' <> 'folha'
         or v_item->>'origem_id' <> '920001'
         or v_item->>'origem_sequencia' <> '000001:salario' then
        raise exception
          'cenario B paginacao: fatia perdeu identidade comum plano/fonte/origem/sequencia: %',
          v_item;
      end if;

      v_units := array_append(v_units, v_item->>'unidade_operacional');
    end if;

    v_cursor := v_page->'next_cursor';
    exit when v_cursor = 'null'::jsonb;
  end loop;

  if v_items <> 4 then
    raise exception
      'cenario B paginacao: esperadas 3 fatias e 1 linha sem unidade, encontrados % itens',
      v_items;
  end if;

  if cardinality(v_units) <> 3 then
    raise exception
      'cenario B paginacao: esperadas 3 unidades, recebido %',
      v_units;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'cg';
  if v_count <> 1 then
    raise exception 'cenario B paginacao: CG apareceu % vezes', v_count;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'rec';
  if v_count <> 1 then
    raise exception 'cenario B paginacao: REC apareceu % vezes', v_count;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'bar';
  if v_count <> 1 then
    raise exception 'cenario B paginacao: Barra apareceu % vezes', v_count;
  end if;

  raise notice
    'PASS cenario B: cursor percorreu % paginas sem pular/duplicar CG, REC e Barra',
    v_pages;
end;
$$;

do $$
declare
  v_regime text;
  v_competencia date;
  v_cons jsonb;
  v_cg jsonb;
  v_rec jsonb;
  v_bar jsonb;
  v_total numeric;
  v_units_total numeric;
  v_sem_total numeric;
  v_group_total numeric;
  v_group_units numeric;
  v_plan_total numeric;
  v_plan_units numeric;
begin
  foreach v_regime in array array['competencia', 'caixa'] loop
    v_competencia := case
      when v_regime = 'competencia' then date '2026-06-01'
      else date '2026-07-01'
    end;

    v_cons := public.dre_consultar(v_competencia, v_regime, 'consolidado');
    v_cg := public.dre_consultar(v_competencia, v_regime, 'cg');
    v_rec := public.dre_consultar(v_competencia, v_regime, 'rec');
    v_bar := public.dre_consultar(v_competencia, v_regime, 'bar');

    if v_cons->'cobertura' is distinct from v_cg->'cobertura'
       or v_cons->'cobertura' is distinct from v_rec->'cobertura'
       or v_cons->'cobertura' is distinct from v_bar->'cobertura' then
      raise exception 'cenario C %: cobertura mudou entre filtros de unidade', v_regime;
    end if;

    if v_cons->'reconciliacao' is distinct from v_cg->'reconciliacao'
       or v_cons->'reconciliacao' is distinct from v_rec->'reconciliacao'
       or v_cons->'reconciliacao' is distinct from v_bar->'reconciliacao' then
      raise exception 'cenario C %: reconciliacao mudou entre filtros de unidade', v_regime;
    end if;

    if v_cons->'sem_unidade_operacional' is distinct from v_cg->'sem_unidade_operacional'
       or v_cons->'sem_unidade_operacional' is distinct from v_rec->'sem_unidade_operacional'
       or v_cons->'sem_unidade_operacional' is distinct from v_bar->'sem_unidade_operacional' then
      raise exception 'cenario C %: diagnostico sem unidade mudou entre filtros', v_regime;
    end if;

    v_total := (v_cons #>> '{kpis,lucro_liquido}')::numeric;
    v_units_total :=
      (v_cg #>> '{kpis,lucro_liquido}')::numeric
      + (v_rec #>> '{kpis,lucro_liquido}')::numeric
      + (v_bar #>> '{kpis,lucro_liquido}')::numeric;
    v_sem_total := (v_cons #>> '{sem_unidade_operacional,valor_resultado}')::numeric;

    if v_total <> v_units_total + v_sem_total then
      raise exception
        'cenario C %: CG + REC + Barra + sem unidade = %, consolidado = %',
        v_regime,
        v_units_total + v_sem_total,
        v_total;
    end if;

    if (v_cons #>> '{sem_unidade_operacional,por_motivo,folha_sem_alocacao,valor_origem}')::numeric
       <> 90.00
       or (v_cons #>> '{sem_unidade_operacional,por_motivo,folha_sem_alocacao,valor_resultado}')::numeric
       <> -90.00
       or (v_cons #>> '{sem_unidade_operacional,por_motivo,folha_sem_alocacao,linhas}')::integer
       <> 1 then
      raise exception
        'cenario C %: valor de folha sem alocacao nao permaneceu no consolidado: %',
        v_regime,
        v_cons->'sem_unidade_operacional';
    end if;

    select (g->>'valor_resultado')::numeric
      into v_group_total
      from jsonb_array_elements(v_cons->'grupos') g
     where g->>'codigo' = '5';

    select sum((g->>'valor_resultado')::numeric)
      into v_group_units
      from (
        select jsonb_array_elements(v_cg->'grupos') as g
        union all
        select jsonb_array_elements(v_rec->'grupos') as g
        union all
        select jsonb_array_elements(v_bar->'grupos') as g
      ) unidades
     where g->>'codigo' = '5';

    if v_group_total <> v_group_units + v_sem_total then
      raise exception
        'cenario C %: grupo 5 nao fecha por particao; unidades %, sem %, consolidado %',
        v_regime,
        v_group_units,
        v_sem_total,
        v_group_total;
    end if;

    select (p->>'valor_resultado')::numeric
      into v_plan_total
      from jsonb_array_elements(v_cons->'planos') p
     where p->>'plano_codigo' = '5.1.01';

    select sum((p->>'valor_resultado')::numeric)
      into v_plan_units
      from (
        select jsonb_array_elements(v_cg->'planos') as p
        union all
        select jsonb_array_elements(v_rec->'planos') as p
        union all
        select jsonb_array_elements(v_bar->'planos') as p
      ) unidades
     where p->>'plano_codigo' = '5.1.01';

    if v_plan_total <> v_plan_units + v_sem_total then
      raise exception
        'cenario C %: plano 5.1.01 nao fecha por particao; unidades %, sem %, consolidado %',
        v_regime,
        v_plan_units,
        v_sem_total,
        v_plan_total;
    end if;

    raise notice
      'PASS cenario C (%): KPI, grupo e plano fecham centavo a centavo; diagnosticos invariantes',
      v_regime;
  end loop;
end;
$$;

do $$
declare
  v_regime text;
  v_competencia date;
  v_count integer;
  v_result jsonb;
begin
  foreach v_regime in array array['competencia', 'caixa'] loop
    v_competencia := case
      when v_regime = 'competencia' then date '2026-06-01'
      else date '2026-07-01'
    end;

    select count(*)
      into v_count
      from public.dre_linhas_normalizadas(v_competencia, v_regime) l
     where l.fonte = 'contas_pagar'
       and l.origem_id = '00000000-0000-0000-0000-000000000404'
       and l.unidade_operacional = 'cg'
       and l.qualidade_unidade = 'aproximada_fiscal_pagadora';

    if v_count <> 1 then
      raise exception
        'qualidade da fonte %: conta a pagar aproximada deveria aparecer uma vez, apareceu %',
        v_regime,
        v_count;
    end if;

    select count(*)
      into v_count
      from public.dre_linhas_normalizadas(v_competencia, v_regime) l
     where l.fonte = 'cartao'
       and l.origem_id = '00000000-0000-0000-0000-000000000502'
       and l.unidade_operacional is null
       and l.qualidade_unidade is null
       and l.motivo_sem_unidade = 'cartao_nao_confirmado'
       and l.status_classificacao = 'em_revisao';

    if v_count <> 1 then
      raise exception
        'qualidade da fonte %: cartao nao confirmado deveria ficar sem unidade, apareceu %',
        v_regime,
        v_count;
    end if;
  end loop;

  v_result := public.dre_detalhes(
    date '2026-07-01', 'caixa', '5.1.01', 'cartao', 'rec', null, 10
  );
  if jsonb_array_length(v_result->'itens') <> 0 then
    raise exception 'cartao nao confirmado apareceu no filtro explicito REC: %', v_result;
  end if;

  v_result := public.dre_consultar(date '2026-07-01', 'caixa', 'consolidado');
  if not (v_result ?& array[
    'success', 'competencia', 'regime', 'unidade', 'kpis', 'grupos', 'planos',
    'cobertura', 'reconciliacao', 'sem_unidade_operacional'
  ]) then
    raise exception 'estrutura de resposta dre_consultar incompleta: %', v_result;
  end if;

  raise notice 'PASS qualidade: CP aproximada e cartao nao confirmado sem unidade comprovados';
end;
$$;

do $$
declare
  v_default jsonb;
  v_explicit jsonb;
  v_details jsonb;
  v_proc_count integer;
begin
  v_default := public.dre_consultar(date '2026-07-01', 'caixa');
  v_explicit := public.dre_consultar(date '2026-07-01', 'caixa', 'consolidado');

  if v_default->>'unidade' <> 'consolidado'
     or v_default->'kpis' is distinct from v_explicit->'kpis' then
    raise exception 'default de dre_consultar nao equivale ao consolidado explicito';
  end if;

  v_details := public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha');
  if v_details->>'unidade' <> 'consolidado'
     or jsonb_array_length(v_details->'itens') <> 4 then
    raise exception 'default de dre_detalhes nao equivale ao consolidado: %', v_details;
  end if;

  if jsonb_array_length(
    public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'cg')->'itens'
  ) <> 1
     or jsonb_array_length(
       public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'rec')->'itens'
     ) <> 1
     or jsonb_array_length(
       public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'bar')->'itens'
     ) <> 1 then
    raise exception 'filtros explicitos de unidade nao retornaram exatamente uma fatia de folha';
  end if;

  select count(*)
    into v_proc_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('dre_linhas_normalizadas', 'dre_consultar', 'dre_detalhes')
     and p.provolatile = 's'
     and p.prosecdef
     and p.proconfig @> array['search_path=public, pg_temp'];

  if v_proc_count <> 3 then
    raise exception
      'seguranca DRE: esperadas 3 funcoes STABLE/SECURITY DEFINER/search_path fixo, encontradas %',
      v_proc_count;
  end if;

  if has_function_privilege(
       'anon', 'public.dre_linhas_normalizadas(date,text)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'public.dre_linhas_normalizadas(date,text)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.dre_linhas_normalizadas(date,text)', 'execute'
     ) then
    raise exception 'ACL da normalizadora DRE foi ampliada ou removeu service_role';
  end if;

  if has_function_privilege(
       'anon', 'public.dre_consultar(date,text,text)', 'execute'
     )
     or not has_function_privilege(
       'authenticated', 'public.dre_consultar(date,text,text)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.dre_consultar(date,text,text)', 'execute'
     ) then
    raise exception 'ACL de dre_consultar nao preservou anon/authenticated/service_role';
  end if;

  if has_function_privilege(
       'anon', 'public.dre_detalhes(date,text,text,text,text,jsonb,integer)', 'execute'
     )
     or not has_function_privilege(
       'authenticated', 'public.dre_detalhes(date,text,text,text,text,jsonb,integer)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.dre_detalhes(date,text,text,text,text,jsonb,integer)', 'execute'
     ) then
    raise exception 'ACL de dre_detalhes nao preservou anon/authenticated/service_role';
  end if;

  raise notice 'PASS defaults/ACL: consolidado por omissao, unidades explicitas e menor privilegio';
end;
$$;

rollback;

\echo 'PASS dre_filtro_unidade_fixture: todos os cenarios PostgreSQL 17 validados; transacao revertida.'
