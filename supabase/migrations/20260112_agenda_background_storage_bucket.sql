-- Agenda: bucket público para fundos personalizados
-- A geração (Fase 2) sobe imagens aqui via Edge Function (service role).

insert into storage.buckets (id, name, public)
values ('agenda-backgrounds', 'agenda-backgrounds', true)
on conflict (id) do nothing;

