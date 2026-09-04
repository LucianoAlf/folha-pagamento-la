-- Maria WhatsApp security model.
-- Owner path: existing Supabase service_role/admin only.
-- Non-owner paths: dedicated Postgres login roles with no direct table writes.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'maria_operacional') then
    create role maria_operacional login noinherit nocreatedb nocreaterole noreplication;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'maria_leitura') then
    create role maria_leitura login noinherit nocreatedb nocreaterole noreplication;
  end if;
end $$;

comment on role maria_operacional is
  'Maria WhatsApp operational-safe role: SELECT plus allowlisted SECURITY DEFINER RPCs only. Password must be set out-of-band.';
comment on role maria_leitura is
  'Maria WhatsApp read-only role: SELECT only. Password must be set out-of-band.';

create table if not exists public.maria_whatsapp_atores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  papel text not null check (papel in (
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe',
    'strategic_read_prepare'
  )),
  numero_hash text not null unique,
  numero_last4 text not null,
  ativo boolean not null default true,
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maria_whatsapp_atores enable row level security;

drop trigger if exists trg_maria_whatsapp_atores_set_updated_at on public.maria_whatsapp_atores;
create trigger trg_maria_whatsapp_atores_set_updated_at
  before update on public.maria_whatsapp_atores
  for each row execute function public.set_updated_at();

comment on table public.maria_whatsapp_atores is
  'Allowlist de remetentes WhatsApp da Maria. Numeros sao armazenados por hash; RPCs recebem o sender real e registram auditoria.';

insert into public.maria_whatsapp_atores (nome, papel, numero_hash, numero_last4, observacao)
values
  ('Luciano Alf', 'owner_full', '3b86142cfd8542351cd2e296e774a7e6453271e2a21219a1cacbafbf1d58e177', '8047', 'CEO / owner full'),
  ('Anne Susan', 'strategic_read_prepare', 'dcaf5032e04604f713ae1493de453478ce317dfb0fe13da90a1cb32809ed1736', '0296', 'Socia / leitura e preparo'),
  ('Rose', 'finance_ops_write_safe', 'cb9cfaac28563decb71cd00196b3c6fd6cb2c1b15660ae22eb0f9b96955a0f92', '0998', 'Gerente financeira / escrita operacional segura'),
  ('Ana', 'finance_assistant_write_safe', '2beefc8e9b191c440dc08c88e10f24b4df7647748d4f00272d762fbdafa5a84d', '0990', 'Assistente financeira / escrita operacional segura')
on conflict (numero_hash) do update
set nome = excluded.nome,
    papel = excluded.papel,
    numero_last4 = excluded.numero_last4,
    observacao = excluded.observacao,
    ativo = true,
    updated_at = now();

create table if not exists public.maria_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ator_nome text not null,
  ator_numero text not null,
  ator_numero_hash text not null,
  ator_numero_last4 text not null,
  papel text not null,
  origem text not null default 'whatsapp',
  canal text null,
  invoker_role text null,
  tabela text not null,
  entidade_tipo text not null,
  entidade_id uuid null,
  operacao text not null,
  antes jsonb null,
  depois jsonb null,
  motivo text null,
  texto_original text null
);

create index if not exists maria_audit_log_created_at_idx
  on public.maria_audit_log (created_at desc);

create index if not exists maria_audit_log_entidade_idx
  on public.maria_audit_log (tabela, entidade_id, created_at desc);

create index if not exists maria_audit_log_ator_idx
  on public.maria_audit_log (ator_numero_hash, created_at desc);

alter table public.maria_audit_log enable row level security;

comment on table public.maria_audit_log is
  'Audit log de mutacoes solicitadas pela Maria via WhatsApp: sender, papel, canal, antes/depois e texto original.';

create or replace function public.maria_normalizar_numero(p_numero text)
returns text
language sql
stable
set search_path = public
as $$
  select regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
$$;

create or replace function public.maria_invoker_role()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );
$$;

create or replace function public.maria_assert_actor(
  p_ator_numero text,
  p_papel text,
  p_allowed_papeis text[]
)
returns public.maria_whatsapp_atores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text;
  v_hash text;
  v_actor public.maria_whatsapp_atores%rowtype;
