-- v5 = v4 + registro em agenda_materializacoes (M-13). Sem bloco de cron.
-- Cada rodada grava 1 linha: origem = 'sync', competencia null (o sync nao tem competencia),
-- duracao_ms e os tres contadores (criados/atualizados/removidos, os mesmos do retorno).
-- detalhes fica so em {hoje, janela}: a tabela e legivel por qualquer autenticado (e pela Maria),
-- entao nada de descricao de conta, valor ou id de pessoa ali dentro.
-- Corpo identico a v4 (20260902004547), com a variavel da janela renomeada de v_ini para
-- v_ini_janela — v_ini agora e o clock_timestamp() do inicio da rodada.
-- O job agenda-sync-contas-10min (cron.job 18) ja existe e nao e tocado aqui.

create or replace function public.agenda_sync_contas_pagar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini  timestamptz := clock_timestamp();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini_janela date := v_hoje - 90;
  v_fim  date := v_hoje + 45;
  v_lista uuid;
  v_ins int := 0; v_upd int := 0; v_del int := 0;
begin
  -- Lista Financeiro por nome (nao-smart), criada se faltar — mesmo criterio de ensureListByName.
  select id into v_lista from public.tarefas_listas
   where lower(nome) = 'financeiro' and coalesce(is_smart, false) = false order by ordem limit 1;
  if v_lista is null then
    insert into public.tarefas_listas (nome, cor, icone, ordem, is_smart, is_default)
    values ('Financeiro', '#8b5cf6', '💰', (select coalesce(max(ordem), 0) + 10 from public.tarefas_listas), false, false)
    returning id into v_lista;
  end if;

  with contas as (
    select c.id, c.descricao, c.unidade, c.valor, c.data_vencimento, c.status,
           c.data_pagamento, c.metodo_pagamento,
           pc.codigo as pc_codigo, pc.nome as pc_nome, cc.nome as cc_nome,
           (c.data_vencimento - v_hoje) as dd
      from public.contas_pagar c
      left join public.plano_contas pc on pc.id = c.plano_conta_id
      left join public.centros_custo cc on cc.id = c.centro_custo_id
     where coalesce(c.status,'') not in ('cancelado','finalizado')
       and c.data_vencimento between v_ini_janela and v_fim
  ), src as (
    select id as vinculo_id,
           'Pagar: ' || descricao as titulo,
           concat_ws(E'\n',
             case when pc_codigo is not null and pc_nome is not null then 'Plano: ' || pc_codigo || ' ' || pc_nome end,
             'Valor: ' || public.agenda_brl(valor),
             case when cc_nome is not null then 'Centro de custo: ' || cc_nome
                  when unidade is not null then 'Centro de custo: ' || upper(unidade) end,
             case when metodo_pagamento is not null then 'Metodo: ' || metodo_pagamento end,
             'Origem: Contas a Pagar (tarefa automatica)'
           ) as descricao,
           case when status = 'pago' then 'baixa'
                when dd < 0 then 'urgente'
                when dd = 0 then 'alta'
                when dd <= 3 then 'media'
                else 'baixa' end as prioridade,
           case when status = 'pago' then 'concluida' else 'pendente' end as st,
           case when status = 'pago' then
             (coalesce((data_pagamento at time zone 'UTC')::date,
                       (now() at time zone 'America/Sao_Paulo')::date)::timestamp + time '12:00') at time zone 'America/Sao_Paulo'
           end as data_conclusao,
           ((data_vencimento::timestamp + time '09:00') at time zone 'America/Sao_Paulo') as vencimento_em,
           unidade
      from contas
  ), upserted as (
    insert into public.tarefas
      (titulo, descricao, lista_id, categoria, prioridade, tags, unidade, vencimento_em, dia_inteiro,
       status, data_conclusao, vinculo_tipo, vinculo_id, lembrete_minutos, ordem)
    select titulo, descricao, v_lista, 'financeiro', prioridade, array['contas-a-pagar','auto'], unidade,
           vencimento_em, true, st, data_conclusao, 'conta_pagar', vinculo_id, array[30], 10
      from src
    on conflict (vinculo_tipo, vinculo_id) do update set
      titulo = excluded.titulo,
      descricao = excluded.descricao,
      lista_id = excluded.lista_id,
      prioridade = excluded.prioridade,
      tags = excluded.tags,
      unidade = excluded.unidade,
      vencimento_em = excluded.vencimento_em,
      status = excluded.status,
      data_conclusao = excluded.data_conclusao,
      updated_at = now()
    where (tarefas.titulo, tarefas.descricao, tarefas.lista_id, tarefas.prioridade, tarefas.tags,
           tarefas.unidade, tarefas.vencimento_em, tarefas.status, tarefas.data_conclusao)
      is distinct from
          (excluded.titulo, excluded.descricao, excluded.lista_id, excluded.prioridade, excluded.tags,
           excluded.unidade, excluded.vencimento_em, excluded.status, excluded.data_conclusao)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ins, v_upd
    from upserted;

  -- Orfa = conta inexistente, cancelada ou finalizada. Sair da janela NAO e orfa (historico fica).
  -- Orfa com filha ativa fica de fora: tarefas_guard_delete levantaria P0001 e derrubaria o sync
  -- inteiro. Ela e colhida num ciclo seguinte, assim que as filhas fecharem.
  -- Mesma ideia pro recorrencia_pai_id: a FK e NO ACTION, entao o delete levantaria 23503.
  delete from public.tarefas t
   where t.vinculo_tipo = 'conta_pagar' and t.vinculo_id is not null
     and not exists (
       select 1 from public.contas_pagar c
        where c.id = t.vinculo_id and coalesce(c.status,'') not in ('cancelado','finalizado')
     )
     and not exists (select 1 from public.tarefas f where f.parent_id = t.id and f.status in ('pendente','em_andamento','adiada'))
     and not exists (select 1 from public.tarefas r where r.recorrencia_pai_id = t.id);
  get diagnostics v_del = row_count;

  insert into public.agenda_materializacoes (origem, competencia, duracao_ms, criados, atualizados, removidos, detalhes)
  values ('sync', null, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int, v_ins, v_upd, v_del,
          jsonb_build_object('hoje', v_hoje, 'janela', jsonb_build_array(v_ini_janela, v_fim)));

  return jsonb_build_object(
    'inseridas', v_ins, 'atualizadas', v_upd, 'orfas_removidas', v_del,
    'hoje', v_hoje, 'janela', jsonb_build_array(v_ini_janela, v_fim)
  );
end $$;

revoke all on function public.agenda_sync_contas_pagar() from public, anon, authenticated;
grant execute on function public.agenda_sync_contas_pagar() to service_role;
