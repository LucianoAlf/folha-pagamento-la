-- Débito automático em contas a pagar (fase 1).
-- Conceito ortogonal a fonte_tipo (de onde vem a fatura) e a metodo_pagamento (como FOI paga, na baixa):
-- a flag diz que a conta se paga sozinha na conta pagadora. Efeitos: sem coleta de código do mês,
-- lista do dia marca "não pagar manualmente", baixa sugere método "Débito Automático".
-- Instâncias recorrentes herdam a coluna do modelo (o materializador copia o modelo por spread).

alter table public.contas_pagar
  add column if not exists debito_automatico boolean not null default false;

comment on column public.contas_pagar.debito_automatico is
  'Conta paga por débito automático na conta pagadora. Sem coleta de código do mês; lista do dia marca "não pagar manualmente"; baixa sugere método Débito Automático.';

-- Backfill 1: linhas com o contorno da Rose (texto "débito automático" na chave PIX fixa)
-- ou já pagas com método Débito Automático (qualquer casing).
update public.contas_pagar
   set debito_automatico = true
 where debito_automatico = false
   and (coalesce(pix_chave_fixa, '') ~* 'd[eé]bito autom'
        or coalesce(metodo_pagamento, '') ~* '^d[eé]bito autom[aá]tico$');

-- Backfill 2: modelos recorrentes cujas instâncias foram flagadas (os próximos meses herdam).
update public.contas_pagar m
   set debito_automatico = true
 where m.debito_automatico = false
   and exists (select 1 from public.contas_pagar i where i.recorrente_modelo_id = m.id and i.debito_automatico);

-- Limpeza do contorno: o texto nunca foi chave PIX; a fonte "pix_fixo" só existia por causa dele.
update public.contas_pagar
   set pix_chave_fixa = null,
       fonte_tipo = case when fonte_tipo = 'pix_fixo' then null else fonte_tipo end
 where coalesce(pix_chave_fixa, '') ~* 'd[eé]bito autom';

-- Normalização de casing dos métodos já gravados (o front sempre gravou os rótulos canônicos).
update public.contas_pagar set metodo_pagamento = 'PIX' where metodo_pagamento in ('Pix', 'pix');
update public.contas_pagar set metodo_pagamento = 'Boleto' where metodo_pagamento in ('boleto', 'BOLETO');
update public.contas_pagar set metodo_pagamento = 'Débito Automático'
 where metodo_pagamento ~* '^d[eé]bito autom[aá]tico$' and metodo_pagamento <> 'Débito Automático';

create index if not exists contas_pagar_debito_automatico_idx
  on public.contas_pagar (debito_automatico) where debito_automatico;
