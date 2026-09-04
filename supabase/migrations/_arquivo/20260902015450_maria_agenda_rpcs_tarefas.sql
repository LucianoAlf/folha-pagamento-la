-- =====================================================================================
-- Agenda × Maria — fase B (parte 1/2): maria_agenda_assert + 10 RPCs de TAREFA (3 leitura, 7 escrita)
-- 02/09/2026 — escrito pelo chat da Maria com o "vai" do Alf (as RPCs de ROTINA ficam com o
-- Super Folha, junto com agenda_rotinas/materializacoes).
-- Contrato: Docs/handoffs/2026-09-01-agenda-maria.md §4.1, §4.3, §4.4, §5, §6.
-- Regras transversais: fuso SP explicito (nunca current_date / now()::date); toda escrita audita
-- via maria_audit_insert; revoke explicito de public/anon/authenticated; proacl nulo e falha.
-- =====================================================================================

-- ---------- helpers (so owner) -------------------------------------------------------

create or replace function public.maria_agenda_assert(
  p_ator_numero text, p_papel text, p_lista_id uuid, p_escrita boolean
) returns public.maria_whatsapp_atores
language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_lista_nome text;
begin
  -- porta grossa (inalterada)
  if p_escrita then
    v_actor := public.maria_assert_actor(p_ator_numero, p_papel,
      array['owner_full','finance_ops_write_safe','finance_assistant_write_safe']);
  else
    v_actor := public.maria_assert_actor(p_ator_numero, p_papel,
      array['owner_full','finance_ops_write_safe','finance_assistant_write_safe','strategic_read_prepare','gov_agent_tecnico']);
  end if;
  if v_actor.papel = 'owner_full' then return v_actor; end if;
  -- porta fina
  if p_escrita and v_actor.user_id is null then
    raise exception 'ator sem usuario vinculado (user_id).'
      using errcode = '42501', hint = 'vincular maria_whatsapp_atores.user_id';
  end if;
  if p_lista_id is not null and v_actor.user_id is not null then
    if not exists (select 1 from public.tarefas_listas_membros m
                    where m.lista_id = p_lista_id and m.user_id = v_actor.user_id) then
      select l.nome into v_lista_nome from public.tarefas_listas l where l.id = p_lista_id;
      raise exception 'ator nao e membro da lista %.', coalesce(v_lista_nome, p_lista_id::text)
        using errcode = '42501';
    end if;
  end if;
  return v_actor;
end $$;

-- Quem pode VER uma tarefa: owner tudo; leitor sem user_id (Anne/gov) passa pela porta grossa;
-- demais: membro da lista, responsavel ou criador.
create or replace function public.maria_agenda_pode_ver(a public.maria_whatsapp_atores, t public.tarefas)
returns boolean language sql stable security definer set search_path = public as $$
  select a.papel = 'owner_full'
      or a.user_id is null
      or (t.lista_id is not null and exists (
            select 1 from public.tarefas_listas_membros m where m.lista_id = t.lista_id and m.user_id = a.user_id))
      or t.responsavel_id = a.user_id
      or t.created_by = a.user_id
$$;

-- Escrita numa tarefa existente: precisa poder ver E ter user_id (ou ser owner).
create or replace function public.maria_agenda_assert_tarefa(a public.maria_whatsapp_atores, t public.tarefas)
returns void language plpgsql security definer set search_path = public as $$
declare v_lista_nome text;
begin
  if a.papel = 'owner_full' then return; end if;
  if a.user_id is null then
    raise exception 'ator sem usuario vinculado (user_id).' using errcode = '42501', hint = 'vincular maria_whatsapp_atores.user_id';
  end if;
  if not public.maria_agenda_pode_ver(a, t) then
    select l.nome into v_lista_nome from public.tarefas_listas l where l.id = t.lista_id;
    raise exception 'ator nao e membro da lista %.', coalesce(v_lista_nome, '(sem lista)') using errcode = '42501';
  end if;
end $$;

