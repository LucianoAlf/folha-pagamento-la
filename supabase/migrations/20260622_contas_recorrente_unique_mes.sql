-- Impede instâncias duplicadas de contas recorrentes no mesmo mês (race no fetchContasPagar).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_pagar_recorrente_mes_unico
  ON public.contas_pagar (recorrente_modelo_id, competencia)
  WHERE recorrente_modelo_id IS NOT NULL;
