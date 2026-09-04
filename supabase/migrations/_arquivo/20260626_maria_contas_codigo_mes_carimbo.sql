-- Carimbo operacional visivel para documentos registrados pela Maria.
-- Nao executa pagamento e nao expoe codigo bruto nas RPCs da Maria.

alter table public.contas_pagar_codigo_mes
  add column if not exists registrado_por_agente boolean not null default false,
  add column if not exists agente_nome text null,
  add column if not exists agente_actor text null,
  add column if not exists confirmado_por_nome text null,
  add column if not exists confirmado_por_actor text null,
  add column if not exists canal_origem text null,
  add column if not exists mensagem_origem_id text null,
  add column if not exists registrado_via text null,
  add column if not exists registrado_em timestamptz null,
  add column if not exists observacao_operacional text null;

create index if not exists contas_pagar_codigo_mes_agente_idx
  on public.contas_pagar_codigo_mes (registrado_por_agente, registrado_em desc)
  where registrado_por_agente = true;

comment on column public.contas_pagar_codigo_mes.registrado_por_agente is
  'Marca operacional visivel: documento registrado/preparado por agente (Maria), sem executar pagamento.';
comment on column public.contas_pagar_codigo_mes.observacao_operacional is
  'Observacao curta e sanitizada para tela operacional; nao armazenar codigo bruto neste campo.';

create or replace function public.maria_contas_observacao_sanitizada(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    left(
      btrim(
        regexp_replace(
          regexp_replace(coalesce(p_texto, ''), '[0-9]{12,}', '[codigo]', 'g'),
          '\s+',
          ' ',
          'g'
        )
      ),
      280
    ),
    ''
  );
$$;

revoke all on function public.maria_contas_observacao_sanitizada(text)
  from public, anon, authenticated, maria_operacional, maria_leitura;

drop function if exists public.maria_contas_codigo_mes_registrar(
  uuid, date, text, text, text, numeric, text, text, text, text, text
);

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
  p_motivo text default null,
  p_agente_nome text default 'Maria',
  p_confirmado_por_nome text default null,
  p_mensagem_origem_id text default null,
  p_canal_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_conta public.contas_pagar%rowtype;
  v_competencia date;
  v_before public.contas_pagar_codigo_mes%rowtype;
  v_after public.contas_pagar_codigo_mes%rowtype;
  v_audit_id uuid;
  v_confirmado_por_nome text;
  v_confirmado_por_actor text;
  v_canal_origem text;
  v_observacao text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  select * into v_conta
    from public.contas_pagar
   where id = p_conta_pagar_id;

  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  if coalesce(nullif(trim(p_codigo_barras), ''), nullif(trim(p_chave_pix), ''), nullif(trim(p_qr_pix_payload), '')) is null then
    raise exception 'informe codigo de barras, chave pix ou payload pix.';
  end if;

  if p_valor_coletado is not null and (p_valor_coletado <= 0 or p_valor_coletado > 9999999.99) then
    raise exception 'valor coletado fora da faixa operacional permitida.';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;
  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_confirmado_por_actor := public.maria_normalizar_numero(p_ator_numero);
  v_canal_origem := coalesce(nullif(trim(p_canal_origem), ''), nullif(trim(p_canal), ''), 'whatsapp');
  v_observacao := coalesce(
    public.maria_contas_observacao_sanitizada(p_motivo),
    'Documento registrado pela Maria apos confirmacao humana.'
  );

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
    status_coleta,
    registrado_por_agente,
    agente_nome,
    agente_actor,
    confirmado_por_nome,
    confirmado_por_actor,
    canal_origem,
    mensagem_origem_id,
    registrado_via,
    registrado_em,
    observacao_operacional
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
    'coletado',
    true,
    coalesce(nullif(trim(p_agente_nome), ''), 'Maria'),
    v_confirmado_por_actor,
    v_confirmado_por_nome,
    v_confirmado_por_actor,
    v_canal_origem,
    nullif(trim(p_mensagem_origem_id), ''),
    'maria_contas_codigo_mes_registrar',
    now(),
    v_observacao
  )
  on conflict (conta_pagar_id, competencia) do update
    set codigo_barras = excluded.codigo_barras,
        chave_pix = excluded.chave_pix,
        qr_pix_payload = excluded.qr_pix_payload,
        valor_coletado = excluded.valor_coletado,
        coletado_em = excluded.coletado_em,
        coletado_por = excluded.coletado_por,
        status_coleta = excluded.status_coleta,
        registrado_por_agente = excluded.registrado_por_agente,
        agente_nome = excluded.agente_nome,
        agente_actor = excluded.agente_actor,
        confirmado_por_nome = excluded.confirmado_por_nome,
        confirmado_por_actor = excluded.confirmado_por_actor,
        canal_origem = excluded.canal_origem,
        mensagem_origem_id = excluded.mensagem_origem_id,
        registrado_via = excluded.registrado_via,
        registrado_em = excluded.registrado_em,
        observacao_operacional = excluded.observacao_operacional,
        updated_at = now()
  returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor, p_ator_numero, v_canal_origem, 'contas_pagar_codigo_mes', 'codigo_mes', v_after.id,
    'registrar_codigo_mes', case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after), p_motivo, p_texto_original
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'audit_id', v_audit_id,
    'conta_id', v_conta.id,
    'descricao', v_conta.descricao,
    'competencia', v_competencia,
    'valor', v_conta.valor,
    'valor_coletado', p_valor_coletado,
    'vencimento', v_conta.data_vencimento,
    'registrado_por', v_after.agente_nome,
    'confirmado_por', v_after.confirmado_por_nome,
    'canal', v_after.canal_origem,
    'documento_status', 'registrado'
  );
