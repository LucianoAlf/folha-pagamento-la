-- Fase 5: correcao excepcional e auditada de um componente de folha.
-- A funcao e estreita de proposito: nao aceita patch generico e nunca altera rateio.

create or replace function public.folha_corrigir_componente(
  p_folha_id integer,
  p_colaborador_id integer,
  p_unidade text,
  p_categoria text,
  p_componente text,
  p_valor_esperado numeric,
  p_valor_novo numeric,
  p_motivo text,
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
  v_status text;
  v_lancamento_id integer;
  v_linhas_alvo integer;
  v_valor_atual numeric;
  v_total_linha_antes numeric;
  v_total_linha_depois numeric;
  v_total_geral_antes numeric;
  v_total_geral_depois numeric;
  v_total_cg_antes numeric;
  v_total_cg_depois numeric;
  v_total_rec_antes numeric;
  v_total_rec_depois numeric;
  v_total_bar_antes numeric;
  v_total_bar_depois numeric;
  v_total_geral_esperado numeric;
  v_conta_pagadora_id uuid;
  v_audit_id uuid;
  v_numero_hash text;
  v_last4 text;
begin
  if p_componente not in (
    'salario', 'bonus', 'comissao', 'passagem',
    'reembolso', 'inss', 'descontos'
  ) then
    raise exception 'componente de folha nao permitido: %.', p_componente;
  end if;

  if nullif(trim(p_motivo), '') is null then
    raise exception 'motivo obrigatorio para corrigir folha.';
  end if;

  if p_valor_esperado is null or p_valor_novo is null then
    raise exception 'valor esperado e valor novo sao obrigatorios.';
  end if;

  if p_unidade not in ('cg', 'rec', 'bar') then
    raise exception 'unidade de folha invalida: %.', p_unidade;
  end if;

  if nullif(trim(p_categoria), '') is null then
    raise exception 'categoria obrigatoria para localizar o lancamento.';
  end if;

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
      raise exception 'ator.tipo nao permitido para service_role nesta correcao.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
    v_ator_nome := coalesce(nullif(p_ator->>'nome', ''), 'Sistema');
  else
    raise exception 'papel nao autorizado para corrigir folha: %', v_role
      using errcode = '42501';
  end if;

  select
    f.status,
    f.total_geral,
    f.total_cg,
    f.total_rec,
    f.total_bar
  into
    v_status,
    v_total_geral_antes,
    v_total_cg_antes,
    v_total_rec_antes,
    v_total_bar_antes
  from public.folhas_mensais f
  where f.id = p_folha_id
  for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  if v_status not in ('rascunho', 'aprovada') then
    raise exception 'folha com status % nao permite correcao de componente.', v_status;
  end if;

  select count(*), min(lf.id)
  into v_linhas_alvo, v_lancamento_id
  from public.lancamentos_folha lf
  where lf.folha_id = p_folha_id
    and lf.colaborador_id = p_colaborador_id
    and lf.unidade = p_unidade
    and lf.categoria = p_categoria;

  if v_linhas_alvo = 0 then
    raise exception 'lancamento nao encontrado para folha, colaborador, unidade e categoria informados.';
  end if;

  if v_linhas_alvo <> 1 then
    raise exception 'alvo ambiguo: % lancamentos encontrados para folha, colaborador, unidade e categoria.',
      v_linhas_alvo;
  end if;

  select
    case p_componente
      when 'salario' then lf.salario
      when 'bonus' then lf.bonus
      when 'comissao' then lf.comissao
      when 'passagem' then lf.passagem
      when 'reembolso' then lf.reembolso
      when 'inss' then lf.inss
      when 'descontos' then lf.descontos
    end,
    lf.total,
    lf.conta_pagadora_id
  into v_valor_atual, v_total_linha_antes, v_conta_pagadora_id
  from public.lancamentos_folha lf
  where lf.id = v_lancamento_id
  for update;

  if v_valor_atual is distinct from p_valor_esperado then
    raise exception 'valor atual % diverge do valor esperado % para o componente %.',
      v_valor_atual, p_valor_esperado, p_componente;
  end if;

  update public.lancamentos_folha lf
  set
    salario = case when p_componente = 'salario' then p_valor_novo else lf.salario end,
    bonus = case when p_componente = 'bonus' then p_valor_novo else lf.bonus end,
    comissao = case when p_componente = 'comissao' then p_valor_novo else lf.comissao end,
    passagem = case when p_componente = 'passagem' then p_valor_novo else lf.passagem end,
    reembolso = case when p_componente = 'reembolso' then p_valor_novo else lf.reembolso end,
    inss = case when p_componente = 'inss' then p_valor_novo else lf.inss end,
    descontos = case when p_componente = 'descontos' then p_valor_novo else lf.descontos end,
    updated_at = now()
  where lf.id = v_lancamento_id;

  select lf.total, lf.conta_pagadora_id
  into v_total_linha_depois, v_conta_pagadora_id
  from public.lancamentos_folha lf
  where lf.id = v_lancamento_id;

  perform public.recalc_folha_totais(p_folha_id);

  select f.total_geral, f.total_cg, f.total_rec, f.total_bar
  into v_total_geral_depois, v_total_cg_depois, v_total_rec_depois, v_total_bar_depois
  from public.folhas_mensais f
  where f.id = p_folha_id;

  v_total_geral_esperado := v_total_geral_antes
    + case
        when p_componente in ('inss', 'descontos')
          then -(p_valor_novo - p_valor_esperado)
        else p_valor_novo - p_valor_esperado
      end;

  if v_total_geral_depois is distinct from v_total_geral_esperado then
    raise exception 'recalculo da folha divergente: esperado %, encontrado %.',
      v_total_geral_esperado, v_total_geral_depois;
  end if;

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
    'lancamentos_folha', 'folha_correcao_componente', null,
    'CORRECAO_COMPONENTE_FOLHA',
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'lancamento_id', v_lancamento_id,
      'unidade', p_unidade,
      'categoria', p_categoria,
      'componente', p_componente,
      'valor', p_valor_esperado,
      'total_linha', v_total_linha_antes,
      'total_geral', v_total_geral_antes,
      'total_cg', v_total_cg_antes,
      'total_rec', v_total_rec_antes,
      'total_bar', v_total_bar_antes,
      'conta_pagadora_id', v_conta_pagadora_id
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'lancamento_id', v_lancamento_id,
      'unidade', p_unidade,
      'categoria', p_categoria,
      'componente', p_componente,
      'valor', p_valor_novo,
      'total_linha', v_total_linha_depois,
      'total_geral', v_total_geral_depois,
      'total_cg', v_total_cg_depois,
      'total_rec', v_total_rec_depois,
      'total_bar', v_total_bar_depois,
      'conta_pagadora_id', v_conta_pagadora_id
    ),
    trim(p_motivo),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'colaborador_id', p_colaborador_id,
    'lancamento_id', v_lancamento_id,
    'componente', p_componente,
    'valor_antes', p_valor_esperado,
    'valor_depois', p_valor_novo,
    'total_linha_antes', v_total_linha_antes,
    'total_linha_depois', v_total_linha_depois,
    'total_geral_antes', v_total_geral_antes,
    'total_geral_depois', v_total_geral_depois,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.folha_corrigir_componente(integer, integer, text, text, text, numeric, numeric, text, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;

grant execute on function public.folha_corrigir_componente(integer, integer, text, text, text, numeric, numeric, text, jsonb) to authenticated, service_role;
