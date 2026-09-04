-- Ponto unico da cascata de destinatarios (spec §6.1) e do momento do lembrete (§6.2).
-- Ninguem reimplementa a cascata: jobs, listar/detalhar (fase B) e resumo leem daqui.

-- responsavel_id definido -> so ele; senao lista com membros -> membros; senao created_by.
create or replace function public.agenda_destinatarios(p_tarefa_id uuid)
returns table (user_id uuid, nome text)
language plpgsql stable security definer set search_path = public as $$
declare v public.tarefas%rowtype;
begin
  select * into v from public.tarefas where id = p_tarefa_id;
  if not found then return; end if;

  if v.responsavel_id is not null then
    return query select p.id, p.nome from public.user_profiles p where p.id = v.responsavel_id;
    return;
  end if;

  if v.lista_id is not null
     and exists (select 1 from public.tarefas_listas_membros m where m.lista_id = v.lista_id) then
    return query
      select p.id, p.nome
        from public.tarefas_listas_membros m
        join public.user_profiles p on p.id = m.user_id
       where m.lista_id = v.lista_id
       order by p.nome;
    return;
  end if;

  if v.created_by is not null then
    return query select p.id, p.nome from public.user_profiles p where p.id = v.created_by;
  end if;
end $$;

-- dia_inteiro = true -> sem ping proprio (coberta pelo resumo). Fora de 07:30-21:00 SP -> adia pro
-- inicio da proxima janela. Vale pros dois jobs e pro digest da Maria.
create or replace function public.agenda_momento_lembrete(p_vencimento timestamptz, p_dia_inteiro boolean, p_minutos integer)
returns timestamptz
language plpgsql stable set search_path = public as $$
declare
  v_local timestamp;
  v_dia date;
  v_hora time;
  v_ini constant time := time '07:30';
  v_fim constant time := time '21:00';
begin
  if p_vencimento is null or coalesce(p_dia_inteiro, false) then
    return null;
  end if;
  v_local := (p_vencimento at time zone 'America/Sao_Paulo')
             - make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_dia := v_local::date;
  v_hora := v_local::time;
  if v_hora < v_ini then
    v_local := v_dia + v_ini;
  elsif v_hora > v_fim then
    v_local := (v_dia + 1) + v_ini;
  end if;
  return v_local at time zone 'America/Sao_Paulo';
end $$;

-- Pings devidos: tarefas com hora (dia_inteiro=false), pendentes, vencendo ate p_ate
-- (com 12h de lookback pra cobrir o adiamento da janela de silencio), x destinatarios x config.
-- LEFT JOIN na config: usuario sem config volta com whatsapp_numero nulo (o job conta como skipped).
create or replace function public.agenda_lembretes_devidos(p_ate timestamptz)
returns table (
  tarefa_id uuid, titulo text, descricao text, prioridade text, categoria text,
  vencimento_em timestamptz, momento timestamptz,
  user_id uuid, nome text,
  whatsapp_numero text, whatsapp_ativo boolean, agenda_lembrete_tarefas_ativo boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.titulo, t.descricao, t.prioridade, t.categoria, t.vencimento_em,
         public.agenda_momento_lembrete(
           t.vencimento_em, t.dia_inteiro,
           coalesce(t.lembrete_minutos[1], nc.lembrete_padrao_minutos, 30)
         ) as momento,
         d.user_id, d.nome,
         nc.whatsapp_numero, coalesce(nc.whatsapp_ativo, false), coalesce(nc.agenda_lembrete_tarefas_ativo, true)
    from public.tarefas t
    cross join lateral public.agenda_destinatarios(t.id) d
    left join public.notificacao_config nc on nc.user_id = d.user_id
   where t.vencimento_em is not null
     and coalesce(t.dia_inteiro, false) = false
     and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em <= p_ate
     and t.vencimento_em >= now() - interval '12 hours'
   order by t.vencimento_em, d.nome;
$$;

-- Resumo individual completo (§6.5): itens (nao-espelho) e atrasadas um a um; "Pagar:" agregadas.
create or replace function public.agenda_resumo_usuario(p_user_id uuid, p_data date, p_dias integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini timestamptz := (p_data::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := ((p_data + greatest(coalesce(p_dias, 1), 1))::timestamp) at time zone 'America/Sao_Paulo';
  v_itens jsonb; v_atr jsonb; v_pagar jsonb; v_pagar_atr jsonb; v_nome text;
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
    'nome', v_nome, 'itens', v_itens, 'atrasadas', v_atr,
    'pagar', v_pagar, 'pagar_atrasadas', v_pagar_atr
  );
end $$;

-- Grants: so service_role (as duas de lembrete devolvem whatsapp_numero).
revoke all on function public.agenda_destinatarios(uuid) from public, anon, authenticated;
grant execute on function public.agenda_destinatarios(uuid) to service_role;
revoke all on function public.agenda_momento_lembrete(timestamptz, boolean, integer) from public, anon, authenticated;
grant execute on function public.agenda_momento_lembrete(timestamptz, boolean, integer) to service_role;
revoke all on function public.agenda_lembretes_devidos(timestamptz) from public, anon, authenticated;
grant execute on function public.agenda_lembretes_devidos(timestamptz) to service_role;
revoke all on function public.agenda_resumo_usuario(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.agenda_resumo_usuario(uuid, date, integer) to service_role;
