-- Rodar via MCP execute_sql. Simula a Rose (sem linha) inserindo a propria config, e a Ana lendo so a dela.
begin;
select set_config('request.jwt.claim.sub', 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', true),
       set_config('request.jwt.claims', '{"sub":"cf0e4bf0-d056-4b55-83c1-92b81f6be9c4","role":"authenticated"}', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- insert da propria linha passa o with_check (sem telefone: whatsapp_numero fica nulo)
insert into public.notificacao_config (user_id, whatsapp_ativo, resumo_diario_ativo)
values ('cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', false, true);

do $t$
begin
  assert (select count(*) from public.notificacao_config) = 1, 'Rose deveria ver exatamente 1 linha (a dela)';
  assert (select user_id from public.notificacao_config limit 1) = 'cf0e4bf0-d056-4b55-83c1-92b81f6be9c4', 'linha visivel nao e da Rose';
end $t$;

-- insert em nome de outro usuario e recusado
do $t$
declare v_ok boolean := false;
begin
  begin
    insert into public.notificacao_config (user_id) values ('81305959-dc68-4f8e-b54f-dd055dabcfd4');
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  assert v_ok, 'insert em nome da Ana deveria falhar com 42501';
end $t$;

reset role;
rollback;
select 'PASS: 02_rls_notificacao_config' as resultado;
