-- Fase 1: Maria cria despesa eventual em contas_pagar.
-- Nao executa pagamento real; registra despesa ja confirmada por humano.

create or replace view public.vw_maria_contas_eventuais as
select
  c.id as conta_id,
  c.descricao,
  c.valor,
  c.data_lancamento,
  c.data_vencimento,
  c.competencia,
  c.status,
  c.data_pagamento,
  c.metodo_pagamento,
  c.fonte_tipo,
  c.plano_conta_id,
  p.codigo as plano_codigo,
  p.nome as plano_nome,
  c.centro_custo_id,
  cc.codigo as centro_codigo,
  cc.nome as centro_nome,
  c.empresa_id,
  e.label_operacional as empresa_label,
  e.nome_fantasia as empresa_nome,
  c.conta_pagadora_id,
  b.banco,
  b.agencia,
  b.conta as conta_pagadora,
  c.created_at,
  c.updated_at
from public.contas_pagar c
left join public.plano_contas p on p.id = c.plano_conta_id
left join public.centros_custo cc on cc.id = c.centro_custo_id
left join public.financeiro_empresas e on e.id = c.empresa_id
left join public.financeiro_contas_bancarias b on b.id = c.conta_pagadora_id
where c.tipo_lancamento = 'eventual';

create or replace function public.maria_contas_eventual_criar(
  p_descricao text,
  p_valor numeric,
  p_data_vencimento date,
  p_plano_conta_id uuid,
  p_centro_custo_id uuid,
  p_conta_pagadora_id uuid,
  p_status text,
  p_data_pagamento date,
  p_metodo_pagamento text,
  p_confirmado_por_nome text,
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_texto_original text default null,
  p_motivo text default null,
  p_mensagem_origem_id text default null,
  p_documento_id uuid default null,
  p_observacoes text default null
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
  v_audit_id uuid;
  v_status text;
  v_metodo text;
  v_data_pagamento timestamptz;
  v_confirmado_por_nome text;
  v_canal_origem text;
  v_obs text;
  v_valor_centavos integer;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  if nullif(trim(p_descricao), '') is null then
    raise exception 'descricao obrigatoria para conta eventual.';
  end if;

  v_valor_centavos := public.maria_fluxo_valor_para_centavos(p_valor);
  if v_valor_centavos is null or v_valor_centavos <= 0 or v_valor_centavos > 999999999 then
    raise exception 'valor fora da faixa operacional permitida.';
  end if;

  if p_data_vencimento is null then
    raise exception 'data_vencimento obrigatoria para conta eventual.';
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

  v_status := lower(coalesce(nullif(trim(p_status), ''), 'pago'));
  if v_status not in ('pendente', 'pago') then
    raise exception 'status permitido para eventual: pendente ou pago.';
  end if;

  v_metodo := nullif(trim(p_metodo_pagamento), '');
  if v_status = 'pago' then
    if p_data_pagamento is null then
      raise exception 'data_pagamento obrigatoria para eventual ja pago.';
    end if;

    if p_data_pagamento > ((now() at time zone 'America/Sao_Paulo')::date + 1) then
      raise exception 'data_pagamento futura nao permitida para conta eventual.';
    end if;

    if v_metodo is null then
      raise exception 'metodo_pagamento obrigatorio para eventual ja pago.';
    end if;

    if lower(v_metodo) not in (
      lower('PIX'),
      lower('Transferência Bancária'),
      lower('Transferencia Bancaria'),
      lower('Cartão de Crédito'),
      lower('Cartao de Credito'),
      lower('Cartão de Débito'),
      lower('Cartao de Debito'),
      lower('Débito Automático'),
      lower('Debito Automatico'),
      lower('Boleto'),
      lower('Dinheiro'),
      lower('Comprovante')
    ) then
      raise exception 'metodo_pagamento nao permitido para conta eventual.';
    end if;

    v_data_pagamento := p_data_pagamento::timestamptz;
  else
    v_metodo := null;
    v_data_pagamento := null;
  end if;

  v_confirmado_por_nome := coalesce(nullif(trim(p_confirmado_por_nome), ''), v_actor.nome);
  v_canal_origem := coalesce(nullif(trim(p_canal), ''), 'whatsapp');
  v_obs := concat_ws(E'\n',
    public.maria_contas_observacao_sanitizada(p_observacoes),
    concat('Conta eventual registrada pela Maria apos confirmacao de ', v_confirmado_por_nome, ' em ', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '. Sem pagamento real executado pela Maria.'),
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
    v_status,
    v_data_pagamento,
    v_metodo,
    'eventual',
    null,
    null,
    nullif(v_obs, ''),
    'whatsapp',
    p_plano_conta_id,
    p_centro_custo_id,
    v_conta_pagadora.empresa_id,
    p_conta_pagadora_id
  )
  returning * into v_after;

  if p_documento_id is not null then
    update public.financeiro_documentos
       set vinculo_tipo = 'conta_pagar',
           vinculo_id = v_after.id
     where id = p_documento_id;
  end if;

  v_audit_id := public.maria_audit_insert(
    v_actor,
    p_ator_numero,
    v_canal_origem,
    'contas_pagar',
    'conta_pagar',
    v_after.id,
    'criar_conta_pagar_eventual',
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
    'status_coleta', null,
    'tipo_lancamento', 'eventual',
    'empresa_label', v_empresa.label_operacional,
    'centro_custo', v_centro.nome,
    'plano', concat_ws(' ', v_plano.codigo, v_plano.nome),
    'valor', v_after.valor,
    'valor_centavos', v_valor_centavos,
    'registrado_por', 'Maria',
    'confirmado_por', v_confirmado_por_nome,
    'canal', v_canal_origem,
    'mensagem_origem_id', nullif(trim(p_mensagem_origem_id), ''),
    'pagamento_executado_pela_maria', false
  );
end;
$$;

revoke all on public.vw_maria_contas_eventuais from public, anon, authenticated;
grant select on public.vw_maria_contas_eventuais to maria_operacional, maria_leitura, service_role;

revoke all on function public.maria_contas_eventual_criar(
  text, numeric, date, uuid, uuid, uuid, text, date, text, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_contas_eventual_criar(
  text, numeric, date, uuid, uuid, uuid, text, date, text, text, text, text, text, text, text, text, uuid, text
) to maria_operacional, service_role;

comment on function public.maria_contas_eventual_criar(
  text, numeric, date, uuid, uuid, uuid, text, date, text, text, text, text, text, text, text, text, uuid, text
) is 'Maria operational RPC: cria conta_pagar eventual confirmada por humano, infere empresa pela conta pagadora e nao executa pagamento real.';
