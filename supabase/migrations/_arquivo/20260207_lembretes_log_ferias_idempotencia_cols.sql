-- Add optional columns used by whatsapp-ferias-alertas for idempotency.
-- Safe: does not break existing reads/writes.

ALTER TABLE public.lembretes_log
  ADD COLUMN IF NOT EXISTS tipo_lembrete text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS mensagem_enviada text;

-- Helpful index for idempotency lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='lembretes_log_user_tipo_ref_enviado_idx'
  ) THEN
    CREATE INDEX lembretes_log_user_tipo_ref_enviado_idx
      ON public.lembretes_log (user_id, tipo_lembrete, referencia, enviado_em DESC);
  END IF;
END $$;

