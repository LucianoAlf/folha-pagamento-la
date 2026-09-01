-- Rodar via MCP execute_sql. Cria contas ficticias, roda o sync, verifica, e desfaz tudo.
begin;
do $t$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_t1 uuid; v_t4 uuid; v_f1 uuid; v_r jsonb; v_n int;
  c_rose constant uuid := 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4';
begin
  -- c1: pendente, vence em 2 dias -> espelho 'media'
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento)
  values ('TESTE SYNC c1', 'rec', 123.45, v_hoje, v_hoje + 2, date_trunc('month', v_hoje)::date, 'pendente', 'unica')
  returning id into v_c1;
  -- c2: paga ha 100 dias (fora da janela) com espelho ja existente -> espelho FICA
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento, data_pagamento)
  values ('TESTE SYNC c2', 'bar', 50, v_hoje - 100, v_hoje - 100, date_trunc('month', v_hoje - 100)::date, 'pago', 'unica', (v_hoje - 100)::timestamptz)
  returning id into v_c2;
  insert into public.tarefas (titulo, status, vinculo_tipo, vinculo_id, vencimento_em, dia_inteiro)
  values ('Pagar: TESTE SYNC c2', 'concluida', 'conta_pagar', v_c2, ((v_hoje - 100)::timestamp + time '09:00') at time zone 'America/Sao_Paulo', true);
  -- c3: cancelada com espelho existente -> espelho SAI
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento)
  values ('TESTE SYNC c3', 'cg', 10, v_hoje, v_hoje + 1, date_trunc('month', v_hoje)::date, 'cancelado', 'unica')
  returning id into v_c3;
  insert into public.tarefas (titulo, status, vinculo_tipo, vinculo_id, vencimento_em, dia_inteiro)
  values ('Pagar: TESTE SYNC c3', 'pendente', 'conta_pagar', v_c3, now(), true);

  v_r := public.agenda_sync_contas_pagar();

  select id into v_t1 from public.tarefas where vinculo_tipo = 'conta_pagar' and vinculo_id = v_c1;
  assert v_t1 is not null, 'espelho de c1 nao foi criado';
  assert (select prioridade from public.tarefas where id = v_t1) = 'media', 'prioridade de c1 deveria ser media';
  assert (select titulo from public.tarefas where id = v_t1) = 'Pagar: TESTE SYNC c1', 'titulo do espelho errado';
  assert (select descricao from public.tarefas where id = v_t1) like '%Valor: R$ 123,45%', 'agenda_brl errado: ' || (select descricao from public.tarefas where id = v_t1);
  assert (select lista_id from public.tarefas where id = v_t1) is not null, 'espelho sem lista Financeiro';
  assert exists (select 1 from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c2), 'espelho de conta paga ha 100d NAO deveria ser removido';
  assert not exists (select 1 from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c3), 'espelho de conta cancelada deveria ser removido';

  -- responsavel setado pela Rose sobrevive ao proximo sync; conta paga -> concluida
  update public.tarefas set responsavel_id = c_rose where id = v_t1;
  update public.contas_pagar set status = 'pago', data_pagamento = now() where id = v_c1;
  v_r := public.agenda_sync_contas_pagar();
  assert (select responsavel_id from public.tarefas where id = v_t1) = c_rose, 'sync sobrescreveu responsavel_id';
  assert (select status from public.tarefas where id = v_t1) = 'concluida', 'conta paga deveria concluir o espelho';
  assert (select data_conclusao from public.tarefas where id = v_t1) is not null, 'data_conclusao ausente';

  -- rodar duas vezes nao duplica
  v_r := public.agenda_sync_contas_pagar();
  select count(*) into v_n from public.tarefas where vinculo_tipo='conta_pagar' and vinculo_id = v_c1;
  assert v_n = 1, 'espelho duplicado: ' || v_n;

  -- achado 1: data_pagamento e timestamptz na meia-noite UTC; sem normalizar, o espelho volta um dia
  -- no fuso -03. data_conclusao tem que ser 12:00 SP da data SP do pagamento (como o cliente legado).
  assert ((select data_conclusao from public.tarefas where id = v_t1) at time zone 'America/Sao_Paulo')::time = time '12:00',
    'data_conclusao deveria ser 12:00 SP da data SP do pagamento';
  assert ((select data_conclusao from public.tarefas where id = v_t1) at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date,
    'data_conclusao deveria ser 12:00 SP da data SP do pagamento';

  -- achado 2: orfa com filha ativa nao pode derrubar o sync (tarefas_guard_delete levanta P0001).
  insert into public.contas_pagar (descricao, unidade, valor, data_lancamento, data_vencimento, competencia, status, tipo_lancamento)
  values ('TESTE SYNC c4', 'cg', 77, v_hoje, v_hoje + 1, date_trunc('month', v_hoje)::date, 'pendente', 'unica')
  returning id into v_c4;
  v_r := public.agenda_sync_contas_pagar();
  select id into v_t4 from public.tarefas where vinculo_tipo = 'conta_pagar' and vinculo_id = v_c4;
  assert v_t4 is not null, 'espelho de c4 nao foi criado';
  insert into public.tarefas (titulo, status, parent_id)
  values ('T filha do espelho', 'pendente', v_t4)
  returning id into v_f1;
  update public.contas_pagar set status = 'cancelado' where id = v_c4;
  -- se o sync levantasse P0001 aqui, o bloco inteiro abortaria e nao chegariamos ao assert.
  v_r := public.agenda_sync_contas_pagar();
  assert exists (select 1 from public.tarefas where id = v_t4), 'orfa com filha ativa deveria ser preservada';
  -- filha fechada -> o espelho e colhido no ciclo seguinte
  update public.tarefas set status = 'concluida' where id = v_f1;
  v_r := public.agenda_sync_contas_pagar();
  assert not exists (select 1 from public.tarefas where id = v_t4), 'orfa sem filha ativa deveria ser removida';
end $t$;
rollback;
select 'PASS: 04_sync_contas_pagar' as resultado;