create or replace function public.maria_agenda_progresso_pai(p_pai_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then null
              else jsonb_build_object('feitas', count(*) filter (where status = 'concluida'),
                                      'total',  count(*) filter (where status <> 'cancelada')) end
    from public.tarefas where parent_id = p_pai_id
$$;

-- Convencao de horario (a mesma do sync de contas): dia-inteiro = 09:00 SP.
create or replace function public.maria_agenda_montar_vencimento(p_data date, p_dia_inteiro boolean, p_hora time)
returns timestamptz language sql stable as $$
  select ((p_data::timestamp + case when p_dia_inteiro then time '09:00' else coalesce(p_hora, time '09:00') end)
          at time zone 'America/Sao_Paulo')
$$;

create or replace function public.maria_agenda_categoria_da_lista(p_lista_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case lower(coalesce(l.nome, ''))
           when 'financeiro' then 'financeiro'
           when 'rh' then 'rh'
           when 'adm' then 'administrativo'
           when 'pessoal' then 'pessoal'
           else 'geral' end
    from public.tarefas_listas l where l.id = p_lista_id
$$;

-- Item de tarefa (handoff §5). rotina_id/competencia vem por jsonb: as colunas nascem na parte 2.
create or replace function public.maria_agenda_tarefa_json(t public.tarefas)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'titulo', t.titulo, 'descricao', t.descricao, 'status', t.status, 'prioridade', t.prioridade,
    'vencimento_em', t.vencimento_em,
    'data_local', to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'hora_local', case when t.dia_inteiro or t.vencimento_em is null then null
                       else to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'HH24:MI') end,
    'dia_inteiro', t.dia_inteiro,
    'lista', (select jsonb_build_object('id', l.id, 'nome', l.nome) from public.tarefas_listas l where l.id = t.lista_id),
    'responsavel', (select jsonb_build_object('id', p.id, 'nome', p.nome) from public.user_profiles p where p.id = t.responsavel_id),
    'destinatarios', coalesce((select jsonb_agg(jsonb_build_object('id', d.user_id, 'nome', d.nome)) from public.agenda_destinatarios(t.id) d), '[]'::jsonb),
    'rotina_id', to_jsonb(t) -> 'rotina_id',
    'competencia', to_jsonb(t) -> 'competencia',
    'parent_id', t.parent_id, 'vinculo_tipo', t.vinculo_tipo, 'vinculo_id', t.vinculo_id,
    'progresso_pai', public.maria_agenda_progresso_pai(coalesce(t.parent_id, t.id)),
    'concluida_por', (select jsonb_build_object('id', p.id, 'nome', p.nome) from public.user_profiles p where p.id = t.concluida_por),
    'data_conclusao', t.data_conclusao,
    'categoria', t.categoria, 'unidade', t.unidade, 'tags', to_jsonb(t.tags),
    'created_at', t.created_at, 'updated_at', t.updated_at)
$$;

create or replace function public.maria_agenda_resumo_linha(p_acao text, t public.tarefas)
returns text language sql stable security definer set search_path = public as $$
  select format('%s: %s (%s) — %s%s%s',
    p_acao, t.titulo,
    coalesce((select l.nome from public.tarefas_listas l where l.id = t.lista_id), 'sem lista'),
    coalesce(to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'DD/MM'), 'sem data'),
    case when t.dia_inteiro or t.vencimento_em is null then '' else ' ' || to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'HH24:MI') end,
    case when t.parent_id is not null then
      coalesce((select ' — pai ' || p.titulo || ' ' || (public.maria_agenda_progresso_pai(p.id)->>'feitas') || '/' || (public.maria_agenda_progresso_pai(p.id)->>'total')
                  from public.tarefas p where p.id = t.parent_id), '')
      else '' end)
$$;

-- ---------- LEITURA ------------------------------------------------------------------

create or replace function public.maria_agenda_listas(p_ator_numero text, p_papel text, p_canal text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v jsonb;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, false);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'nome', l.nome,
           'membro', (v_actor.user_id is not null and exists (select 1 from public.tarefas_listas_membros m where m.lista_id = l.id and m.user_id = v_actor.user_id)),
           'membros', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
                                  from public.tarefas_listas_membros m join public.user_profiles p on p.id = m.user_id where m.lista_id = l.id), '[]'::jsonb),
           'pendentes', (select count(*) from public.tarefas t where t.lista_id = l.id and t.status in ('pendente','em_andamento','adiada'))
         ) order by l.nome), '[]'::jsonb)
    into v from public.tarefas_listas l;
  return jsonb_build_object('success', true, 'ator', jsonb_build_object('nome', v_actor.nome, 'papel', v_actor.papel, 'user_id', v_actor.user_id), 'listas', v);
