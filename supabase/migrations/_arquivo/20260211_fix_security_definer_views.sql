-- Fix Supabase Security Advisor: security_definer_view
-- Postgres default for views behaves like "definer"; on PG15+ we can enforce invoker.
-- This ensures underlying table privileges/RLS are evaluated for the querying role.

alter view public.v_ferias_colaboradores_status set (security_invoker = true);
alter view public.vw_resumo_unidade set (security_invoker = true);

