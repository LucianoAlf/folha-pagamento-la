-- Adiciona p_frequencia (mensal|semanal) a RPC da Maria de criar conta recorrente.
-- Drop da assinatura de 15 args + create com 16 args (novo param opcional no fim mantem as
-- chamadas de 15 args funcionando e evita overload ambiguo). Grava recorrente_frequencia.
drop function if exists public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text);

create or replace function public.maria_contas_recorrente_criar(
  p_descricao text,
  p_valor numeric,
  p_data_vencimento date,
  p_plano_conta_id uuid,
  p_centro_custo_id uuid,
  p_conta_pagadora_id uuid,
  p_fonte_tipo text,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null::text,
  p_motivo text default null::text,
  p_mensagem_origem_id text default null::text,
  p_observacoes text default null::text,
  p_frequencia text default 'mensal'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_plano public.plano_contas%rowtype;
  v_centro public.centros_custo%rowtype;
  v_conta_pagadora public.financeiro_contas_bancarias%rowtype;
  v_empresa public.financeiro_empresas%rowtype;
  v_after public.contas_pagar%rowtype;
  v_duplicada public.contas_pagar%rowtype;
  v_audit_id uuid;
  v_confirmado_por_nome text;
  v_canal_origem text;
  v_obs text;
  v_valor_centavos integer;
  v_fonte_tipo text;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if nullif(trim(p_descricao), '') is null then
    raise exception 'descricao obrigatoria para conta recorrente.';
  end if;

  v_valor_centavos := public.maria_fluxo_valor_para_centavos(p_valor);
  if v_valor_centavos is null or v_valor_centavos <= 0 or v_valor_centavos > 999999999 then
    raise exception 'valor fora da faixa operacional permitida.';
  end if;

  if p_data_vencimento is null then
    raise exception 'data_vencimento obrigatoria para conta recorrente.';
  end if;

  if p_frequencia is null or p_frequencia not in ('mensal','semanal') then
    raise exception 'frequencia invalida (use mensal ou semanal).';
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

  v_fonte_tipo := lower(nullif(trim(p_fonte_tipo), ''));
  if v_fonte_tipo is not null and v_fonte_tipo not in ('site','email','pix_fixo','banco','whatsapp','manual','cartao') then
    raise exception 'fonte_tipo nao permitido para conta recorrente.';
  end if;

  if p_conta_pagadora_id is not null then
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
  end if;

  select * into v_duplicada
    from public.contas_pagar
   where tipo_lancamento = 'recorrente'
     and status <> 'cancelado'
     and lower(trim(descricao)) = lower(trim(p_descricao))
     and centro_custo_id = p_centro_custo_id
     and plano_conta_id = p_plano_conta_id
     and competencia = date_trunc('month', p_data_vencimento)::date
   order by created_at desc
   limit 1;

  if found then
    raise exception 'possivel duplicidade: ja existe conta recorrente semelhante nesta competencia (conta_id=%).', v_duplicada.id;
  end if;

  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal_origem := coalesce(nullif(trim(p_canal), ''), 'whatsapp');
  v_obs := concat_ws(E'\n',
    public.maria_contas_observacao_sanitizada(p_observacoes),
    concat('Conta recorrente criada pela Maria apos confirmacao de ', v_confirmado_por_nome, ' em ', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '. Status pendente. Sem pagamento real executado pela Maria.'),
    public.maria_contas_observacao_sanitizada(p_motivo)
  );

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
    recorrente_frequencia,
    parcela_atual,
    total_parcelas,
    observacoes,
    fonte_tipo,
    plano_conta_id,
    centro_custo_id,
    empresa_id,
    conta_pagadora_id
  ) values (
    trim(p_descricao),
    v_centro.codigo,
    round(p_valor, 2),
    (now() at time zone 'America/Sao_Paulo')::date,
    p_data_vencimento,
    date_trunc('month', p_data_vencimento)::date,
    'pendente',
    null,
    null,
    'recorrente',
    p_frequencia,
    null,
    null,
    nullif(v_obs, ''),
    coalesce(v_fonte_tipo, 'whatsapp'),
    p_plano_conta_id,
    p_centro_custo_id,
    case when p_conta_pagadora_id is null then null else v_conta_pagadora.empresa_id end,
    p_conta_pagadora_id
  )
  returning * into v_after;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal_origem,
    'contas_pagar',
    'conta_pagar',
    v_after.id,
    'criar_conta_pagar_recorrente',
    null,
    to_jsonb(v_after),
    p_motivo,
    p_texto_original
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'audit_id', v_audit_id,
    'conta', public.maria_conta_pagar_public_json(v_after.id),
    'conta_id', v_after.id,
    'status', v_after.status,
    'tipo_lancamento', 'recorrente',
    'frequencia', p_frequencia,
    'empresa_label', case when p_conta_pagadora_id is null then null else v_empresa.label_operacional end,
    'centro_custo', v_centro.nome,
    'plano', concat_ws(' ', v_plano.codigo, v_plano.nome),
    'valor', v_after.valor,
    'valor_centavos', v_valor_centavos,
    'data_vencimento', v_after.data_vencimento,
    'competencia', v_after.competencia,
    'registrado_por', 'Maria',
    'confirmado_por', v_confirmado_por_nome,
    'canal', v_canal_origem,
    'mensagem_origem_id', nullif(trim(p_mensagem_origem_id), ''),
    'pagamento_executado_pela_maria', false
  );
end;
$function$;

grant execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.maria_contas_recorrente_criar(text,numeric,date,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text) to maria_operacional;
