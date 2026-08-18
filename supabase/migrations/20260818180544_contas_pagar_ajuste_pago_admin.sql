-- Ajuste administrativo de contas ja pagas.
-- A conta continua liquidada; esta porta registra a correcao com antes/depois.

create or replace function public.contas_pagar_ajustar_paga(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_conta_pagadora_id uuid;
  v_plano_conta_id uuid;
  v_before public.contas_pagar%rowtype;
  v_after public.contas_pagar%rowtype;
  v_conta_pagadora public.financeiro_contas_bancarias%rowtype;
  v_empresa public.financeiro_empresas%rowtype;
  v_centro public.centros_custo%rowtype;
  v_descricao text;
  v_valor numeric;
  v_data_lancamento date;
  v_data_vencimento date;
  v_data_pagamento date;
  v_metodo_pagamento text;
  v_observacoes text;
  v_motivo text;
  v_ator_id uuid;
  v_ator_nome text;
  v_audit_id uuid;
begin
  if not public.financeiro_cartoes_is_admin() then
    raise exception 'Perfil administrativo obrigatorio para ajustar conta paga.' using errcode = '42501';
  end if;

  v_ator_id := auth.uid();
  if v_ator_id is null then
    raise exception 'Usuario autenticado sem auth.uid().' using errcode = '42501';
  end if;

  v_conta_id := nullif(p_payload->>'conta_id', '')::uuid;
  v_conta_pagadora_id := nullif(p_payload->>'conta_pagadora_id', '')::uuid;
  v_plano_conta_id := nullif(p_payload->>'plano_conta_id', '')::uuid;
  v_descricao := nullif(btrim(p_payload->>'descricao'), '');
  if lower(coalesce(p_payload->>'valor', '')) in ('nan', 'infinity', '+infinity', '-infinity') then
    raise exception 'valor deve ser finito para ajustar conta paga.';
  end if;
  v_valor := round(nullif(p_payload->>'valor', '')::numeric, 2);
  v_data_lancamento := nullif(p_payload->>'data_lancamento', '')::date;
  v_data_vencimento := nullif(p_payload->>'data_vencimento', '')::date;
  v_data_pagamento := nullif(p_payload->>'data_pagamento', '')::date;
  v_metodo_pagamento := nullif(btrim(p_payload->>'metodo_pagamento'), '');
  v_observacoes := nullif(btrim(p_payload->>'observacoes'), '');
  v_motivo := coalesce(
    nullif(btrim(p_payload->>'motivo'), ''),
    'Correcao administrativa de conta ja paga.'
  );

  if v_conta_id is null then
    raise exception 'conta_id obrigatorio para ajustar conta paga.';
  end if;
  if v_descricao is null then
    raise exception 'descricao obrigatoria para ajustar conta paga.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor <> v_valor then
    raise exception 'valor deve ser maior que zero para ajustar conta paga.';
  end if;
  if v_data_lancamento is null or v_data_vencimento is null or v_data_pagamento is null then
    raise exception 'data de lancamento, vencimento e pagamento sao obrigatorias.';
  end if;
  if v_data_pagamento > ((now() at time zone 'America/Sao_Paulo')::date + 1) then
    raise exception 'data de pagamento futura nao permitida.';
  end if;
  if v_metodo_pagamento is null then
    raise exception 'metodo_pagamento obrigatorio para ajustar conta paga.';
  end if;
  if v_conta_pagadora_id is null then
    raise exception 'conta_pagadora_id obrigatoria para ajustar conta paga.';
  end if;
  if v_plano_conta_id is null then
    raise exception 'plano_conta_id obrigatorio para ajustar conta paga.';
  end if;

  select * into v_before
    from public.contas_pagar
   where id = v_conta_id
   for update;
  if not found then
    raise exception 'conta_pagar nao encontrada.';
  end if;
  if v_before.status <> 'pago' then
    raise exception 'somente conta paga pode usar o ajuste administrativo.';
  end if;
  if v_before.tipo_lancamento in ('fatura_cartao', 'folha_pagamento') then
    raise exception 'use o fluxo de origem para ajustar fatura de cartao ou folha de pagamento.';
  end if;

  select * into v_conta_pagadora
    from public.financeiro_contas_bancarias
   where id = v_conta_pagadora_id
     and ativo = true;
  if not found then
    raise exception 'conta pagadora ativa nao encontrada.';
  end if;

  select * into v_empresa
    from public.financeiro_empresas
   where id = v_conta_pagadora.empresa_id
     and ativo = true;
  if not found then
    raise exception 'empresa da conta pagadora nao encontrada ou inativa.';
  end if;

  select * into v_centro
    from public.centros_custo
   where id = v_empresa.unidade_id
     and ativo = true;
  if not found then
    raise exception 'centro de custo da empresa pagadora nao encontrado ou inativo.';
  end if;

  if not exists (
    select 1
      from public.plano_contas
     where id = v_plano_conta_id
       and ativo = true
  ) then
    raise exception 'plano de contas ativo nao encontrado.';
  end if;

  update public.contas_pagar
     set descricao = v_descricao,
         valor = v_valor,
         data_lancamento = v_data_lancamento,
         data_vencimento = v_data_vencimento,
         competencia = date_trunc('month', v_data_vencimento)::date,
         data_pagamento = (v_data_pagamento::timestamp at time zone 'America/Sao_Paulo'),
         metodo_pagamento = v_metodo_pagamento,
         conta_pagadora_id = v_conta_pagadora.id,
         empresa_id = v_conta_pagadora.empresa_id,
         centro_custo_id = v_empresa.unidade_id,
         unidade = v_centro.codigo,
         plano_conta_id = v_plano_conta_id,
         observacoes = v_observacoes,
         updated_at = now()
   where id = v_before.id
   returning * into v_after;

  select nome into v_ator_nome
    from public.user_profiles
   where id = v_ator_id;

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
    motivo
  ) values (
    coalesce(nullif(v_ator_nome, ''), 'Admin'),
    v_ator_id::text,
    encode(extensions.digest(v_ator_id::text, 'sha256'), 'hex'),
    right(v_ator_id::text, 4),
    'admin',
    'contas_pagar',
    'web',
    coalesce(nullif(auth.role(), ''), session_user::text),
    'contas_pagar',
    'conta_pagar',
    v_after.id,
    'ajustar_conta_paga',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_motivo
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'conta_id', v_after.id,
    'audit_id', v_audit_id,
    'status', v_after.status
  );
end;
$$;

revoke all on function public.contas_pagar_ajustar_paga(jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_pagar_ajustar_paga(jsonb) to authenticated, service_role;

comment on function public.contas_pagar_ajustar_paga(jsonb) is
  'Ajuste administrativo auditavel de conta ja paga; preserva a origem de cartao e folha.';
