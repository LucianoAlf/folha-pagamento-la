-- O create function reintroduziu o grant padrao de EXECUTE para PUBLIC (logo anon/authenticated).
-- A postura original desta RPC SECURITY DEFINER e travada: so service_role e maria_operacional.
-- Restaura removendo o PUBLIC.
revoke execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) from public;