end $$;

create or replace function public.maria_agenda_listar(
  p_escopo text, p_data date, p_data_fim date, p_lista_id uuid, p_responsavel_id uuid, p_busca text,
  p_incluir_concluidas boolean, p_ator_numero text, p_papel text, p_canal text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini date; v_fim date; v_itens jsonb; v_total int; v_resumo text;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, false);
  if p_escopo is null or p_escopo not in ('dia','semana','atrasadas','periodo','busca') then
    raise exception 'escopo invalido' using errcode = '22023', hint = 'dia | semana | atrasadas | periodo | busca';
  end if;
  if p_escopo = 'busca' and nullif(trim(coalesce(p_busca, '')), '') is null then
    raise exception 'escopo busca exige p_busca' using errcode = '22023';
  end if;
  v_ini := coalesce(p_data, v_hoje);
  case p_escopo
    when 'dia' then v_fim := v_ini;
    when 'semana' then v_fim := v_ini + 6;
    when 'periodo' then v_fim := coalesce(p_data_fim, v_ini);
    when 'atrasadas' then v_ini := null; v_fim := v_hoje - 1;
    else v_ini := null; v_fim := null;
  end case;
  if v_ini is not null and v_fim < v_ini then raise exception 'data invalida' using errcode = '22023'; end if;

  with sel as (
    select t.*
      from public.tarefas t
     where (p_escopo = 'atrasadas' and t.status in ('pendente','em_andamento','adiada')
              or p_escopo <> 'atrasadas' and (p_incluir_concluidas and t.status <> 'cancelada'
                                              or not p_incluir_concluidas and t.status in ('pendente','em_andamento','adiada')))
       and (p_escopo = 'busca'
            or (t.vencimento_em is not null
                and (v_ini is null or (t.vencimento_em at time zone 'America/Sao_Paulo')::date >= v_ini)
                and (t.vencimento_em at time zone 'America/Sao_Paulo')::date <= v_fim))
       and (p_lista_id is null or t.lista_id = p_lista_id)
       and (p_responsavel_id is null or t.responsavel_id = p_responsavel_id)
       and (p_busca is null or t.titulo ilike '%' || p_busca || '%')
       and public.maria_agenda_pode_ver(v_actor, t)
     order by t.vencimento_em nulls last, t.ordem, t.titulo
     limit 300)
  select coalesce(jsonb_agg(public.maria_agenda_tarefa_json(s)), '[]'::jsonb), count(*)
    into v_itens, v_total from sel s;

  v_resumo := format('%s tarefa(s) — escopo %s%s', v_total, p_escopo,
                     case when v_ini is not null then format(' %s a %s', to_char(v_ini,'DD/MM'), to_char(v_fim,'DD/MM'))
                          when p_escopo = 'atrasadas' then format(' (antes de %s)', to_char(v_hoje,'DD/MM')) else '' end);
  return jsonb_build_object('success', true, 'escopo', p_escopo, 'data_inicio', v_ini, 'data_fim', v_fim,
                            'total', v_total, 'itens', v_itens, 'resumo', v_resumo);
end $$;

create or replace function public.maria_agenda_detalhar(
  p_tarefa_id uuid, p_ator_numero text, p_papel text, p_canal text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; t public.tarefas%rowtype; v_filhas jsonb;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, false);
  select * into t from public.tarefas where id = p_tarefa_id;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  if not public.maria_agenda_pode_ver(v_actor, t) then
    raise exception 'ator nao e membro da lista %.', coalesce((select l.nome from public.tarefas_listas l where l.id = t.lista_id), '(sem lista)') using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(public.maria_agenda_tarefa_json(f) order by f.vencimento_em nulls last, f.ordem, f.titulo), '[]'::jsonb)
    into v_filhas from public.tarefas f where f.parent_id = t.id;
  return jsonb_build_object('success', true, 'tarefa', public.maria_agenda_tarefa_json(t), 'filhas', v_filhas,
                            'resumo', public.maria_agenda_resumo_linha('Tarefa', t));
