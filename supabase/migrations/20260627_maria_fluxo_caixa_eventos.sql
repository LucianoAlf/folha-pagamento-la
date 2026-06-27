-- Maria observadora de fluxo de caixa do grupo financeiro.
-- Ledger auditável para eventos observados no WhatsApp: saídas, entradas, saldos,
-- transferências, comprovantes e observações. Não executa pagamento nem baixa.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.maria_fluxo_caixa_eventos (
  id uuid primary key default gen_random_uuid(),
  data_operacional date not null,
  chat_id text not null,
  message_id text not null,
  quoted_id text null,
  remetente_numero_hash text null,
  remetente_numero_last4 text null,
  remetente_nome text null,
  tipo_evento text not null check (tipo_evento in (
    'conta_prevista',
    'saida_confirmada',
    'entrada_confirmada',
    'transferencia',
    'saldo_informado',
    'comprovante_recebido',
    'observacao',
    'divergencia'
  )),
  direcao text not null check (direcao in (
    'saida',
    'entrada',
    'transferencia',
    'saldo',
    'observacao'
  )),
  unidade text null check (unidade is null or unidade in (
    'recreio',
    'barra',
    'campo_grande',
    'emla_cg',
    'kids_cg',
    'multi',
    'indefinida'
  )),
  conta_origem text null,
  descricao text not null,
  valor_centavos integer null check (valor_centavos is null or valor_centavos >= 0),
  moeda text not null default 'BRL',
  status text not null default 'observado' check (status in (
    'observado',
    'confirmado',
    'pendente_confirmacao',
    'divergente',
    'ignorado',
    'corrigido'
  )),
  evidencia_texto text null,
  media_ref text null,
  conta_pagar_id uuid null references public.contas_pagar(id) on delete set null,
  raw_payload_sanitizado jsonb null,
  observacoes text null,
  criado_por text not null default 'maria-observadora',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, message_id, tipo_evento, coalesce(descricao, ''), coalesce(valor_centavos, -1))
);

create index if not exists maria_fluxo_caixa_eventos_data_idx
  on public.maria_fluxo_caixa_eventos (data_operacional desc, created_at desc);

create index if not exists maria_fluxo_caixa_eventos_chat_message_idx
  on public.maria_fluxo_caixa_eventos (chat_id, message_id);

create index if not exists maria_fluxo_caixa_eventos_tipo_idx
  on public.maria_fluxo_caixa_eventos (tipo_evento, direcao, status);

create index if not exists maria_fluxo_caixa_eventos_unidade_idx
  on public.maria_fluxo_caixa_eventos (unidade, data_operacional desc);

create index if not exists maria_fluxo_caixa_eventos_conta_pagar_idx
  on public.maria_fluxo_caixa_eventos (conta_pagar_id) where conta_pagar_id is not null;

alter table public.maria_fluxo_caixa_eventos enable row level security;

drop trigger if exists trg_maria_fluxo_caixa_eventos_set_updated_at on public.maria_fluxo_caixa_eventos;
create trigger trg_maria_fluxo_caixa_eventos_set_updated_at
  before update on public.maria_fluxo_caixa_eventos
  for each row execute function public.set_updated_at();

comment on table public.maria_fluxo_caixa_eventos is
  'Ledger da Maria observadora: eventos de fluxo de caixa observados no WhatsApp financeiro. Não representa baixa/pagamento executado pela Maria.';

create or replace function public.maria_fluxo_valor_para_centavos(p_valor numeric)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p_valor is null then null else round(p_valor * 100)::integer end;
$$;

