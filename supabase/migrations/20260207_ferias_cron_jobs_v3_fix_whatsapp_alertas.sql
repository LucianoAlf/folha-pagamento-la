-- Fix: ferias-whatsapp-alertas cron job should not depend on unset app.* settings.
-- It only needs to call the Edge Function endpoint with x-cron-secret.

DO $$
DECLARE
  jid INT;
BEGIN
  SELECT jobid INTO jid
  FROM cron.job
  WHERE jobname = 'ferias-whatsapp-alertas'
  LIMIT 1;

  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'ferias-whatsapp-alertas',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/whatsapp-ferias-alertas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZHZ0amJpdG96aGt1dnZxa3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDAzOTksImV4cCI6MjA4MzU3NjM5OX0.Dy8I_055izn9952BIwNzN_JhZRfcCsJYrFTlDrF5DVs',
        'x-cron-secret', public.get_vault_secret('WHATSAPP_CRON_SECRET')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

