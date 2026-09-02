-- atrasadas: piso de 30 dias; atrasadas_total conta sem piso (R19)
-- Sem o piso, a lista de atrasadas arrastava tudo o que ficou pra tras desde o inicio dos tempos
-- (medido: 34 linhas / 3.181 chars pra Ana em 02/09). O corpo e identico ao aplicado em
-- 20260901214314_agenda_destinatarios_lembretes.sql, com o piso no v_atr e o contador total novo.

create or replace function public.agenda_resumo_usuario(p_user_id uuid, p_data date, p_dias integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini timestamptz := (p_data::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := ((p_data + greatest(coalesce(p_dias, 1), 1))::timestamp) at time zone 'America/Sao_Paulo';
  v_itens jsonb; v_atr jsonb; v_pagar jsonb; v_pagar_atr jsonb; v_nome text;
  v_atr_total integer;
begin
  select nome into v_nome from public.user_profiles where id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'titulo', t.titulo, 'prioridade', t.prioridade,
           'vencimento_em', t.vencimento_em, 'dia_inteiro', t.dia_inteiro, 'parent_id', t.parent_id
         ) order by t.vencimento_em, t.titulo), '[]'::jsonb)
    into v_itens
    from public.tarefas t
   where t.status in ('pendente', 'em_andamento')
     and t.vencimento_em >= v_ini and t.vencimento_em < v_fim
     and coalesce(t.vinculo_tipo, '') <> 'conta_pagar'
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'titulo', t.titulo, 'prioridade', t.prioridade, 'vencimento_em', t.vencimento_em
         ) order by t.vencimento_em), '[]'::jsonb)
    into v_atr
    from public.tarefas t
   where t.status in ('pendente', 'em_andamento')
     and t.vencimento_em < v_ini
     and t.vencimento_em >= v_ini - interval '30 days'
     and coalesce(t.vinculo_tipo, '') <> 'conta_pagar'
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select count(*)
    into v_atr_total
    from public.tarefas t
   where t.status in ('pendente', 'em_andamento')
     and t.vencimento_em < v_ini
     and coalesce(t.vinculo_tipo, '') <> 'conta_pagar'
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.valor), 0))
    into v_pagar
    from public.tarefas t join public.contas_pagar c on c.id = t.vinculo_id
   where t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em >= v_ini and t.vencimento_em < v_fim
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.valor), 0))
    into v_pagar_atr
    from public.tarefas t join public.contas_pagar c on c.id = t.vinculo_id
   where t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em < v_ini
     and exists (select 1 from public.agenda_destinatarios(t.id) d where d.user_id = p_user_id);

  return jsonb_build_object(
    'nome', v_nome, 'itens', v_itens, 'atrasadas', v_atr, 'atrasadas_total', v_atr_total,
    'pagar', v_pagar, 'pagar_atrasadas', v_pagar_atr
  );
end $$;

revoke all on function public.agenda_resumo_usuario(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.agenda_resumo_usuario(uuid, date, integer) to service_role;
