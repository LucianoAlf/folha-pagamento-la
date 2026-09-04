-- WhatsApp (UAZAPI): Contas a Pagar — alertas 3d/1d/no dia + resumo semanal
-- Segurança: o header `x-cron-secret` é lido do Vault via `public.get_vault_secret()`.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $do$
declare
  jid integer;
begin
  select jobid into jid from cron.job where jobname = 'contas-whatsapp-notificacoes-5min' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;

  perform cron.schedule(
    'contas-whatsapp-notificacoes-5min',
    '*/5 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/whatsapp-contas-notificacoes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- publishable/anon key (necessário para acessar o gateway das Functions)
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZHZ0amJpdG96aGt1dnZxa3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDAzOTksImV4cCI6MjA4MzU3NjM5OX0.Dy8I_055izn9952BIwNzN_JhZRfcCsJYrFTlDrF5DVs',
        'x-cron-secret', public.get_vault_secret('WHATSAPP_CRON_SECRET')
      ),
      body := '{}'::jsonb
    );
    $cmd$
  );
end $do$;

