create or replace function public.maria_codigo_barras_texto_valido(p_text text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_linha text;
  v_codigo text;
  v_digitos text;
  v_tem_linha boolean := false;
begin
  if nullif(trim(p_text), '') is null then
    return true;
  end if;

  for v_linha in
    select trim(value)
      from regexp_split_to_table(p_text, E'\r?\n') as value
  loop
    if v_linha = '' then
      continue;
    end if;

    v_tem_linha := true;
    v_codigo := trim(regexp_replace(v_linha, '\s+[-–—]\s+.*$', ''));

    if v_codigo !~ '^[0-9 .-]+$' then
      return false;
    end if;

    v_digitos := regexp_replace(v_codigo, '\D', '', 'g');
    if length(v_digitos) not in (44, 47, 48) then
      return false;
    end if;
  end loop;

  return v_tem_linha;
end;
$function$;

alter table public.contas_pagar_codigo_mes
  add constraint contas_pagar_codigo_mes_codigo_barras_formato_check
  check (public.maria_codigo_barras_texto_valido(codigo_barras))
  not valid;

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
  p_texto_original text default null::text,
  p_motivo text default null::text,
  p_agente_nome text default 'Maria'::text,
  p_confirmado_por_nome text default null::text,
  p_mensagem_origem_id text default null::text,
  p_canal_origem text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_codigo_barras text;
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

  v_codigo_barras := nullif(trim(p_codigo_barras), '');

  if v_codigo_barras is not null then
    if not public.maria_codigo_barras_texto_valido(v_codigo_barras) then
      raise exception 'codigo de barras invalido. Informe apenas linha digitavel/codigo de barras, sem texto livre.';
    end if;
  end if;

  if coalesce(v_codigo_barras, nullif(trim(p_chave_pix), ''), nullif(trim(p_qr_pix_payload), '')) is null then
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
    v_codigo_barras,
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
    'status_coleta', 'COLETADO',
    'registrado_por', v_after.agente_nome,
    'confirmado_por', v_after.confirmado_por_nome,
    'canal', v_after.canal_origem
  );
end;
$function$;
