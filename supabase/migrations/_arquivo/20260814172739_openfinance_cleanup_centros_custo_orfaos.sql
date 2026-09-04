-- Reverte o efeito colateral da migration anterior (openfinance_cadastro_empresas_contas_reais):
-- financeiro_empresas e financeiro_contas_bancarias já existiam desde 28/06/2026 (seed do
-- módulo de Cartões) com o CNPJ/conta/unidade_id corretos — a inserção foi um no-op esperado.
-- Mas o guard de centros_custo não sabia que "Campo Grande" já cobre Kids CG e EMLA CG, e criou
-- 2 centros de custo redundantes sem nenhuma referência. Removendo.
delete from public.centros_custo cc
where cc.nome in ('Kids CG', 'EMLA CG')
  and not exists (select 1 from public.financeiro_empresas fe where fe.unidade_id = cc.id);
