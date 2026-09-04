-- =====================================================================================
-- Agenda × Maria — fase B (parte 2/2): 9 RPCs de ROTINA mensal (moldes em agenda_rotinas)
-- 02/09/2026 — chat da Maria. Apoia-se no B1 do Super Folha: agenda_rotinas, tarefas.rotina_id/
-- competencia, agenda_materializar_corrente_e_proximo('rpc'), agenda_resolve_dia/ajustar_data e
-- os guards de trigger (profundidade 1, filha na lista do pai, rotina com filhas nao muda de lista).
-- Contrato: Docs/handoffs/2026-09-01-agenda-maria.md §4.5, §5, §6. Mesmas regras transversais da
-- parte 1: fuso SP explicito, auditoria em toda escrita, revoke explicito, proacl nao nulo.
-- Regras de negocio: molde editado muda so os meses ainda nao materializados (instancia existente
-- nao se move); pausar nao toca instancias; encerrar/remover cancela so instancias PENDENTES de
-- competencia FUTURA (o mes corrente fica; a Rose cancela a mao se quiser); nunca apaga molde.
-- =====================================================================================

-- ---------- helpers (so owner) -------------------------------------------------------

create or replace function public.maria_agenda_validar_rotina(p_dia_mes integer, p_ultimo_dia boolean, p_regra text, p_prioridade text)
returns void language plpgsql immutable as $$
begin
  if p_dia_mes is null and not coalesce(p_ultimo_dia, false) then
    raise exception 'informe dia_mes ou ultimo_dia' using errcode = '22023';
  end if;
  if p_dia_mes is not null and (p_dia_mes < 1 or p_dia_mes > 31) then
    raise exception 'dia_mes fora de 1..31' using errcode = '22023';
  end if;
  if p_regra is not null and p_regra not in ('manter','proximo_dia_util','dia_util_anterior') then
    raise exception 'regra de fim de semana invalida' using errcode = '22023', hint = 'manter | proximo_dia_util | dia_util_anterior';
  end if;
  if p_prioridade is not null and p_prioridade not in ('baixa','media','alta','urgente') then
    raise exception 'prioridade invalida' using errcode = '22023', hint = 'baixa | media | alta | urgente';
  end if;
end $$;

-- Proxima data em que o molde materializa (corrente se ainda nao passou, senao o proximo mes).
create or replace function public.maria_agenda_rotina_proxima_data(r public.agenda_rotinas)
returns date language plpgsql stable security definer set search_path = public as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_comp date; v_d date; i int;
begin
  if r.status <> 'ativa' then return null; end if;
  v_comp := date_trunc('month', v_hoje)::date;
  for i in 0..2 loop
    v_d := public.agenda_ajustar_data(public.agenda_resolve_dia((v_comp + (i || ' month')::interval)::date, r.dia_mes, r.ultimo_dia), r.se_cair_fim_de_semana);
    if v_d >= v_hoje and v_d >= r.vigencia_inicio then return v_d; end if;
  end loop;
  return null;
end $$;

