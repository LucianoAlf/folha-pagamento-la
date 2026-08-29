-- Remove o índice único mensal (recorrente_modelo_id, competencia), que forçava 1 instância
-- por modelo por mês — incompatível com recorrência semanal (várias no mesmo mês). A unicidade
-- passa a ser garantida por contas_pagar_modelo_venc_uniq (recorrente_modelo_id, data_vencimento),
-- que protege mensal (datas distintas entre meses) e permite semanal (datas distintas no mês).
drop index if exists public.idx_contas_pagar_recorrente_mes_unico;