end;
$$;

create or replace function public.maria_contas_documento_status(
  p_conta_id uuid,
  p_competencia date
)
returns table (
  conta_id uuid,
  competencia date,
  tem_documento_registrado boolean,
  tipo_documento_registrado text,
  registrado_por_agente boolean,
  agente_nome text,
  confirmado_por_nome text,
  registrado_em timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p_conta_id as conta_id,
    date_trunc('month', p_competencia)::date as competencia,
    coalesce(
      nullif(btrim(c.codigo_barras), '') is not null
      or nullif(btrim(c.chave_pix), '') is not null
      or nullif(btrim(c.qr_pix_payload), '') is not null
      or c.status_coleta = 'coletado',
      false
    ) as tem_documento_registrado,
    case
      when c.id is null then null
      when (nullif(btrim(c.codigo_barras), '') is not null)
        and (nullif(btrim(c.chave_pix), '') is not null or nullif(btrim(c.qr_pix_payload), '') is not null)
        then 'ambos'
      when nullif(btrim(c.codigo_barras), '') is not null then 'boleto'
      when nullif(btrim(c.chave_pix), '') is not null or nullif(btrim(c.qr_pix_payload), '') is not null then 'pix'
      when c.status_coleta = 'coletado' then 'desconhecido'
      else null
    end as tipo_documento_registrado,
    coalesce(c.registrado_por_agente, false) as registrado_por_agente,
    c.agente_nome,
    c.confirmado_por_nome,
    c.registrado_em
  from (select 1) seed
  left join public.contas_pagar_codigo_mes c
    on c.conta_pagar_id = p_conta_id
   and c.competencia = date_trunc('month', p_competencia)::date;
$$;

revoke all on function public.maria_contas_codigo_mes_registrar(
  uuid, date, text, text, text, numeric, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, maria_leitura;
revoke all on function public.maria_contas_documento_status(uuid, date)
  from public, anon, authenticated;

grant execute on function public.maria_contas_codigo_mes_registrar(
  uuid, date, text, text, text, numeric, text, text, text, text, text, text, text, text, text
) to maria_operacional, service_role;
grant execute on function public.maria_contas_documento_status(uuid, date)
  to maria_operacional, maria_leitura, service_role;

-- A Maria deve consultar status sanitizado via RPC, nao a tabela sensivel.
revoke select on public.contas_pagar_codigo_mes from maria_operacional, maria_leitura;

comment on function public.maria_contas_codigo_mes_registrar(
  uuid, date, text, text, text, numeric, text, text, text, text, text, text, text, text, text
) is 'Maria operational RPC: registra documento mensal com carimbo operacional visivel e retorno sanitizado. Nao retorna codigo bruto nem executa pagamento.';
comment on function public.maria_contas_documento_status(uuid, date)
  is 'Maria read RPC: retorna somente status sanitizado de documento mensal, sem codigo bruto.';
