-- Rodar via MCP execute_sql. Roda o sync real sob rollback (como o 04) e confere a linha
-- que a v5 grava em agenda_materializacoes: 1 por rodada, contagens iguais ao retorno,
-- competencia nula e detalhes com a janela. Nada e persistido.
begin;
do $t$
declare v_antes int; v_r jsonb; v_row public.agenda_materializacoes%rowtype;
begin
  select count(*) into v_antes from public.agenda_materializacoes where origem = 'sync';
  v_r := public.agenda_sync_contas_pagar();
  select * into v_row from public.agenda_materializacoes where origem = 'sync' order by executado_em desc limit 1;
  assert (select count(*) from public.agenda_materializacoes where origem = 'sync') = v_antes + 1, 'sync deveria gravar 1 linha';
  assert v_row.criados = (v_r->>'inseridas')::int and v_row.atualizados = (v_r->>'atualizadas')::int and v_row.removidos = (v_r->>'orfas_removidas')::int, 'contagens divergem do retorno';
  assert v_row.detalhes ? 'janela', 'detalhes.janela ausente';
  assert v_row.competencia is null, 'sync nao tem competencia';
end $t$;
rollback;
select 'PASS: 09_sync_materializacoes' as resultado;
