-- Materializador mensal v2 (spec §5.3). Duas correcoes sobre a v1:
--   1) o bloco `exception` por pai e uma subtransacao: as linhas voltam, mas variaveis plpgsql NAO.
--      Sem restaurar os contadores, agenda_materializacoes mentiria justamente quando algo falhou.
--      Agora cada pai tira um retrato de (v_pais, v_filhas, v_pulados) e o handler restaura.
--   2) p_origem passa a ser validado na entrada (errcode 22023, mensagem em portugues). Antes, um valor
--      fora do CHECK de agenda_materializacoes so estourava no insert final — FORA de todo exception —
--      e derrubava a transacao do chamador, descartando as tarefas ja criadas na rodada.
-- Resto identico: idempotente por ON CONFLICT (rotina_id, competencia) DO NOTHING; vigencia por linha
-- contra a data NOMINAL; vencimento do pai = max(nominal pai, nominais das filhas elegiveis); ajuste de
-- FDS depois do max; pai fechado nao ganha filha.

create or replace function public.agenda_rotinas_materializar(p_competencia date, p_origem text default 'rpc')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini timestamptz := clock_timestamp();
  v_comp date;
  v_pai public.agenda_rotinas%rowtype;
  v_filha public.agenda_rotinas%rowtype;
  v_nominal_pai date; v_nominal_f date; v_nominal_max date; v_data date; v_venc timestamptz;
  v_pai_id uuid; v_pai_status text;
  v_pais int := 0; v_filhas int := 0; v_pulados int := 0; v_ins int := 0;
  v_pais_ret int; v_filhas_ret int; v_pulados_ret int;      -- retrato dos contadores antes de cada pai
  v_erros jsonb := '[]'::jsonb;
begin
  if p_competencia is null then
    raise exception 'competencia obrigatoria.' using errcode = '22023';
  end if;
  if coalesce(p_origem, 'rpc') not in ('cron','rpc','sync','manual') then
    raise exception 'origem invalida: %.', p_origem using errcode = '22023';
  end if;
  v_comp := date_trunc('month', p_competencia)::date;

  for v_pai in
    select * from public.agenda_rotinas
     where parent_rotina_id is null and status = 'ativa'
     order by ordem, titulo
  loop
    begin
      -- retrato: o handler abaixo desfaz as LINHAS deste pai, mas nao as variaveis; restauramos na mao.
      v_pais_ret := v_pais; v_filhas_ret := v_filhas; v_pulados_ret := v_pulados;

      v_nominal_pai := public.agenda_resolve_dia(v_comp, v_pai.dia_mes, v_pai.ultimo_dia);
      if v_nominal_pai < v_pai.vigencia_inicio then          -- vigencia contra a NOMINAL
        v_pulados := v_pulados + 1;
        continue;
      end if;

      -- vencimento do pai = max(nominal pai, nominais das filhas elegiveis) — dia_mes do pai e piso
      v_nominal_max := v_nominal_pai;
      for v_filha in select * from public.agenda_rotinas where parent_rotina_id = v_pai.id and status = 'ativa' loop
        v_nominal_f := public.agenda_resolve_dia(v_comp, v_filha.dia_mes, v_filha.ultimo_dia);
        if v_nominal_f >= v_filha.vigencia_inicio and v_nominal_f > v_nominal_max then
          v_nominal_max := v_nominal_f;
        end if;
      end loop;

      v_data := public.agenda_ajustar_data(v_nominal_max, v_pai.se_cair_fim_de_semana);   -- pode sair do mes
      v_venc := (v_data::timestamp + v_pai.hora) at time zone 'America/Sao_Paulo';

      insert into public.tarefas
        (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
         rotina_id, competencia, responsavel_id, lembrete_minutos, ordem)
      values
        (v_pai.titulo, v_pai.descricao, v_pai.lista_id, v_pai.categoria, v_pai.prioridade, array['rotina'],
         v_venc, v_pai.dia_inteiro, 'pendente', v_pai.id, v_comp, v_pai.responsavel_id, array[30], v_pai.ordem)
      on conflict (rotina_id, competencia) do nothing;
      get diagnostics v_ins = row_count;
      v_pais := v_pais + v_ins;

      select id, status into v_pai_id, v_pai_status
        from public.tarefas where rotina_id = v_pai.id and competencia = v_comp;

      if v_pai_status in ('concluida','cancelada') then         -- pai fechado nao ganha filha nova
        select count(*) into v_ins
          from public.agenda_rotinas f
         where f.parent_rotina_id = v_pai.id and f.status = 'ativa'
           and not exists (select 1 from public.tarefas t where t.rotina_id = f.id and t.competencia = v_comp);
        v_pulados := v_pulados + v_ins;
        continue;
      end if;

      for v_filha in
        select * from public.agenda_rotinas
         where parent_rotina_id = v_pai.id and status = 'ativa'
         order by ordem, titulo
      loop
        v_nominal_f := public.agenda_resolve_dia(v_comp, v_filha.dia_mes, v_filha.ultimo_dia);
        if v_nominal_f < v_filha.vigencia_inicio then          -- vigencia por linha
          v_pulados := v_pulados + 1;
          continue;
        end if;
        v_data := public.agenda_ajustar_data(v_nominal_f, v_filha.se_cair_fim_de_semana);
        v_venc := (v_data::timestamp + v_filha.hora) at time zone 'America/Sao_Paulo';
        insert into public.tarefas
          (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
           rotina_id, competencia, parent_id, responsavel_id, lembrete_minutos, ordem)
        values
          (v_filha.titulo, v_filha.descricao, v_filha.lista_id, v_filha.categoria, v_filha.prioridade, array['rotina'],
           v_venc, v_filha.dia_inteiro, 'pendente', v_filha.id, v_comp, v_pai_id, v_filha.responsavel_id, array[30], v_filha.ordem)
        on conflict (rotina_id, competencia) do nothing;
        get diagnostics v_ins = row_count;
        v_filhas := v_filhas + v_ins;
      end loop;
    exception when others then
      -- as linhas deste pai ja voltaram com a subtransacao; os contadores voltam aqui.
      v_pais := v_pais_ret; v_filhas := v_filhas_ret; v_pulados := v_pulados_ret;
      v_erros := v_erros || jsonb_build_object('rotina_id', v_pai.id, 'titulo', v_pai.titulo, 'erro', sqlerrm, 'sqlstate', sqlstate);
      raise warning 'agenda_rotinas_materializar: % (%) — %', v_pai.titulo, v_pai.id, sqlerrm;
    end;
  end loop;

  insert into public.agenda_materializacoes (origem, competencia, duracao_ms, pais_criados, filhas_criadas, pulados, erros)
  values (coalesce(p_origem, 'rpc'), v_comp, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int, v_pais, v_filhas, v_pulados, v_erros);

  return jsonb_build_object('competencia', v_comp, 'pais_criados', v_pais, 'filhas_criadas', v_filhas, 'pulados', v_pulados, 'erros', v_erros);
end $$;

revoke all on function public.agenda_rotinas_materializar(date, text) from public, anon, authenticated;
grant execute on function public.agenda_rotinas_materializar(date, text) to service_role;
