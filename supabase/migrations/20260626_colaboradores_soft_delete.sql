alter table public.colaboradores
  add column if not exists arquivado_em timestamptz null,
  add column if not exists arquivado_por uuid null references auth.users(id) on delete set null;

create index if not exists colaboradores_arquivado_em_idx
  on public.colaboradores(arquivado_em);

comment on column public.colaboradores.arquivado_em is
  'Soft delete operacional: colaborador arquivado some das listas, preservando historico de folha/ferias.';
comment on column public.colaboradores.arquivado_por is
  'Usuario auth que arquivou o colaborador, quando disponivel.';
