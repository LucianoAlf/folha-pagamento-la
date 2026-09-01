-- Rodar via MCP execute_sql. Esperado: sem erro e a ultima linha 'PASS: 01_schema_guardas'.
begin;
do $t$
declare v_pai uuid; v_filha uuid; v_ok boolean;
begin
  insert into public.tarefas (titulo, status) values ('T pai', 'pendente') returning id into v_pai;
  insert into public.tarefas (titulo, status, parent_id) values ('T filha', 'pendente', v_pai) returning id into v_filha;

  -- filha de filha -> recusa
  v_ok := false;
  begin
    insert into public.tarefas (titulo, status, parent_id) values ('T neta', 'pendente', v_filha);
  exception when others then
    v_ok := sqlerrm like 'profundidade maxima 1%';
  end;
  assert v_ok, 'neta deveria ser recusada por profundidade';

  -- delete de pai com filha ativa -> recusa
  v_ok := false;
  begin
    delete from public.tarefas where id = v_pai;
  exception when others then
    v_ok := sqlerrm like 'pai com filha ativa%';
  end;
  assert v_ok, 'delete de pai com filha ativa deveria ser recusado';

  -- filha concluida -> pai pode ser excluido
  update public.tarefas set status = 'concluida' where id = v_filha;
  delete from public.tarefas where id = v_pai;
  assert (select parent_id from public.tarefas where id = v_filha) is null, 'on delete set null falhou';
end $t$;
rollback;
select 'PASS: 01_schema_guardas' as resultado;
