-- Rodar via MCP execute_sql. Usa a lista Financeiro (Rose+Ana) semeada na Task 1.
-- Fixtures ancoradas em 12:00 SP de hoje (nao em now()+1h): a janela do resumo e
-- [hoje 00:00 SP, amanha 00:00 SP), entao qualquer offset relativo a now() torna o
-- teste vermelho perto da meia-noite SP. 12:00 fica longe das duas bordas e tambem
-- dentro do lookback de 12 h de agenda_lembretes_devidos em qualquer hora do dia.
begin;
do $t$
declare
  v_fin uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_n int; v_m timestamptz; v_r jsonb;
  v_meio_dia timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '12 hours') at time zone 'America/Sao_Paulo';
  c_rose constant uuid := 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4';
  c_ana  constant uuid := '81305959-dc68-4f8e-b54f-dd055dabcfd4';
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  assert v_fin is not null, 'lista Financeiro ausente';

  -- 1) responsavel nulo + lista com membros -> Rose e Ana
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro)
  values ('T grupo', 'pendente', v_fin, v_meio_dia, false) returning id into v_t1;
  select count(*) into v_n from public.agenda_destinatarios(v_t1);
  assert v_n = 2, 'esperava 2 destinatarios (membros), veio ' || v_n;

  -- 2) responsavel definido -> so ele
  insert into public.tarefas (titulo, status, lista_id, responsavel_id, vencimento_em, dia_inteiro)
  values ('T rose', 'pendente', v_fin, c_rose, v_meio_dia, false) returning id into v_t2;
  assert (select count(*) from public.agenda_destinatarios(v_t2)) = 1, 'responsavel definido deveria ser 1';
  assert (select user_id from public.agenda_destinatarios(v_t2)) = c_rose, 'destinatario deveria ser a Rose';

  -- 3) sem lista e sem responsavel -> created_by
  insert into public.tarefas (titulo, status, created_by, vencimento_em, dia_inteiro)
  values ('T avulsa', 'pendente', c_ana, v_meio_dia, false) returning id into v_t3;
  assert (select user_id from public.agenda_destinatarios(v_t3)) = c_ana, 'fallback created_by falhou';

  -- 4) momento: dia_inteiro -> null
  assert public.agenda_momento_lembrete(now(), true, 30) is null, 'dia_inteiro deveria dar null';
  -- 5) 10:00 SP com 30 min -> 09:30 SP (dentro da janela)
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 10:00:00-03', false, 30);
  assert v_m = timestamptz '2026-09-02 09:30:00-03', 'dentro da janela deveria manter 09:30, veio ' || v_m;
  -- 6) 07:00 SP com 60 min -> 06:00 -> adia pra 07:30 do mesmo dia
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 07:00:00-03', false, 60);
  assert v_m = timestamptz '2026-09-02 07:30:00-03', 'antes da janela deveria ir pra 07:30, veio ' || v_m;
  -- 7) 22:30 SP com 30 min -> 22:00 -> adia pra 07:30 do dia seguinte
  v_m := public.agenda_momento_lembrete(timestamptz '2026-09-02 22:30:00-03', false, 30);
  assert v_m = timestamptz '2026-09-03 07:30:00-03', 'depois da janela deveria ir pro dia seguinte, veio ' || v_m;

  -- 8) lembretes_devidos: T grupo aparece 2x (Rose e Ana), T rose 1x
  select count(*) into v_n from public.agenda_lembretes_devidos(now() + interval '30 hours') where tarefa_id = v_t1;
  assert v_n = 2, 'T grupo deveria render 2 linhas, veio ' || v_n;
  select count(*) into v_n from public.agenda_lembretes_devidos(now() + interval '30 hours') where tarefa_id = v_t2;
  assert v_n = 1, 'T rose deveria render 1 linha, veio ' || v_n;

  -- 8b) horizonte por momento: offset de 1440 min poe o momento 24 h antes do vencimento.
  -- Com o filtro antigo (vencimento <= p_ate) essa linha sumia silenciosamente; agora o corte
  -- alarga pelo offset efetivo da linha.
  insert into public.tarefas (titulo, status, lista_id, vencimento_em, dia_inteiro, lembrete_minutos)
  values ('T offset 1440', 'pendente', v_fin, v_meio_dia, false, array[1440]) returning id into v_t4;
  select count(*) into v_n from public.agenda_lembretes_devidos(now() + interval '2 hours') where tarefa_id = v_t4;
  assert v_n = 2, 'T offset 1440 deveria render 2 linhas (Rose e Ana), veio ' || v_n;
  select distinct momento into v_m from public.agenda_lembretes_devidos(now() + interval '2 hours') where tarefa_id = v_t4;
  assert v_m = v_meio_dia - interval '1440 minutes', 'momento com offset 1440 deveria ser 24h antes do vencimento, veio ' || v_m;

  -- 9) resumo da Rose no dia de hoje (SP) inclui T grupo e T rose, nao inclui T avulsa (da Ana)
  v_r := public.agenda_resumo_usuario(c_rose, (now() at time zone 'America/Sao_Paulo')::date, 1);
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T grupo')), 'resumo da Rose sem T grupo';
  assert (v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T rose')), 'resumo da Rose sem T rose';
  assert not ((v_r->'itens') @> jsonb_build_array(jsonb_build_object('titulo', 'T avulsa'))), 'resumo da Rose nao deveria ter T avulsa';
  assert (v_r->>'nome') is not null, 'nome ausente no resumo';
end $t$;
rollback;
select 'PASS: 03_destinatarios_momento' as resultado;
