\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_setting('app.cartao_recorrencia_fixture_guard', true) is distinct from 'local_ci_only' then
    raise exception 'REFUSED: app.cartao_recorrencia_fixture_guard=local_ci_only e obrigatorio.';
  end if;
  if current_database() is distinct from 'financeiro_cartao_recorrencias_fixture' then
    raise exception 'REFUSED: fixture nao pode rodar no banco %.', current_database();
  end if;
end;
$$;

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca06';

insert into public.financeiro_empresas (id, razao_social)
values ('00000000-0000-0000-0000-00000000ca02', 'Empresa fixture');
insert into public.plano_contas (id, codigo, nome)
values ('00000000-0000-0000-0000-00000000ca03', '5.1.99', 'Assinaturas fixture');
insert into public.centros_custo (id, codigo, nome)
values ('00000000-0000-0000-0000-00000000ca04', 'FIX', 'Centro fixture');
insert into public.financeiro_contas_bancarias (id, empresa_id, conta)
values (
  '00000000-0000-0000-0000-00000000ca05',
  '00000000-0000-0000-0000-00000000ca02',
  'Conta fixture'
);
insert into public.financeiro_cartoes (
  id, apelido, ativo, dia_fechamento, dia_vencimento,
  empresa_id, conta_pagadora_id, centro_custo_id
)
values (
  '00000000-0000-0000-0000-00000000ca01',
  'Cartao fixture',
  true,
  20,
  25,
  '00000000-0000-0000-0000-00000000ca02',
  '00000000-0000-0000-0000-00000000ca05',
  '00000000-0000-0000-0000-00000000ca04'
);
insert into public.financeiro_cartao_faturas (
  id, cartao_id, competencia, data_fechamento, data_vencimento, valor_total, status
)
values
  (
    '00000000-0000-0000-0000-00000000ca11',
    '00000000-0000-0000-0000-00000000ca01',
    date '2026-08-01',
    date '2026-08-20',
    date '2026-08-25',
    0,
    'aberta'
  ),
  (
    '00000000-0000-0000-0000-00000000ca12',
    '00000000-0000-0000-0000-00000000ca01',
    date '2026-09-01',
    date '2026-09-20',
    date '2026-09-25',
    0,
    'aberta'
  ),
  (
    '00000000-0000-0000-0000-00000000ca13',
    '00000000-0000-0000-0000-00000000ca01',
    date '2026-10-01',
    date '2026-10-20',
    date '2026-10-25',
    0,
    'aberta'
  ),
  (
    '00000000-0000-0000-0000-00000000ca14',
    '00000000-0000-0000-0000-00000000ca01',
    date '2026-11-01',
    date '2026-11-20',
    date '2026-11-25',
    0,
    'aberta'
  ),
  (
    '00000000-0000-0000-0000-00000000ca15',
    '00000000-0000-0000-0000-00000000ca01',
    date '2027-02-01',
    date '2027-02-20',
    date '2027-02-25',
    0,
    'fechada'
  );

do $$
declare
  v_cartao_id uuid := '00000000-0000-0000-0000-00000000ca01';
  v_fatura_agosto uuid := '00000000-0000-0000-0000-00000000ca11';
  v_fatura_setembro uuid := '00000000-0000-0000-0000-00000000ca12';
  v_fatura_outubro uuid := '00000000-0000-0000-0000-00000000ca13';
  v_fatura_novembro uuid := '00000000-0000-0000-0000-00000000ca14';
  v_fatura_fechada uuid := '00000000-0000-0000-0000-00000000ca15';
  v_usuario_id uuid := '00000000-0000-0000-0000-00000000ca06';
  v_criacao jsonb;
  v_retry jsonb;
  v_abertura_dezembro jsonb;
  v_abertura_janeiro jsonb;
  v_fechamento jsonb;
  v_recorrencia_id uuid;
  v_transacao_origem_id uuid;
  v_previsao_setembro uuid;
  v_previsao_outubro uuid;
  v_previsao_novembro uuid;
  v_previsao_dezembro uuid;
  v_fatura_dezembro uuid;
  v_fatura_janeiro uuid;
  v_transacao_novembro uuid;
  v_transacao_dezembro uuid;
  v_total_antes_decisao numeric;
  v_total_depois_decisao numeric;
  v_count integer;
  v_delete_bloqueado boolean := false;
  v_duplicata_bloqueada boolean := false;
