-- Fase 2: seed dos seis cartoes operacionais mapeados.

with seed (
  final,
  apelido,
  empresa_id,
  conta_pagadora_id,
  titularidade_tipo,
  titular,
  bandeira,
  dia_vencimento,
  dia_fechamento,
  limite,
  observacoes
) as (
  values
    ('1074', 'Kids CG 1074', 'd2a4e487-9cd2-425c-b77b-cc396a8873f2'::uuid, '32bf1231-b6cc-476d-87d1-5a4acbfc2cec'::uuid, 'pj', null, 'Master', 25, 12, 4700, 'ex-4520'),
    ('8434', 'Kids CG 8434', 'd2a4e487-9cd2-425c-b77b-cc396a8873f2'::uuid, '32bf1231-b6cc-476d-87d1-5a4acbfc2cec'::uuid, 'pj', null, 'Master', 25, 12, 5900, null),
    ('2270', 'EMLA CG 2270', 'b077b3f7-f553-42f4-87e8-e90e932e994b'::uuid, '17ff042d-ce80-4977-97d8-1a96e1792894'::uuid, 'pj', null, 'Master', 10, 27, 17700, null),
    ('8641', 'Recreio 8641', '0c593015-b65d-4863-aab1-3c9db205f3b9'::uuid, '63ecfa2e-25ec-45cd-9d7b-cb4250237c2a'::uuid, 'pj', null, 'Master', 15, 1, 12250, null),
    ('8516', 'Barra 8516', '03b21560-69db-4488-a413-a9e6e56fc71e'::uuid, '2670b337-3711-4ce7-9ce0-c25b4ae855c8'::uuid, 'pj', null, 'Master', 10, 27, 1500, null),
    ('4425', 'Mercado Pago 4425', '03b21560-69db-4488-a413-a9e6e56fc71e'::uuid, '2670b337-3711-4ce7-9ce0-c25b4ae855c8'::uuid, 'pf', 'Luciano Teixeira', 'Visa', 23, 18, 27700, 'Cartao PF operacional pago pela Barra')
)
insert into public.financeiro_cartoes (
  final,
  apelido,
  empresa_id,
  conta_pagadora_id,
  centro_custo_id,
  titularidade_tipo,
  titular,
  bandeira,
  dia_vencimento,
  dia_fechamento,
  limite,
  observacoes
)
select
  s.final,
  s.apelido,
  s.empresa_id,
  s.conta_pagadora_id,
  e.unidade_id,
  s.titularidade_tipo,
  s.titular,
  s.bandeira,
  s.dia_vencimento,
  s.dia_fechamento,
  s.limite,
  s.observacoes
from seed s
join public.financeiro_empresas e on e.id = s.empresa_id
on conflict (apelido) do update
set empresa_id = excluded.empresa_id,
    conta_pagadora_id = excluded.conta_pagadora_id,
    centro_custo_id = excluded.centro_custo_id,
    titularidade_tipo = excluded.titularidade_tipo,
    titular = excluded.titular,
    final = excluded.final,
    bandeira = excluded.bandeira,
    dia_vencimento = excluded.dia_vencimento,
    dia_fechamento = excluded.dia_fechamento,
    limite = excluded.limite,
    observacoes = excluded.observacoes,
    ativo = true,
    updated_at = now();
