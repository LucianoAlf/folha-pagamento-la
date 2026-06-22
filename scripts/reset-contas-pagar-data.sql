-- Reset operacional: Contas a Pagar (NÃO mexe em folha de pagamento)
-- Executar via Supabase SQL Editor ou MCP com confirmação explícita.
--
-- REMOVE:
--   contas_pagar (+ cascade: codigo_mes, notificacoes por conta, lembretes_log)
--   tarefas da agenda vinculadas (vinculo_tipo = 'conta_pagar')
--   snapshots IA e relatório do dia
--
-- PRESERVA:
--   categorias_despesa, contas_credenciais, folha, colaboradores, demais tarefas agenda

begin;

-- Pré-contagem (opcional — descomente para auditoria)
-- select 'contas_pagar' as tbl, count(*) from contas_pagar
-- union all select 'tarefas conta_pagar', count(*) from tarefas where vinculo_tipo = 'conta_pagar';

-- 1) Tarefas automáticas da agenda (vínculo lógico, sem FK para contas_pagar)
delete from public.tarefas
where vinculo_tipo = 'conta_pagar';

-- 2) Cache IA / relatórios (sem dependência de folha)
delete from public.contas_pagar_relatorio_dia;
delete from public.contas_ai_insights;
delete from public.contas_comparativo_ai_insights;
delete from public.contas_anomalia_notas;

-- 3) Lançamentos financeiros (cascade nas tabelas filhas)
delete from public.contas_pagar;

commit;

-- Pós-reset: abrir Agenda no app dispara syncAgendaIntegrations() e recria tarefas
-- para contas novas dentro da janela -90d / +45d.
