-- Roteamento de credencial por aplicação Pluggy. A escola (Santander) usa uma aplicação
-- (clientId 7023...); o Mercado Pago do Alf usa OUTRA (clientId 7e54...). No Pluggy, um item
-- só é legível pela aplicação que o criou — então cada conta/cartão precisa saber a qual app
-- pertence, para a Edge Function escolher o par de credenciais certo no Vault.
--   'la_music'     -> PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET
--   'mercado_pago' -> PLUGGY_MP_CLIENT_ID / PLUGGY_MP_CLIENT_SECRET

alter table public.financeiro_contas_bancarias
  add column if not exists pluggy_app text not null default 'la_music'
  check (pluggy_app in ('la_music','mercado_pago'));

alter table public.financeiro_cartoes
  add column if not exists pluggy_app text not null default 'la_music'
  check (pluggy_app in ('la_music','mercado_pago'));

comment on column public.financeiro_contas_bancarias.pluggy_app is
  'Qual aplicação Pluggy (conjunto de credenciais no Vault) lê este item. Default la_music (Santander).';
comment on column public.financeiro_cartoes.pluggy_app is
  'Qual aplicação Pluggy (conjunto de credenciais no Vault) lê este item. Default la_music (Santander).';
