-- Rodar via MCP execute_sql. Cria moldes sinteticos, materializa set/2026 em rollback. Esperado: 'PASS: 07_materializar'.
begin;
do $t$
declare
  v_fin uuid; v_pac uuid; v_f12 uuid; v_f21 uuid; v_simples uuid; v_dom uuid; v_paus uuid; v_r jsonb;
  v_pai_t uuid; v_n int;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;

  -- pacote: pai dia 6 (piso), filhas 12 e 21 -> vencimento do pai = 21 (2026-09-21 e segunda)
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, se_cair_fim_de_semana, vigencia_inicio) values ('X Pacote', v_fin, 6, 'proximo_dia_util', date '2026-01-01') returning id into v_pac;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 12', v_fin, 12, v_pac, date '2026-01-01') returning id into v_f12;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 21', v_fin, 21, v_pac, date '2026-01-01') returning id into v_f21;
  -- simples dia 30, vigencia set
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, vigencia_inicio) values ('X Simples', v_fin, 30, date '2026-09-01') returning id into v_simples;
  -- vigencia nominal vs ajustada: dia 1 de nov/2026 e domingo; dia_util_anterior -> 30/10; vigencia 2026-11-01
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, se_cair_fim_de_semana, vigencia_inicio) values ('X Dom', v_fin, 1, 'dia_util_anterior', date '2026-11-01') returning id into v_dom;
  -- pausada: nao materializa
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, status, vigencia_inicio) values ('X Pausada', v_fin, 5, 'pausada', date '2026-01-01') returning id into v_paus;

  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'pais_criados')::int = 2, 'esperava 2 pais (pacote + simples), veio ' || (v_r->>'pais_criados');
  assert (v_r->>'filhas_criadas')::int = 2, 'esperava 2 filhas, veio ' || (v_r->>'filhas_criadas');
  assert jsonb_array_length(v_r->'erros') = 0, 'erros: ' || (v_r->'erros')::text;

  -- pai = max(6, 12, 21) = 21/09 (segunda, sem ajuste); competencia 2026-09-01
  select id into v_pai_t from public.tarefas where rotina_id = v_pac and competencia = date '2026-09-01';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where id = v_pai_t) = date '2026-09-21', 'vencimento do pai deveria ser 21/09 (max das filhas)';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::time from public.tarefas where id = v_pai_t) = time '09:00', 'hora 09:00';
  -- filhas apontam pro pai e tem datas proprias
  assert (select count(*) from public.tarefas where parent_id = v_pai_t) = 2, 'filhas com parent_id';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = date '2026-09-12', 'filha 12';
  -- simples dia 30
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_simples and competencia = date '2026-09-01') = date '2026-09-30', 'simples 30';
  -- pausada e vigencia futura nao existem em set
  assert not exists (select 1 from public.tarefas where rotina_id in (v_paus, v_dom) and competencia = date '2026-09-01'), 'pausada/vigencia futura nao deveriam materializar';

  -- idempotente
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'pais_criados')::int = 0 and (v_r->>'filhas_criadas')::int = 0, '2a rodada deveria criar 0';

  -- vigencia compara a NOMINAL: nov/2026, X Dom nominal 01/11 (>= vigencia 01/11) -> cria, com vencimento ajustado 30/10 (competencia fica nov)
  v_r := public.agenda_rotinas_materializar(date '2026-11-01', 'manual');
  assert exists (select 1 from public.tarefas where rotina_id = v_dom and competencia = date '2026-11-01'), 'X Dom deveria existir em nov (vigencia pela nominal)';
  assert (select (vencimento_em at time zone 'America/Sao_Paulo')::date from public.tarefas where rotina_id = v_dom and competencia = date '2026-11-01') = date '2026-10-30', 'ajuste dia_util_anterior 01/11 dom -> 30/10';

  -- cancelada ocupa a chave: cancelar a filha 12 de set e rematerializar -> nao ressuscita
  update public.tarefas set status = 'cancelada' where rotina_id = v_f12 and competencia = date '2026-09-01';
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (select count(*) from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = 1, 'cancelada nao deveria ser recriada';
  assert (select status from public.tarefas where rotina_id = v_f12 and competencia = date '2026-09-01') = 'cancelada', 'status cancelada preservado';

  -- pai fechado nao ganha filha nova: conclui filhas e pai de set; adiciona filha-molde nova; rematerializa -> pulada
  update public.tarefas set status = 'concluida' where parent_id = v_pai_t;
  update public.tarefas set status = 'concluida' where id = v_pai_t;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha 25', v_fin, 25, v_pac, date '2026-01-01');
  v_r := public.agenda_rotinas_materializar(date '2026-09-01', 'manual');
  assert (v_r->>'filhas_criadas')::int = 0, 'pai concluido nao deveria ganhar filha';
  assert (v_r->>'pulados')::int >= 1, 'filha sob pai fechado deveria contar em pulados';

  -- filha parcial no 1o mes: filha com vigencia 2026-09-20 e dia 12 -> em set pula (12 < 20); em out entra
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id, vigencia_inicio) values ('X filha tardia', v_fin, 12, v_simples, date '2026-09-20');
  -- (X Simples virou pai ao ganhar filha; seu vencimento em out = max(30, 12) = 30)
  v_r := public.agenda_rotinas_materializar(date '2026-10-01', 'manual');
  assert exists (select 1 from public.tarefas t join public.agenda_rotinas r on r.id = t.rotina_id where r.titulo = 'X filha tardia' and t.competencia = date '2026-10-01'), 'filha tardia em out';

  -- registro da rodada
  select count(*) into v_n from public.agenda_materializacoes where origem = 'manual' and competencia = date '2026-09-01';
  assert v_n >= 3, 'agenda_materializacoes deveria ter as rodadas de set';
end $t$;
rollback;
select 'PASS: 07_materializar' as resultado;
