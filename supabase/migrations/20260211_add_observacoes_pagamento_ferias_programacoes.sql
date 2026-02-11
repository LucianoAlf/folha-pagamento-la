-- Store payment notes separately from scheduling notes
alter table public.ferias_programacoes
add column if not exists observacoes_pagamento text;