end $$;

-- ---------- ESCRITA ------------------------------------------------------------------

create or replace function public.maria_agenda_criar(
  p_titulo text, p_lista_id uuid, p_data date, p_dia_inteiro boolean, p_hora time, p_prioridade text,
  p_responsavel_id uuid, p_descricao text, p_parent_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text,
  p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype; v_pai public.tarefas%rowtype; t public.tarefas%rowtype;
  v_prio text := coalesce(nullif(trim(p_prioridade), ''), 'media'); v_audit uuid;
begin
  if p_lista_id is null then raise exception 'lista obrigatoria' using errcode = '22023'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);
  if nullif(trim(coalesce(p_titulo, '')), '') is null then raise exception 'titulo obrigatorio' using errcode = '22023'; end if;
  if p_data is null then raise exception 'data invalida' using errcode = '22023'; end if;
  if v_prio not in ('baixa','media','alta','urgente') then raise exception 'prioridade invalida' using errcode = '22023', hint = 'baixa | media | alta | urgente'; end if;
  if not exists (select 1 from public.tarefas_listas l where l.id = p_lista_id) then raise exception 'lista nao encontrada.' using errcode = '22023'; end if;
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  if p_parent_id is not null then
    select * into v_pai from public.tarefas where id = p_parent_id;
    if not found then raise exception 'pai nao encontrado.' using errcode = 'P0001'; end if;
    if v_pai.parent_id is not null then raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001'; end if;
    perform public.maria_agenda_assert_tarefa(v_actor, v_pai);
  end if;
  -- idempotencia por (mensagem_origem_id, titulo[, pai])
  if nullif(trim(coalesce(p_mensagem_origem_id, '')), '') is not null then
    select * into t from public.tarefas
     where mensagem_origem_id = p_mensagem_origem_id and titulo = trim(p_titulo)
       and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     order by created_at limit 1;
    if found then
      return jsonb_build_object('success', true, 'id', t.id, 'idempotente', true,
                                'resumo', public.maria_agenda_resumo_linha('Ja existia', t), 'tarefa', public.maria_agenda_tarefa_json(t));
    end if;
  end if;
  insert into public.tarefas (titulo, descricao, lista_id, categoria, prioridade, tags, vencimento_em, dia_inteiro, status,
                              responsavel_id, parent_id, created_by, mensagem_origem_id)
  values (trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), p_lista_id,
          coalesce(public.maria_agenda_categoria_da_lista(p_lista_id), 'geral'), v_prio, array['maria'],
          public.maria_agenda_montar_vencimento(p_data, coalesce(p_dia_inteiro, true), p_hora), coalesce(p_dia_inteiro, true), 'pendente',
          p_responsavel_id, p_parent_id, v_actor.user_id, nullif(trim(coalesce(p_mensagem_origem_id, '')), ''))
  returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_criar', null, to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_resumo_linha('Criada', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_editar(
  p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade text, p_lista_id uuid, p_responsavel_id uuid, p_limpar_responsavel boolean,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; t public.tarefas%rowtype; v_audit uuid;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' and (p_titulo is not null or p_descricao is not null or p_prioridade is not null or p_lista_id is not null) then
    raise exception 'espelho de conta a pagar: so o responsavel pode ser alterado; o resto vem da conta.' using errcode = 'P0001', hint = 'maria_contas_*';
  end if;
  if p_prioridade is not null and p_prioridade not in ('baixa','media','alta','urgente') then raise exception 'prioridade invalida' using errcode = '22023'; end if;
  if p_lista_id is not null then
    if not exists (select 1 from public.tarefas_listas l where l.id = p_lista_id) then raise exception 'lista nao encontrada.' using errcode = '22023'; end if;
    perform public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  update public.tarefas set
    titulo = coalesce(nullif(trim(coalesce(p_titulo, '')), ''), titulo),
    descricao = coalesce(p_descricao, descricao),
    prioridade = coalesce(p_prioridade, prioridade),
    lista_id = coalesce(p_lista_id, lista_id),
    categoria = case when p_lista_id is not null then coalesce(public.maria_agenda_categoria_da_lista(p_lista_id), categoria) else categoria end,
    responsavel_id = case when coalesce(p_limpar_responsavel, false) then null else coalesce(p_responsavel_id, responsavel_id) end,
    updated_at = now()
  where id = p_tarefa_id returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_editar', to_jsonb(v_antes), to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_resumo_linha('Editada', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_remarcar(
  p_tarefa_id uuid, p_nova_data date, p_hora time,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; t public.tarefas%rowtype; v_audit uuid; v_hora time;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if p_nova_data is null then raise exception 'data invalida' using errcode = '22023'; end if;
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' then
    raise exception 'espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.'
      using errcode = 'P0001', hint = format('maria_contas_alterar_vencimento(conta_id=%s)', v_antes.vinculo_id);
  end if;
  -- so vencimento_em: competencia/rotina intocados, pai nao arrasta filhas
  v_hora := coalesce(p_hora, case when v_antes.dia_inteiro or v_antes.vencimento_em is null then null
                                  else (v_antes.vencimento_em at time zone 'America/Sao_Paulo')::time end);
  update public.tarefas set vencimento_em = public.maria_agenda_montar_vencimento(p_nova_data, v_antes.dia_inteiro, v_hora), updated_at = now()
   where id = p_tarefa_id returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_remarcar', to_jsonb(v_antes), to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_resumo_linha('Remarcada', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_concluir(
  p_tarefa_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; t public.tarefas%rowtype; v_audit uuid; v_pend text;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' then
    raise exception 'tarefa vinculada a conta a pagar: conclua pela baixa da conta.'
      using errcode = 'P0001', hint = format('maria_contas_dar_baixa(p_conta_id=%s)', v_antes.vinculo_id);
  end if;
  if v_antes.status = 'concluida' then
    return jsonb_build_object('success', true, 'id', v_antes.id, 'idempotente', true,
                              'resumo', public.maria_agenda_resumo_linha('Ja estava concluida', v_antes), 'tarefa', public.maria_agenda_tarefa_json(v_antes));
  end if;
  select string_agg(f.titulo, '; ' order by f.titulo) into v_pend
    from public.tarefas f where f.parent_id = v_antes.id and f.status in ('pendente','em_andamento','adiada');
  if v_pend is not null then
    raise exception 'pai com filhas pendentes: %.', v_pend using errcode = 'P0001', hint = 'conclua ou cancele as filhas';
  end if;
  update public.tarefas set status = 'concluida', data_conclusao = now(), concluida_por = v_actor.user_id, updated_at = now()
   where id = p_tarefa_id returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_concluir', to_jsonb(v_antes), to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'progresso_pai', case when t.parent_id is not null then public.maria_agenda_progresso_pai(t.parent_id) end,
                            'resumo', public.maria_agenda_resumo_linha('Concluida', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_reabrir(
  p_tarefa_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; t public.tarefas%rowtype; v_audit uuid; v_pai_status text;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' then
    raise exception 'espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.' using errcode = 'P0001', hint = 'maria_contas_*';
  end if;
  if v_antes.status not in ('concluida','cancelada') then
    raise exception 'tarefa nao esta concluida nem cancelada (status %).', v_antes.status using errcode = 'P0001';
  end if;
  if v_antes.parent_id is not null then
    select status into v_pai_status from public.tarefas where id = v_antes.parent_id;
    if v_pai_status = 'concluida' then
      raise exception 'filha de pai concluido: reabra o pai primeiro.' using errcode = 'P0001', hint = format('maria_agenda_reabrir(%s)', v_antes.parent_id);
    end if;
  end if;
  update public.tarefas set status = 'pendente', data_conclusao = null, concluida_por = null, updated_at = now()
   where id = p_tarefa_id returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_reabrir', to_jsonb(v_antes), to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_resumo_linha('Reaberta', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_cancelar(
  p_tarefa_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; t public.tarefas%rowtype; v_audit uuid;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'motivo obrigatorio para cancelar.' using errcode = '22023'; end if;
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' then
    raise exception 'espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.' using errcode = 'P0001', hint = 'maria_contas_*';
  end if;
  if v_antes.status = 'cancelada' then
    return jsonb_build_object('success', true, 'id', v_antes.id, 'idempotente', true,
                              'resumo', public.maria_agenda_resumo_linha('Ja estava cancelada', v_antes), 'tarefa', public.maria_agenda_tarefa_json(v_antes));
  end if;
  if exists (select 1 from public.tarefas f where f.parent_id = v_antes.id and f.status in ('pendente','em_andamento','adiada')) then
    raise exception 'pai com filha ativa nao pode ser excluido/cancelado.' using errcode = 'P0001';
  end if;
  update public.tarefas set status = 'cancelada', updated_at = now(),
         descricao = concat_ws(E'\n', descricao, format('[Cancelada pela Maria em %s] %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), trim(p_motivo)))
   where id = p_tarefa_id returning * into t;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', t.id, 'agenda_cancelar', to_jsonb(v_antes), to_jsonb(t),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', t.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_resumo_linha('Cancelada', t), 'tarefa', public.maria_agenda_tarefa_json(t));
end $$;

create or replace function public.maria_agenda_excluir(
  p_tarefa_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.tarefas%rowtype; v_audit uuid; v_resumo text;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'motivo obrigatorio para excluir.' using errcode = '22023'; end if;
  select * into v_antes from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'tarefa nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert_tarefa(v_actor, v_antes);
  if v_antes.vinculo_tipo = 'conta_pagar' or v_antes.vinculo_id is not null then
    raise exception 'espelho de conta a pagar: remarque/cancele a conta, nao a tarefa.' using errcode = 'P0001', hint = 'maria_contas_*';
  end if;
  if (to_jsonb(v_antes) ->> 'rotina_id') is not null or v_antes.recorrencia_pai_id is not null then
    raise exception 'instancia de rotina nao se exclui: use cancelar.' using errcode = 'P0001', hint = 'maria_agenda_cancelar';
  end if;
  if exists (select 1 from public.tarefas f where f.parent_id = v_antes.id and f.status in ('pendente','em_andamento','adiada')) then
    raise exception 'pai com filha ativa nao pode ser excluido/cancelado.' using errcode = 'P0001';
  end if;
  v_resumo := public.maria_agenda_resumo_linha('Excluida', v_antes);
  delete from public.tarefas where id = p_tarefa_id;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'tarefas', 'tarefa', v_antes.id, 'agenda_excluir', to_jsonb(v_antes), null,
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', v_antes.id, 'audit_id', v_audit, 'resumo', v_resumo,
                            'tarefa', public.maria_agenda_tarefa_json(v_antes));
end $$;

-- ---------- GRANTS (handoff §4.2 / §9) ------------------------------------------------
do $g$
declare f text;
begin
  -- helpers: so owner
  foreach f in array array[
    'public.maria_agenda_assert(text,text,uuid,boolean)',
    'public.maria_agenda_pode_ver(public.maria_whatsapp_atores,public.tarefas)',
    'public.maria_agenda_assert_tarefa(public.maria_whatsapp_atores,public.tarefas)',
    'public.maria_agenda_progresso_pai(uuid)',
    'public.maria_agenda_montar_vencimento(date,boolean,time)',
    'public.maria_agenda_categoria_da_lista(uuid)',
    'public.maria_agenda_tarefa_json(public.tarefas)',
    'public.maria_agenda_resumo_linha(text,public.tarefas)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- leitura (L)
  foreach f in array array[
    'public.maria_agenda_listas(text,text,text)',
    'public.maria_agenda_listar(text,date,date,uuid,uuid,text,boolean,text,text,text)',
    'public.maria_agenda_detalhar(uuid,text,text,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role, maria_operacional, maria_leitura', f);
  end loop;
  -- escrita (E)
  foreach f in array array[
    'public.maria_agenda_criar(text,uuid,date,boolean,time,text,uuid,text,uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_editar(uuid,text,text,text,uuid,uuid,boolean,text,text,text,text,text,text,text)',
    'public.maria_agenda_remarcar(uuid,date,time,text,text,text,text,text,text,text)',
    'public.maria_agenda_concluir(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_reabrir(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_cancelar(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_excluir(uuid,text,text,text,text,text,text,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role, maria_operacional', f);
  end loop;
end $g$;