create or replace function public.maria_fluxo_evento_registrar(
  p_data_operacional date,
  p_chat_id text,
  p_message_id text,
  p_tipo_evento text,
  p_direcao text,
  p_descricao text,
  p_valor numeric,
  p_unidade text default null,
  p_conta_origem text default null,
  p_status text default 'observado',
  p_evidencia_texto text default null,
  p_quoted_id text default null,
  p_media_ref text default null,
  p_conta_pagar_id uuid default null,
  p_raw_payload_sanitizado jsonb default null,
  p_observacoes text default null,
  p_ator_numero text default null,
  p_papel text default null,
  p_canal text default 'whatsapp-grupo-financeiro'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_numero text;
  v_valor_centavos integer;
  v_id uuid;
  v_row public.maria_fluxo_caixa_eventos%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_data_operacional is null then
    raise exception 'data_operacional obrigatoria.';
  end if;

  if nullif(trim(p_chat_id), '') is null then
    raise exception 'chat_id obrigatorio.';
  end if;

  if nullif(trim(p_message_id), '') is null then
    raise exception 'message_id obrigatorio para idempotencia.';
  end if;

  if nullif(trim(p_descricao), '') is null then
    raise exception 'descricao obrigatoria.';
  end if;

  v_numero := public.maria_normalizar_numero(p_ator_numero);
  v_valor_centavos := public.maria_fluxo_valor_para_centavos(p_valor);

  insert into public.maria_fluxo_caixa_eventos (
    data_operacional,
    chat_id,
    message_id,
    quoted_id,
    remetente_numero_hash,
    remetente_numero_last4,
    remetente_nome,
    tipo_evento,
    direcao,
    unidade,
    conta_origem,
    descricao,
    valor_centavos,
    status,
    evidencia_texto,
    media_ref,
    conta_pagar_id,
    raw_payload_sanitizado,
    observacoes
  ) values (
    p_data_operacional,
    trim(p_chat_id),
    trim(p_message_id),
    nullif(trim(p_quoted_id), ''),
    encode(extensions.digest(v_numero, 'sha256'), 'hex'),
    right(v_numero, 4),
    v_actor.nome,
    lower(trim(p_tipo_evento)),
    lower(trim(p_direcao)),
    nullif(lower(trim(p_unidade)), ''),
    nullif(trim(p_conta_origem), ''),
    trim(p_descricao),
    v_valor_centavos,
    coalesce(nullif(lower(trim(p_status)), ''), 'observado'),
    nullif(trim(p_evidencia_texto), ''),
    nullif(trim(p_media_ref), ''),
    p_conta_pagar_id,
    p_raw_payload_sanitizado,
    nullif(trim(p_observacoes), '')
  )
  on conflict (chat_id, message_id, tipo_evento, coalesce(descricao, ''), coalesce(valor_centavos, -1))
  do update set
    data_operacional = excluded.data_operacional,
    quoted_id = coalesce(excluded.quoted_id, public.maria_fluxo_caixa_eventos.quoted_id),
    remetente_numero_hash = excluded.remetente_numero_hash,
    remetente_numero_last4 = excluded.remetente_numero_last4,
    remetente_nome = excluded.remetente_nome,
    direcao = excluded.direcao,
    unidade = coalesce(excluded.unidade, public.maria_fluxo_caixa_eventos.unidade),
    conta_origem = coalesce(excluded.conta_origem, public.maria_fluxo_caixa_eventos.conta_origem),
    status = excluded.status,
    evidencia_texto = coalesce(excluded.evidencia_texto, public.maria_fluxo_caixa_eventos.evidencia_texto),
    media_ref = coalesce(excluded.media_ref, public.maria_fluxo_caixa_eventos.media_ref),
    conta_pagar_id = coalesce(excluded.conta_pagar_id, public.maria_fluxo_caixa_eventos.conta_pagar_id),
    raw_payload_sanitizado = coalesce(excluded.raw_payload_sanitizado, public.maria_fluxo_caixa_eventos.raw_payload_sanitizado),
    observacoes = coalesce(excluded.observacoes, public.maria_fluxo_caixa_eventos.observacoes),
    updated_at = now()
  returning id into v_id;

  select * into v_row from public.maria_fluxo_caixa_eventos where id = v_id;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    coalesce(nullif(trim(p_canal), ''), 'whatsapp-grupo-financeiro'),
    'maria_fluxo_caixa_eventos',
    'fluxo_caixa_evento',
    v_id,
    'registrar_evento_fluxo_caixa_observado',
    null,
    to_jsonb(v_row),
    p_observacoes,
    p_evidencia_texto
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'evento_id', v_id,
    'audit_id', v_audit_id,
    'data_operacional', v_row.data_operacional,
    'tipo_evento', v_row.tipo_evento,
    'direcao', v_row.direcao,
    'unidade', v_row.unidade,
    'descricao', v_row.descricao,
    'valor_centavos', v_row.valor_centavos,
    'valor', case when v_row.valor_centavos is null then null else (v_row.valor_centavos::numeric / 100) end,
    'status', v_row.status,
    'pagamento_executado_pela_maria', false,
    'baixa_executada_pela_maria', false
  );
