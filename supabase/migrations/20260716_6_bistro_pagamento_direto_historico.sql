-- Permite registrar o fato historico de pagamento direto mesmo quando a
-- competencia ja alimentou uma folha fechada. O snapshot DRE permanece
-- imutavel; somente bistro_consumos.valor_pago_direto e sua auditoria mudam.

create or replace function public.bistro_consumo_pagamento_direto_salvar(
  p_consumo_id uuid,
  p_valor_pago_direto numeric,
  p_valor_esperado numeric,
  p_ator jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ator_tipo text;
  v_ator_ref text;
  v_ator_nome text;
  v_numero_hash text;
  v_last4 text;
  v_consumo record;
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_ator_ref := auth.uid()::text;
    v_ator_nome := 'Super Folha Web';
    if v_ator_ref is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role in ('service_role', 'postgres') then
    v_ator_tipo := coalesce(nullif(p_ator->>'tipo', ''), 'sistema');
    if v_ator_tipo <> 'sistema' then
      raise exception 'ator.tipo nao permitido para service_role nesta fatia.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
    v_ator_nome := coalesce(nullif(p_ator->>'nome', ''), 'Sistema');
  else
    raise exception 'papel nao autorizado para pagamento direto do Bistro: %', v_role
      using errcode = '42501';
  end if;

  if p_valor_pago_direto is null or p_valor_pago_direto < 0 then
    raise exception 'valor_pago_direto deve ser nao negativo.';
  end if;

  select bc.*
    into v_consumo
    from public.bistro_consumos bc
   where bc.id = p_consumo_id
   for update;

  if not found then
    raise exception 'consumo_id % nao encontrado.', p_consumo_id;
  end if;

  if p_valor_esperado is null
     or v_consumo.valor_pago_direto is distinct from p_valor_esperado then
    raise exception 'Os valores mudaram. Atualize o consumo antes de salvar.';
  end if;

  if p_valor_pago_direto > v_consumo.valor then
    raise exception 'valor_pago_direto nao pode exceder o consumo bruto.';
  end if;

  if v_consumo.valor_pago_direto is not distinct from p_valor_pago_direto then
    return jsonb_build_object(
      'success', true,
      'status', 'already_applied',
      'consumo_id', p_consumo_id,
      'valor_pago_direto', v_consumo.valor_pago_direto,
      'audit_id', null
    );
  end if;

  v_before := to_jsonb(v_consumo);

  perform set_config('app.bistro_pagamento_direto_rpc', 'on', true);

  update public.bistro_consumos as bc
     set valor_pago_direto = p_valor_pago_direto,
         updated_at = now()
   where bc.id = p_consumo_id
  returning to_jsonb(bc) into v_after;

  v_numero_hash := encode(
    extensions.digest(coalesce(v_ator_ref, v_ator_tipo), 'sha256'),
    'hex'
  );
  v_last4 := right(regexp_replace(coalesce(v_ator_ref, ''), '\D', '', 'g'), 4);
  if v_last4 = '' then
    v_last4 := 'n/a';
  end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  )
  values (
    v_ator_nome, v_ator_ref, v_numero_hash, v_last4,
    v_ator_tipo, 'folha', v_ator_tipo, v_role,
    'bistro_consumos', 'bistro_consumo', p_consumo_id,
    'MARCAR_PAGAMENTO_DIRETO_BISTRO',
    v_before,
    v_after,
    nullif(trim(p_ator->>'motivo'), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'status', 'updated',
    'consumo_id', p_consumo_id,
    'valor_pago_direto', p_valor_pago_direto,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.bistro_consumo_pagamento_direto_salvar(
  uuid, numeric, numeric, jsonb
) from public, anon;

grant execute on function public.bistro_consumo_pagamento_direto_salvar(
  uuid, numeric, numeric, jsonb
) to authenticated, service_role;
