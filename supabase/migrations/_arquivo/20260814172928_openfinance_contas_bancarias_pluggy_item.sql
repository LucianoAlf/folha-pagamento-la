-- Vínculo de cada conta bancária real com o item Open Finance (Pluggy) correspondente.
-- Fica no cadastro, não hardcoded na Edge Function de sync: se a conta for reconectada
-- (novo itemId), atualiza aqui, sem precisar de deploy.

alter table public.financeiro_contas_bancarias
  add column pluggy_item_id text,
  add column pluggy_account_id text;

comment on column public.financeiro_contas_bancarias.pluggy_item_id is
  'itemId da conexão Open Finance (Pluggy) que corresponde a esta conta. NULL = conta ainda não ligada ao Open Finance.';
comment on column public.financeiro_contas_bancarias.pluggy_account_id is
  'id da account BANK/CHECKING_ACCOUNT retornada pela Pluggy para este item, para referência/debug.';

update public.financeiro_contas_bancarias set pluggy_item_id = '16a09238-0ed8-4885-92f2-8571184d5877', pluggy_account_id = '76c117ad-b378-4a46-b260-91942ae8dce7' where conta = '13002361-9';
update public.financeiro_contas_bancarias set pluggy_item_id = '4f8419d8-a2a1-485d-b72c-c930dd4c6a8c', pluggy_account_id = '21fbb271-9618-44c4-b121-e19511881421' where conta = '13002358-5';
update public.financeiro_contas_bancarias set pluggy_item_id = '2da7650d-52e0-4908-9fcb-bac93099a9e4', pluggy_account_id = '4b6e4dad-5390-4741-aef1-fc2822f78135' where conta = '13002359-2';
update public.financeiro_contas_bancarias set pluggy_item_id = '019f04bc-4f27-4373-9f88-68827c32d3c2', pluggy_account_id = '9d001659-df67-4c9b-94e8-8d4de56d1b8a' where conta = '13002360-2';
