-- maria_agenda_saude v2 (02/09/2026): (1) o digest v2 registra envios com tipo 'manha' (nao mais 'digest') — sem isto a saude
-- daria "digest nao enviado" toda manha a partir de 03/09 (falso alarme no laudo/sonda); (2) debito automatico: conta flagada
-- nao tem espelho "Pagar:" (sync v6 apaga em <=10 min) — espelho vivo e defeito, e o laudo passa a ver o resumo.
do $mig$
declare def text; n int;
  a1 text := $a$where tipo = 'digest'$a$;
  b1 text := $b$where tipo in ('digest','manha')$b$;
  a2 text := $a$v_faltantes int; v_alertas text[] := '{}';$a$;
  b2 text := $b$v_faltantes int; v_alertas text[] := '{}'; v_deb jsonb; v_esp_deb int;$b$;
  a3 text := $a$  if v_erros24 > 0 then$a$;
  b3 text := $b$  -- debito automatico (fase 2, 02/09/2026): conta flagada nao tem espelho "Pagar:" (sync v6 apaga em <=10 min); espelho vivo = defeito.
  select count(*) into v_esp_deb
    from public.tarefas t join public.contas_pagar c on c.id = t.vinculo_id
   where t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente','em_andamento','adiada') and c.debito_automatico
     and c.updated_at < now() - interval '30 minutes';
  select jsonb_build_object('pendentes', count(*), 'total', coalesce(sum(valor), 0),
                            'sem_baixa_vencidas', count(*) filter (where data_vencimento < v_hoje),
                            'sem_baixa_total', coalesce(sum(valor) filter (where data_vencimento < v_hoje), 0),
                            'espelhos_vivos', v_esp_deb)
    into v_deb from public.contas_pagar where debito_automatico and status = 'pendente';
  if v_esp_deb > 0 then v_alertas := v_alertas || format('%s conta(s) em debito automatico ainda com espelho "Pagar:" na agenda (sync v6 deveria ter apagado)', v_esp_deb); end if;
  if v_erros24 > 0 then$b$;
  a4 text := $a$'atrasadas_por_lista', v_atr,$a$;
  b4 text := $b$'atrasadas_por_lista', v_atr, 'debito_automatico', v_deb,$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'maria_agenda_saude';
  if def like '%v_esp_deb%' then raise notice 'saude: ja aplicado'; return; end if;
  n := (length(def) - length(replace(def, a1, ''))) / length(a1); if n <> 2 then raise exception 'saude: ancora tipo digest com % ocorrencias (esperava 2)', n; end if;
  n := (length(def) - length(replace(def, a2, ''))) / length(a2); if n <> 1 then raise exception 'saude: ancora declare com % ocorrencias', n; end if;
  n := (length(def) - length(replace(def, a3, ''))) / length(a3); if n <> 1 then raise exception 'saude: ancora alertas com % ocorrencias', n; end if;
  n := (length(def) - length(replace(def, a4, ''))) / length(a4); if n <> 1 then raise exception 'saude: ancora saida com % ocorrencias', n; end if;
  execute replace(replace(replace(replace(def, a1, b1), a2, b2), a3, b3), a4, b4);
  if (select count(*) from pg_proc where proname = 'maria_agenda_saude') <> 1 then raise exception 'saude: overload indevido'; end if;
  raise notice 'saude v2: tipos do digest + debito automatico';
end $mig$;
