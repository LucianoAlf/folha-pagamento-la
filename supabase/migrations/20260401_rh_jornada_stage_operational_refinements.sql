alter table if exists public.rh_template_etapas
  add column if not exists instrucoes text null,
  add column if not exists modelo_mensagem text null,
  add column if not exists link_referencia text null,
  add column if not exists link_reuniao text null,
  add column if not exists notificar_responsaveis boolean not null default true,
  add column if not exists notificar_colaborador boolean not null default false;

alter table if exists public.rh_processo_etapas
  add column if not exists agendado_em timestamptz null,
  add column if not exists instrucoes text null,
  add column if not exists modelo_mensagem text null,
  add column if not exists link_referencia text null,
  add column if not exists link_reuniao text null,
  add column if not exists notificar_responsaveis boolean not null default true,
  add column if not exists notificar_colaborador boolean not null default false,
  add column if not exists ultimo_aviso_whatsapp_em timestamptz null;

alter table if exists public.rh_template_checklist_itens
  add column if not exists descricao text null,
  add column if not exists link_url text null;

alter table if exists public.rh_checklist_itens
  add column if not exists link_url text null;
