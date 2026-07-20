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
values
  (
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Pessoal', 'Despesas fixas > Pessoal'
  ),
  (
    '00000000-0000-0000-0000-000000000101',
    '3.1.01', 'Mensalidades', 'Receitas > Mensalidades'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '4.1.01', 'Material didatico', 'Despesas variaveis > Material didatico'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '6.1.01', 'Equipamentos', 'Investimentos > Equipamentos'
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '7.1.01', 'Entrada nao operacional', 'Nao operacional > Entradas'
  ),
  (
    '00000000-0000-0000-0000-000000000105',
    '7.2.01', 'Saida nao operacional', 'Nao operacional > Saidas'
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
values
  (910001, 2026, 6, 'fechada'),
  (910002, 2026, 6, 'fechada');

insert into public.colaboradores (id, nome, nome_completo)
values
  (930001, 'Colaborador Rateado', 'Colaborador Rateado'),
  (930002, 'Colaborador Sem Rateio', 'Colaborador Sem Rateio'),
  (930003, 'Colaborador Sem Titulo', 'Colaborador Sem Titulo');

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
  ),
  (
    910002,
    920003,
    'salario',
    1,
    null
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
    300.03, 300.03, 100.01,
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
    300.03, 300.03, 100.01,
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
    300.03, 300.03, 100.01,
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
    90.03, 90.03, 90.03,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture sem rateio',
    null, '2026-06', repeat('d', 64),
    null, null, null, repeat('e', 64), null, 'sem_alocacao'
  ),
  (
    910002, 920003, 1, 930003, date '2026-06-01',
    'professor', 'clt', 'professor', 'salario', 'provento',
    15.06, 15.06, 15.06,
    '00000000-0000-0000-0000-000000000100',
    '5.1.01', 'Despesas fixas > Pessoal',
    'automatico', 'operacional', null, 1, 'fixture sem titulo financeiro',
    null, '2026-06', repeat('f', 64),
    'cg', 100.000000,
    '00000000-0000-0000-0000-000000000602',
    repeat('1', 64), repeat('2', 64), 'pronto'
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
    'Folha paga em julho', 'folha_pagamento', '910001', 390.06, 'pago',
    null, '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-07-10 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    date '2026-06-01', timestamptz '2026-08-02 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Folha concorrente paga em agosto', 'folha_pagamento', '910001', 390.06, 'pago',
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
    'Fornecedor CG', 'fornecedor', 'fornecedor-cg', 60.02, 'pago',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001', null,
    timestamptz '2026-07-08 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000405',
    date '2026-06-01', timestamptz '2026-07-09 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Fatura cartao', 'cartao', 'fatura-fixture', 40.04, 'pago',
    null, '00000000-0000-0000-0000-000000000002', null,
    timestamptz '2026-07-09 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000406',
    date '2026-06-01', timestamptz '2026-07-11 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Material Barra', 'fornecedor', 'material-barra', 10.04, 'pago',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000003', null,
    timestamptz '2026-07-11 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000407',
    date '2026-06-01', timestamptz '2026-07-12 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Equipamento Recreio', 'fornecedor', 'equipamento-rec', 30.07, 'pago',
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000002', null,
    timestamptz '2026-07-12 13:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000408',
    date '2026-06-01', timestamptz '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000300',
    'Saida nao operacional sem unidade', 'fornecedor', 'sem-unidade', 20.05, 'pago',
    '00000000-0000-0000-0000-000000000105',
    null, null,
    timestamptz '2026-07-13 13:00:00+00'
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
  40.04,
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002',
  'pendente'
);

