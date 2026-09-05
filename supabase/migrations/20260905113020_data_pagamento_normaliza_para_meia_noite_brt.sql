-- 05/09/2026 — data_pagamento é timestamptz e existiam DUAS convenções no mesmo banco:
--   contas_pagar_ajustar_paga:  (data::timestamp at time zone 'America/Sao_Paulo')  -> meia-noite BRT  (certo)
--   maria_contas_dar_baixa:     data::timestamptz                                   -> meia-noite UTC  (errado)
-- Resultado: 465 de 466 baixas mostravam um dia diferente conforme o fuso em que se lê, e 8 pagamentos
-- (R$ 4.327,62) mudavam de MÊS — os do dia 1º, que em São Paulo caem no último dia do mês anterior.
-- Ninguém sofria porque todo o fluxo lê em UTC; a consistência vinha de todo mundo ler errado igual.
--
-- A regra vai no DADO, não nas funções: um trigger cobre toda origem, inclusive as que eu não achei,
-- e é idempotente. Normaliza pelo dia lido em UTC — que é o dia que o sistema sempre mostrou — e grava
-- meia-noite de Brasília, que lê igual nos dois fusos.
--   entrada 04/09 00:00+00 (errada) -> dia UTC 04/09 -> 04/09 03:00+00 : lê 04/09 em UTC e em SP
--   entrada 04/09 03:00+00 (certa)  -> dia UTC 04/09 -> 04/09 03:00+00 : nao mexe (idempotente)
-- data_vencimento e competencia ja sao `date` — nao tem esse problema.

-- 1) rede: guarda o valor antigo antes de tocar em 466 linhas
create table if not exists public.contas_pagar_backup_data_pagamento_20260905 as
select id, data_pagamento as data_pagamento_antiga, now() as capturado_em
  from public.contas_pagar
 where data_pagamento is not null;

revoke all on public.contas_pagar_backup_data_pagamento_20260905 from public, anon, authenticated;

-- 2) a regra
create or replace function public.contas_pagar_normaliza_data_pagamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_pagamento is not null then
    new.data_pagamento := ((new.data_pagamento at time zone 'UTC')::date::timestamp
                            at time zone 'America/Sao_Paulo');
  end if;
  return new;
end $$;

drop trigger if exists trg_contas_pagar_normaliza_data_pagamento on public.contas_pagar;
create trigger trg_contas_pagar_normaliza_data_pagamento
  before insert or update of data_pagamento on public.contas_pagar
  for each row execute function public.contas_pagar_normaliza_data_pagamento();

-- 3) backfill: o trigger cuida do calculo, entao basta reescrever a coluna com ela mesma
update public.contas_pagar
   set data_pagamento = data_pagamento
 where data_pagamento is not null;
