-- Sincroniza saldo Open Finance (Pluggy) diariamente às 07:45 BRT (10:45 UTC), 15min antes
-- do disparo automático das 08:00 BRT de "contas_a_pagar_dia" (whatsapp_grupo_notificacoes),
-- garantindo que o rodapé SALDO EM CONTAS já esteja preenchido quando a mensagem for gerada.
select cron.schedule(
  'openfinance-sync-saldos-diario',
  '45 10 * * *',
  $$
  select net.http_post(
    url := 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/openfinance-sync-saldos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZHZ0amJpdG96aGt1dnZxa3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDAzOTksImV4cCI6MjA4MzU3NjM5OX0.Dy8I_055izn9952BIwNzN_JhZRfcCsJYrFTlDrF5DVs',
      'x-cron-secret', public.get_vault_secret('WHATSAPP_CRON_SECRET')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
