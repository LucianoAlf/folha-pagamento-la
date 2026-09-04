-- Mapeia o cartão Mercado Pago (final 4425 no cadastro, número 0687 na Pluggy) ao item da
-- aplicação Pluggy pessoal do Alf. Confirmado por limite (27.700) e bandeira (VISA) via probe
-- em 14/08/2026. pluggy_app='mercado_pago' faz a Edge Function usar o par de credenciais MP.
update public.financeiro_cartoes
  set pluggy_item_id = 'd673d702-737c-46e9-aba8-73587b583e25',
      pluggy_account_id = '72ae9abb-b523-4cfa-8ae2-633fe5c0d63c',
      pluggy_app = 'mercado_pago'
  where final = '4425';
