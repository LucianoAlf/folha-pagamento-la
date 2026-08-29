-- O índice único parcial (WHERE recorrente_modelo_id IS NOT NULL) não é inferível pelo
-- ON CONFLICT (recorrente_modelo_id, data_vencimento) do upsert (erro 42P10). Recria como
-- índice único NÃO-parcial: seguro porque NULLs são distintos no unique — modelos com
-- recorrente_modelo_id NULL não colidem entre si; apenas instâncias (modelo_id não nulo)
-- ganham unicidade por data.
drop index if exists public.contas_pagar_modelo_venc_uniq;
create unique index if not exists contas_pagar_modelo_venc_uniq
  on public.contas_pagar (recorrente_modelo_id, data_vencimento);