create or replace function public.maria_agenda_rotina_json_base(r public.agenda_rotinas)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'titulo', r.titulo, 'descricao', r.descricao,
    'lista', (select jsonb_build_object('id', l.id, 'nome', l.nome) from public.tarefas_listas l where l.id = r.lista_id),
    'categoria', r.categoria, 'frequencia', r.frequencia, 'dia_mes', r.dia_mes, 'ultimo_dia', r.ultimo_dia,
    'se_cair_fim_de_semana', r.se_cair_fim_de_semana, 'hora', to_char(r.hora, 'HH24:MI'), 'dia_inteiro', r.dia_inteiro,
    'prioridade', r.prioridade,
    'responsavel', (select jsonb_build_object('id', p.id, 'nome', p.nome) from public.user_profiles p where p.id = r.responsavel_id),
    'status', r.status, 'vigencia_inicio', r.vigencia_inicio, 'encerrada_em', r.encerrada_em,
    'parent_rotina_id', r.parent_rotina_id, 'ordem', r.ordem,
    'proxima_data', public.maria_agenda_rotina_proxima_data(r),
    'instancias', jsonb_build_object(
      'corrente', (select jsonb_build_object('id', t.id, 'status', t.status, 'data_local', to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
                     from public.tarefas t where t.rotina_id = r.id and t.competencia = date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date),
      'proxima',  (select jsonb_build_object('id', t.id, 'status', t.status, 'data_local', to_char(t.vencimento_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
                     from public.tarefas t where t.rotina_id = r.id and t.competencia = (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '1 month')::date)))
$$;

create or replace function public.maria_agenda_rotina_json(r public.agenda_rotinas)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.maria_agenda_rotina_json_base(r)
      || jsonb_build_object('filhas', case when r.parent_rotina_id is null then
           coalesce((select jsonb_agg(public.maria_agenda_rotina_json_base(f) order by f.ordem, f.titulo) from public.agenda_rotinas f where f.parent_rotina_id = r.id), '[]'::jsonb)
           else null end)
$$;

create or replace function public.maria_agenda_rotina_resumo(p_acao text, r public.agenda_rotinas)
returns text language sql stable security definer set search_path = public as $$
  select format('%s: %s (%s) — %s, %s%s',
    p_acao, r.titulo,
    coalesce((select l.nome from public.tarefas_listas l where l.id = r.lista_id), 'sem lista'),
    case when r.ultimo_dia then 'ultimo dia do mes' else 'dia ' || coalesce(r.dia_mes::text, '?') end,
    r.se_cair_fim_de_semana,
    case when r.parent_rotina_id is not null then coalesce((select ' — filha de ' || p.titulo from public.agenda_rotinas p where p.id = r.parent_rotina_id), '') else '' end)
$$;

-- Encerra UMA linha de molde e cancela so as instancias pendentes de competencia FUTURA.
create or replace function public.maria_agenda_rotina_encerrar_linha(p_id uuid, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date; v_n int;
begin
  update public.agenda_rotinas
     set status = 'encerrada', encerrada_em = coalesce(encerrada_em, now()), updated_at = now(),
         observacao = concat_ws(E'\n', observacao, format('[Encerrada pela Maria em %s] %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), p_motivo))
   where id = p_id and status <> 'encerrada';
  update public.tarefas
     set status = 'cancelada', updated_at = now(),
         descricao = concat_ws(E'\n', descricao, format('[Cancelada: rotina encerrada em %s] %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), p_motivo))
   where rotina_id = p_id and competencia > v_mes and status in ('pendente','em_andamento','adiada');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- LEITURA ------------------------------------------------------------------

create or replace function public.maria_agenda_rotinas_listar(
  p_lista_id uuid, p_status text, p_ator_numero text, p_papel text, p_canal text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v jsonb; v_total int;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, false);
  if p_status is not null and p_status not in ('ativa','pausada','encerrada') then
    raise exception 'status invalido' using errcode = '22023', hint = 'ativa | pausada | encerrada';
  end if;
  with pais as (
    select r.* from public.agenda_rotinas r
     where r.parent_rotina_id is null
       and (p_lista_id is null or r.lista_id = p_lista_id)
       and (p_status is null or r.status = p_status)
       and (v_actor.papel = 'owner_full' or v_actor.user_id is null
            or exists (select 1 from public.tarefas_listas_membros m where m.lista_id = r.lista_id and m.user_id = v_actor.user_id))
     order by (r.status = 'encerrada'), r.ordem, r.titulo)
  select coalesce(jsonb_agg(public.maria_agenda_rotina_json(p)), '[]'::jsonb), count(*) into v, v_total from pais p;
  return jsonb_build_object('success', true, 'total', v_total, 'rotinas', v,
                            'resumo', format('%s rotina(s)%s', v_total, case when p_status is not null then ' ' || p_status else '' end));
end $$;

-- ---------- ESCRITA ------------------------------------------------------------------

create or replace function public.maria_agenda_rotina_criar(
  p_titulo text, p_lista_id uuid, p_dia_mes integer, p_ultimo_dia boolean, p_se_cair_fim_de_semana text,
  p_hora time, p_dia_inteiro boolean, p_prioridade text, p_responsavel_id uuid, p_descricao text, p_vigencia_inicio date,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid; v_mat jsonb;
  v_regra text := coalesce(nullif(trim(p_se_cair_fim_de_semana), ''), 'manter');
  v_prio text := coalesce(nullif(trim(p_prioridade), ''), 'media');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_lista_id is null then raise exception 'lista obrigatoria' using errcode = '22023'; end if;
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, p_lista_id, true);
  if nullif(trim(coalesce(p_titulo, '')), '') is null then raise exception 'titulo obrigatorio' using errcode = '22023'; end if;
  perform public.maria_agenda_validar_rotina(p_dia_mes, p_ultimo_dia, v_regra, v_prio);
  if not exists (select 1 from public.tarefas_listas l where l.id = p_lista_id) then raise exception 'lista nao encontrada.' using errcode = '22023'; end if;
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_mensagem_origem_id, '')), '') is not null then
    select * into r from public.agenda_rotinas
     where mensagem_origem_id = p_mensagem_origem_id and titulo = trim(p_titulo) and parent_rotina_id is null
     order by created_at limit 1;
    if found then
      return jsonb_build_object('success', true, 'id', r.id, 'idempotente', true,
                                'resumo', public.maria_agenda_rotina_resumo('Ja existia', r), 'rotina', public.maria_agenda_rotina_json(r));
    end if;
  end if;
  insert into public.agenda_rotinas (titulo, descricao, lista_id, categoria, prioridade, responsavel_id, dia_mes, ultimo_dia,
                                     se_cair_fim_de_semana, hora, dia_inteiro, status, vigencia_inicio, mensagem_origem_id, created_by)
  values (trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), p_lista_id,
          coalesce(public.maria_agenda_categoria_da_lista(p_lista_id), 'geral'), v_prio, p_responsavel_id,
          p_dia_mes, coalesce(p_ultimo_dia, false), v_regra, coalesce(p_hora, time '09:00'), coalesce(p_dia_inteiro, true), 'ativa',
          coalesce(p_vigencia_inicio, v_hoje), nullif(trim(coalesce(p_mensagem_origem_id, '')), ''), v_actor.user_id)
  returning * into r;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_criar', null, to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit, 'pai_id', r.id,
                            'resumo', public.maria_agenda_rotina_resumo('Rotina criada', r),
                            'rotina', public.maria_agenda_rotina_json(r), 'materializacao', v_mat - 'hoje');
end $$;

create or replace function public.maria_agenda_rotina_editar(
  p_rotina_id uuid, p_titulo text, p_descricao text, p_dia_mes integer, p_ultimo_dia boolean, p_se_cair_fim_de_semana text,
  p_hora time, p_dia_inteiro boolean, p_prioridade text, p_responsavel_id uuid, p_limpar_responsavel boolean,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid;
        v_dia int; v_ult boolean;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.parent_rotina_id is not null then
    raise exception 'alvo e filha: use maria_agenda_rotina_filha_editar.' using errcode = 'P0001', hint = 'maria_agenda_rotina_filha_editar';
  end if;
  if v_antes.status = 'encerrada' then
    raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar';
  end if;
  v_dia := coalesce(p_dia_mes, v_antes.dia_mes);
  v_ult := coalesce(p_ultimo_dia, case when p_dia_mes is not null then false else v_antes.ultimo_dia end);
  perform public.maria_agenda_validar_rotina(v_dia, v_ult, coalesce(p_se_cair_fim_de_semana, v_antes.se_cair_fim_de_semana), coalesce(p_prioridade, v_antes.prioridade));
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  update public.agenda_rotinas set
    titulo = coalesce(nullif(trim(coalesce(p_titulo, '')), ''), titulo),
    descricao = coalesce(p_descricao, descricao),
    dia_mes = v_dia, ultimo_dia = v_ult,
    se_cair_fim_de_semana = coalesce(p_se_cair_fim_de_semana, se_cair_fim_de_semana),
    hora = coalesce(p_hora, hora), dia_inteiro = coalesce(p_dia_inteiro, dia_inteiro),
    prioridade = coalesce(p_prioridade, prioridade),
    responsavel_id = case when coalesce(p_limpar_responsavel, false) then null else coalesce(p_responsavel_id, responsavel_id) end,
    updated_at = now()
  where id = p_rotina_id returning * into r;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_editar', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_rotina_resumo('Rotina editada (vale dos proximos meses em diante; instancia ja criada nao se move)', r),
                            'rotina', public.maria_agenda_rotina_json(r));
end $$;

create or replace function public.maria_agenda_rotina_filha_adicionar(
  p_rotina_pai_id uuid, p_titulo text, p_dia_mes integer, p_ultimo_dia boolean, p_se_cair_fim_de_semana text,
  p_prioridade text, p_responsavel_id uuid, p_descricao text,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_pai public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid; v_mat jsonb;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_pai from public.agenda_rotinas where id = p_rotina_pai_id for update;
  if not found then raise exception 'rotina pai nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_pai.lista_id, true);
  if v_pai.parent_rotina_id is not null then
    raise exception 'alvo ja e filha: adicione filhas ao pai.' using errcode = 'P0001', hint = format('maria_agenda_rotina_filha_adicionar(p_rotina_pai_id=%s)', v_pai.parent_rotina_id);
  end if;
  if v_pai.status = 'encerrada' then
    raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar';
  end if;
  if nullif(trim(coalesce(p_titulo, '')), '') is null then raise exception 'titulo obrigatorio' using errcode = '22023'; end if;
  perform public.maria_agenda_validar_rotina(p_dia_mes, p_ultimo_dia, coalesce(p_se_cair_fim_de_semana, v_pai.se_cair_fim_de_semana), coalesce(p_prioridade, v_pai.prioridade));
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_mensagem_origem_id, '')), '') is not null then
    select * into r from public.agenda_rotinas
     where mensagem_origem_id = p_mensagem_origem_id and titulo = trim(p_titulo) and parent_rotina_id = v_pai.id
     order by created_at limit 1;
    if found then
      return jsonb_build_object('success', true, 'id', r.id, 'pai_id', v_pai.id, 'idempotente', true,
                                'resumo', public.maria_agenda_rotina_resumo('Ja existia', r), 'rotina', public.maria_agenda_rotina_json(r));
    end if;
  end if;
  insert into public.agenda_rotinas (parent_rotina_id, titulo, descricao, lista_id, categoria, prioridade, responsavel_id, dia_mes, ultimo_dia,
                                     se_cair_fim_de_semana, hora, dia_inteiro, status, vigencia_inicio, mensagem_origem_id, created_by, ordem)
  values (v_pai.id, trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), v_pai.lista_id, v_pai.categoria,
          coalesce(p_prioridade, v_pai.prioridade), p_responsavel_id, p_dia_mes, coalesce(p_ultimo_dia, false),
          coalesce(p_se_cair_fim_de_semana, v_pai.se_cair_fim_de_semana), v_pai.hora, v_pai.dia_inteiro, 'ativa',
          greatest(v_pai.vigencia_inicio, (now() at time zone 'America/Sao_Paulo')::date), nullif(trim(coalesce(p_mensagem_origem_id, '')), ''), v_actor.user_id,
          coalesce((select max(f.ordem) + 1 from public.agenda_rotinas f where f.parent_rotina_id = v_pai.id), v_pai.ordem))
  returning * into r;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_filha_adicionar', null, to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit, 'pai_id', v_pai.id,
                            'resumo', public.maria_agenda_rotina_resumo('Filha adicionada', r),
                            'rotina', public.maria_agenda_rotina_json(r), 'materializacao', v_mat - 'hoje');
