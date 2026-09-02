-- Rodar via MCP execute_sql. Esperado: 'PASS: 06_calendario'.
begin;
do $t$
begin
  -- resolve_dia
  assert public.agenda_resolve_dia(date '2026-02-01', 31, false) = date '2026-02-28', 'clamp fev 31 -> 28';
  assert public.agenda_resolve_dia(date '2028-02-01', 31, false) = date '2028-02-29', 'clamp fev bissexto';
  assert public.agenda_resolve_dia(date '2026-09-15', 12, false) = date '2026-09-12', 'competencia nao-normalizada';
  assert public.agenda_resolve_dia(date '2026-09-01', null, true) = date '2026-09-30', 'ultimo dia set';
  assert public.agenda_resolve_dia(date '2026-04-01', 30, true) = date '2026-04-30', 'ultimo_dia prevalece';
  assert public.agenda_resolve_dia(date '2026-09-01', 1, false) = date '2026-09-01', 'dia 1';
  -- ajustar_data: 2026-09-05 sab, 09-06 dom, 09-07 seg, 09-04 sex
  assert public.agenda_ajustar_data(date '2026-09-05', 'proximo_dia_util') = date '2026-09-07', 'sab -> seg';
  assert public.agenda_ajustar_data(date '2026-09-06', 'proximo_dia_util') = date '2026-09-07', 'dom -> seg';
  assert public.agenda_ajustar_data(date '2026-09-05', 'dia_util_anterior') = date '2026-09-04', 'sab -> sex';
  assert public.agenda_ajustar_data(date '2026-09-06', 'dia_util_anterior') = date '2026-09-04', 'dom -> sex';
  assert public.agenda_ajustar_data(date '2026-09-05', 'manter') = date '2026-09-05', 'manter';
  assert public.agenda_ajustar_data(date '2026-09-07', 'proximo_dia_util') = date '2026-09-07', 'dia util fica';
  assert public.agenda_ajustar_data(null, 'manter') is null, 'null passa';
  -- sai do mes: sab 2026-10-31 + proximo_dia_util = seg 2026-11-02 (competencia fica em outubro no materializador)
  assert public.agenda_ajustar_data(date '2026-10-31', 'proximo_dia_util') = date '2026-11-02', 'ajuste pode sair do mes';
end $t$;
rollback;
select 'PASS: 06_calendario' as resultado;
