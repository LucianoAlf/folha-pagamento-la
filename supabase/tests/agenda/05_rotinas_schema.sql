-- Rodar via MCP execute_sql. Esperado: sem erro e ultima linha 'PASS: 05_rotinas_schema'.
begin;
do $t$
declare v_fin uuid; v_rh uuid; v_pai uuid; v_filha uuid; v_solo uuid; v_ok boolean; v_t uuid; v_lista_depois uuid;
begin
  select id into v_fin from public.tarefas_listas where lower(nome)='financeiro' and coalesce(is_smart,false)=false order by ordem limit 1;
  select id into v_rh  from public.tarefas_listas where lower(nome)='rh' and coalesce(is_smart,false)=false order by ordem limit 1;
  assert v_fin is not null and v_rh is not null, 'listas Financeiro/RH ausentes';

  insert into public.agenda_rotinas (titulo, lista_id, dia_mes) values ('R pai', v_fin, 10) returning id into v_pai;
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R filha', v_fin, 12, v_pai) returning id into v_filha;

  -- filha de filha -> recusa
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R neta', v_fin, 13, v_filha);
  exception when others then v_ok := sqlerrm like 'profundidade maxima 1%'; end;
  assert v_ok, 'neta deveria ser recusada';

  -- filha em outra lista -> recusa
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, parent_rotina_id) values ('R filha rh', v_rh, 13, v_pai);
  exception when others then v_ok := sqlerrm like 'filha deve estar na mesma lista%'; end;
  assert v_ok, 'filha em outra lista deveria ser recusada';

  -- R-B1-4: mover o PAI de lista quebraria o invariante pelas costas -> recusa
  v_ok := false;
  begin
    update public.agenda_rotinas set lista_id = v_rh where id = v_pai;
  exception when others then
    v_ok := sqlstate = 'P0001' and sqlerrm like 'rotina com filhas nao muda de lista%';
  end;
  assert v_ok, 'pai com filhas nao deveria poder mudar de lista';
  select lista_id into v_lista_depois from public.agenda_rotinas where id = v_pai;
  assert v_lista_depois = v_fin, 'a lista do pai deveria ter ficado intacta';

  -- ... mas a guarda nao pode bloquear demais: rotina SEM filhas muda de lista normalmente
  insert into public.agenda_rotinas (titulo, lista_id, dia_mes) values ('R solo', v_fin, 5) returning id into v_solo;
  update public.agenda_rotinas set lista_id = v_rh where id = v_solo;
  select lista_id into v_lista_depois from public.agenda_rotinas where id = v_solo;
  assert v_lista_depois = v_rh, 'rotina sem filhas deveria poder mudar de lista';

  -- sem dia_mes e sem ultimo_dia -> CHECK
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id) values ('R sem dia', v_fin);
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'rotina sem dia deveria violar o CHECK';

  -- frequencia semanal barrada
  v_ok := false;
  begin
    insert into public.agenda_rotinas (titulo, lista_id, dia_mes, frequencia) values ('R sem', v_fin, 1, 'semanal');
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'frequencia semanal deveria ser barrada';

  -- instancia com rotina_id exige competencia; chave unica (rotina_id, competencia)
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, rotina_id) values ('T sem comp', 'pendente', v_pai);
  exception when others then v_ok := sqlstate = '23514'; end;
  assert v_ok, 'instancia sem competencia deveria violar o CHECK';
  insert into public.tarefas (titulo, status, rotina_id, competencia) values ('T set', 'pendente', v_pai, date '2026-09-01') returning id into v_t;
  update public.tarefas set status = 'cancelada' where id = v_t;
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, rotina_id, competencia) values ('T set dup', 'pendente', v_pai, date '2026-09-01');
  exception when others then v_ok := sqlstate = '23505'; end;
  assert v_ok, 'cancelada deveria continuar ocupando a chave (rotina_id, competencia)';
end $t$;
rollback;
select 'PASS: 05_rotinas_schema' as resultado;
