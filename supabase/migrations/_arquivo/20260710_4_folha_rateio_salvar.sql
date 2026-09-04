-- Fase 5 / Fatia A: substitui atomicamente as fatias mensais de uma pessoa.
-- A UI envia todos os componentes; o banco deriva unidade e preserva totais.

create or replace function public.folha_rateio_contas_salvar(
  p_folha_id integer,
  p_colaborador_id integer,
  p_fatias jsonb,
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
  v_before jsonb;
  v_after jsonb;
  v_total_geral_antes numeric;
  v_total_geral_depois numeric;
  v_input_count integer;
  v_current_count integer;
  v_audit_id uuid;
  v_numero_hash text;
  v_last4 text;
  v_row record;
begin
  if p_fatias is null
     or jsonb_typeof(p_fatias) <> 'array'
     or jsonb_array_length(p_fatias) = 0 then
    raise exception 'p_fatias deve ser um array nao vazio.';
  end if;

  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    v_ator_tipo := 'web';
    v_ator_ref := auth.uid()::text;
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
  else
    raise exception 'papel nao autorizado para rateio da folha: %', v_role
      using errcode = '42501';
  end if;

  select total_geral
    into v_total_geral_antes
    from public.folhas_mensais
   where id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  perform 1
    from public.lancamentos_folha
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id
   for update;

  get diagnostics v_current_count = row_count;
  if v_current_count = 0 then
    raise exception 'colaborador_id % nao possui lancamentos na folha %.',
      p_colaborador_id, p_folha_id;
  end if;

  select jsonb_agg(to_jsonb(lf) order by lf.id)
    into v_before
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

  drop table if exists pg_temp.folha_rateio_input;

  create temporary table pg_temp.folha_rateio_input (
    ordem integer not null,
    lancamento_id integer null,
    categoria text null,
    conta_pagadora_id uuid null,
    salario numeric not null,
    bonus numeric not null,
    comissao numeric not null,
    passagem numeric not null,
    reembolso numeric not null,
    inss numeric not null,
    descontos numeric not null,
    unidade text null
  ) on commit drop;

  insert into pg_temp.folha_rateio_input (
    ordem, lancamento_id, categoria, conta_pagadora_id,
    salario, bonus, comissao, passagem, reembolso, inss, descontos
  )
  select
    ordinality::integer,
    nullif(item->>'lancamento_id', '')::integer,
    nullif(trim(item->>'categoria'), ''),
    nullif(item->>'conta_pagadora_id', '')::uuid,
    coalesce((item->>'salario')::numeric, 0),
    coalesce((item->>'bonus')::numeric, 0),
    coalesce((item->>'comissao')::numeric, 0),
    coalesce((item->>'passagem')::numeric, 0),
    coalesce((item->>'reembolso')::numeric, 0),
    coalesce((item->>'inss')::numeric, 0),
    coalesce((item->>'descontos')::numeric, 0)
  from jsonb_array_elements(p_fatias) with ordinality as x(item, ordinality);

  get diagnostics v_input_count = row_count;
  if v_input_count <> jsonb_array_length(p_fatias) then
    raise exception 'nem todas as fatias foram carregadas.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where categoria is null
       or conta_pagadora_id is null
       or salario < 0
       or bonus < 0
       or comissao < 0
       or passagem < 0
       or reembolso < 0
       or inss < 0
       or descontos < 0
  ) then
    raise exception 'categoria, conta e componentes nao negativos sao obrigatorios.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    group by categoria, conta_pagadora_id
    having count(*) > 1
  ) then
    raise exception 'conta pagadora repetida dentro da mesma categoria.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where lancamento_id is not null
    group by lancamento_id
    having count(*) > 1
  ) then
    raise exception 'lancamento_id nao pode ser reutilizado em duas fatias.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input i
    where not exists (
      select 1
      from public.lancamentos_folha lf
      where lf.folha_id = p_folha_id
        and lf.colaborador_id = p_colaborador_id
        and lf.categoria = i.categoria
    )
  ) then
    raise exception 'categoria enviada nao pertence ao colaborador nesta folha.';
  end if;

  if exists (
    select 1
    from pg_temp.folha_rateio_input i
    where i.lancamento_id is not null
      and not exists (
        select 1
        from public.lancamentos_folha lf
        where lf.id = i.lancamento_id
          and lf.folha_id = p_folha_id
          and lf.colaborador_id = p_colaborador_id
          and lf.categoria = i.categoria
      )
  ) then
    raise exception 'lancamento_id nao pertence a pessoa, folha e categoria informadas.';
  end if;

  update pg_temp.folha_rateio_input i
     set unidade = cc.codigo
    from public.financeiro_contas_bancarias b
    join public.financeiro_empresas e
      on e.id = b.empresa_id
     and e.ativo = true
    join public.centros_custo cc
      on cc.id = e.unidade_id
     and cc.ativo = true
   where b.id = i.conta_pagadora_id
     and b.ativo = true;

  if exists (
    select 1
    from pg_temp.folha_rateio_input
    where unidade is null or unidade not in ('cg', 'rec', 'bar')
  ) then
    raise exception 'conta pagadora inativa, inexistente ou sem unidade operacional.';
  end if;

  if exists (
    with antes as (
      select
        categoria,
        coalesce(sum(salario), 0) as salario,
        coalesce(sum(bonus), 0) as bonus,
        coalesce(sum(comissao), 0) as comissao,
        coalesce(sum(passagem), 0) as passagem,
        coalesce(sum(reembolso), 0) as reembolso,
        coalesce(sum(inss), 0) as inss,
        coalesce(sum(descontos), 0) as descontos
      from public.lancamentos_folha
      where folha_id = p_folha_id and colaborador_id = p_colaborador_id
      group by categoria
    ),
    depois as (
      select
        categoria,
        coalesce(sum(salario), 0) as salario,
        coalesce(sum(bonus), 0) as bonus,
        coalesce(sum(comissao), 0) as comissao,
        coalesce(sum(passagem), 0) as passagem,
        coalesce(sum(reembolso), 0) as reembolso,
        coalesce(sum(inss), 0) as inss,
        coalesce(sum(descontos), 0) as descontos
      from pg_temp.folha_rateio_input
      group by categoria
    )
    select 1
    from antes a
    full join depois d using (categoria)
    where a.categoria is null
       or d.categoria is null
       or a.salario is distinct from d.salario
       or a.bonus is distinct from d.bonus
       or a.comissao is distinct from d.comissao
       or a.passagem is distinct from d.passagem
       or a.reembolso is distinct from d.reembolso
       or a.inss is distinct from d.inss
       or a.descontos is distinct from d.descontos
  ) then
    raise exception 'totais por categoria e componente nao conferem.';
  end if;

  if exists (
    select 1
    from public.lancamentos_folha lf
    where lf.folha_id = p_folha_id
      and lf.colaborador_id = p_colaborador_id
      and not exists (
        select 1
        from pg_temp.folha_rateio_input i
        where i.lancamento_id = lf.id
      )
      and (
        coalesce(lf.detalhamento, '{}'::jsonb) <> '{}'::jsonb
        or nullif(trim(lf.observacoes), '') is not null
      )
  ) then
    raise exception 'detalhamento estruturado exige preservacao explicita da linha de origem.';
  end if;

  perform set_config('app.folha_rateio_rpc', 'on', true);

  delete from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id
     and not exists (
       select 1 from pg_temp.folha_rateio_input i
       where i.lancamento_id = lf.id
     );

  update public.lancamentos_folha lf
     set conta_pagadora_id = null,
         updated_at = now()
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id
     and exists (
       select 1 from pg_temp.folha_rateio_input i
       where i.lancamento_id = lf.id
     );

  for v_row in
    select * from pg_temp.folha_rateio_input order by ordem
  loop
    if v_row.lancamento_id is not null then
      update public.lancamentos_folha
         set unidade = v_row.unidade,
             categoria = v_row.categoria,
             conta_pagadora_id = v_row.conta_pagadora_id,
             salario = v_row.salario,
             bonus = v_row.bonus,
             comissao = v_row.comissao,
             passagem = v_row.passagem,
             reembolso = v_row.reembolso,
             inss = v_row.inss,
             descontos = v_row.descontos,
             updated_at = now()
       where id = v_row.lancamento_id;
    else
      insert into public.lancamentos_folha (
        folha_id, colaborador_id, unidade, categoria, conta_pagadora_id,
        salario, bonus, comissao, passagem, reembolso, inss, descontos,
        alert_checked, detalhamento, created_at, updated_at
      )
      values (
        p_folha_id, p_colaborador_id, v_row.unidade, v_row.categoria,
        v_row.conta_pagadora_id, v_row.salario, v_row.bonus,
        v_row.comissao, v_row.passagem, v_row.reembolso,
        v_row.inss, v_row.descontos, false, '{}'::jsonb, now(), now()
      );
    end if;
  end loop;

  perform public.recalc_folha_totais(p_folha_id);

  select total_geral
    into v_total_geral_depois
    from public.folhas_mensais
   where id = p_folha_id;

  if v_total_geral_depois is distinct from v_total_geral_antes then
    raise exception 'total geral da folha mudou durante o rateio: antes %, depois %.',
      v_total_geral_antes, v_total_geral_depois;
  end if;

  select jsonb_agg(to_jsonb(lf) order by lf.categoria, lf.conta_pagadora_id)
    into v_after
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

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
    case when v_ator_tipo = 'web' then 'Super Folha Web' else 'Sistema' end,
    v_ator_ref, v_numero_hash, v_last4, v_ator_tipo, 'folha',
    v_ator_tipo, v_role, 'lancamentos_folha', 'folha_rateio_colaborador',
    null, 'RATEIO_CONTAS',
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'fatias', v_before
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'fatias', v_after
    ),
    null, null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'colaborador_id', p_colaborador_id,
    'audit_id', v_audit_id,
    'fatias', v_after,
    'preflight', public.folha_rateio_contas_preflight(p_folha_id)
  );
end;
$$;

revoke all on function public.folha_rateio_contas_salvar(integer, integer, jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;

grant execute on function public.folha_rateio_contas_salvar(integer, integer, jsonb, jsonb) to authenticated, service_role;