end $$;

create or replace function public.maria_agenda_rotina_filha_editar(
  p_rotina_filha_id uuid, p_titulo text, p_descricao text, p_dia_mes integer, p_ultimo_dia boolean, p_se_cair_fim_de_semana text,
  p_prioridade text, p_responsavel_id uuid, p_limpar_responsavel boolean,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid;
        v_dia int; v_ult boolean;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.agenda_rotinas where id = p_rotina_filha_id for update;
  if not found then raise exception 'rotina filha nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.parent_rotina_id is null then
    raise exception 'alvo e pai: use maria_agenda_rotina_editar.' using errcode = 'P0001', hint = 'maria_agenda_rotina_editar';
  end if;
  if v_antes.status = 'encerrada' then
    raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_filha_adicionar';
  end if;
  v_dia := coalesce(p_dia_mes, v_antes.dia_mes);
  v_ult := coalesce(p_ultimo_dia, case when p_dia_mes is not null then false else v_antes.ultimo_dia end);
  perform public.maria_agenda_validar_rotina(v_dia, v_ult, coalesce(p_se_cair_fim_de_semana, v_antes.se_cair_fim_de_semana), coalesce(p_prioridade, v_antes.prioridade));
  if p_responsavel_id is not null and not exists (select 1 from public.user_profiles p where p.id = p_responsavel_id) then
    raise exception 'responsavel nao encontrado.' using errcode = '22023';
  end if;
  -- preserva o id (identidade da linhagem rotina_id): "8641 pro dia 19 todo mes" nao abre duplicata
  update public.agenda_rotinas set
    titulo = coalesce(nullif(trim(coalesce(p_titulo, '')), ''), titulo),
    descricao = coalesce(p_descricao, descricao),
    dia_mes = v_dia, ultimo_dia = v_ult,
    se_cair_fim_de_semana = coalesce(p_se_cair_fim_de_semana, se_cair_fim_de_semana),
    prioridade = coalesce(p_prioridade, prioridade),
    responsavel_id = case when coalesce(p_limpar_responsavel, false) then null else coalesce(p_responsavel_id, responsavel_id) end,
    updated_at = now()
  where id = p_rotina_filha_id returning * into r;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_filha_editar', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit, 'pai_id', r.parent_rotina_id,
                            'resumo', public.maria_agenda_rotina_resumo('Filha editada (vale dos proximos meses em diante)', r),
                            'rotina', public.maria_agenda_rotina_json(r));
