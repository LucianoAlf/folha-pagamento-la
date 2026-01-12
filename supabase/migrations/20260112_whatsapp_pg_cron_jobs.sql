-- WhatsApp (UAZAPI): agendamento via pg_cron + pg_net
-- Segurança: o header `x-cron-secret` é lido do Vault via `public.get_vault_secret()`,
-- evitando embutir segredo no job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $do$
declare
  jid integer;
begin
  -- Lembretes (5 min)
  select jobid into jid from cron.job where jobname = 'agenda-whatsapp-lembretes-5min' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;

  perform cron.schedule(
    'agenda-whatsapp-lembretes-5min',
    '*/5 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/whatsapp-agenda-lembretes',
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

  -- Resumo (5 min)
  select jobid into jid from cron.job where jobname = 'agenda-whatsapp-resumo-5min' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;

  perform cron.schedule(
    'agenda-whatsapp-resumo-5min',
    '*/5 * * * *',
    $cmd2$
    select net.http_post(
      url := 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/whatsapp-agenda-resumo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZHZ0amJpdG96aGt1dnZxa3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDAzOTksImV4cCI6MjA4MzU3NjM5OX0.Dy8I_055izn9952BIwNzN_JhZRfcCsJYrFTlDrF5DVs',
        'x-cron-secret', public.get_vault_secret('WHATSAPP_CRON_SECRET')
      ),
      body := '{}'::jsonb
    );
    $cmd2$
  );
end $do$;

