-- Fase B1 — pós-review final: leitura direta dos papéis Maria em agenda_rotinas (grant já existia, faltava a policy),
-- CHECK de categoria alinhado a tarefas_categoria_check, e search_path em agenda_resolve_dia (uniformidade).
drop policy if exists agenda_rotinas_select_maria on public.agenda_rotinas;
create policy agenda_rotinas_select_maria on public.agenda_rotinas
  for select to maria_leitura, maria_operacional using (true);

alter table public.agenda_rotinas drop constraint if exists agenda_rotinas_categoria_check;
alter table public.agenda_rotinas add constraint agenda_rotinas_categoria_check
  check (categoria in ('financeiro','rh','administrativo','pessoal','geral'));

alter function public.agenda_resolve_dia(date, integer, boolean) set search_path = public;
