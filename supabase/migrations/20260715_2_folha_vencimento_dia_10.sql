-- Folhas fechadas a partir desta versao vencem no dia 10 da competencia.
-- A data do fechamento continua registrada separadamente em data_lancamento.

create or replace function public.folha_fechar(
  p_folha_id integer,
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
  v_status text;
  v_ano integer;
  v_mes integer;
  v_total_geral numeric;
  v_preflight jsonb;
  v_pendentes jsonb;
  v_existentes jsonb;
  v_contas_geradas jsonb := '[]'::jsonb;
  v_total_gerado numeric := 0;
  v_data_fechamento date := (now() at time zone 'America/Sao_Paulo')::date;
  v_data_vencimento date;
  v_competencia date;
  v_conta_id uuid;
  v_audit_id uuid;
  v_row record;
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
      raise exception 'ator.tipo nao permitido para service_role no fechamento da folha.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
    v_ator_nome := coalesce(nullif(p_ator->>'nome', ''), 'Sistema');
  else
    raise exception 'papel nao autorizado para fechar folha: %', v_role
      using errcode = '42501';
  end if;

  select f.status, f.ano, f.mes, f.total_geral
    into v_status, v_ano, v_mes, v_total_geral
    from public.folhas_mensais f
   where f.id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  perform 1
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
   for update;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'descricao', cp.descricao,
    'status', cp.status,
    'conta_pagadora_id', cp.conta_pagadora_id,
    'valor', cp.valor
  ) order by cp.created_at), '[]'::jsonb)
    into v_existentes
    from public.contas_pagar cp
   where cp.fonte_tipo = 'folha_pagamento'
     and cp.fonte_identificador = p_folha_id::text
     and cp.status <> 'cancelado';

  if jsonb_array_length(v_existentes) > 0 then
    raise exception 'folha % ja possui contas a pagar ativas: %.', p_folha_id, v_existentes;
  end if;

  if v_status <> 'aprovada' then
    raise exception 'status da folha deve ser aprovada para fechar; encontrado: %.', v_status;
  end if;

  v_preflight := public.folha_rateio_contas_preflight(p_folha_id);

  if coalesce((v_preflight->>'pronto')::boolean, false) is not true then
    select coalesce(jsonb_agg(x.pendente order by x.nome), '[]'::jsonb)
      into v_pendentes
      from (
        select distinct
          coalesce(c.nome_completo, c.nome) as nome,
          jsonb_build_object(
            'colaborador_id', c.id,
            'nome', coalesce(c.nome_completo, c.nome)
          ) as pendente
        from public.lancamentos_folha lf
        join public.colaboradores c on c.id = lf.colaborador_id
        where lf.folha_id = p_folha_id
          and lf.conta_pagadora_id is null
      ) x;

    raise exception
      'preflight da folha nao esta zerado. colaboradores pendentes de conta pagadora: %. problemas: %.',
      v_pendentes,
      coalesce(v_preflight->'problemas', '[]'::jsonb);
  end if;

  v_competencia := make_date(v_ano, v_mes, 1);
  v_data_vencimento := make_date(v_ano, v_mes, 10);

  for v_row in
    select
      lf.conta_pagadora_id,
      b.empresa_id,
      e.unidade_id as centro_custo_id,
      cc.codigo as unidade,
      coalesce(e.label_operacional, e.nome_fantasia, e.razao_social) as empresa,
      round(sum(lf.total), 2) as valor
    from public.lancamentos_folha lf
    join public.financeiro_contas_bancarias b
      on b.id = lf.conta_pagadora_id
     and b.ativo = true
    join public.financeiro_empresas e
      on e.id = b.empresa_id
     and e.ativo = true
    join public.centros_custo cc
      on cc.id = e.unidade_id
     and cc.ativo = true
    where lf.folha_id = p_folha_id
    group by
      lf.conta_pagadora_id,
      b.empresa_id,
      e.unidade_id,
      cc.codigo,
      e.label_operacional,
      e.nome_fantasia,
      e.razao_social
    having round(sum(lf.total), 2) > 0
    order by coalesce(e.label_operacional, e.nome_fantasia, e.razao_social)
  loop
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
      fonte_identificador,
      plano_conta_id,
      centro_custo_id,
      empresa_id,
      conta_pagadora_id
    )
    values (
      'Folha de Pagamento - ' || v_row.empresa || ' - ' || to_char(v_competencia, 'MM/YYYY'),
      v_row.unidade,
      v_row.valor,
      v_data_fechamento,
      v_data_vencimento,
      v_competencia,
      'pendente',
      null,
      null,
      'folha_pagamento',
      null,
      null,
      'Conta a pagar gerada pelo fechamento da folha. O DRE permanece detalhado nos lancamentos da folha.',
      'folha_pagamento',
      p_folha_id::text,
      null, -- plano_conta_id: obrigacao agregada fora da soma por plano
      v_row.centro_custo_id,
      v_row.empresa_id,
      v_row.conta_pagadora_id
    )
    returning id into v_conta_id;

    v_total_gerado := v_total_gerado + v_row.valor;
    v_contas_geradas := v_contas_geradas || jsonb_build_array(jsonb_build_object(
      'id', v_conta_id,
      'empresa', v_row.empresa,
      'valor', v_row.valor
    ));
  end loop;

  if round(v_total_gerado, 2) is distinct from round(v_total_geral, 2) then
    raise exception 'soma das contas geradas % nao confere com o total geral da folha %.',
      round(v_total_gerado, 2), round(v_total_geral, 2);
  end if;

  update public.folhas_mensais
     set status = 'fechada',
         updated_at = now()
   where id = p_folha_id;

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
    'folhas_mensais', 'folha_fechamento', null,
    'FECHAR_FOLHA',
    jsonb_build_object(
      'folha_id', p_folha_id,
      'status', v_status,
      'total_geral', v_total_geral
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'status', 'fechada',
      'total_geral', v_total_geral,
      'contas_geradas', v_contas_geradas
    ),
    nullif(trim(p_ator->>'motivo'), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'status', 'fechada',
    'contas_geradas', v_contas_geradas,
    'total_geral', v_total_geral,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.folha_fechar(integer, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.folha_fechar(integer, jsonb)
  to authenticated, service_role;

comment on function public.folha_fechar(integer, jsonb) is
  'Fecha uma folha aprovada e totalmente rateada, gerando obrigacoes por conta pagadora com vencimento no dia 10 da competencia.';