end;
$$;

create or replace function public.maria_fluxo_eventos_dia(
  p_data_operacional date,
  p_chat_id text default null
)
returns table (
  id uuid,
  data_operacional date,
  created_at timestamptz,
  chat_id text,
  message_id text,
  tipo_evento text,
  direcao text,
  unidade text,
  conta_origem text,
  descricao text,
  valor_centavos integer,
  valor numeric,
  status text,
  remetente_nome text,
  evidencia_texto text,
  media_ref text,
  conta_pagar_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.data_operacional,
    e.created_at,
    e.chat_id,
    e.message_id,
    e.tipo_evento,
    e.direcao,
    e.unidade,
    e.conta_origem,
    e.descricao,
    e.valor_centavos,
    case when e.valor_centavos is null then null else e.valor_centavos::numeric / 100 end as valor,
    e.status,
    e.remetente_nome,
    e.evidencia_texto,
    e.media_ref,
    e.conta_pagar_id
  from public.maria_fluxo_caixa_eventos e
  where e.data_operacional = p_data_operacional
    and (p_chat_id is null or e.chat_id = p_chat_id)
  order by e.created_at asc, e.descricao asc;
$$;

create or replace function public.maria_fluxo_resumo_periodo(
  p_inicio date,
  p_fim date,
  p_chat_id text default null
)
returns table (
  data_operacional date,
  unidade text,
  direcao text,
  tipo_evento text,
  status text,
  quantidade bigint,
  total_centavos bigint,
  total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    e.data_operacional,
    coalesce(e.unidade, 'indefinida') as unidade,
    e.direcao,
    e.tipo_evento,
    e.status,
    count(*)::bigint as quantidade,
    coalesce(sum(e.valor_centavos), 0)::bigint as total_centavos,
    coalesce(sum(e.valor_centavos), 0)::numeric / 100 as total
  from public.maria_fluxo_caixa_eventos e
  where e.data_operacional between p_inicio and p_fim
    and (p_chat_id is null or e.chat_id = p_chat_id)
  group by e.data_operacional, coalesce(e.unidade, 'indefinida'), e.direcao, e.tipo_evento, e.status
  order by e.data_operacional, unidade, direcao, tipo_evento, status;
$$;

revoke all on table public.maria_fluxo_caixa_eventos from public, anon, authenticated;
revoke all on function public.maria_fluxo_valor_para_centavos(numeric) from public, anon, authenticated;
revoke all on function public.maria_fluxo_evento_registrar(
  date, text, text, text, text, text, numeric, text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text
) from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_fluxo_eventos_dia(date, text) from public, anon, authenticated;
revoke all on function public.maria_fluxo_resumo_periodo(date, date, text) from public, anon, authenticated;

grant execute on function public.maria_fluxo_valor_para_centavos(numeric) to maria_operacional, maria_leitura, service_role;
grant execute on function public.maria_fluxo_evento_registrar(
  date, text, text, text, text, text, numeric, text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text
) to maria_operacional, service_role;
grant execute on function public.maria_fluxo_eventos_dia(date, text) to maria_operacional, maria_leitura, service_role;
grant execute on function public.maria_fluxo_resumo_periodo(date, date, text) to maria_operacional, maria_leitura, service_role;

grant select on public.maria_fluxo_caixa_eventos to maria_operacional, maria_leitura, service_role;

comment on function public.maria_fluxo_evento_registrar(
  date, text, text, text, text, text, numeric, text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text
) is 'Maria observadora: registra evento de fluxo de caixa observado no WhatsApp. Não executa pagamento, baixa ou transferência.';

comment on function public.maria_fluxo_eventos_dia(date, text) is
  'Maria observadora: lista eventos de fluxo de caixa observados em um dia.';

comment on function public.maria_fluxo_resumo_periodo(date, date, text) is
  'Maria observadora: agrega eventos observados por período/unidade/direção/status.';