begin
  v_numero := public.maria_normalizar_numero(p_ator_numero);
  if v_numero = '' then
    raise exception 'sender ausente.' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(v_numero, 'sha256'), 'hex');

  select *
    into v_actor
    from public.maria_whatsapp_atores
   where numero_hash = v_hash
     and ativo = true;

  if not found then
    raise exception 'sender nao autorizado para a Maria.' using errcode = '42501';
  end if;

  if v_actor.papel <> p_papel then
    raise exception 'papel informado nao confere com o sender.' using errcode = '42501';
  end if;

  if not (v_actor.papel = any(p_allowed_papeis)) then
    raise exception 'papel nao autorizado para esta operacao.' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function public.maria_audit_insert(
  p_actor public.maria_whatsapp_atores,
  p_ator_numero text,
  p_canal text,
  p_tabela text,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_operacao text,
  p_antes jsonb,
  p_depois jsonb,
  p_motivo text,
  p_texto_original text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
  v_numero text;
begin
  v_numero := public.maria_normalizar_numero(p_ator_numero);

  insert into public.maria_audit_log (
    ator_nome,
    ator_numero,
    ator_numero_hash,
    ator_numero_last4,
    papel,
    origem,
    canal,
    invoker_role,
    tabela,
    entidade_tipo,
    entidade_id,
    operacao,
    antes,
    depois,
    motivo,
    texto_original
  )
  values (
    p_actor.nome,
    v_numero,
    p_actor.numero_hash,
    p_actor.numero_last4,
    p_actor.papel,
    'whatsapp',
    nullif(p_canal, ''),
    public.maria_invoker_role(),
    p_tabela,
    p_entidade_tipo,
    p_entidade_id,
    p_operacao,
    p_antes,
    p_depois,
    nullif(p_motivo, ''),
    nullif(p_texto_original, '')
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public.maria_contas_corrigir_valor(
  p_conta_id uuid,
  p_valor numeric,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_valor is null or p_valor <= 0 or p_valor > 9999999.99 then
    raise exception 'valor fora da faixa operacional permitida.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set valor = round(p_valor, 2),
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'corrigir_valor', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_alterar_vencimento(
  p_conta_id uuid,
  p_data_vencimento date,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_data_vencimento is null or p_data_vencimento < date '2000-01-01' or p_data_vencimento > date '2100-12-31' then
    raise exception 'data de vencimento fora da faixa operacional permitida.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set data_vencimento = p_data_vencimento,
         competencia = date_trunc('month', p_data_vencimento)::date,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'alterar_vencimento', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_atualizar_status(
  p_conta_id uuid,
  p_status text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_status not in ('pendente', 'pago', 'cancelado', 'finalizado') then
    raise exception 'status operacional nao permitido.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set status = p_status,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'atualizar_status', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_registrar_observacao(
  p_conta_id uuid,
  p_observacoes text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if p_observacoes is null or length(p_observacoes) > 5000 then
    raise exception 'observacao ausente ou maior que o limite operacional.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set observacoes = p_observacoes,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'registrar_observacao', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_definir_plano_conta(
  p_conta_id uuid,
  p_plano_conta_id uuid,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if not exists (
    select 1 from public.plano_contas
     where id = p_plano_conta_id
       and ativo = true
       and natureza = 'saida'
       and nivel = 3
  ) then
    raise exception 'plano_conta_id nao e uma folha de saida ativa.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set plano_conta_id = p_plano_conta_id,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'definir_plano_conta', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_definir_centro_custo(
  p_conta_id uuid,
  p_centro_custo_id uuid,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_centro public.centros_custo%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  select * into v_centro
    from public.centros_custo
   where id = p_centro_custo_id
     and ativo = true
     and tipo = 'unidade';

  if not found then
    raise exception 'centro_custo_id nao e uma unidade ativa.';
  end if;

  select * into v_before from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set centro_custo_id = p_centro_custo_id,
         unidade = v_centro.codigo,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar', 'conta_pagar', p_conta_id,
    'definir_centro_custo', to_jsonb(v_before), to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'conta', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_codigo_mes_registrar(
  p_conta_pagar_id uuid,
  p_competencia date,
  p_codigo_barras text,
  p_chave_pix text,
  p_qr_pix_payload text,
  p_valor_coletado numeric,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_competencia date;
  v_before public.contas_pagar_codigo_mes%rowtype;
  v_after public.contas_pagar_codigo_mes%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if not exists (select 1 from public.contas_pagar where id = p_conta_pagar_id) then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  if coalesce(nullif(trim(p_codigo_barras), ''), nullif(trim(p_chave_pix), ''), nullif(trim(p_qr_pix_payload), '')) is null then
    raise exception 'informe codigo de barras, chave pix ou payload pix.';
  end if;

  if p_valor_coletado is not null and (p_valor_coletado <= 0 or p_valor_coletado > 9999999.99) then
    raise exception 'valor coletado fora da faixa operacional permitida.';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  select * into v_before
    from public.contas_pagar_codigo_mes
   where conta_pagar_id = p_conta_pagar_id
     and competencia = v_competencia
   for update;

  insert into public.contas_pagar_codigo_mes (
    conta_pagar_id,
    competencia,
    codigo_barras,
    chave_pix,
    qr_pix_payload,
    valor_coletado,
    coletado_em,
    coletado_por,
    status_coleta
  )
  values (
    p_conta_pagar_id,
    v_competencia,
    nullif(trim(p_codigo_barras), ''),
    nullif(trim(p_chave_pix), ''),
    nullif(trim(p_qr_pix_payload), ''),
    p_valor_coletado,
    now(),
    v_actor.nome,
    'coletado'
  )
  on conflict (conta_pagar_id, competencia) do update
    set codigo_barras = excluded.codigo_barras,
        chave_pix = excluded.chave_pix,
        qr_pix_payload = excluded.qr_pix_payload,
        valor_coletado = excluded.valor_coletado,
        coletado_em = excluded.coletado_em,
        coletado_por = excluded.coletado_por,
        status_coleta = excluded.status_coleta,
        updated_at = now()
  returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar_codigo_mes', 'codigo_mes', v_after.id,
    'registrar_codigo_mes', case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'codigo_mes', to_jsonb(v_after));
end;
$$;

create or replace function public.maria_contas_codigo_mes_marcar_indisponivel(
  p_conta_pagar_id uuid,
  p_competencia date,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_competencia date;
  v_before public.contas_pagar_codigo_mes%rowtype;
  v_after public.contas_pagar_codigo_mes%rowtype;
  v_audit_id uuid;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if not exists (select 1 from public.contas_pagar where id = p_conta_pagar_id) then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  select * into v_before
    from public.contas_pagar_codigo_mes
   where conta_pagar_id = p_conta_pagar_id
     and competencia = v_competencia
   for update;

  insert into public.contas_pagar_codigo_mes (
    conta_pagar_id,
    competencia,
    coletado_em,
    coletado_por,
    status_coleta
  )
  values (
    p_conta_pagar_id,
    v_competencia,
    now(),
    v_actor.nome,
    'indisponivel'
  )
  on conflict (conta_pagar_id, competencia) do update
    set coletado_em = excluded.coletado_em,
        coletado_por = excluded.coletado_por,
        status_coleta = excluded.status_coleta,
        updated_at = now()
  returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, p_canal, 'contas_pagar_codigo_mes', 'codigo_mes', v_after.id,
    'marcar_codigo_mes_indisponivel', case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object('success', true, 'audit_id', v_audit_id, 'codigo_mes', to_jsonb(v_after));
end;
$$;

grant usage on schema public to maria_operacional, maria_leitura;

grant select on
  public.contas_pagar,
  public.contas_pagar_codigo_mes,
  public.contas_pagar_relatorio_dia,
  public.contas_credenciais,
  public.plano_contas,
  public.centros_custo,
  public.whatsapp_destinos,
  public.whatsapp_grupo_notificacoes
to maria_operacional, maria_leitura;

revoke insert, update, delete, truncate, references, trigger on
  public.contas_pagar,
  public.contas_pagar_codigo_mes,
  public.contas_pagar_relatorio_dia,
  public.contas_credenciais,
  public.plano_contas,
  public.centros_custo,
  public.whatsapp_destinos,
  public.whatsapp_grupo_notificacoes,
  public.maria_whatsapp_atores,
  public.maria_audit_log
from maria_operacional, maria_leitura;

revoke all on public.maria_whatsapp_atores from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on public.maria_audit_log from public, anon, authenticated, maria_operacional, maria_leitura;

do $$
declare
  t text;
begin
  foreach t in array array[
    'contas_pagar',
    'contas_pagar_codigo_mes',
    'contas_pagar_relatorio_dia',
    'contas_credenciais',
    'plano_contas',
    'centros_custo',
    'whatsapp_destinos',
    'whatsapp_grupo_notificacoes'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'maria_select_' || t
    ) then
      execute format(
        'create policy %I on public.%I for select to maria_operacional, maria_leitura using (true)',
        'maria_select_' || t,
        t
      );
    end if;
  end loop;
end $$;

revoke all on function public.maria_normalizar_numero(text) from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on function public.maria_invoker_role() from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on function public.maria_assert_actor(text, text, text[]) from public, anon, authenticated, maria_operacional, maria_leitura;
revoke all on function public.maria_audit_insert(public.maria_whatsapp_atores, text, text, text, text, uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated, maria_operacional, maria_leitura;

revoke all on function public.maria_contas_corrigir_valor(uuid, numeric, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_alterar_vencimento(uuid, date, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_atualizar_status(uuid, text, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_registrar_observacao(uuid, text, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_definir_plano_conta(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_definir_centro_custo(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_codigo_mes_registrar(uuid, date, text, text, text, numeric, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_codigo_mes_marcar_indisponivel(uuid, date, text, text, text, text, text)
  from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_contas_corrigir_valor(uuid, numeric, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_alterar_vencimento(uuid, date, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_atualizar_status(uuid, text, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_registrar_observacao(uuid, text, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_definir_plano_conta(uuid, uuid, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_definir_centro_custo(uuid, uuid, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_codigo_mes_registrar(uuid, date, text, text, text, numeric, text, text, text, text, text)
  to maria_operacional, service_role;
grant execute on function public.maria_contas_codigo_mes_marcar_indisponivel(uuid, date, text, text, text, text, text)
  to maria_operacional, service_role;

comment on function public.maria_contas_corrigir_valor(uuid, numeric, text, text, text, text, text)
  is 'Maria operational RPC: corrige somente o valor de uma conta_pagar, com validacao e audit log.';
comment on function public.maria_contas_alterar_vencimento(uuid, date, text, text, text, text, text)
  is 'Maria operational RPC: altera somente vencimento/competencia de uma conta_pagar, com audit log.';
comment on function public.maria_contas_atualizar_status(uuid, text, text, text, text, text, text)
  is 'Maria operational RPC: atualiza somente status operacional permitido, sem mover dinheiro.';
comment on function public.maria_contas_registrar_observacao(uuid, text, text, text, text, text, text)
  is 'Maria operational RPC: substitui observacoes de uma conta_pagar, com audit log.';
comment on function public.maria_contas_definir_plano_conta(uuid, uuid, text, text, text, text, text)
  is 'Maria operational RPC: define plano_conta_id validando folha ativa de saida.';
comment on function public.maria_contas_definir_centro_custo(uuid, uuid, text, text, text, text, text)
  is 'Maria operational RPC: define centro_custo_id validando unidade ativa e sincroniza unidade.';
comment on function public.maria_contas_codigo_mes_registrar(uuid, date, text, text, text, numeric, text, text, text, text, text)
  is 'Maria operational RPC: registra codigo de pagamento mensal sem executar pagamento.';
comment on function public.maria_contas_codigo_mes_marcar_indisponivel(uuid, date, text, text, text, text, text)
  is 'Maria operational RPC: marca codigo mensal como indisponivel.';
