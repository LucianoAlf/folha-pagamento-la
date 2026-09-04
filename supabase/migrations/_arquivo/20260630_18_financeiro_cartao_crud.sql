-- Fase 3 / Fatia 1 / Marco A: escrita segura do cadastro de cartoes.
-- A tabela financeiro_cartoes continua SELECT-only para authenticated; escrita apenas por RPC SECURITY DEFINER.

create or replace function public.financeiro_cartao_salvar(p_payload jsonb, p_ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_created_by uuid;
  v_actor jsonb;

  v_cartao_id uuid;
  v_operacao text;
  v_before public.financeiro_cartoes%rowtype;
  v_after public.financeiro_cartoes%rowtype;

  v_apelido text;
  v_final text;
  v_titularidade_tipo text;
  v_titular text;
  v_bandeira text;
  v_empresa_id uuid;
  v_conta_pagadora_id uuid;
  v_centro_custo_id uuid;
  v_dia_fechamento int;
  v_dia_vencimento int;
  v_limite numeric;
  v_observacoes text;
  v_ativo boolean;
  v_constraint text;
begin
  v_role := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text);

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_created_by := auth.uid();
    v_ator_ref := coalesce(v_created_by::text, nullif(current_setting('request.jwt.claim.email', true), ''), 'authenticated');
  elsif v_role = 'service_role' then
    v_ator_tipo := coalesce(nullif(p_ator->>'ator_tipo', ''), nullif(p_ator->>'tipo', ''), 'sistema');
    if v_ator_tipo not in ('web','maria','openfinance','sistema') then
      raise exception 'ator_tipo nao permitido para service_role.';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ator_ref', ''), nullif(p_ator->>'ref', ''), v_ator_tipo);
  else
    raise exception 'papel nao autorizado para RPC de cartoes: %', v_role using errcode = '42501';
  end if;

  v_actor := jsonb_build_object(
    'role', v_role,
    'ator_tipo', v_ator_tipo,
    'ator_ref', v_ator_ref,
    'created_by', v_created_by
  );

  v_cartao_id := nullif(p_payload->>'cartao_id', '')::uuid;

  if v_cartao_id is not null then
    select * into v_before
      from public.financeiro_cartoes
     where id = v_cartao_id
     for update;

    if not found then
      raise exception 'cartao_id nao encontrado.';
    end if;
  end if;

  v_apelido := case
    when p_payload ? 'apelido' then nullif(trim(p_payload->>'apelido'), '')
    when v_cartao_id is not null then v_before.apelido
    else null
  end;

  v_final := case
    when p_payload ? 'final' then nullif(trim(p_payload->>'final'), '')
    when v_cartao_id is not null then v_before.final
    else null
  end;

  v_titularidade_tipo := case
    when p_payload ? 'titularidade_tipo' then nullif(trim(p_payload->>'titularidade_tipo'), '')
    when v_cartao_id is not null then v_before.titularidade_tipo
    else null
  end;

  if v_apelido is null then
    raise exception 'apelido obrigatorio para cartao.';
  end if;

  if v_final is null then
    raise exception 'final obrigatorio para cartao.';
  end if;

  if v_final !~ '^[0-9]{4}$' then
    raise exception 'final deve conter exatamente 4 digitos.';
  end if;

  if v_titularidade_tipo is null then
    raise exception 'titularidade_tipo obrigatorio para cartao.';
  end if;

  if v_titularidade_tipo not in ('pf','pj') then
    raise exception 'titularidade_tipo invalido.';
  end if;

  v_titular := case
    when p_payload ? 'titular' then nullif(trim(p_payload->>'titular'), '')
    when v_cartao_id is not null then v_before.titular
    else null
  end;

  v_bandeira := case
    when p_payload ? 'bandeira' then nullif(trim(p_payload->>'bandeira'), '')
    when v_cartao_id is not null then v_before.bandeira
    else null
  end;

  v_empresa_id := case
    when p_payload ? 'empresa_id' then nullif(p_payload->>'empresa_id', '')::uuid
    when v_cartao_id is not null then v_before.empresa_id
    else null
  end;

  v_conta_pagadora_id := case
    when p_payload ? 'conta_pagadora_id' then nullif(p_payload->>'conta_pagadora_id', '')::uuid
    when v_cartao_id is not null then v_before.conta_pagadora_id
    else null
  end;

  v_centro_custo_id := case
    when p_payload ? 'centro_custo_id' then nullif(p_payload->>'centro_custo_id', '')::uuid
    when v_cartao_id is not null then v_before.centro_custo_id
    else null
  end;

  v_dia_fechamento := case
    when p_payload ? 'dia_fechamento' then nullif(p_payload->>'dia_fechamento', '')::int
    when v_cartao_id is not null then v_before.dia_fechamento
    else null
  end;

  v_dia_vencimento := case
    when p_payload ? 'dia_vencimento' then nullif(p_payload->>'dia_vencimento', '')::int
    when v_cartao_id is not null then v_before.dia_vencimento
    else null
  end;

  v_limite := case
    when p_payload ? 'limite' then nullif(p_payload->>'limite', '')::numeric
    when v_cartao_id is not null then v_before.limite
    else null
  end;

  v_observacoes := case
    when p_payload ? 'observacoes' then nullif(trim(p_payload->>'observacoes'), '')
    when v_cartao_id is not null then v_before.observacoes
    else null
  end;

  v_ativo := case
    when p_payload ? 'ativo' then coalesce(nullif(p_payload->>'ativo', '')::boolean, true)
    when v_cartao_id is not null then v_before.ativo
    else true
  end;

  begin
    if v_cartao_id is null then
      v_operacao := 'INSERT';

      insert into public.financeiro_cartoes (
        apelido,
        final,
        titularidade_tipo,
        titular,
        bandeira,
        empresa_id,
        conta_pagadora_id,
        centro_custo_id,
        dia_fechamento,
        dia_vencimento,
        limite,
        observacoes,
        ativo
      )
      values (
        v_apelido,
        v_final,
        v_titularidade_tipo,
        v_titular,
        v_bandeira,
        v_empresa_id,
        v_conta_pagadora_id,
        v_centro_custo_id,
        v_dia_fechamento,
        v_dia_vencimento,
        v_limite,
        v_observacoes,
        v_ativo
      )
      returning * into v_after;
    else
      v_operacao := 'UPDATE';

      update public.financeiro_cartoes
         set apelido = v_apelido,
             final = v_final,
             titularidade_tipo = v_titularidade_tipo,
             titular = v_titular,
             bandeira = v_bandeira,
             empresa_id = v_empresa_id,
             conta_pagadora_id = v_conta_pagadora_id,
             centro_custo_id = v_centro_custo_id,
             dia_fechamento = v_dia_fechamento,
             dia_vencimento = v_dia_vencimento,
             limite = v_limite,
             observacoes = v_observacoes,
             ativo = v_ativo,
             updated_at = now()
       where id = v_cartao_id
       returning * into v_after;
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if coalesce(v_constraint, '') ilike '%apelido%' then
        raise exception 'Ja existe um cartao com esse apelido.' using errcode = '23505';
      end if;
      raise;
  end;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartoes',
    'cartao',
    v_after.id,
    case when v_operacao = 'INSERT' then 'INSERT' else 'UPDATE' end,
    case when v_operacao = 'UPDATE' then to_jsonb(v_before) else null end,
    to_jsonb(v_after),
    p_payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'cartao_id', v_after.id,
    'operacao', v_operacao
  );