end $$;

create or replace function public.maria_agenda_rotina_filha_remover(
  p_rotina_filha_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid; v_canc int;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'motivo obrigatorio para remover.' using errcode = '22023'; end if;
  select * into v_antes from public.agenda_rotinas where id = p_rotina_filha_id for update;
  if not found then raise exception 'rotina filha nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.parent_rotina_id is null then
    raise exception 'alvo e pai: use maria_agenda_rotina_encerrar.' using errcode = 'P0001', hint = 'maria_agenda_rotina_encerrar';
  end if;
  if v_antes.status = 'encerrada' then
    select * into r from public.agenda_rotinas where id = p_rotina_filha_id;
    return jsonb_build_object('success', true, 'id', r.id, 'idempotente', true, 'resumo', public.maria_agenda_rotina_resumo('Ja estava encerrada', r), 'rotina', public.maria_agenda_rotina_json(r));
  end if;
  v_canc := public.maria_agenda_rotina_encerrar_linha(p_rotina_filha_id, trim(p_motivo));
  select * into r from public.agenda_rotinas where id = p_rotina_filha_id;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_filha_remover', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit, 'pai_id', r.parent_rotina_id, 'instancias_futuras_canceladas', v_canc,
                            'resumo', public.maria_agenda_rotina_resumo(format('Filha removida (encerrada; %s instancia(s) futura(s) cancelada(s), o mes corrente fica)', v_canc), r),
                            'rotina', public.maria_agenda_rotina_json(r));