insert into public.contas_receber (
  id,
  competencia,
  data_recebimento,
  descricao,
  aluno_nome,
  emusys_fatura_id,
  valor_pago,
  valor_liquido,
  status,
  excluido_da_receita,
  classificacao_status,
  cadastro_match_status,
  plano_conta_id,
  centro_custo_id,
  unidade
)
values
  (
    '00000000-0000-0000-0000-000000000701',
    date '2026-06-01', date '2026-07-06',
    'Mensalidade CG', 'Aluno CG', 970001,
    200.11, 200.11, 'recebido', false, 'confirmada', 'unico',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001', 'cg'
  ),
  (
    '00000000-0000-0000-0000-000000000702',
    date '2026-06-01', date '2026-07-07',
    'Entrada nao operacional Barra', 'Aluno Barra', 970002,
    50.09, 50.09, 'recebido', false, 'confirmada', 'unico',
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000003', 'bar'
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

  if v_count is distinct from 3 then
    raise exception 'cenario A invalido: esperados 3 candidatos de folha, encontrados %', v_count;
  end if;

  if (
    (select updated_at from public.contas_pagar where id = '00000000-0000-0000-0000-000000000402')
    >
    (select updated_at from public.contas_pagar where id = '00000000-0000-0000-0000-000000000401')
  ) is distinct from true then
    raise exception 'cenario A invalido: o candidato fora do mes deveria ser mais novo';
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
   where l.fonte = 'folha';

  if v_count is distinct from 4 then
    raise exception 'cenario A caixa: esperadas 4 linhas de folha, encontradas %', v_count;
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
   where l.fonte = 'folha'
     and l.origem_id = '920001'
     and l.data_caixa = date '2026-07-10'
     and l.valor_origem = 100.01;

  if v_count is distinct from 3 then
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
     and l.origem_id in ('920001', '920002')
     and l.data_referencia = date '2026-06-01';

  if v_count is distinct from 4 then
    raise exception
      'cenario A competencia: folha economica de junho dependeu indevidamente do pagamento; linhas %',
      v_count;
  end if;

  if exists (
    select 1
      from public.contas_pagar cp
     where cp.fonte_tipo = 'folha_pagamento'
       and cp.fonte_identificador = '910002'
  ) then
    raise exception 'cenario competencia sem titulo: folha 910002 recebeu conta a pagar indevida';
  end if;

  select count(*)
    into v_count
    from public.dre_linhas_normalizadas(date '2026-06-01', 'competencia') l
   where l.fonte = 'folha'
     and l.origem_id = '920003'
     and l.data_caixa is null
     and l.data_referencia = date '2026-06-01'
     and l.valor_origem = 15.06
     and l.unidade_operacional = 'cg';

  if v_count is distinct from 1 then
    raise exception
      'cenario competencia sem titulo: folha 910002 deveria aparecer uma vez sem pagamento; apareceu %',
      v_count;
  end if;

  if exists (
    select 1
      from public.dre_linhas_normalizadas(date '2026-07-01', 'caixa') l
     where l.fonte = 'folha'
       and l.origem_id = '920003'
  ) then
    raise exception 'cenario competencia sem titulo: folha sem pagamento vazou para Caixa';
  end if;

  select public.dre_consultar(date '2026-07-01', 'caixa') into v_result;
  if (v_result #>> '{kpis,lucro_liquido}')::numeric is distinct from -260.04 then
    raise exception
      'cenario A dre_consultar: lucro liquido caixa esperado -260.04, recebido %',
      v_result #>> '{kpis,lucro_liquido}';
  end if;

  raise notice
    'PASS cenario A: caixa escolheu julho antes do LIMIT e competencia incluiu folha sem titulo';
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
  v_expected_unit text;
  v_requested_unit text;
  v_detail jsonb;
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

    if jsonb_array_length(v_page->'itens') is distinct from 1 then
      raise exception
        'cenario B paginacao: pagina % deveria conter 1 item; resposta %',
        v_pages,
        v_page;
    end if;

    v_item := v_page->'itens'->0;
    v_items := v_items + 1;

    if v_item->>'unidade_operacional' is not null then
      if v_item->>'plano_codigo' is distinct from '5.1.01'
         or v_item->>'fonte' is distinct from 'folha'
         or v_item->>'origem_id' is distinct from '920001'
         or v_item->>'origem_sequencia' is distinct from '000001:salario' then
        raise exception
          'cenario B paginacao: fatia perdeu identidade comum plano/fonte/origem/sequencia: %',
          v_item;
      end if;

      v_units := array_append(v_units, v_item->>'unidade_operacional');
    end if;

    v_cursor := v_page->'next_cursor';
    exit when v_cursor is not distinct from 'null'::jsonb;
  end loop;

  if v_items is distinct from 4 then
    raise exception
      'cenario B paginacao: esperadas 3 fatias e 1 linha sem unidade, encontrados % itens',
      v_items;
  end if;

  if cardinality(v_units) is distinct from 3 then
    raise exception
      'cenario B paginacao: esperadas 3 unidades, recebido %',
      v_units;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'cg';
  if v_count is distinct from 1 then
    raise exception 'cenario B paginacao: CG apareceu % vezes', v_count;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'rec';
  if v_count is distinct from 1 then
    raise exception 'cenario B paginacao: REC apareceu % vezes', v_count;
  end if;

  select count(*) into v_count from unnest(v_units) u(unit) where u.unit = 'bar';
  if v_count is distinct from 1 then
    raise exception 'cenario B paginacao: Barra apareceu % vezes', v_count;
  end if;

  foreach v_expected_unit in array array['cg', 'rec', 'bar'] loop
    v_requested_unit := case
      when current_setting('app.dre_fixture_mutation', true)
        is not distinct from 'rotate_dre_detalhes_units' then case v_expected_unit
          when 'cg' then 'rec'
          when 'rec' then 'bar'
          else 'cg'
        end
      else v_expected_unit
    end;

    v_detail := public.dre_detalhes(
      date '2026-07-01',
      'caixa',
      '5.1.01',
      'folha',
      v_requested_unit,
      null,
      10
    );

    if v_detail->>'unidade' is distinct from v_expected_unit then
      raise exception
        'cenario B detalhes: unidade % recebeu %',
        v_expected_unit,
        v_detail->>'unidade';
    end if;

    if jsonb_array_length(v_detail->'itens') is distinct from 1 then
      raise exception
        'cenario B detalhes: unidade % deveria ter 1 item, resposta %',
        v_expected_unit,
        v_detail;
    end if;

    v_item := v_detail->'itens'->0;
    if v_item->>'unidade_operacional' is distinct from v_expected_unit
       or v_item->>'origem_id' is distinct from '920001'
       or v_item->>'origem_sequencia' is distinct from '000001:salario'
       or (v_item->>'valor_origem')::numeric is distinct from 100.01
       or (v_item->>'valor_resultado')::numeric is distinct from -100.01 then
      raise exception
        'cenario B detalhes: identidade/valor incorreto para unidade %: %',
        v_expected_unit,
        v_item;
    end if;
  end loop;

  raise notice
    'PASS cenario B: cursor e detalhes por unidade preservaram CG, REC e Barra em % paginas',
    v_pages;
end;
$$;

do $$
declare
  v_regime text;
  v_competencia date;
  v_kpi text;
  v_cons jsonb;
  v_cg jsonb;
  v_rec jsonb;
  v_bar jsonb;
  v_sem_kpis jsonb;
  v_expected_kpis jsonb;
  v_expected_cg_kpis jsonb;
  v_expected_rec_kpis jsonb;
  v_expected_bar_kpis jsonb;
  v_expected_sem_kpis jsonb;
  v_expected_groups jsonb;
  v_expected_cg_groups jsonb;
  v_expected_rec_groups jsonb;
  v_expected_bar_groups jsonb;
  v_expected_sem_groups jsonb;
  v_expected_plans jsonb;
  v_expected_cg_plans jsonb;
  v_expected_rec_plans jsonb;
  v_expected_bar_plans jsonb;
  v_expected_sem_plans jsonb;
  v_folha_sem_alocacao jsonb;
  v_total numeric;
  v_units_total numeric;
  v_sem_total numeric;
  v_required_count integer;
  v_group_codigo text;
  v_group_total numeric;
  v_group_cg numeric;
  v_group_rec numeric;
  v_group_bar numeric;
  v_group_units numeric;
  v_group_sem numeric;
  v_plan_codigo text;
  v_plan_total numeric;
  v_plan_cg numeric;
  v_plan_rec numeric;
  v_plan_bar numeric;
  v_plan_units numeric;
  v_plan_sem numeric;
begin
  foreach v_regime in array array['competencia', 'caixa'] loop
    v_competencia := case
      when v_regime = 'competencia' then date '2026-06-01'
      else date '2026-07-01'
    end;

    v_cons := public.dre_consultar(v_competencia, v_regime, 'consolidado');
    if current_setting('app.dre_fixture_mutation', true)
         is not distinct from 'rotate_dre_consultar_units' then
      v_cg := public.dre_consultar(v_competencia, v_regime, 'rec');
      v_rec := public.dre_consultar(v_competencia, v_regime, 'bar');
      v_bar := public.dre_consultar(v_competencia, v_regime, 'cg');
    else
      v_cg := public.dre_consultar(v_competencia, v_regime, 'cg');
      v_rec := public.dre_consultar(v_competencia, v_regime, 'rec');
      v_bar := public.dre_consultar(v_competencia, v_regime, 'bar');
    end if;

    v_expected_kpis := case
      when v_regime = 'competencia' then jsonb_build_object(
        'receita', 200.11::numeric,
        'despesa', 475.18::numeric,
        'lucro_operacional', -275.07::numeric,
        'investimentos', 30.07::numeric,
        'entradas_nao_operacionais', 50.09::numeric,
        'saidas_nao_operacionais', 20.05::numeric,
        'lucro_liquido', -275.10::numeric
      )
      else jsonb_build_object(
        'receita', 200.11::numeric,
        'despesa', 460.12::numeric,
        'lucro_operacional', -260.01::numeric,
        'investimentos', 30.07::numeric,
        'entradas_nao_operacionais', 50.09::numeric,
        'saidas_nao_operacionais', 20.05::numeric,
        'lucro_liquido', -260.04::numeric
      )
    end;

    v_expected_cg_kpis := case
      when v_regime = 'competencia' then jsonb_build_object(
        'receita', 200.11::numeric,
        'despesa', 175.09::numeric,
        'lucro_operacional', 25.02::numeric,
        'investimentos', 0::numeric,
        'entradas_nao_operacionais', 0::numeric,
        'saidas_nao_operacionais', 0::numeric,
        'lucro_liquido', 25.02::numeric
      )
      else jsonb_build_object(
        'receita', 200.11::numeric,
        'despesa', 160.03::numeric,
        'lucro_operacional', 40.08::numeric,
        'investimentos', 0::numeric,
        'entradas_nao_operacionais', 0::numeric,
        'saidas_nao_operacionais', 0::numeric,
        'lucro_liquido', 40.08::numeric
      )
    end;

    v_expected_rec_kpis := jsonb_build_object(
      'receita', 0::numeric,
      'despesa', 100.01::numeric,
      'lucro_operacional', -100.01::numeric,
      'investimentos', 30.07::numeric,
      'entradas_nao_operacionais', 0::numeric,
      'saidas_nao_operacionais', 0::numeric,
      'lucro_liquido', -130.08::numeric
    );

    v_expected_bar_kpis := jsonb_build_object(
      'receita', 0::numeric,
      'despesa', 110.05::numeric,
      'lucro_operacional', -110.05::numeric,
      'investimentos', 0::numeric,
      'entradas_nao_operacionais', 50.09::numeric,
      'saidas_nao_operacionais', 0::numeric,
      'lucro_liquido', -59.96::numeric
    );

    v_expected_sem_kpis := jsonb_build_object(
      'receita', 0::numeric,
      'despesa', 90.03::numeric,
      'lucro_operacional', -90.03::numeric,
      'investimentos', 0::numeric,
      'entradas_nao_operacionais', 0::numeric,
      'saidas_nao_operacionais', 20.05::numeric,
      'lucro_liquido', -110.08::numeric
    );

    v_expected_groups := case
      when v_regime = 'competencia' then jsonb_build_object(
        '3', 200.11::numeric,
        '4', -10.04::numeric,
        '5', -465.14::numeric,
        '6', -30.07::numeric,
        '7', 30.04::numeric
      )
      else jsonb_build_object(
        '3', 200.11::numeric,
        '4', -10.04::numeric,
        '5', -450.08::numeric,
        '6', -30.07::numeric,
        '7', 30.04::numeric
      )
    end;

    v_expected_cg_groups := case
      when v_regime = 'competencia' then jsonb_build_object(
        '3', 200.11::numeric, '4', 0::numeric, '5', -175.09::numeric,
        '6', 0::numeric, '7', 0::numeric
      )
      else jsonb_build_object(
        '3', 200.11::numeric, '4', 0::numeric, '5', -160.03::numeric,
        '6', 0::numeric, '7', 0::numeric
      )
    end;

    v_expected_rec_groups := jsonb_build_object(
      '3', 0::numeric, '4', 0::numeric, '5', -100.01::numeric,
      '6', -30.07::numeric, '7', 0::numeric
    );

    v_expected_bar_groups := jsonb_build_object(
      '3', 0::numeric, '4', -10.04::numeric, '5', -100.01::numeric,
      '6', 0::numeric, '7', 50.09::numeric
    );

    v_expected_sem_groups := jsonb_build_object(
      '3', 0::numeric, '4', 0::numeric, '5', -90.03::numeric,
      '6', 0::numeric, '7', -20.05::numeric
    );

    v_expected_plans := case
      when v_regime = 'competencia' then jsonb_build_object(
        '3.1.01', 200.11::numeric,
        '4.1.01', -10.04::numeric,
        '5.1.01', -465.14::numeric,
        '6.1.01', -30.07::numeric,
        '7.1.01', 50.09::numeric,
        '7.2.01', -20.05::numeric
      )
      else jsonb_build_object(
        '3.1.01', 200.11::numeric,
        '4.1.01', -10.04::numeric,
        '5.1.01', -450.08::numeric,
        '6.1.01', -30.07::numeric,
        '7.1.01', 50.09::numeric,
        '7.2.01', -20.05::numeric
      )
    end;

    v_expected_cg_plans := case
      when v_regime = 'competencia' then jsonb_build_object(
        '3.1.01', 200.11::numeric, '4.1.01', 0::numeric,
        '5.1.01', -175.09::numeric, '6.1.01', 0::numeric,
        '7.1.01', 0::numeric, '7.2.01', 0::numeric
      )
      else jsonb_build_object(
        '3.1.01', 200.11::numeric, '4.1.01', 0::numeric,
        '5.1.01', -160.03::numeric, '6.1.01', 0::numeric,
        '7.1.01', 0::numeric, '7.2.01', 0::numeric
      )
    end;

    v_expected_rec_plans := jsonb_build_object(
      '3.1.01', 0::numeric, '4.1.01', 0::numeric,
      '5.1.01', -100.01::numeric, '6.1.01', -30.07::numeric,
      '7.1.01', 0::numeric, '7.2.01', 0::numeric
    );

    v_expected_bar_plans := jsonb_build_object(
      '3.1.01', 0::numeric, '4.1.01', -10.04::numeric,
      '5.1.01', -100.01::numeric, '6.1.01', 0::numeric,
      '7.1.01', 50.09::numeric, '7.2.01', 0::numeric
    );

    v_expected_sem_plans := jsonb_build_object(
      '3.1.01', 0::numeric, '4.1.01', 0::numeric,
      '5.1.01', -90.03::numeric, '6.1.01', 0::numeric,
      '7.1.01', 0::numeric, '7.2.01', -20.05::numeric
    );

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

    select jsonb_build_object(
      'receita', coalesce(sum(l.valor_resultado) filter (where l.grupo_codigo = '3'), 0),
      'despesa', -coalesce(sum(l.valor_resultado) filter (where l.grupo_codigo in ('4', '5')), 0),
      'lucro_operacional', coalesce(sum(l.valor_resultado) filter (where l.grupo_codigo in ('3', '4', '5')), 0),
      'investimentos', -coalesce(sum(l.valor_resultado) filter (where l.grupo_codigo = '6'), 0),
      'entradas_nao_operacionais', coalesce(sum(l.valor_resultado) filter (
        where l.grupo_codigo = '7' and l.natureza = 'entrada'
      ), 0),
      'saidas_nao_operacionais', -coalesce(sum(l.valor_resultado) filter (
        where l.grupo_codigo = '7' and l.natureza = 'saida'
      ), 0),
      'lucro_liquido', coalesce(sum(l.valor_resultado), 0)
    )
      into v_sem_kpis
      from public.dre_linhas_normalizadas(v_competencia, v_regime) l
     where l.unidade_operacional is null;

    foreach v_kpi in array array[
      'receita',
      'despesa',
      'lucro_operacional',
      'investimentos',
      'entradas_nao_operacionais',
      'saidas_nao_operacionais',
      'lucro_liquido'
    ] loop
      if v_cons #>> array['kpis', v_kpi] is null
         or v_cg #>> array['kpis', v_kpi] is null
         or v_rec #>> array['kpis', v_kpi] is null
         or v_bar #>> array['kpis', v_kpi] is null
         or v_sem_kpis->>v_kpi is null
         or v_expected_kpis->>v_kpi is null
         or v_expected_cg_kpis->>v_kpi is null
         or v_expected_rec_kpis->>v_kpi is null
         or v_expected_bar_kpis->>v_kpi is null
         or v_expected_sem_kpis->>v_kpi is null then
        raise exception
          'cenario C %: KPI obrigatorio % ausente ou nulo',
          v_regime,
          v_kpi;
      end if;

      v_total := (v_cons #>> array['kpis', v_kpi])::numeric;
      v_units_total :=
        (v_cg #>> array['kpis', v_kpi])::numeric
        + (v_rec #>> array['kpis', v_kpi])::numeric
        + (v_bar #>> array['kpis', v_kpi])::numeric;
      v_sem_total := (v_sem_kpis->>v_kpi)::numeric;

      if (v_cg #>> array['kpis', v_kpi])::numeric
           is distinct from (v_expected_cg_kpis->>v_kpi)::numeric then
        raise exception
          'cenario C %: KPI % da unidade cg esperado %, recebido %',
          v_regime,
          v_kpi,
          v_expected_cg_kpis->>v_kpi,
          v_cg #>> array['kpis', v_kpi];
      end if;

      if (v_rec #>> array['kpis', v_kpi])::numeric
           is distinct from (v_expected_rec_kpis->>v_kpi)::numeric then
        raise exception
          'cenario C %: KPI % da unidade rec esperado %, recebido %',
          v_regime,
          v_kpi,
          v_expected_rec_kpis->>v_kpi,
          v_rec #>> array['kpis', v_kpi];
      end if;

      if (v_bar #>> array['kpis', v_kpi])::numeric
           is distinct from (v_expected_bar_kpis->>v_kpi)::numeric then
        raise exception
          'cenario C %: KPI % da unidade bar esperado %, recebido %',
          v_regime,
          v_kpi,
          v_expected_bar_kpis->>v_kpi,
          v_bar #>> array['kpis', v_kpi];
      end if;

      if v_sem_total is distinct from (v_expected_sem_kpis->>v_kpi)::numeric then
        raise exception
          'cenario C %: KPI % sem unidade esperado %, recebido %',
          v_regime,
          v_kpi,
          v_expected_sem_kpis->>v_kpi,
          v_sem_total;
      end if;

      if v_total is distinct from (v_expected_kpis->>v_kpi)::numeric then
        raise exception
          'cenario C %: KPI % esperado %, recebido %',
          v_regime,
          v_kpi,
          v_expected_kpis->>v_kpi,
          v_total;
      end if;

      if v_total is distinct from v_units_total + v_sem_total then
        raise exception
          'cenario C % KPI %: CG + REC + Barra + sem unidade = %, consolidado = %',
          v_regime,
          v_kpi,
          v_units_total + v_sem_total,
          v_total;
      end if;
    end loop;

    if v_cg->>'unidade' is distinct from 'cg'
       or v_rec->>'unidade' is distinct from 'rec'
       or v_bar->>'unidade' is distinct from 'bar' then
      raise exception
        'cenario C %: labels de unidade da consulta incorretos: cg %, rec %, bar %',
        v_regime,
        v_cg->>'unidade',
        v_rec->>'unidade',
        v_bar->>'unidade';
    end if;

    v_folha_sem_alocacao := v_cons
      #> '{sem_unidade_operacional,por_motivo,folha_sem_alocacao}';

    if v_regime is not distinct from 'competencia'
       and current_setting('app.dre_fixture_mutation', true)
         is not distinct from 'null_folha_sem_alocacao_valor_origem' then
      v_folha_sem_alocacao := v_folha_sem_alocacao - 'valor_origem';
    end if;

    if jsonb_typeof(v_folha_sem_alocacao) is distinct from 'object'
       or (v_folha_sem_alocacao ?& array[
         'valor_origem', 'valor_resultado', 'linhas', 'colaboradores_folha'
       ]) is distinct from true then
      raise exception
        'cenario C %: folha_sem_alocacao obrigatoria ausente ou incompleta: %',
        v_regime,
        v_folha_sem_alocacao;
    end if;

    if (v_folha_sem_alocacao->>'valor_origem')::numeric is distinct from 90.03
       or (v_folha_sem_alocacao->>'valor_resultado')::numeric is distinct from -90.03
       or (v_folha_sem_alocacao->>'linhas')::integer is distinct from 1
       or (v_folha_sem_alocacao->>'colaboradores_folha')::integer is distinct from 1 then
      raise exception
        'cenario C %: metricas folha_sem_alocacao invalidas: %',
        v_regime,
        v_folha_sem_alocacao;
    end if;

    if v_regime is not distinct from 'competencia'
       and current_setting('app.dre_fixture_mutation', true) in (
         'missing_group_4', 'missing_group_5'
       ) then
      v_group_codigo := case current_setting('app.dre_fixture_mutation', true)
        when 'missing_group_4' then '4'
        else '5'
      end;
      v_cons := jsonb_set(
        v_cons,
        '{grupos}',
        coalesce((
          select jsonb_agg(g order by g->>'codigo')
            from jsonb_array_elements(v_cons->'grupos') g
           where g->>'codigo' is distinct from v_group_codigo
        ), '[]'::jsonb)
      );
    end if;

    foreach v_group_codigo in array array['3', '4', '5', '6', '7'] loop
      select count(*), max((g->>'valor_resultado')::numeric)
        into v_required_count, v_group_total
        from jsonb_array_elements(v_cons->'grupos') g
       where g->>'codigo' = v_group_codigo;

      if v_required_count is distinct from 1 or v_group_total is null then
        raise exception
          'cenario C %: grupo % obrigatorio ausente ou nulo no consolidado',
          v_regime,
          v_group_codigo;
      end if;

      select count(*), max((g->>'valor_resultado')::numeric)
        into v_required_count, v_group_cg
        from jsonb_array_elements(v_cg->'grupos') g
       where g->>'codigo' = v_group_codigo;

      if v_required_count is distinct from 1 or v_group_cg is null then
        raise exception
          'cenario C %: grupo % obrigatorio ausente ou nulo em CG',
          v_regime,
          v_group_codigo;
      end if;

      select count(*), max((g->>'valor_resultado')::numeric)
        into v_required_count, v_group_rec
        from jsonb_array_elements(v_rec->'grupos') g
       where g->>'codigo' = v_group_codigo;

      if v_required_count is distinct from 1 or v_group_rec is null then
        raise exception
          'cenario C %: grupo % obrigatorio ausente ou nulo em REC',
          v_regime,
          v_group_codigo;
      end if;

      select count(*), max((g->>'valor_resultado')::numeric)
        into v_required_count, v_group_bar
        from jsonb_array_elements(v_bar->'grupos') g
       where g->>'codigo' = v_group_codigo;

      if v_required_count is distinct from 1 or v_group_bar is null then
        raise exception
          'cenario C %: grupo % obrigatorio ausente ou nulo em Barra',
          v_regime,
          v_group_codigo;
      end if;

      select coalesce(sum(l.valor_resultado), 0)
        into v_group_sem
        from public.dre_linhas_normalizadas(v_competencia, v_regime) l
       where l.unidade_operacional is null
         and l.grupo_codigo = v_group_codigo
         and l.status_classificacao = 'classificado_dre';

      if v_group_total is distinct from (v_expected_groups->>v_group_codigo)::numeric
         or v_group_cg is distinct from (v_expected_cg_groups->>v_group_codigo)::numeric
         or v_group_rec is distinct from (v_expected_rec_groups->>v_group_codigo)::numeric
         or v_group_bar is distinct from (v_expected_bar_groups->>v_group_codigo)::numeric
         or v_group_sem is distinct from (v_expected_sem_groups->>v_group_codigo)::numeric then
        raise exception
          'cenario C %: valores do grupo % divergiram: total %, cg %, rec %, bar %, sem %',
          v_regime,
          v_group_codigo,
          v_group_total,
          v_group_cg,
          v_group_rec,
          v_group_bar,
          v_group_sem;
      end if;

      v_group_units := v_group_cg + v_group_rec + v_group_bar;
      if v_group_total is distinct from v_group_units + v_group_sem then
        raise exception
          'cenario C %: grupo % nao fecha por particao; unidades %, sem %, consolidado %',
          v_regime,
          v_group_codigo,
          v_group_units,
          v_group_sem,
          v_group_total;
      end if;
    end loop;

    if v_regime is not distinct from 'competencia'
       and current_setting('app.dre_fixture_mutation', true) in (
         'missing_plan_5_1_01', 'missing_plan_6_1_01'
       ) then
      v_plan_codigo := case current_setting('app.dre_fixture_mutation', true)
        when 'missing_plan_6_1_01' then '6.1.01'
        else '5.1.01'
      end;
      v_cons := jsonb_set(
        v_cons,
        '{planos}',
        coalesce((
          select jsonb_agg(p order by p->>'plano_codigo')
            from jsonb_array_elements(v_cons->'planos') p
           where p->>'plano_codigo' is distinct from v_plan_codigo
        ), '[]'::jsonb)
      );
    end if;

    foreach v_plan_codigo in array array[
      '3.1.01', '4.1.01', '5.1.01', '6.1.01', '7.1.01', '7.2.01'
    ] loop
      if v_expected_plans->>v_plan_codigo is null
         or v_expected_cg_plans->>v_plan_codigo is null
         or v_expected_rec_plans->>v_plan_codigo is null
         or v_expected_bar_plans->>v_plan_codigo is null
         or v_expected_sem_plans->>v_plan_codigo is null then
        raise exception 'cenario C %: expectativa ausente para plano %', v_regime, v_plan_codigo;
      end if;

      select count(*), max((p->>'valor_resultado')::numeric)
        into v_required_count, v_plan_total
        from jsonb_array_elements(v_cons->'planos') p
       where p->>'plano_codigo' = v_plan_codigo;

      if v_required_count is distinct from 1 or v_plan_total is null then
        raise exception
          'cenario C %: plano % obrigatorio ausente ou nulo no consolidado',
          v_regime,
          v_plan_codigo;
      end if;

      select count(*), max((p->>'valor_resultado')::numeric)
        into v_required_count, v_plan_cg
        from jsonb_array_elements(v_cg->'planos') p
       where p->>'plano_codigo' = v_plan_codigo;

      if (v_expected_cg_plans->>v_plan_codigo)::numeric = 0 then
        if v_required_count is distinct from 0 then
          raise exception 'cenario C %: plano % inesperado em CG', v_regime, v_plan_codigo;
        end if;
        v_plan_cg := 0;
      elsif v_required_count is distinct from 1 or v_plan_cg is null then
        raise exception
          'cenario C %: plano % obrigatorio ausente ou nulo em CG',
          v_regime,
          v_plan_codigo;
      end if;

      select count(*), max((p->>'valor_resultado')::numeric)
        into v_required_count, v_plan_rec
        from jsonb_array_elements(v_rec->'planos') p
       where p->>'plano_codigo' = v_plan_codigo;

      if (v_expected_rec_plans->>v_plan_codigo)::numeric = 0 then
        if v_required_count is distinct from 0 then
          raise exception 'cenario C %: plano % inesperado em REC', v_regime, v_plan_codigo;
        end if;
        v_plan_rec := 0;
      elsif v_required_count is distinct from 1 or v_plan_rec is null then
        raise exception
          'cenario C %: plano % obrigatorio ausente ou nulo em REC',
          v_regime,
          v_plan_codigo;
      end if;

      select count(*), max((p->>'valor_resultado')::numeric)
        into v_required_count, v_plan_bar
        from jsonb_array_elements(v_bar->'planos') p
       where p->>'plano_codigo' = v_plan_codigo;

      if (v_expected_bar_plans->>v_plan_codigo)::numeric = 0 then
        if v_required_count is distinct from 0 then
          raise exception 'cenario C %: plano % inesperado em Barra', v_regime, v_plan_codigo;
        end if;
        v_plan_bar := 0;
      elsif v_required_count is distinct from 1 or v_plan_bar is null then
        raise exception
          'cenario C %: plano % obrigatorio ausente ou nulo em Barra',
          v_regime,
          v_plan_codigo;
      end if;

      select coalesce(sum(l.valor_resultado), 0)
        into v_plan_sem
        from public.dre_linhas_normalizadas(v_competencia, v_regime) l
       where l.unidade_operacional is null
         and l.plano_codigo = v_plan_codigo
         and l.status_classificacao = 'classificado_dre';

      if v_plan_total is distinct from (v_expected_plans->>v_plan_codigo)::numeric
         or v_plan_cg is distinct from (v_expected_cg_plans->>v_plan_codigo)::numeric
         or v_plan_rec is distinct from (v_expected_rec_plans->>v_plan_codigo)::numeric
         or v_plan_bar is distinct from (v_expected_bar_plans->>v_plan_codigo)::numeric
         or v_plan_sem is distinct from (v_expected_sem_plans->>v_plan_codigo)::numeric then
        raise exception
          'cenario C %: valores do plano % divergiram: total %, cg %, rec %, bar %, sem %',
          v_regime,
          v_plan_codigo,
          v_plan_total,
          v_plan_cg,
          v_plan_rec,
          v_plan_bar,
          v_plan_sem;
      end if;

      v_plan_units := v_plan_cg + v_plan_rec + v_plan_bar;
      if v_plan_total is distinct from v_plan_units + v_plan_sem then
        raise exception
          'cenario C %: plano % nao fecha por particao; unidades %, sem %, consolidado %',
          v_regime,
          v_plan_codigo,
          v_plan_units,
          v_plan_sem,
          v_plan_total;
      end if;
    end loop;

    if jsonb_array_length(v_cons->'planos') is distinct from 6 then
      raise exception
        'cenario C %: consolidado deveria conter exatamente 6 planos, recebeu %',
        v_regime,
        jsonb_array_length(v_cons->'planos');
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

    if v_count is distinct from 1 then
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

    if v_count is distinct from 1 then
      raise exception
        'qualidade da fonte %: cartao nao confirmado deveria ficar sem unidade, apareceu %',
        v_regime,
        v_count;
    end if;
  end loop;

  v_result := public.dre_detalhes(
    date '2026-07-01', 'caixa', '5.1.01', 'cartao', 'rec', null, 10
  );
  if jsonb_array_length(v_result->'itens') is distinct from 0 then
    raise exception 'cartao nao confirmado apareceu no filtro explicito REC: %', v_result;
  end if;

  v_result := public.dre_consultar(date '2026-07-01', 'caixa', 'consolidado');
  if (v_result ?& array[
    'success', 'competencia', 'regime', 'unidade', 'kpis', 'grupos', 'planos',
    'cobertura', 'reconciliacao', 'sem_unidade_operacional'
  ]) is distinct from true then
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

  if v_default->>'unidade' is distinct from 'consolidado'
     or v_default->'kpis' is distinct from v_explicit->'kpis' then
    raise exception 'default de dre_consultar nao equivale ao consolidado explicito';
  end if;

  v_details := public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha');
  if v_details->>'unidade' is distinct from 'consolidado'
     or jsonb_array_length(v_details->'itens') is distinct from 4 then
    raise exception 'default de dre_detalhes nao equivale ao consolidado: %', v_details;
  end if;

  if jsonb_array_length(
    public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'cg')->'itens'
  ) is distinct from 1
     or jsonb_array_length(
       public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'rec')->'itens'
     ) is distinct from 1
     or jsonb_array_length(
       public.dre_detalhes(date '2026-07-01', 'caixa', '5.1.01', 'folha', 'bar')->'itens'
     ) is distinct from 1 then
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

  if v_proc_count is distinct from 3 then
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
