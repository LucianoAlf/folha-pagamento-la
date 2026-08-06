-- Histórico já aplicado em produção em 2026-08-06.
-- Não reaplicar manualmente contra o projeto remoto.
ALTER TABLE public.rh_candidatos
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS ficha_link text,
  ADD COLUMN IF NOT EXISTS ficha_link_gerado_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_rh_candidatos_unidade'
      AND conrelid = 'public.rh_candidatos'::regclass
  ) THEN
    ALTER TABLE public.rh_candidatos
      ADD CONSTRAINT chk_rh_candidatos_unidade
      CHECK (unidade IS NULL OR unidade IN ('bar', 'cg', 'rec'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_candidatos_ficha_token
  ON public.rh_candidatos (ficha_token)
  WHERE ficha_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_candidatos_la_colaborador
  ON public.rh_candidatos (la_colaborador_id)
  WHERE la_colaborador_id IS NOT NULL;
