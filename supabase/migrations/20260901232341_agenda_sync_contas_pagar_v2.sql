-- Correcoes da revisao da Task 4 (achados 1, 2 e 3). Substitui o corpo de
-- agenda_sync_contas_pagar criado em 20260901230636; agenda_brl fica como esta.
--
-- 1) data_conclusao: meio-dia SP da data SP do pagamento (R10). contas_pagar.data_pagamento e
--    timestamptz na meia-noite UTC do dia pago; usa-lo cru joga 425 de 426 espelhos pagos um dia
--    para tras no fuso -03. O cliente legado (services/agendaIntegrations.ts syncContasAsAgendaTasks)
--    ja normalizava para 12:00 local justamente por isso — este port passa a fazer o mesmo.
-- 2) Orfa com filha ativa fica (R11). tarefas_guard_delete levanta P0001 ao apagar pai com filha
--    ativa; como o delete e um comando so dentro da funcao, a excecao derrubava a transacao inteira
--    (inclusive o upsert) e o cron falharia a cada 10 min em silencio. Sem bloco de excecao: o erro
--    fica explicito se aparecer por outro caminho; so este caso conhecido e excluido do delete.
-- 3) Cron preserva o estado anterior (R12): reaplicar a migration nao pode desligar o job depois
--    de ativado.

create or replace function public.agenda_sync_contas_pagar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini  date := v_hoje - 90;
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
     where c.status not in ('cancelado','finalizado')
       and c.data_vencimento between v_ini and v_fim
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
           case when status = 'pago' then ((coalesce(data_pagamento, now()) at time zone 'America/Sao_Paulo')::date::timestamp + time '12:00') at time zone 'America/Sao_Paulo' end as data_conclusao,
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
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ins, v_upd
    from upserted;

  -- Orfa = conta inexistente, cancelada ou finalizada. Sair da janela NAO e orfa (historico fica).
  -- Orfa com filha ativa fica de fora: tarefas_guard_delete levantaria P0001 e derrubaria o sync
  -- inteiro. Ela e colhida num ciclo seguinte, assim que as filhas fecharem.
  delete from public.tarefas t
   where t.vinculo_tipo = 'conta_pagar' and t.vinculo_id is not null
     and not exists (
       select 1 from public.contas_pagar c
        where c.id = t.vinculo_id and c.status not in ('cancelado','finalizado')
     )
     and not exists (select 1 from public.tarefas f where f.parent_id = t.id and f.status in ('pendente','em_andamento','adiada'));
  get diagnostics v_del = row_count;

  return jsonb_build_object(
    'inseridas', v_ins, 'atualizadas', v_upd, 'orfas_removidas', v_del,
    'hoje', v_hoje, 'janela', jsonb_build_array(v_ini, v_fim)
  );
end $$;

revoke all on function public.agenda_sync_contas_pagar() from public, anon, authenticated;
grant execute on function public.agenda_sync_contas_pagar() to service_role;

-- Cron: reagenda preservando o estado anterior. Reaplicar esta migration depois da ativacao nao
-- pode desligar o sync em silencio.
do $do$
declare
  jid bigint;
  v_ativo_antes boolean;
begin
  select jobid, active into jid, v_ativo_antes from cron.job where jobname = 'agenda-sync-contas-10min' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  jid := cron.schedule(
    'agenda-sync-contas-10min',
    '*/10 * * * *',
    $cmd$ select public.agenda_sync_contas_pagar(); $cmd$
  );
  -- Preserva o estado anterior; na primeira criacao nasce inativo (R8): o orquestrador ativa
  -- apos a primeira execucao real observada.
  perform cron.alter_job(job_id := jid, active := coalesce(v_ativo_antes, false));
end $do$;
