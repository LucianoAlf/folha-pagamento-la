-- Maria: cancelamento auditado e criacao de parcelamento real.
-- Nao executa pagamento, nao apaga evidencias e nao altera fluxos de folha/cartao.

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
  v_status text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_status := lower(nullif(trim(p_status), ''));
  if v_status not in ('pendente', 'pago', 'finalizado') then
    raise exception 'status operacional nao permitido. Para cancelar, use maria_contas_cancelar.';
  end if;

  select * into v_before
    from public.contas_pagar
   where id = p_conta_id
   for update;

  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;

  update public.contas_pagar
     set status = v_status,
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    p_canal,
    'contas_pagar',
    'conta_pagar',
    p_conta_id,
    'atualizar_status',
    to_jsonb(v_before),
    to_jsonb(v_after),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'conta', to_jsonb(v_after)
  );
end;
$$;

create or replace function public.maria_contas_cancelar(
  p_conta_id uuid,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_motivo text,
  p_texto_original text default null,
  p_mensagem_origem_id text default null
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
  v_empresa public.financeiro_empresas%rowtype;
  v_motivo text;
  v_canal text;
  v_cancelado_em timestamptz;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_motivo := public.maria_contas_observacao_sanitizada(p_motivo);
  if v_motivo is null then
    raise exception 'motivo obrigatorio para cancelar conta.';
  end if;

  select * into v_before
    from public.contas_pagar
   where id = p_conta_id
   for update;

  if not found then
    raise exception 'conta_pagar nao encontrada para cancelamento.';
  end if;

  if v_before.status = 'pago' then
    raise exception 'conta ja paga nao pode ser cancelada.';
  end if;

  if v_before.status = 'cancelado' then
    raise exception 'conta ja estava cancelada.';
  end if;

  v_cancelado_em := now();
  v_canal := coalesce(nullif(trim(p_canal), ''), 'whatsapp');

  update public.contas_pagar
     set status = 'cancelado',
         observacoes = nullif(concat_ws(E'\n',
           nullif(v_before.observacoes, ''),
           concat(
             'Conta cancelada pela Maria apos confirmacao de ',
             v_actor.nome,
             ' em ',
             to_char(v_cancelado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
             '. Motivo: ',
             v_motivo,
             '.'
           )
         ), ''),
         updated_at = now()
   where id = p_conta_id
   returning * into v_after;

  select * into v_centro
    from public.centros_custo
   where id = v_after.centro_custo_id;

  select * into v_empresa
    from public.financeiro_empresas
   where id = v_after.empresa_id;

  perform public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal,
    'contas_pagar',
    'conta_pagar',
    p_conta_id,
    'cancelar_conta_pagar',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'success', true,
    'descricao', v_after.descricao,
    'valor', v_after.valor,
    'unidade', coalesce(v_centro.codigo, v_after.unidade),
    'centro', v_centro.nome,
    'empresa', coalesce(v_empresa.label_operacional, v_empresa.nome_fantasia, v_empresa.razao_social),
    'status_anterior', v_before.status,
    'status_novo', v_after.status,
    'motivo', v_motivo,
    'cancelado_por', v_actor.nome,
    'cancelado_em', v_cancelado_em,
    'mensagem_origem_registrada', nullif(trim(p_mensagem_origem_id), '') is not null,
    'pagamento_executado_pela_maria', false
  );
end;
$$;

create or replace function public.maria_contas_parcelada_criar(
  p_descricao text,
  p_valor_parcela numeric,
  p_valor_total numeric,
  p_quantidade_parcelas integer,
  p_primeira_data_vencimento date,
  p_plano_conta_id uuid,
  p_centro_custo_id uuid,
  p_conta_pagadora_id uuid,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null,
  p_mensagem_origem_id text default null,
  p_observacoes text default null,
  p_periodicidade text default 'mensal',
  p_confirmar_duplicidade boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_plano public.plano_contas%rowtype;
  v_centro public.centros_custo%rowtype;
  v_conta_pagadora public.financeiro_contas_bancarias%rowtype;
  v_empresa public.financeiro_empresas%rowtype;
  v_after public.contas_pagar%rowtype;
  v_duplicate record;
  v_parcelamento_id uuid;
  v_descricao_norm text;
  v_confirmado_por text;
  v_canal text;
  v_obs text;
  v_month_start date;
  v_due date;
  v_last_due date;
  v_anchor_day integer;
  v_days_in_month integer;
  v_i integer;
  v_parcela_centavos bigint;
  v_ultima_centavos bigint;
  v_total_centavos bigint;
  v_valor_centavos integer;
  v_valor numeric;
  v_parcelas_audit jsonb := '[]'::jsonb;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if nullif(trim(p_descricao), '') is null then
    raise exception 'descricao obrigatoria para conta parcelada.';
  end if;

  if p_quantidade_parcelas is null then
    raise exception 'quantidade_parcelas obrigatoria para conta parcelada.';
  end if;

  if p_quantidade_parcelas <= 1 or p_quantidade_parcelas > 120 then
    raise exception 'quantidade_parcelas deve ser maior que 1 e no maximo 120.';
  end if;

  if p_primeira_data_vencimento is null then
    raise exception 'primeira_data_vencimento obrigatoria para conta parcelada.';
  end if;

  if lower(coalesce(nullif(trim(p_periodicidade), ''), 'mensal')) <> 'mensal' then
    raise exception 'periodicidade permitida nesta fatia: mensal.';
  end if;

  if (p_valor_parcela is null) = (p_valor_total is null) then
    raise exception 'informe exatamente um modo de valor: valor_parcela ou valor_total.';
  end if;

  if p_plano_conta_id is null then
    raise exception 'plano_conta_id obrigatorio para conta parcelada.';
  end if;

  if p_centro_custo_id is null then
    raise exception 'centro_custo_id obrigatorio para conta parcelada.';
  end if;

  if p_conta_pagadora_id is null then
    raise exception 'conta_pagadora_id obrigatoria para conta parcelada.';
  end if;

  select * into v_plano
    from public.plano_contas
   where id = p_plano_conta_id
     and ativo = true
     and natureza = 'saida'
     and nivel = 3;

  if not found then
    raise exception 'plano_conta_id nao e uma folha de saida ativa.';
  end if;

  select * into v_centro
    from public.centros_custo
   where id = p_centro_custo_id
     and ativo = true
     and tipo = 'unidade';

  if not found then
    raise exception 'centro_custo_id nao e uma unidade ativa.';
  end if;

  select * into v_conta_pagadora
    from public.financeiro_contas_bancarias
   where id = p_conta_pagadora_id
     and ativo = true;

  if not found then
    raise exception 'conta_pagadora_id nao encontrada ou inativa.';
  end if;

  select * into v_empresa
    from public.financeiro_empresas
   where id = v_conta_pagadora.empresa_id
     and ativo = true;

  if not found then
    raise exception 'empresa da conta pagadora nao encontrada ou inativa.';
  end if;

  if v_empresa.unidade_id <> p_centro_custo_id then
    raise exception 'centro_custo_id nao corresponde a unidade da conta pagadora.';
  end if;

  if p_valor_total is not null then
    v_valor_centavos := public.maria_fluxo_valor_para_centavos(p_valor_total);
    if v_valor_centavos is null or v_valor_centavos <= 0 or v_valor_centavos > 999999999 then
      raise exception 'valor_total fora da faixa operacional permitida.';
    end if;
    v_total_centavos := v_valor_centavos;
    v_parcela_centavos := public.maria_fluxo_valor_para_centavos(
      round(p_valor_total / p_quantidade_parcelas, 2)
    );
    v_ultima_centavos := v_total_centavos - ((p_quantidade_parcelas - 1) * v_parcela_centavos);
  else
    v_valor_centavos := public.maria_fluxo_valor_para_centavos(p_valor_parcela);
    if v_valor_centavos is null or v_valor_centavos <= 0 or v_valor_centavos > 999999999 then
      raise exception 'valor_parcela fora da faixa operacional permitida.';
    end if;
    v_parcela_centavos := v_valor_centavos;
    v_ultima_centavos := v_parcela_centavos;
    v_total_centavos := v_parcela_centavos * p_quantidade_parcelas;
  end if;

  if v_parcela_centavos <= 0 or v_ultima_centavos <= 0 or v_total_centavos > 999999999 then
    raise exception 'valores das parcelas fora da faixa operacional permitida.';
  end if;

  v_descricao_norm := public.maria_cartoes_normalizar_texto(trim(p_descricao));
  select c.descricao, c.data_vencimento
    into v_duplicate
    from public.contas_pagar c
   where c.plano_conta_id = p_plano_conta_id
     and c.centro_custo_id = p_centro_custo_id
     and c.parcelamento_id is not null
     and c.status not in ('cancelado', 'finalizado')
     and c.data_vencimento between p_primeira_data_vencimento - 3 and p_primeira_data_vencimento + 3
     and position(v_descricao_norm in public.maria_cartoes_normalizar_texto(c.descricao)) = 1
   order by c.data_vencimento, c.created_at
   limit 1;

  if found and not coalesce(p_confirmar_duplicidade, false) then
    raise exception 'possivel parcelamento duplicado: "%" com vencimento em %. Confirme explicitamente para continuar.',
      v_duplicate.descricao,
      to_char(v_duplicate.data_vencimento, 'DD/MM/YYYY');
  end if;

  v_parcelamento_id := gen_random_uuid();
  v_confirmado_por := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal := coalesce(nullif(trim(p_canal), ''), 'whatsapp');
  v_obs := concat_ws(E'\n',
    public.maria_contas_observacao_sanitizada(p_observacoes),
    concat(
      'Conta parcelada registrada pela Maria apos confirmacao de ',
      v_confirmado_por,
      ' em ',
      to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      '. Sem pagamento real executado pela Maria.'
    ),
    public.maria_contas_observacao_sanitizada(p_motivo)
  );
  v_anchor_day := extract(day from p_primeira_data_vencimento)::integer;

  for v_i in 1..p_quantidade_parcelas loop
    v_month_start := (date_trunc('month', p_primeira_data_vencimento)::date + ((v_i - 1) * interval '1 month'))::date;
    v_days_in_month := extract(day from (date_trunc('month', v_month_start) + interval '1 month - 1 day'))::integer;
    v_due := make_date(
      extract(year from v_month_start)::integer,
      extract(month from v_month_start)::integer,
      least(v_anchor_day, v_days_in_month)
    );
    v_last_due := v_due;
    v_valor := (case when v_i = p_quantidade_parcelas then v_ultima_centavos else v_parcela_centavos end)::numeric / 100;

    insert into public.contas_pagar (
      descricao,
      unidade,
      valor,
      data_lancamento,
      data_vencimento,
      competencia,
      status,
      data_pagamento,
      metodo_pagamento,
      tipo_lancamento,
      parcelamento_id,
      parcela_atual,
      total_parcelas,
      observacoes,
      fonte_tipo,
      plano_conta_id,
      centro_custo_id,
      empresa_id,
      conta_pagadora_id
    ) values (
      concat(trim(p_descricao), ' (', v_i, '/', p_quantidade_parcelas, ')'),
      v_centro.codigo,
      v_valor,
      (now() at time zone 'America/Sao_Paulo')::date,
      v_due,
      date_trunc('month', v_due)::date,
      'pendente',
      null,
      null,
      'parcelada',
      v_parcelamento_id,
      v_i,
      p_quantidade_parcelas,
      nullif(v_obs, ''),
      'whatsapp',
      p_plano_conta_id,
      p_centro_custo_id,
      v_conta_pagadora.empresa_id,
      p_conta_pagadora_id
    )
    returning * into v_after;

    v_parcelas_audit := v_parcelas_audit || jsonb_build_array(jsonb_build_object(
      'id', v_after.id,
      'parcela_atual', v_after.parcela_atual,
      'total_parcelas', v_after.total_parcelas,
      'valor', v_after.valor,
      'data_vencimento', v_after.data_vencimento
    ));
  end loop;

  perform public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal,
    'contas_pagar',
    'parcelamento_conta_pagar',
    v_parcelamento_id,
    'criar_conta_pagar_parcelada',
    null,
    jsonb_build_object(
      'parcelamento_id', v_parcelamento_id,
      'descricao', trim(p_descricao),
      'quantidade_parcelas', p_quantidade_parcelas,
      'valor_total', v_total_centavos::numeric / 100,
      'parcelas', v_parcelas_audit,
      'mensagem_origem_id', nullif(trim(p_mensagem_origem_id), '')
    ),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'success', true,
    'descricao', trim(p_descricao),
    'quantidade_parcelas', p_quantidade_parcelas,
    'valor_parcela', v_parcela_centavos::numeric / 100,
    'valor_ultima_parcela', case
      when v_ultima_centavos <> v_parcela_centavos then v_ultima_centavos::numeric / 100
      else null
    end,
    'primeiro_vencimento', p_primeira_data_vencimento,
    'ultimo_vencimento', v_last_due,
    'valor_total', v_total_centavos::numeric / 100,
    'plano', concat_ws(' ', v_plano.codigo, v_plano.nome),
    'centro', v_centro.nome,
    'empresa', coalesce(v_empresa.label_operacional, v_empresa.nome_fantasia, v_empresa.razao_social),
    'conta_pagadora', concat_ws(' · ',
      coalesce(v_conta_pagadora.apelido, v_conta_pagadora.banco),
      concat('agencia ', v_conta_pagadora.agencia),
      concat('conta ', v_conta_pagadora.conta)
    ),
    'status', 'pendente',
    'registrado_por', 'Maria',
    'confirmado_por', v_confirmado_por,
    'canal', v_canal,
    'pagamento_executado_pela_maria', false
  );
end;
$$;

revoke all on function public.maria_contas_cancelar(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_contas_cancelar(
  uuid, text, text, text, text, text, text
) to maria_operacional, service_role;

revoke all on function public.maria_contas_parcelada_criar(
  text, numeric, numeric, integer, date, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, boolean
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_contas_parcelada_criar(
  text, numeric, numeric, integer, date, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, boolean
) to maria_operacional, service_role;

comment on function public.maria_contas_cancelar(
  uuid, text, text, text, text, text, text
) is 'Cancela conta por status, preserva evidencias e registra auditoria. Nao executa DELETE nem pagamento.';

comment on function public.maria_contas_parcelada_criar(
  text, numeric, numeric, integer, date, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, boolean
) is 'Cria parcelamento mensal atomico confirmado por humano, sem executar pagamento real.';
