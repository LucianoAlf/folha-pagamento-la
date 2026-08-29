-- Default privileges do Supabase concedem EXECUTE em novas funcoes a anon/authenticated.
-- A RPC original era travada (so service_role + maria_operacional); restaura removendo anon e authenticated.
revoke execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) from anon;
revoke execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) from authenticated;
