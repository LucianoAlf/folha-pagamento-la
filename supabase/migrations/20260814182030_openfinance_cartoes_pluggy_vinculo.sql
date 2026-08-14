-- Vínculo de cada cartão real com o cartão de crédito Open Finance (Pluggy) correspondente.
-- Fica no cadastro (financeiro_cartoes), não hardcoded na Edge Function: reconectou, atualiza aqui.
-- Casamento confirmado pelo Alf em 14/08/2026 por (unidade + limite): os 4 últimos dígitos do
-- cadastro (número do plástico) não batem com o número da conta-cartão que a Pluggy reporta, mas
-- o limite bate 1:1 dentro de cada item, e no caso do Kids CG 8434 a Pluggy lista 8434 como cartão
-- adicional da mesma conta — prova de que é o mesmo cartão.

alter table public.financeiro_cartoes
  add column if not exists pluggy_item_id text,
  add column if not exists pluggy_account_id text;

comment on column public.financeiro_cartoes.pluggy_item_id is
  'itemId da conexão Open Finance (Pluggy) do cartão. NULL = cartão não ligado ao Open Finance (ex.: Mercado Pago, fora do Santander).';
comment on column public.financeiro_cartoes.pluggy_account_id is
  'id da account CREDIT/CREDIT_CARD retornada pela Pluggy para este cartão.';

-- Recreio 8641 (limite 12.250)
update public.financeiro_cartoes
  set pluggy_item_id = '16a09238-0ed8-4885-92f2-8571184d5877',
      pluggy_account_id = '55904187-123b-4d90-b92f-4f06c30d9b08'
  where final = '8641';

-- Kids CG 1074 (limite 4.700)
update public.financeiro_cartoes
  set pluggy_item_id = '019f04bc-4f27-4373-9f88-68827c32d3c2',
      pluggy_account_id = '8b85b644-3462-44d5-9dc7-0a386438137d'
  where final = '1074';

-- Kids CG 8434 (limite 5.900)
update public.financeiro_cartoes
  set pluggy_item_id = '019f04bc-4f27-4373-9f88-68827c32d3c2',
      pluggy_account_id = 'a901478d-d7ec-4d90-a54b-5b8dc4ddb3d4'
  where final = '8434';

-- EMLA CG 2270 (limite 17.700)
update public.financeiro_cartoes
  set pluggy_item_id = '2da7650d-52e0-4908-9fcb-bac93099a9e4',
      pluggy_account_id = '0ce178e9-3cff-4f89-89e3-89e0ec0279aa'
  where final = '2270';

-- Barra 8516 (limite 1.500)
update public.financeiro_cartoes
  set pluggy_item_id = '4f8419d8-a2a1-485d-b72c-c930dd4c6a8c',
      pluggy_account_id = '5d0214f8-2198-4245-8d2a-3f7bb46c2247'
  where final = '8516';
