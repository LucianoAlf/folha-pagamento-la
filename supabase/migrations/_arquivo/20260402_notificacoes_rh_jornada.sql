-- Notificacoes centralizadas da Jornada RH
-- Mantem as preferencias pessoais da Ana para lembretes espelhados na Agenda.

alter table public.notificacao_config
  add column if not exists rh_agenda_lembrete_processos_ativo boolean not null default true,
  add column if not exists rh_agenda_lembrete_processos_minutos integer not null default 1440,
  add column if not exists rh_agenda_lembrete_etapas_ativo boolean not null default true,
  add column if not exists rh_agenda_lembrete_etapas_minutos integer not null default 1440,
  add column if not exists rh_agenda_lembrete_pdi_ativo boolean not null default true,
  add column if not exists rh_agenda_lembrete_pdi_minutos integer not null default 1440;

comment on column public.notificacao_config.rh_agenda_lembrete_processos_ativo is 'Ativa lembrete automatico para processos da Jornada RH espelhados na Agenda';
comment on column public.notificacao_config.rh_agenda_lembrete_processos_minutos is 'Antecedencia em minutos para lembretes de processos RH na Agenda';
comment on column public.notificacao_config.rh_agenda_lembrete_etapas_ativo is 'Ativa lembrete automatico para etapas da Jornada RH espelhadas na Agenda';
comment on column public.notificacao_config.rh_agenda_lembrete_etapas_minutos is 'Antecedencia em minutos para lembretes de etapas RH na Agenda';
comment on column public.notificacao_config.rh_agenda_lembrete_pdi_ativo is 'Ativa lembrete automatico para checkpoints de PDI espelhados na Agenda';
comment on column public.notificacao_config.rh_agenda_lembrete_pdi_minutos is 'Antecedencia em minutos para lembretes de checkpoints de PDI na Agenda';