end $$;

create or replace function public.maria_agenda_rotina_pausar(
  p_rotina_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'motivo obrigatorio para pausar.' using errcode = '22023'; end if;
  select * into v_antes from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.status = 'encerrada' then
    raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar';
  end if;
  if v_antes.status = 'pausada' then
    return jsonb_build_object('success', true, 'id', v_antes.id, 'idempotente', true, 'resumo', public.maria_agenda_rotina_resumo('Ja estava pausada', v_antes), 'rotina', public.maria_agenda_rotina_json(v_antes));
  end if;
  update public.agenda_rotinas set status = 'pausada', updated_at = now(),
         observacao = concat_ws(E'\n', observacao, format('[Pausada pela Maria em %s] %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), trim(p_motivo)))
   where id = p_rotina_id returning * into r;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_pausar', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_rotina_resumo(case when r.parent_rotina_id is null then 'Rotina pausada (pacote inteiro deixa de nascer; instancias existentes ficam)' else 'Filha pausada (so ela deixa de nascer)' end, r),
                            'rotina', public.maria_agenda_rotina_json(r));
end $$;

create or replace function public.maria_agenda_rotina_reativar(
  p_rotina_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid; v_mat jsonb;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  select * into v_antes from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.status = 'encerrada' then
    raise exception 'rotina encerrada nao aceita edicao nem reativacao.' using errcode = 'P0001', hint = 'maria_agenda_rotina_criar';
  end if;
  if v_antes.status = 'ativa' then
    return jsonb_build_object('success', true, 'id', v_antes.id, 'idempotente', true, 'resumo', public.maria_agenda_rotina_resumo('Ja estava ativa', v_antes), 'rotina', public.maria_agenda_rotina_json(v_antes));
  end if;
  update public.agenda_rotinas set status = 'ativa', updated_at = now(),
         observacao = concat_ws(E'\n', observacao, format('[Reativada pela Maria em %s]%s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), coalesce(' ' || nullif(trim(coalesce(p_motivo, '')), ''), '')))
   where id = p_rotina_id returning * into r;
  v_mat := public.agenda_materializar_corrente_e_proximo('rpc');
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_reativar', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit,
                            'resumo', public.maria_agenda_rotina_resumo('Rotina reativada', r),
                            'rotina', public.maria_agenda_rotina_json(r), 'materializacao', v_mat - 'hoje');
end $$;

create or replace function public.maria_agenda_rotina_encerrar(
  p_rotina_id uuid,
  p_ator_numero text, p_papel text, p_canal text, p_texto_original text, p_motivo text, p_mensagem_origem_id text, p_canal_origem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor public.maria_whatsapp_atores%rowtype; v_antes public.agenda_rotinas%rowtype; r public.agenda_rotinas%rowtype; v_audit uuid;
        v_canc int := 0; v_filhas int := 0; f record;
begin
  v_actor := public.maria_agenda_assert(p_ator_numero, p_papel, null, true);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'motivo obrigatorio para encerrar.' using errcode = '22023'; end if;
  select * into v_antes from public.agenda_rotinas where id = p_rotina_id for update;
  if not found then raise exception 'rotina nao encontrada.' using errcode = 'P0001'; end if;
  perform public.maria_agenda_assert(p_ator_numero, p_papel, v_antes.lista_id, true);
  if v_antes.status = 'encerrada' then
    return jsonb_build_object('success', true, 'id', v_antes.id, 'idempotente', true, 'resumo', public.maria_agenda_rotina_resumo('Ja estava encerrada', v_antes), 'rotina', public.maria_agenda_rotina_json(v_antes));
  end if;
  -- pai encerra o pacote: filhas-molde tambem encerram; nunca apaga
  for f in select id from public.agenda_rotinas where parent_rotina_id = v_antes.id and status <> 'encerrada' loop
    v_canc := v_canc + public.maria_agenda_rotina_encerrar_linha(f.id, trim(p_motivo)); v_filhas := v_filhas + 1;
  end loop;
  v_canc := v_canc + public.maria_agenda_rotina_encerrar_linha(v_antes.id, trim(p_motivo));
  select * into r from public.agenda_rotinas where id = p_rotina_id;
  v_audit := public.maria_audit_insert(v_actor, p_ator_numero, p_canal, 'agenda_rotinas', 'rotina', r.id, 'agenda_rotina_encerrar', to_jsonb(v_antes), to_jsonb(r),
               concat_ws(' | ', p_motivo, nullif('canal_origem=' || coalesce(p_canal_origem, ''), 'canal_origem=')), p_texto_original);
  return jsonb_build_object('success', true, 'id', r.id, 'audit_id', v_audit, 'filhas_encerradas', v_filhas, 'instancias_futuras_canceladas', v_canc,
                            'resumo', public.maria_agenda_rotina_resumo(format('Rotina encerrada (%s filha(s) encerrada(s); %s instancia(s) futura(s) cancelada(s); o mes corrente fica)', v_filhas, v_canc), r),
                            'rotina', public.maria_agenda_rotina_json(r));
end $$;

-- ---------- GRANTS ---------------------------------------------------------------------
do $g$
declare f text;
begin
  foreach f in array array[
    'public.maria_agenda_validar_rotina(integer,boolean,text,text)',
    'public.maria_agenda_rotina_proxima_data(public.agenda_rotinas)',
    'public.maria_agenda_rotina_json_base(public.agenda_rotinas)',
    'public.maria_agenda_rotina_json(public.agenda_rotinas)',
    'public.maria_agenda_rotina_resumo(text,public.agenda_rotinas)',
    'public.maria_agenda_rotina_encerrar_linha(uuid,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.maria_agenda_rotinas_listar(uuid,text,text,text,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role, maria_operacional, maria_leitura', f);
  end loop;
  foreach f in array array[
    'public.maria_agenda_rotina_criar(text,uuid,integer,boolean,text,time,boolean,text,uuid,text,date,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_editar(uuid,text,text,integer,boolean,text,time,boolean,text,uuid,boolean,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_filha_adicionar(uuid,text,integer,boolean,text,text,uuid,text,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_filha_editar(uuid,text,text,integer,boolean,text,text,uuid,boolean,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_filha_remover(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_pausar(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_reativar(uuid,text,text,text,text,text,text,text)',
    'public.maria_agenda_rotina_encerrar(uuid,text,text,text,text,text,text,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role, maria_operacional', f);
  end loop;
end $g$;
