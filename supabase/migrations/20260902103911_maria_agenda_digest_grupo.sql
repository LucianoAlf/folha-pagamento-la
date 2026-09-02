-- =====================================================================================
-- Agenda × Maria — digest de agenda no grupo (spec §6.6: 08:00, Financeiro Grupo LA Music)
-- 02/09/2026 — chat da Maria, a pedido do Alf ("ela vai substituir o que o TOM faz no grupo").
-- 1) maria_agenda_envios: o que a Maria mandou (message_id -> tarefa_ids), pra resolver "isso ja foi
--    feito" por citacao e pra idempotencia (1 digest por grupo por dia).
-- 2) maria_agenda_digest_grupo(p_lista_id, p_data): payload do digest de UMA lista (job de sistema,
--    sem ator — quem chama e o bridge com service_role). Contas "Pagar:" agregadas com valor da conta;
--    rotinas/manuais uma a uma; atrasadas; proximos 7 dias.
-- =====================================================================================

create table if not exists public.maria_agenda_envios (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  message_id text,
  tipo text not null default 'digest' check (tipo in ('digest','lembrete','resumo')),
  data_local date not null,
  tarefa_ids uuid[] not null default '{}',
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (chat_id, tipo, data_local)
);
alter table public.maria_agenda_envios enable row level security;
revoke all on table public.maria_agenda_envios from public, anon, authenticated;
grant select on table public.maria_agenda_envios to maria_operacional, maria_leitura;
grant select, insert, update on table public.maria_agenda_envios to service_role;
create index if not exists maria_agenda_envios_message_idx on public.maria_agenda_envios (message_id);

create or replace function public.maria_agenda_digest_grupo(p_lista_id uuid, p_data date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_data date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_lista jsonb; v_hoje jsonb; v_atr jsonb; v_atr_total int; v_prox jsonb; v_ids uuid[];
  v_c_hoje jsonb; v_c_atr jsonb; v_c_prox jsonb;
  v_dias text[] := array['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
begin
  if p_lista_id is null then raise exception 'lista obrigatoria' using errcode = '22023'; end if;
  select jsonb_build_object('id', l.id, 'nome', l.nome) into v_lista from public.tarefas_listas l where l.id = p_lista_id;
  if v_lista is null then raise exception 'lista nao encontrada.' using errcode = '22023'; end if;

  -- item de tarefa (nao-conta) enxuto para o digest
  with base as (
    select t.*, (t.vencimento_em at time zone 'America/Sao_Paulo')::date as dl
      from public.tarefas t
     where t.lista_id = p_lista_id and t.status in ('pendente','em_andamento','adiada') and t.vencimento_em is not null
       and t.vinculo_tipo is distinct from 'conta_pagar'),
  item as (
    select b.id, b.dl, b.parent_id, jsonb_build_object(
      'id', b.id, 'titulo', b.titulo, 'data_local', to_char(b.dl, 'YYYY-MM-DD'),
      'hora_local', case when b.dia_inteiro then null else to_char(b.vencimento_em at time zone 'America/Sao_Paulo', 'HH24:MI') end,
      'prioridade', b.prioridade, 'status', b.status, 'parent_id', b.parent_id,
      'parent_titulo', (select p.titulo from public.tarefas p where p.id = b.parent_id),
      'rotina_id', b.rotina_id,
      'responsavel', (select p.nome from public.user_profiles p where p.id = b.responsavel_id),
      'destinatarios', coalesce((select string_agg(d.nome, ', ' order by d.nome) from public.agenda_destinatarios(b.id) d), ''),
      'filhas_pendentes', (select count(*) from public.tarefas f where f.parent_id = b.id and f.status in ('pendente','em_andamento','adiada')),
      'filhas_total', (select count(*) from public.tarefas f where f.parent_id = b.id and f.status <> 'cancelada')) as j
      from base b)
  select
    coalesce((select jsonb_agg(i.j order by i.parent_id nulls first, i.j->>'hora_local' nulls first, i.j->>'titulo') from item i where i.dl = v_data), '[]'::jsonb),
    coalesce((select jsonb_agg(i.j order by i.dl desc, i.j->>'titulo') from (select * from item where dl < v_data order by dl desc limit 15) i), '[]'::jsonb),
    (select count(*) from item i where i.dl < v_data),
    coalesce((select jsonb_agg(i.j order by i.dl, i.j->>'titulo') from (select * from item where dl > v_data and dl <= v_data + 6 order by dl limit 20) i), '[]'::jsonb),
    coalesce((select array_agg(i.id) from item i where i.dl <= v_data + 6), '{}'::uuid[])
    into v_hoje, v_atr, v_atr_total, v_prox, v_ids;

  -- contas "Pagar:" (espelhos) agregadas, com valor da conta
  with esp as (
    select t.id, t.titulo, (t.vencimento_em at time zone 'America/Sao_Paulo')::date as dl, c.valor, c.descricao, t.unidade
      from public.tarefas t left join public.contas_pagar c on c.id = t.vinculo_id
     where t.lista_id = p_lista_id and t.vinculo_tipo = 'conta_pagar' and t.status in ('pendente','em_andamento','adiada') and t.vencimento_em is not null)
  select
    jsonb_build_object('n', count(*) filter (where dl = v_data), 'total', coalesce(sum(valor) filter (where dl = v_data), 0),
                       'itens', coalesce(jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'valor', valor, 'unidade', unidade) order by valor desc) filter (where dl = v_data), '[]'::jsonb)),
    jsonb_build_object('n', count(*) filter (where dl < v_data), 'total', coalesce(sum(valor) filter (where dl < v_data), 0),
                       'itens', coalesce(jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'valor', valor, 'data_local', to_char(dl, 'YYYY-MM-DD')) order by dl desc) filter (where dl < v_data), '[]'::jsonb)),
    jsonb_build_object('n', count(*) filter (where dl > v_data and dl <= v_data + 6), 'total', coalesce(sum(valor) filter (where dl > v_data and dl <= v_data + 6), 0))
    into v_c_hoje, v_c_atr, v_c_prox from esp;
  v_ids := v_ids || coalesce((select array_agg(t.id) from public.tarefas t where t.lista_id = p_lista_id and t.vinculo_tipo = 'conta_pagar'
                               and t.status in ('pendente','em_andamento','adiada') and (t.vencimento_em at time zone 'America/Sao_Paulo')::date <= v_data), '{}'::uuid[]);

  return jsonb_build_object(
    'success', true, 'data', v_data, 'data_br', v_dias[extract(dow from v_data)::int + 1] || ', ' || to_char(v_data, 'DD/MM'),
    'lista', v_lista, 'hoje', v_hoje, 'atrasadas', v_atr, 'atrasadas_total', v_atr_total, 'proximos', v_prox,
    'contas_hoje', v_c_hoje, 'contas_atrasadas', v_c_atr, 'contas_proximas', v_c_prox, 'tarefa_ids', to_jsonb(v_ids));
end $$;

revoke all on function public.maria_agenda_digest_grupo(uuid, date) from public, anon, authenticated;
grant execute on function public.maria_agenda_digest_grupo(uuid, date) to service_role, maria_operacional, maria_leitura;
