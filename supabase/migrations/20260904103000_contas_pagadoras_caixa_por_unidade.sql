-- Conta pagadora interna por unidade, para pagamento em espécie (fora do banco).
-- Sem Open Finance de propósito: pluggy_* fica NULL, e openfinance-sync-saldos
-- filtra por pluggy_item_id não nulo, então ignora estas contas.
-- Antes disso, pagamento em dinheiro era registrado numa conta Santander que não
-- debitou de verdade, e virava ruído na conciliação com o extrato.
insert into public.financeiro_contas_bancarias
  (empresa_id, banco, agencia, conta, tipo, apelido, ativo, observacoes)
values
  ('0c593015-b65d-4863-aab1-3c9db205f3b9','Caixa','0','CAIXA-RECREIO','corrente','Caixa Recreio',true,'Conta pagadora interna (espécie). Sem Open Finance.'),
  ('03b21560-69db-4488-a413-a9e6e56fc71e','Caixa','0','CAIXA-BARRA','corrente','Caixa Barra',true,'Conta pagadora interna (espécie). Sem Open Finance.'),
  ('b077b3f7-f553-42f4-87e8-e90e932e994b','Caixa','0','CAIXA-EMLA-CG','corrente','Caixa EMLA CG',true,'Conta pagadora interna (espécie). Sem Open Finance.'),
  ('d2a4e487-9cd2-425c-b77b-cc396a8873f2','Caixa','0','CAIXA-KIDS-CG','corrente','Caixa Kids CG',true,'Conta pagadora interna (espécie). Sem Open Finance.')
on conflict (banco, agencia, conta) do nothing;
