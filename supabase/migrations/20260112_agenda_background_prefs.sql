-- Agenda: preferências de fundo por usuário (presets + url)
-- Mantemos em notificacao_config para centralizar configurações da Ana.

alter table public.notificacao_config
  add column if not exists agenda_bg_preset text null,
  add column if not exists agenda_bg_url text null;

