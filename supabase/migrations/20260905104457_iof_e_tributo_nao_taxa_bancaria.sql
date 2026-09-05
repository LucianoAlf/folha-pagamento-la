update public.maria_classificacao_regras
   set plano_conta_id = (select id from plano_contas where codigo = '4.1.5'),
       observacao = coalesce(observacao || ' | ', '')
                    || '05/09/2026: era 4.1.6 (Taxas Bancarias). IOF e tributo, nao tarifa: movido para '
                    || '4.1.5 (Outros Custos Tributarios e Financeiros). Decidido pelo Alf.'
 where palavra_chave = 'IOF DESPESA NO EXTERIOR';

update public.financeiro_cartao_transacoes
   set plano_conta_id = (select id from plano_contas where codigo = '4.1.5'),
       updated_at = now()
 where descricao ilike '%IOF%EXTERIOR%'
   and plano_conta_id is distinct from (select id from plano_contas where codigo = '4.1.5');

update public.contas_pagar
   set plano_conta_id = (select id from plano_contas where codigo = '4.1.5'),
       updated_at = now()
 where descricao ilike '%IOF%EXTERIOR%'
   and plano_conta_id is distinct from (select id from plano_contas where codigo = '4.1.5');
