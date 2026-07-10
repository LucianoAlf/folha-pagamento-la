-- Fase 5 / Fatia A: cobre a FK por conta pagadora sem remover o indice do preflight.

create index if not exists lancamentos_folha_conta_pagadora_id_idx
  on public.lancamentos_folha (conta_pagadora_id);