begin
  v_criacao := public.financeiro_cartao_recorrencia_criar(
    jsonb_build_object(
      'fatura_id', v_fatura_agosto,
      'cartao_id', v_cartao_id,
      'client_token', 'fixture-recorrencia-agosto',
      'data_compra', '2026-08-10',
      'descricao', 'Assinatura fixture',
      'estabelecimento', 'Fixture Stream',
      'valor', '49.904',
      'tipo_transacao', 'compra',
      'classificacao_status', 'pendente'
    ),
    '{}'::jsonb
  );
  v_retry := public.financeiro_cartao_recorrencia_criar(
    jsonb_build_object(
      'fatura_id', v_fatura_agosto,
      'cartao_id', v_cartao_id,
      'client_token', 'fixture-recorrencia-agosto',
      'data_compra', '2026-08-10',
      'descricao', 'Assinatura fixture',
      'estabelecimento', 'Fixture Stream',
      'valor', '49.904',
      'tipo_transacao', 'compra',
      'classificacao_status', 'pendente'
    ),
    '{}'::jsonb
  );
  if coalesce((v_criacao->>'success')::boolean, false) is not true
     or coalesce((v_retry->>'success')::boolean, false) is not true
     or coalesce((v_retry->>'idempotent')::boolean, false) is not true then
    raise exception 'criacao/retry idempotente de recorrencia falhou: %, %', v_criacao, v_retry;
  end if;

  v_recorrencia_id := nullif(v_criacao->>'recorrencia_id', '')::uuid;
  v_transacao_origem_id := nullif(v_criacao->>'transacao_id', '')::uuid;
  select id into v_previsao_setembro
    from public.financeiro_cartao_recorrencia_previsoes
   where recorrencia_id = v_recorrencia_id
     and competencia = date '2026-09-01';

  if (select count(*) from public.financeiro_cartao_recorrencias
      where transacao_origem_id = v_transacao_origem_id) <> 1
     or (select created_by from public.financeiro_cartao_recorrencias where id = v_recorrencia_id)
        is distinct from v_usuario_id then
    raise exception 'criacao idempotente deveria deixar uma regra.';
  end if;
  if (select count(*) from public.financeiro_cartao_recorrencia_previsoes
      where recorrencia_id = v_recorrencia_id and competencia = date '2026-09-01') <> 1 then
    raise exception 'criacao idempotente deveria deixar uma previsao de setembro.';
  end if;
  if (select valor_total from public.financeiro_cartao_faturas where id = v_fatura_agosto) <> 49.90 then
    raise exception 'somente a transacao real arredondada deveria totalizar agosto em 49.90.';
  end if;
  if (select valor from public.financeiro_cartao_transacoes where id = v_transacao_origem_id) <> 49.90 then
    raise exception 'registro real deveria persistir valor em centavos arredondado.';
  end if;

  begin
    delete from public.financeiro_cartao_transacoes where id = v_transacao_origem_id;
  exception
    when others then
      v_delete_bloqueado := position('Compra de origem de recorr' in sqlerrm) > 0;
  end;
  if v_delete_bloqueado is not true
     or not exists (select 1 from public.financeiro_cartao_transacoes where id = v_transacao_origem_id) then
    raise exception 'origem de recorrencia deveria ser imutavel para delete.';
  end if;

  v_fechamento := public.financeiro_cartao_fatura_fechar(v_fatura_agosto, '{}'::jsonb);
  if coalesce((v_fechamento->>'success')::boolean, false) is not true
     or (select valor from public.contas_pagar
         where id = nullif(v_fechamento->>'conta_pagar_id', '')::uuid) <> 49.90
     or (select status from public.financeiro_cartao_faturas where id = v_fatura_agosto) <> 'fechada'
     or (select conta_pagar_id from public.financeiro_cartao_faturas where id = v_fatura_agosto)
        is distinct from nullif(v_fechamento->>'conta_pagar_id', '')::uuid then
    raise exception 'fechamento deveria gerar conta a pagar de 49.90, sem dobrar previsao.';
  end if;

  perform public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura_outubro, '{}'::jsonb);
  perform public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura_novembro, '{}'::jsonb);
  select id into v_previsao_outubro
    from public.financeiro_cartao_recorrencia_previsoes
   where recorrencia_id = v_recorrencia_id and competencia = date '2026-10-01';
  select id into v_previsao_novembro
    from public.financeiro_cartao_recorrencia_previsoes
   where recorrencia_id = v_recorrencia_id and competencia = date '2026-11-01';
  if v_previsao_outubro is null or v_previsao_novembro is null then
    raise exception 'faturas abertas de outubro/novembro deveriam receber previsoes.';
  end if;

  perform public.financeiro_cartao_recorrencia_atualizar(
    jsonb_build_object(
      'recorrencia_id', v_recorrencia_id,
      'competencia_efetiva', '2026-11-01',
      'descricao', 'Assinatura fixture revisada',
      'valor', '59.904',
      'classificacao_status', 'sugerida',
      'plano_conta_id', '00000000-0000-0000-0000-00000000ca03'
    ),
    '{}'::jsonb
  );
  if (select valor from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_outubro) <> 49.90
     or (select classificacao_status from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_outubro) <> 'pendente'
     or (select valor from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_novembro) <> 59.90
     or (select classificacao_status from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_novembro) <> 'sugerida' then
    raise exception 'edicao efetiva em novembro deveria preservar outubro e atualizar novembro.';
  end if;

  perform public.financeiro_cartao_recorrencia_alterar_status(
    jsonb_build_object('recorrencia_id', v_recorrencia_id, 'status', 'pausada', 'motivo', 'pausa fixture'),
    '{}'::jsonb
  );
  v_abertura_dezembro := public.financeiro_cartao_fatura_abrir(
    jsonb_build_object('cartao_id', v_cartao_id, 'data_compra', '2026-12-10'),
    '{}'::jsonb
  );
  v_fatura_dezembro := nullif(v_abertura_dezembro->>'fatura_id', '')::uuid;
  if (select count(*) from public.financeiro_cartao_recorrencia_previsoes
      where recorrencia_id = v_recorrencia_id and competencia = date '2026-12-01') <> 0 then
    raise exception 'recorrencia pausada nao deveria gerar previsao em dezembro.';
  end if;

  perform public.financeiro_cartao_recorrencia_alterar_status(
    jsonb_build_object('recorrencia_id', v_recorrencia_id, 'status', 'ativa', 'motivo', 'retomada fixture'),
    '{}'::jsonb
  );
  perform public.financeiro_cartao_fatura_abrir(
    jsonb_build_object('cartao_id', v_cartao_id, 'data_compra', '2026-12-10'),
    '{}'::jsonb
  );
  select id into v_previsao_dezembro
    from public.financeiro_cartao_recorrencia_previsoes
   where recorrencia_id = v_recorrencia_id and competencia = date '2026-12-01';
  if (select count(*) from public.financeiro_cartao_recorrencia_previsoes
      where recorrencia_id = v_recorrencia_id and competencia = date '2026-12-01') <> 1 then
    raise exception 'retomada deveria gerar exatamente uma previsao em dezembro.';
  end if;

  v_transacao_novembro := nullif(public.financeiro_cartao_transacao_registrar(
    jsonb_build_object(
      'fatura_id', v_fatura_novembro,
      'data_compra', '2026-11-10',
      'descricao', 'Extrato novembro fixture',
      'valor', '59.90',
      'tipo_transacao', 'compra',
      'id_externo', 'fixture-extrato-novembro'
    ),
    '{}'::jsonb
  )->>'transacao_id', '')::uuid;
  perform public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(
    jsonb_build_object(
      'previsao_id', v_previsao_novembro,
      'transacao_id', v_transacao_novembro,
      'decisao', 'manter_separadas',
      'motivo', 'duas cobrancas validas'
    ),
    '{}'::jsonb
  );
  if (select status from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_novembro) <> 'dispensada'
     or not exists (select 1 from public.financeiro_cartao_transacoes where id = v_transacao_novembro) then
    raise exception 'manter_separadas deveria dispensar somente a previsao e manter transacao real.';
  end if;

  v_transacao_dezembro := nullif(public.financeiro_cartao_transacao_registrar(
    jsonb_build_object(
      'fatura_id', v_fatura_dezembro,
      'data_compra', '2026-12-10',
      'descricao', 'Extrato dezembro fixture',
      'valor', '59.90',
      'tipo_transacao', 'compra',
      'id_externo', 'fixture-extrato-dezembro'
    ),
    '{}'::jsonb
  )->>'transacao_id', '')::uuid;
  select valor_total into v_total_antes_decisao
    from public.financeiro_cartao_faturas
   where id = v_fatura_dezembro;
  perform public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(
    jsonb_build_object(
      'previsao_id', v_previsao_dezembro,
      'transacao_id', v_transacao_dezembro,
      'decisao', 'confirmar',
      'motivo', 'extrato confirmado'
    ),
    '{}'::jsonb
  );
  select valor_total into v_total_depois_decisao
    from public.financeiro_cartao_faturas
   where id = v_fatura_dezembro;
  if (select status from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_dezembro) <> 'confirmada'
     or (select transacao_confirmada_id from public.financeiro_cartao_recorrencia_previsoes where id = v_previsao_dezembro) <> v_transacao_dezembro
     or v_total_antes_decisao <> v_total_depois_decisao then
    raise exception 'confirmar deveria vincular previsao sem alterar total financeiro.';
  end if;

  if public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura_fechada, '{}'::jsonb) <> 0
     or exists (
       select 1 from public.financeiro_cartao_recorrencia_previsoes
        where recorrencia_id = v_recorrencia_id and fatura_id = v_fatura_fechada
     ) then
    raise exception 'fatura fechada nao deveria gerar previsao.';
  end if;

  begin
    insert into public.financeiro_cartao_recorrencia_previsoes (
      recorrencia_id, fatura_id, cartao_id, competencia, data_compra, descricao, valor
    )
    values (
      v_recorrencia_id, v_fatura_setembro, v_cartao_id, date '2026-09-01',
      date '2026-09-10', 'Duplicata fixture', 49.90
    );
  exception
    when unique_violation then
      v_duplicata_bloqueada := true;
  end;
  select count(*) into v_count
    from public.financeiro_cartao_recorrencia_previsoes
   where recorrencia_id = v_recorrencia_id and competencia = date '2026-09-01';
  if v_duplicata_bloqueada is not true or v_count <> 1 then
    raise exception 'unicidade deveria impedir segunda previsao da mesma regra/competencia.';
  end if;

  perform public.financeiro_cartao_recorrencia_alterar_status(
    jsonb_build_object('recorrencia_id', v_recorrencia_id, 'status', 'encerrada', 'motivo', 'fim fixture'),
    '{}'::jsonb
  );
  v_abertura_janeiro := public.financeiro_cartao_fatura_abrir(
    jsonb_build_object('cartao_id', v_cartao_id, 'data_compra', '2027-01-10'),
    '{}'::jsonb
  );
  v_fatura_janeiro := nullif(v_abertura_janeiro->>'fatura_id', '')::uuid;
  if exists (
    select 1 from public.financeiro_cartao_recorrencia_previsoes
     where recorrencia_id = v_recorrencia_id
       and competencia = date '2027-01-01'
  ) then
    raise exception 'recorrencia encerrada nao deveria gerar previsao em janeiro.';
  end if;

  if not exists (
    select 1
      from public.maria_audit_log a
     where a.entidade_id = v_recorrencia_id
       and a.operacao = 'criar_recorrencia_cartao'
       and a.papel = 'web'
       and a.ator_numero = v_usuario_id::text
       and a.invoker_role = 'authenticated'
       and a.antes is null
       and a.depois is not null
  ) then
    raise exception 'auditoria de criacao deveria atribuir web autenticado e registrar depois.';
  end if;
  if not exists (
    select 1
      from public.maria_audit_log a
     where a.entidade_id = v_recorrencia_id
       and a.operacao = 'atualizar_recorrencia_cartao'
       and a.papel = 'web'
       and a.ator_numero = v_usuario_id::text
       and a.invoker_role = 'authenticated'
       and a.antes is not null
       and a.depois is not null
  ) then
    raise exception 'auditoria de atualizacao deveria atribuir web autenticado e registrar antes/depois.';
  end if;
  if not exists (
    select 1 from public.maria_audit_log a
     where a.entidade_id = v_recorrencia_id
       and a.operacao = 'alterar_status_recorrencia_cartao'
       and a.papel = 'web' and a.ator_numero = v_usuario_id::text and a.invoker_role = 'authenticated'
       and a.antes is not null and a.depois is not null
       and a.antes->>'status' = 'ativa' and a.depois->>'status' = 'pausada'
  ) then
    raise exception 'auditoria deveria registrar pausa ativa/pausada com web autenticado.';
  end if;
  if not exists (
    select 1 from public.maria_audit_log a
     where a.entidade_id = v_recorrencia_id
       and a.operacao = 'alterar_status_recorrencia_cartao'
       and a.papel = 'web' and a.ator_numero = v_usuario_id::text and a.invoker_role = 'authenticated'
       and a.antes is not null and a.depois is not null
       and a.antes->>'status' = 'pausada' and a.depois->>'status' = 'ativa'
  ) then
    raise exception 'auditoria deveria registrar retomada pausada/ativa com web autenticado.';
  end if;
  if not exists (
    select 1 from public.maria_audit_log a
     where a.entidade_id = v_recorrencia_id
       and a.operacao = 'alterar_status_recorrencia_cartao'
       and a.papel = 'web' and a.ator_numero = v_usuario_id::text and a.invoker_role = 'authenticated'
       and a.antes is not null and a.depois is not null
       and a.antes->>'status' = 'ativa' and a.depois->>'status' = 'encerrada'
  ) then
    raise exception 'auditoria deveria registrar encerramento ativa/encerrada com web autenticado.';
  end if;
  if not exists (
    select 1
      from public.maria_audit_log a
     where a.entidade_id = v_previsao_novembro
       and a.operacao = 'manter_previsao_separada'
       and a.papel = 'web'
       and a.ator_numero = v_usuario_id::text
       and a.invoker_role = 'authenticated'
       and a.antes is not null
       and a.depois is not null
       and a.antes->>'status' = 'prevista'
       and a.depois->>'status' = 'dispensada'
  ) then
    raise exception 'decisao manter_separadas deveria auditar transicao prevista/dispensada com web autenticado.';
  end if;
  if not exists (
    select 1
      from public.maria_audit_log a
     where a.entidade_id = v_previsao_dezembro
       and a.operacao = 'confirmar_vinculo_recorrencia'
       and a.papel = 'web'
       and a.ator_numero = v_usuario_id::text
       and a.invoker_role = 'authenticated'
       and a.antes is not null
       and a.depois is not null
       and a.antes->>'status' = 'prevista'
       and a.depois->>'status' = 'confirmada'
  ) then
    raise exception 'decisao confirmar deveria auditar transicao prevista/confirmada com web autenticado.';
  end if;
  if v_fatura_janeiro is null or v_previsao_setembro is null then
    raise exception 'fixture nao resolveu IDs obrigatorios.';
  end if;
end;
$$;

rollback;