end;
$$;

create or replace function public.financeiro_cartao_arquivar(p_payload jsonb, p_ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_created_by uuid;
  v_actor jsonb;

  v_cartao_id uuid;
  v_ativo boolean;
  v_before public.financeiro_cartoes%rowtype;
  v_after public.financeiro_cartoes%rowtype;
  v_operacao text;
begin
  v_role := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text);

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_created_by := auth.uid();
    v_ator_ref := coalesce(v_created_by::text, nullif(current_setting('request.jwt.claim.email', true), ''), 'authenticated');
  elsif v_role = 'service_role' then
    v_ator_tipo := coalesce(nullif(p_ator->>'ator_tipo', ''), nullif(p_ator->>'tipo', ''), 'sistema');
    if v_ator_tipo not in ('web','maria','openfinance','sistema') then
      raise exception 'ator_tipo nao permitido para service_role.';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ator_ref', ''), nullif(p_ator->>'ref', ''), v_ator_tipo);
  else
    raise exception 'papel nao autorizado para RPC de cartoes: %', v_role using errcode = '42501';
  end if;

  v_actor := jsonb_build_object(
    'role', v_role,
    'ator_tipo', v_ator_tipo,
    'ator_ref', v_ator_ref,
    'created_by', v_created_by
  );

  v_cartao_id := nullif(p_payload->>'cartao_id', '')::uuid;
  if v_cartao_id is null then
    raise exception 'cartao_id obrigatorio para arquivar cartao.';
  end if;

  v_ativo := coalesce(nullif(p_payload->>'ativo', '')::boolean, false);
  v_operacao := case when v_ativo then 'UNARCHIVE' else 'ARCHIVE' end;

  select * into v_before
    from public.financeiro_cartoes
   where id = v_cartao_id
   for update;

  if not found then
    raise exception 'cartao_id nao encontrado.';
  end if;

  update public.financeiro_cartoes
     set ativo = v_ativo,
         updated_at = now()
   where id = v_cartao_id
   returning * into v_after;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartoes',
    'cartao',
    v_after.id,
    case when v_ativo then 'UNARCHIVE' else 'ARCHIVE' end,
    to_jsonb(v_before),
    to_jsonb(v_after),
    p_payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'cartao_id', v_after.id,
    'ativo', v_after.ativo
  );
end;
$$;

revoke all on function public.financeiro_cartao_salvar(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_salvar(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_arquivar(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_arquivar(jsonb, jsonb) to authenticated, service_role;

comment on function public.financeiro_cartao_salvar(jsonb, jsonb) is
  'Fase 3 Cartoes: cria ou edita cadastro de cartao por RPC auditada, sem DML direto para authenticated.';

comment on function public.financeiro_cartao_arquivar(jsonb, jsonb) is
  'Fase 3 Cartoes: arquiva/desarquiva cartao por toggle ativo, sem DELETE fisico.';
