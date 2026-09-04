-- Add payment modality to vacation scheduling/payment
-- "completo": ferias + 1/3 (e abono, se houver)
-- "somente_terco": apenas adicional de 1/3 (e abono, se houver)

alter table public.ferias_programacoes
add column if not exists pagamento_modalidade text not null default 'completo';

alter table public.ferias_programacoes
drop constraint if exists ferias_programacoes_pagamento_modalidade_check;

alter table public.ferias_programacoes
add constraint ferias_programacoes_pagamento_modalidade_check
check (pagamento_modalidade in ('completo', 'somente_terco'));

