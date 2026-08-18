\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_setting('app.contas_pagar_ajuste_fixture_guard', true) is distinct from 'local_ci_only' then
    raise exception 'REFUSED: fixture local obrigatoria.';
  end if;
  if current_database() is distinct from 'contas_pagar_ajuste_fixture' then
    raise exception 'REFUSED: banco de fixture esperado.';
  end if;
end;
$$;

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';

insert into public.centros_custo (id, codigo, ativo)
values ('00000000-0000-0000-0000-00000000a010', 'rec', true);
insert into public.financeiro_empresas (id, unidade_id, ativo)
values ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a010', true);
insert into public.financeiro_contas_bancarias (id, empresa_id, ativo)
values ('00000000-0000-0000-0000-00000000a012', '00000000-0000-0000-0000-00000000a011', true);
insert into public.plano_contas (id, ativo)
values ('00000000-0000-0000-0000-00000000a013', true);

insert into public.contas_pagar (
  id, descricao, unidade, valor, data_lancamento, data_vencimento, competencia,
  status, data_pagamento, metodo_pagamento, tipo_lancamento, plano_conta_id,
  centro_custo_id, empresa_id, conta_pagadora_id, observacoes
) values (
  '00000000-0000-0000-0000-00000000a020', 'Conta com dado incorreto', 'rec', 10.00,
  date '2026-08-01', date '2026-08-05', date '2026-08-01', 'pago',
  timestamptz '2026-08-05 03:00:00+00', 'Boleto', 'unica',
  '00000000-0000-0000-0000-00000000a013', '00000000-0000-0000-0000-00000000a010',
  '00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a012', 'antes'
), (
  '00000000-0000-0000-0000-00000000a021', 'Fatura fonte', 'rec', 10.00,
  date '2026-08-01', date '2026-08-05', date '2026-08-01', 'pago',
  timestamptz '2026-08-05 03:00:00+00', 'Boleto', 'fatura_cartao',
  '00000000-0000-0000-0000-00000000a013', '00000000-0000-0000-0000-00000000a010',
  '00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a012', null
);

do $$
declare
  v_result jsonb;
  v_after public.contas_pagar%rowtype;
  v_audit public.maria_audit_log%rowtype;
  v_source_rejected boolean := false;
begin
  v_result := public.contas_pagar_ajustar_paga(jsonb_build_object(
    'conta_id', '00000000-0000-0000-0000-00000000a020',
    'descricao', 'Conta corrigida',
    'valor', '123.456',
    'data_lancamento', '2026-08-02',
    'data_vencimento', '2026-08-15',
    'data_pagamento', '2026-08-16',
    'metodo_pagamento', 'PIX',
    'conta_pagadora_id', '00000000-0000-0000-0000-00000000a012',
    'plano_conta_id', '00000000-0000-0000-0000-00000000a013',
    'observacoes', 'correcao fixture',
    'motivo', 'Conferencia do extrato'
  ));
  if coalesce((v_result->>'success')::boolean, false) is not true then
    raise exception 'RPC nao retornou sucesso: %', v_result;
  end if;

  select * into v_after from public.contas_pagar where id = '00000000-0000-0000-0000-00000000a020';
  if v_after.descricao <> 'Conta corrigida'
     or v_after.valor <> 123.46
     or v_after.data_lancamento <> date '2026-08-02'
     or v_after.data_vencimento <> date '2026-08-15'
     or v_after.competencia <> date '2026-08-01'
     or v_after.metodo_pagamento <> 'PIX'
     or v_after.status <> 'pago' then
    raise exception 'campos corrigidos nao bateram: %', to_jsonb(v_after);
  end if;

  select * into v_audit
    from public.maria_audit_log
   where entidade_id = v_after.id
     and operacao = 'ajustar_conta_paga';
  if not found
     or v_audit.antes->>'descricao' <> 'Conta com dado incorreto'
     or v_audit.depois->>'descricao' <> 'Conta corrigida'
     or v_audit.motivo <> 'Conferencia do extrato' then
    raise exception 'auditoria antes/depois nao registrada.';
  end if;

  begin
    perform public.contas_pagar_ajustar_paga(jsonb_build_object(
      'conta_id', '00000000-0000-0000-0000-00000000a021',
      'descricao', 'Tentativa proibida', 'valor', 10,
      'data_lancamento', '2026-08-01', 'data_vencimento', '2026-08-05',
      'data_pagamento', '2026-08-05', 'metodo_pagamento', 'PIX',
      'conta_pagadora_id', '00000000-0000-0000-0000-00000000a012',
      'plano_conta_id', '00000000-0000-0000-0000-00000000a013'
    ));
  exception when others then
    v_source_rejected := position('fluxo de origem' in sqlerrm) > 0;
  end;
  if not v_source_rejected then
    raise exception 'fatura de cartao deveria ser recusada pela RPC.';
  end if;
end;
$$;

rollback;
