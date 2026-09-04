-- Bistro automatico na folha.
-- Esta migration cria somente contratos de banco; nao reclassifica snapshots
-- fechados nem marca pagamentos diretos historicos por inferencia.

alter table public.bistro_consumos
  add column if not exists valor_pago_direto numeric not null default 0;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bistro_consumos'::regclass
      and conname = 'bistro_consumos_valor_pago_direto_check'
  ) then
    alter table public.bistro_consumos
      add constraint bistro_consumos_valor_pago_direto_check
      check (valor_pago_direto >= 0 and valor_pago_direto <= valor);
  end if;
end;
$constraint$;

-- Ancora auditada de junho/2026. Os valores individuais sao apenas a prova
-- aritmetica; a marcacao das linhas reais deve passar pela RPC auditada.
do $junho_anchor$
declare
  v_bruto numeric := 5955.48;
  v_pago_direto numeric := round(59.30 + 98.70 + 32.90, 2);
  v_pago_direto_esperado numeric := 190.90;
  v_aplicavel numeric := 5764.58;
begin
  if v_pago_direto <> v_pago_direto_esperado
     or round(v_bruto - v_pago_direto, 2) <> v_aplicavel then
    raise exception 'ancora Bistro junho/2026 nao reconciliou.';
  end if;
end;
$junho_anchor$;

-- O parametro false existe apenas para validar snapshots v4 ja fechados,
-- cujo payload antecede a coluna valor_pago_direto. Novas classificacoes usam
-- sempre o default true e incluem a coluna no hash canonico.
create or replace function public.folha_dre_hash_origem(
  p_folha_id integer,
  p_incluir_valor_pago_direto boolean default true
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano integer;
  v_mes integer;
  v_total_geral numeric;
  v_competencia date;
  v_bistro_ref_date date;
  v_bistro_ref_ym text;
  v_bistro_competencia_id uuid;
  v_ruleset_version integer;
  v_hash_payload text;
begin
  select f.ano, f.mes, coalesce(f.total_geral, 0)
    into v_ano, v_mes, v_total_geral
    from public.folhas_mensais f
   where f.id = p_folha_id;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  v_competencia := make_date(v_ano, v_mes, 1);
  v_bistro_ref_date := (v_competencia - interval '1 month')::date;
  v_bistro_ref_ym := to_char(v_bistro_ref_date, 'YYYY-MM');

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_bistro_ref_date)::integer
     and bc.mes = extract(month from v_bistro_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1;

  select max(r.ruleset_version)
    into v_ruleset_version
    from public.folha_regra_plano_conta r
   where r.ativo = true
     and r.vigencia_inicio <= v_competencia
     and (r.vigencia_fim is null or r.vigencia_fim >= v_competencia);

  if v_ruleset_version is null then
    raise exception 'nenhum ruleset de classificacao DRE ativo para %.', v_competencia;
  end if;

  select jsonb_build_object(
    'folha_id', p_folha_id,
    'ano', v_ano,
    'mes', v_mes,
    'total_geral', v_total_geral,
    'ruleset_version', v_ruleset_version,
    'bistro_competencia_id', v_bistro_competencia_id,
    'bistro_ref_ym', v_bistro_ref_ym,
    'lancamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lf.id,
        'colaborador_id', lf.colaborador_id,
        'categoria', lf.categoria,
        'tipo', c.tipo,
        'funcao', c.funcao,
        'unidade', lf.unidade,
        'conta_pagadora_id', lf.conta_pagadora_id,
        'salario', coalesce(lf.salario, 0),
        'bonus', coalesce(lf.bonus, 0),
        'comissao', coalesce(lf.comissao, 0),
        'passagem', coalesce(lf.passagem, 0),
        'reembolso', coalesce(lf.reembolso, 0),
        'inss', coalesce(lf.inss, 0),
        'descontos', coalesce(lf.descontos, 0),
        'detalhamento', coalesce(lf.detalhamento, '{}'::jsonb)
      ) order by lf.id)
      from public.lancamentos_folha lf
      join public.colaboradores c on c.id = lf.colaborador_id
      where lf.folha_id = p_folha_id
    ), '[]'::jsonb),
    'bistro_consumos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bc.id,
          'colaborador_id', bc.colaborador_id,
          'valor', bc.valor
        ) || case when p_incluir_valor_pago_direto
          then jsonb_build_object(
            'valor_pago_direto', coalesce(bc.valor_pago_direto, 0)
          )
          else '{}'::jsonb
        end
        order by bc.id
      )
      from public.bistro_consumos bc
      where bc.competencia_id = v_bistro_competencia_id
    ), '[]'::jsonb)
  )::text
    into v_hash_payload;

  return encode(extensions.digest(v_hash_payload, 'sha256'), 'hex');
end;
$$;

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

  if exists (
    select 1
    from public.folha_classificacao_dre s
    join public.folhas_mensais f on f.id = s.folha_id
    where s.bistro_competencia_id = v_consumo.competencia_id
      and f.status = 'fechada'
  ) then
    raise exception
      'valor_pago_direto protegido: competencia alimentou snapshot de folha fechada.';
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

create or replace function public.bistro_consumo_valor_pago_direto_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.valor_pago_direto is distinct from old.valor_pago_direto
     and current_setting('app.bistro_pagamento_direto_rpc', true) is distinct from 'on' then
    raise exception 'valor_pago_direto deve ser alterado pela RPC auditada.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists bistro_consumos_valor_pago_direto_guard
  on public.bistro_consumos;

create trigger bistro_consumos_valor_pago_direto_guard
before update of valor_pago_direto on public.bistro_consumos
for each row
execute function public.bistro_consumo_valor_pago_direto_guard();

create or replace function public.folha_sugerir_desconto_bistro(
  p_folha_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_folha_status text;
  v_ano integer;
  v_mes integer;
  v_bistro_ref_date date;
  v_ref_ym text;
  v_bistro_competencia_id uuid;
  v_result jsonb;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role not in ('service_role', 'postgres') then
    raise exception 'papel nao autorizado para sugerir desconto Bistro: %', v_role
      using errcode = '42501';
  end if;

  select f.status, f.ano, f.mes
    into v_folha_status, v_ano, v_mes
    from public.folhas_mensais f
   where f.id = p_folha_id;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  v_bistro_ref_date := (make_date(v_ano, v_mes, 1) - interval '1 month')::date;
  v_ref_ym := to_char(v_bistro_ref_date, 'YYYY-MM');

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_bistro_ref_date)::integer
     and bc.mes = extract(month from v_bistro_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1;

  with consumo_totais as (
    select
      bc.colaborador_id,
      round(coalesce(sum(bc.valor), 0), 2) as valor_consumo,
      round(coalesce(sum(bc.valor_pago_direto), 0), 2) as valor_pago_direto,
      round(coalesce(sum(greatest(valor - valor_pago_direto, 0)), 0), 2)
        as valor_aplicavel
    from public.bistro_consumos bc
    where bc.competencia_id = v_bistro_competencia_id
    group by bc.colaborador_id
  ), linhas_raw as (
    select
      lf.id as lancamento_id,
      lf.colaborador_id,
      lf.unidade,
      lf.categoria,
      lf.conta_pagadora_id,
      round(coalesce(lf.salario, 0), 2) as salario,
      round(coalesce(lf.bonus, 0), 2) as bonus,
      round(coalesce(lf.comissao, 0), 2) as comissao,
      round(coalesce(lf.passagem, 0), 2) as passagem,
      round(coalesce(lf.reembolso, 0), 2) as reembolso,
      round(coalesce(lf.inss, 0), 2) as inss,
      round(coalesce(lf.descontos, 0), 2) as descontos_atual,
      coalesce(lf.detalhamento, '{}'::jsonb) - '__bistro'
        as detalhamento_sem_bistro,
      coalesce(lf.detalhamento, '{}'::jsonb) ? '__bistro' as tem_meta,
      lf.detalhamento->'__bistro'->>'ref_ym' as meta_ref_ym,
      lf.detalhamento->'__bistro'->>'updated_at' as meta_updated_at,
      case
        when jsonb_typeof(lf.detalhamento->'__bistro'->'valor') = 'number'
          then (lf.detalhamento->'__bistro'->>'valor')::numeric
        when coalesce(lf.detalhamento->'__bistro'->>'valor', '')
             ~ '^-?[0-9]+([.,][0-9]+)?$'
          then replace(lf.detalhamento->'__bistro'->>'valor', ',', '.')::numeric
        else null
      end as meta_valor
    from public.lancamentos_folha lf
    where lf.folha_id = p_folha_id
  ), linhas_meta as (
    select
      lr.*,
      (
        lr.tem_meta
        and lr.meta_ref_ym = v_ref_ym
        and lr.meta_valor is not null
        and lr.meta_valor >= 0
        and round(lr.meta_valor, 2) <= lr.descontos_atual
      ) as meta_valida,
      -- metadata normalizada: chaves estaveis, numericos em centavos e sem
      -- depender da ordem original do jsonb.
      jsonb_build_object(
        'presente', lr.tem_meta,
        'ref_ym', lr.meta_ref_ym,
        'valor_centavos', case when lr.meta_valor is null then null
          else round(lr.meta_valor * 100)::bigint end,
        'updated_at', lr.meta_updated_at
      ) as metadata_normalizada
    from linhas_raw lr
  ), linhas_valores as (
    select
      lm.*,
      case when lm.meta_valida then round(lm.meta_valor, 2) else 0::numeric end
        as bistro_anterior,
      round(
        lm.descontos_atual
        - case when lm.meta_valida then round(lm.meta_valor, 2) else 0::numeric end,
        2
      ) as outros_descontos
    from linhas_meta lm
  ), linhas_base as (
    select
      lv.*,
      greatest(round((
        lv.salario + lv.bonus + lv.comissao + lv.passagem + lv.reembolso
        - lv.inss - lv.outros_descontos
      ) * 100)::bigint, 0) as base_centavos,
      round(greatest(
        lv.salario + lv.bonus + lv.comissao + lv.passagem + lv.reembolso
        - lv.inss - lv.outros_descontos,
        0
      ), 2) as base_disponivel
    from linhas_valores lv
  ), pessoas_ids as (
    select colaborador_id from linhas_base
    union
    select colaborador_id from consumo_totais
  ), pessoa_totais as (
    select
      p.colaborador_id,
      coalesce(ct.valor_consumo, 0) as valor_consumo,
      coalesce(ct.valor_pago_direto, 0) as valor_pago_direto,
      coalesce(ct.valor_aplicavel, 0) as valor_aplicavel,
      round(coalesce(ct.valor_aplicavel, 0) * 100)::bigint as aplicavel_centavos,
      count(lb.lancamento_id)::integer as linhas,
      count(*) filter (where lb.tem_meta)::integer as meta_presentes,
      count(*) filter (where lb.meta_valida)::integer as meta_validas,
      round(coalesce(sum(lb.bistro_anterior), 0), 2) as ja_aplicado,
      round(coalesce(sum(lb.outros_descontos), 0), 2) as outros_descontos,
      round(coalesce(sum(lb.descontos_atual), 0), 2) as descontos_total,
      coalesce(sum(lb.base_centavos), 0)::bigint as base_total_centavos
    from pessoas_ids p
    left join consumo_totais ct on ct.colaborador_id = p.colaborador_id
    left join linhas_base lb on lb.colaborador_id = p.colaborador_id
    group by
      p.colaborador_id,
      ct.valor_consumo,
      ct.valor_pago_direto,
      ct.valor_aplicavel
  ), linhas_rateio_base as (
    select
      lb.*,
      pt.aplicavel_centavos,
      pt.base_total_centavos,
      max(lb.lancamento_id) filter (where lb.base_centavos > 0)
        over (partition by lb.colaborador_id) as ultima_linha_positiva,
      case
        when lb.base_centavos <= 0
          or pt.base_total_centavos <= 0
          or pt.aplicavel_centavos > pt.base_total_centavos then 0::bigint
        else floor(
          pt.aplicavel_centavos::numeric * lb.base_centavos::numeric
          / pt.base_total_centavos::numeric
        )::bigint
      end as parcela_base_centavos
    from linhas_base lb
    join pessoa_totais pt on pt.colaborador_id = lb.colaborador_id
  ), linhas_rateio as (
    select
      lrb.*,
      -- A ultima linha positiva recebe o residuo inteiro de centavos.
      case
        when lrb.aplicavel_centavos > lrb.base_total_centavos
          or lrb.base_total_centavos <= 0 then 0::bigint
        when lrb.lancamento_id = lrb.ultima_linha_positiva then
          lrb.parcela_base_centavos + (
            lrb.aplicavel_centavos
            - sum(lrb.parcela_base_centavos) over (
                partition by lrb.colaborador_id
              )
          )
        else lrb.parcela_base_centavos
      end as bistro_novo_centavos
    from linhas_rateio_base lrb
  ), linhas_agrupadas as (
    select
      lr.colaborador_id,
      bool_and(round(lr.bistro_anterior * 100)::bigint = lr.bistro_novo_centavos)
        as alocacao_igual,
      jsonb_agg(jsonb_build_object(
        'lancamento_id', lr.lancamento_id,
        'unidade', lr.unidade,
        'categoria', lr.categoria,
        'conta_pagadora_id', lr.conta_pagadora_id,
        'descontos_atual', lr.descontos_atual,
        'bistro_anterior', lr.bistro_anterior,
        'outros_descontos', lr.outros_descontos,
        'base_disponivel', lr.base_disponivel,
        'bistro_novo', round(lr.bistro_novo_centavos::numeric / 100, 2),
        'descontos_novo', round(
          lr.outros_descontos + lr.bistro_novo_centavos::numeric / 100,
          2
        )
      ) order by lr.lancamento_id) as linhas,
      jsonb_agg(jsonb_build_object(
        'lancamento_id', lr.lancamento_id,
        'salario_centavos', round(lr.salario * 100)::bigint,
        'bonus_centavos', round(lr.bonus * 100)::bigint,
        'comissao_centavos', round(lr.comissao * 100)::bigint,
        'passagem_centavos', round(lr.passagem * 100)::bigint,
        'reembolso_centavos', round(lr.reembolso * 100)::bigint,
        'inss_centavos', round(lr.inss * 100)::bigint,
        'descontos_novo_centavos', round((
          lr.outros_descontos + lr.bistro_novo_centavos::numeric / 100
        ) * 100)::bigint,
        'metadata_normalizada', lr.detalhamento_sem_bistro
          || jsonb_build_object(
            '__bistro', jsonb_build_object(
              'valor_centavos', lr.bistro_novo_centavos,
              'ref_ym', v_ref_ym
            )
          ),
        'conta_pagadora_id', lr.conta_pagadora_id,
        'unidade', lr.unidade,
        'categoria', lr.categoria
      ) order by lr.lancamento_id) as linhas_hash
    from linhas_rateio lr
    group by lr.colaborador_id
  ), pessoas_com_hash as (
    select
      pt.*,
      coalesce(la.alocacao_igual, false) as alocacao_igual,
      coalesce(la.linhas, '[]'::jsonb) as linhas_json,
      encode(extensions.digest(
        jsonb_build_object(
          'allocation_version', 'bistro-write-v1',
          'folha_id', p_folha_id,
          'bistro_competencia_id', v_bistro_competencia_id,
          'ref_ym', v_ref_ym,
          'valor_aplicavel_centavos', pt.aplicavel_centavos,
          'linhas', coalesce(la.linhas_hash, '[]'::jsonb)
        )::text,
        'sha256'
      ), 'hex') as source_hash
    from pessoa_totais pt
    left join linhas_agrupadas la on la.colaborador_id = pt.colaborador_id
  ), pessoas_json as (
    select
      ph.*,
      coalesce(c.nome_completo, c.nome) as nome,
      (ph.meta_presentes > 0 and ph.meta_validas <> ph.linhas) as metadata_mista,
      (ph.meta_presentes = 0 and ph.descontos_total > 0) as desconto_sem_origem,
      case
        when ph.linhas = 0 then 'sem_lancamento'
        when ph.meta_presentes > 0 and ph.meta_validas <> ph.linhas
          then 'metadata mista'
        when ph.aplicavel_centavos > ph.base_total_centavos
          then 'consumo maior que a base disponivel'
        when v_bistro_competencia_id is null and ph.ja_aplicado = 0
          then 'sem_competencia'
        when ph.valor_aplicavel = 0 and ph.ja_aplicado > 0
          then 'pronto_remover'
        when ph.alocacao_igual then 'already_applied'
        when ph.meta_presentes = 0 and ph.descontos_total > 0
          then 'desconto_sem_origem'
        else 'pronto_aplicar'
      end as status
    from pessoas_com_hash ph
    join public.colaboradores c on c.id = ph.colaborador_id
  )
  select jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'folha_status', v_folha_status,
    'bistro_competencia_id', v_bistro_competencia_id,
    'ref_ym', v_ref_ym,
    'resumo', jsonb_build_object(
      'pessoas', count(*)::integer,
      'total_bruto', round(coalesce(sum(pj.valor_consumo), 0), 2),
      'pago_direto', round(coalesce(sum(pj.valor_pago_direto), 0), 2),
      'aplicavel', round(coalesce(sum(pj.valor_aplicavel), 0), 2),
      'ja_aplicado', round(coalesce(sum(pj.ja_aplicado), 0), 2),
      'outros_descontos', round(coalesce(sum(pj.outros_descontos), 0), 2),
      'divergencia', round(coalesce(sum(pj.valor_aplicavel - pj.ja_aplicado), 0), 2)
    ),
    'pessoas', coalesce(jsonb_agg(jsonb_build_object(
      'colaborador_id', pj.colaborador_id,
      'nome', pj.nome,
      'valor_consumo', pj.valor_consumo,
      'valor_pago_direto', pj.valor_pago_direto,
      'valor_aplicavel', pj.valor_aplicavel,
      'ja_aplicado', pj.ja_aplicado,
      'outros_descontos', pj.outros_descontos,
      'divergencia', round(pj.valor_aplicavel - pj.ja_aplicado, 2),
      'status', pj.status,
      'desconto_sem_origem', pj.desconto_sem_origem,
      'source_hash', pj.source_hash,
      'linhas', pj.linhas_json
    ) order by pj.nome, pj.colaborador_id), '[]'::jsonb)
  )
    into v_result
    from pessoas_json pj;

  return v_result;
end;
$$;

create or replace function public.folha_aplicar_sugestao_bistro(
  p_folha_id integer,
  p_colaborador_id integer,
  p_acao text,
  p_source_hash_esperado text,
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
  v_folha_status text;
  v_ano integer;
  v_mes integer;
  v_bistro_ref_date date;
  v_bistro_competencia_id uuid;
  v_sugestao jsonb;
  v_pessoa jsonb;
  v_source_hash text;
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_total_geral_antes numeric;
  v_total_geral_depois numeric;
  v_bistro_anterior_total numeric;
  v_bistro_novo_total numeric;
  v_delta_esperado numeric;
  v_linhas_esperadas integer;
  v_linhas_atualizadas integer;
  v_audit_id uuid;
begin
  if p_acao not in ('aplicar', 'remover') then
    raise exception 'p_acao deve ser aplicar ou remover.';
  end if;

  if nullif(trim(p_source_hash_esperado), '') is null then
    raise exception 'p_source_hash_esperado e obrigatorio.';
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
      raise exception 'ator.tipo nao permitido para service_role nesta fatia.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
    v_ator_nome := coalesce(nullif(p_ator->>'nome', ''), 'Sistema');
  else
    raise exception 'papel nao autorizado para aplicar desconto Bistro: %', v_role
      using errcode = '42501';
  end if;

  select f.status, f.ano, f.mes, coalesce(f.total_geral, 0)
    into v_folha_status, v_ano, v_mes, v_total_geral_antes
    from public.folhas_mensais f
   where f.id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  if v_folha_status <> 'rascunho' then
    raise exception 'folha deve estar em rascunho para alterar desconto Bistro.';
  end if;

  v_bistro_ref_date := (make_date(v_ano, v_mes, 1) - interval '1 month')::date;

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_bistro_ref_date)::integer
     and bc.mes = extract(month from v_bistro_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1
   for update;

  perform 1
    from public.bistro_consumos bc
   where bc.competencia_id = v_bistro_competencia_id
     and bc.colaborador_id = p_colaborador_id
   order by bc.id
   for update;

  perform 1
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id
   order by lf.id
   for update;

  v_sugestao := public.folha_sugerir_desconto_bistro(p_folha_id);

  select x.item
    into v_pessoa
    from jsonb_array_elements(v_sugestao->'pessoas') as x(item)
   where (x.item->>'colaborador_id')::integer = p_colaborador_id;

  if v_pessoa is null then
    raise exception 'colaborador_id % nao participa da sugestao da folha %.',
      p_colaborador_id, p_folha_id;
  end if;

  v_status := v_pessoa->>'status';
  v_source_hash := v_pessoa->>'source_hash';
  v_bistro_anterior_total := coalesce((v_pessoa->>'ja_aplicado')::numeric, 0);
  v_bistro_novo_total := case when p_acao = 'aplicar'
    then coalesce((v_pessoa->>'valor_aplicavel')::numeric, 0)
    else 0::numeric
  end;
  v_linhas_esperadas := jsonb_array_length(v_pessoa->'linhas');

  if v_status = 'sem_lancamento' then
    raise exception 'sem_lancamento: colaborador nao possui linha na folha.';
  end if;

  if v_status = 'metadata mista' then
    raise exception 'metadata mista: pessoa inteira bloqueada sem escrita.';
  end if;

  if v_status = 'consumo maior que a base disponivel' then
    raise exception 'consumo maior que a base disponivel: aplicacao inteira bloqueada.';
  end if;

  if p_acao = 'aplicar' and v_bistro_novo_total = 0 then
    raise exception
      'consumo aplicavel igual a zero exige p_acao=remover explicito; remocao nao e inferida.';
  end if;

  if v_source_hash is distinct from p_source_hash_esperado then
    raise exception 'Os valores mudaram. Atualize a sugestao antes de aplicar.';
  end if;

  -- Idempotencia e avaliada sob os locks. Se a alocacao alvo ja e a atual,
  -- nao ha escrita nem nova auditoria, mesmo para a repeticao do hash aplicado.
  if p_acao = 'aplicar' and not exists (
    select 1
    from jsonb_array_elements(v_pessoa->'linhas') as x(item)
    where round((x.item->>'bistro_anterior')::numeric, 2)
          is distinct from round((x.item->>'bistro_novo')::numeric, 2)
  ) then
    return jsonb_build_object(
      'success', true,
      'status', 'already_applied',
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'source_hash', v_source_hash,
      'total_antes', v_total_geral_antes,
      'total_depois', v_total_geral_antes,
      'audit_id', null
    );
  end if;

  if p_acao = 'remover' and v_bistro_anterior_total = 0 then
    return jsonb_build_object(
      'success', true,
      'status', 'already_removed',
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'source_hash', v_source_hash,
      'total_antes', v_total_geral_antes,
      'total_depois', v_total_geral_antes,
      'audit_id', null
    );
  end if;

  if p_acao = 'remover' and exists (
    select 1
    from jsonb_array_elements(v_pessoa->'linhas') as x(item)
    join public.lancamentos_folha lf
      on lf.id = (x.item->>'lancamento_id')::integer
    where not (coalesce(lf.detalhamento, '{}'::jsonb) ? '__bistro')
  ) then
    raise exception 'remocao exige __bistro valido em todas as linhas da pessoa.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(lf) order by lf.id), '[]'::jsonb)
    into v_before
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

  perform set_config('app.folha_bistro_rpc', 'on', true);

  with alvo as (
    select
      (x.item->>'lancamento_id')::integer as lancamento_id,
      (x.item->>'bistro_novo')::numeric as bistro_novo,
      (x.item->>'descontos_novo')::numeric as descontos_novo,
      (x.item->>'outros_descontos')::numeric as outros_descontos
    from jsonb_array_elements(v_pessoa->'linhas') as x(item)
  )
  update public.lancamentos_folha lf
     set descontos = case when p_acao = 'aplicar'
           then round(a.descontos_novo, 2)
           else round(a.outros_descontos, 2)
         end,
         detalhamento = case when p_acao = 'aplicar' then
           jsonb_set(
             coalesce(lf.detalhamento, '{}'::jsonb),
             '{__bistro}',
             coalesce(lf.detalhamento->'__bistro', '{}'::jsonb)
             || jsonb_build_object(
               'valor', round(a.bistro_novo, 2),
               'ref_ym', v_sugestao->>'ref_ym',
               'updated_at', to_char(
                 clock_timestamp() at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
               ),
               'source_hash', v_source_hash
             ),
             true
           )
           else coalesce(lf.detalhamento, '{}'::jsonb) - '__bistro'
         end,
         updated_at = now()
    from alvo a
   where lf.id = a.lancamento_id
     and lf.folha_id = p_folha_id
     and lf.colaborador_id = p_colaborador_id;

  get diagnostics v_linhas_atualizadas = row_count;
  if v_linhas_atualizadas <> v_linhas_esperadas then
    raise exception 'falha atomica: esperadas % linhas e atualizadas %.',
      v_linhas_esperadas, v_linhas_atualizadas;
  end if;

  perform public.recalc_folha_totais(p_folha_id);

  select coalesce(f.total_geral, 0)
    into v_total_geral_depois
    from public.folhas_mensais f
   where f.id = p_folha_id;

  v_delta_esperado := round(v_bistro_anterior_total - v_bistro_novo_total, 2);

  if round((v_total_geral_depois - v_total_geral_antes) * 100)::bigint
     is distinct from round(v_delta_esperado * 100)::bigint then
    raise exception
      'sinal do total_geral invalido: total_geral_depois %, total_geral_antes %, bistro_anterior %, bistro_novo %.',
      v_total_geral_depois, v_total_geral_antes,
      v_bistro_anterior_total, v_bistro_novo_total;
  end if;

  select coalesce(jsonb_agg(to_jsonb(lf) order by lf.id), '[]'::jsonb)
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
    v_ator_nome, v_ator_ref, v_numero_hash, v_last4,
    v_ator_tipo, 'folha', v_ator_tipo, v_role,
    'lancamentos_folha', 'folha_bistro_colaborador', null,
    case when p_acao = 'aplicar'
      then 'APLICAR_DESCONTO_BISTRO'
      else 'REMOVER_DESCONTO_BISTRO'
    end,
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'total_geral', v_total_geral_antes,
      'linhas', v_before
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'acao', p_acao,
      'source_hash', v_source_hash,
      'desconto_sem_origem_confirmado',
        coalesce((v_pessoa->>'desconto_sem_origem')::boolean, false),
      'total_geral', v_total_geral_depois,
      'linhas', v_after
    ),
    nullif(trim(p_ator->>'motivo'), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'status', case when p_acao = 'aplicar' then 'applied' else 'removed' end,
    'folha_id', p_folha_id,
    'colaborador_id', p_colaborador_id,
    'source_hash', v_source_hash,
    'total_antes', v_total_geral_antes,
    'total_depois', v_total_geral_depois,
    'audit_id', v_audit_id
  );
end;
$$;

create or replace function public.folha_duplicar_lancamentos_preflight(
  p_folha_origem_id integer,
  p_folha_destino_id integer,
  p_unidades text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_origem_status text;
  v_origem_ano integer;
  v_origem_mes integer;
  v_destino_status text;
  v_ref_date date;
  v_ref_ym text;
  v_bistro_competencia_id uuid;
  v_unidades text[];
  v_origem_linhas integer;
  v_destino_ocupado integer;
  v_hash_origem_atual text;
  v_hash_origem_legacy text;
  v_snapshot_hash text;
  v_snapshot_hashes integer;
  v_snapshot_linhas integer;
  v_snapshot_valido boolean;
  v_legacy_sem_pagamento_direto boolean;
  v_ambiguos jsonb;
  v_insercoes jsonb;
  v_conflitos jsonb;
  v_source_hash text;
  v_pode_duplicar boolean;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role not in ('service_role', 'postgres') then
    raise exception 'papel nao autorizado para preflight de duplicacao: %', v_role
      using errcode = '42501';
  end if;

  if p_folha_origem_id = p_folha_destino_id then
    raise exception 'folha de origem e destino devem ser diferentes.';
  end if;

  if p_unidades is null or cardinality(p_unidades) = 0 then
    raise exception 'p_unidades deve conter ao menos uma unidade.';
  end if;

  if exists (
    select 1 from unnest(p_unidades) as u(unidade)
    where u.unidade is null or u.unidade not in ('cg', 'rec', 'bar')
  ) then
    raise exception 'unidades devem ser subconjunto de {cg,rec,bar}.';
  end if;

  if (select count(*) from unnest(p_unidades))
     <> (select count(distinct unidade) from unnest(p_unidades) as u(unidade)) then
    raise exception 'unidades repetidas ou duplicadas nao sao permitidas.';
  end if;

  select array_agg(u.unidade order by u.unidade)
    into v_unidades
    from unnest(p_unidades) as u(unidade);

  select f.status, f.ano, f.mes
    into v_origem_status, v_origem_ano, v_origem_mes
    from public.folhas_mensais f
   where f.id = p_folha_origem_id;

  if not found then
    raise exception 'folha de origem % nao encontrada.', p_folha_origem_id;
  end if;

  select f.status
    into v_destino_status
    from public.folhas_mensais f
   where f.id = p_folha_destino_id;

  if not found then
    raise exception 'folha de destino % nao encontrada.', p_folha_destino_id;
  end if;

  v_ref_date := (
    make_date(v_origem_ano, v_origem_mes, 1) - interval '1 month'
  )::date;
  v_ref_ym := to_char(v_ref_date, 'YYYY-MM');

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_ref_date)::integer
     and bc.mes = extract(month from v_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1;

  select count(*)::integer
    into v_origem_linhas
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_origem_id
     and lf.unidade = any(v_unidades);

  select count(*)::integer
    into v_destino_ocupado
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_destino_id
     and lf.unidade = any(v_unidades);

  v_hash_origem_atual := public.folha_dre_hash_origem(
    p_folha_origem_id,
    true
  );
  v_hash_origem_legacy := public.folha_dre_hash_origem(
    p_folha_origem_id,
    false
  );

  select
    count(*)::integer,
    count(distinct s.hash_origem)::integer,
    min(s.hash_origem)
  into v_snapshot_linhas, v_snapshot_hashes, v_snapshot_hash
  from public.folha_classificacao_dre s
  where s.folha_id = p_folha_origem_id;

  select not exists (
    select 1
    from public.bistro_consumos bc
    where bc.competencia_id = v_bistro_competencia_id
      and bc.valor_pago_direto <> 0
  ) into v_legacy_sem_pagamento_direto;

  v_snapshot_valido := v_snapshot_linhas > 0
    and v_snapshot_hashes = 1
    and (
      v_snapshot_hash = v_hash_origem_atual
      or (
        v_legacy_sem_pagamento_direto
        and v_snapshot_hash = v_hash_origem_legacy
      )
    );

  with origem_raw as (
    select
      lf.id as lancamento_id,
      lf.colaborador_id,
      lf.unidade,
      lf.categoria,
      lf.salario,
      lf.bonus,
      lf.comissao,
      lf.passagem,
      lf.reembolso,
      lf.inss,
      round(coalesce(lf.descontos, 0), 2) as descontos,
      lf.observacoes,
      coalesce(lf.detalhamento, '{}'::jsonb)
        - '__bistro' - '__rateio' - 'rateio' - 'conta_pagadora_id'
        as detalhamento_limpo,
      coalesce(lf.detalhamento, '{}'::jsonb) ? '__bistro' as tem_meta,
      lf.detalhamento->'__bistro'->>'ref_ym' as meta_ref_ym,
      case
        when jsonb_typeof(lf.detalhamento->'__bistro'->'valor') = 'number'
          then (lf.detalhamento->'__bistro'->>'valor')::numeric
        when coalesce(lf.detalhamento->'__bistro'->>'valor', '')
             ~ '^-?[0-9]+([.,][0-9]+)?$'
          then replace(lf.detalhamento->'__bistro'->>'valor', ',', '.')::numeric
        else null
      end as meta_valor
    from public.lancamentos_folha lf
    where lf.folha_id = p_folha_origem_id
      and lf.unidade = any(v_unidades)
  ), dre_liquidacao as (
    select
      s.lancamento_folha_id as lancamento_id,
      round(sum(s.valor_original), 2) as valor_bistro
    from public.folha_classificacao_dre s
    where s.folha_id = p_folha_origem_id
      and s.tipo_efeito = 'liquidacao'
      and s.hash_origem = v_snapshot_hash
    group by s.lancamento_folha_id
  ), linhas_meta as (
    select
      o.*,
      (
        o.tem_meta
        and o.meta_ref_ym = v_ref_ym
        and o.meta_valor is not null
        and o.meta_valor >= 0
        and round(o.meta_valor, 2) <= o.descontos
      ) as meta_valida,
      coalesce(dl.valor_bistro, 0) as dre_bistro
    from origem_raw o
    left join dre_liquidacao dl on dl.lancamento_id = o.lancamento_id
  ), pessoa_prova as (
    select
      lm.colaborador_id,
      count(*)::integer as linhas,
      count(*) filter (where lm.meta_valida)::integer as meta_validas,
      round(sum(lm.descontos), 2) as descontos_total,
      round(sum(lm.dre_bistro), 2) as dre_bistro_total,
      case
        when count(*) filter (where lm.meta_valida) = count(*)
          then 'metadata'
        when v_snapshot_valido and round(sum(lm.dre_bistro), 2) <= round(sum(lm.descontos), 2)
          then 'snapshot_dre'
        when round(sum(lm.descontos), 2) = 0 then 'sem_desconto'
        else 'ambiguo'
      end as prova
    from linhas_meta lm
    group by lm.colaborador_id
  ), linhas_provadas as (
    select
      lm.*,
      pp.prova,
      round(case
        when pp.prova = 'metadata' then coalesce(lm.meta_valor, 0)
        when pp.prova = 'snapshot_dre' then lm.dre_bistro
        else 0
      end, 2) as bistro_remover
    from linhas_meta lm
    join pessoa_prova pp on pp.colaborador_id = lm.colaborador_id
  ), grupos as (
    select
      lp.colaborador_id,
      lp.unidade,
      lp.categoria,
      round(sum(coalesce(lp.salario, 0)), 2) as salario,
      round(sum(coalesce(lp.bonus, 0)), 2) as bonus,
      round(sum(coalesce(lp.comissao, 0)), 2) as comissao,
      round(sum(coalesce(lp.passagem, 0)), 2) as passagem,
      round(sum(coalesce(lp.reembolso, 0)), 2) as reembolso,
      round(sum(coalesce(lp.inss, 0)), 2) as inss,
      round(sum(lp.descontos - lp.bistro_remover), 2) as descontos,
      count(distinct nullif(trim(lp.observacoes), ''))::integer
        as observacoes_distintas,
      min(nullif(trim(lp.observacoes), '')) as observacoes,
      count(distinct lp.detalhamento_limpo)::integer as detalhes_distintos,
      (jsonb_agg(lp.detalhamento_limpo order by lp.lancamento_id))->0
        as detalhamento,
      min(lp.lancamento_id) as primeiro_lancamento_id
    from linhas_provadas lp
    group by lp.colaborador_id, lp.unidade, lp.categoria
  ), ambiguos_raw as (
    select
      pp.colaborador_id,
      'desconto sem prova Bistro por metadata completa ou snapshot DRE vigente'
        as motivo
    from pessoa_prova pp
    where pp.prova = 'ambiguo'
    union all
    select
      g.colaborador_id,
      'observacoes/detalhamento nao podem ser consolidados sem perda'
    from grupos g
    where g.observacoes_distintas > 1 or g.detalhes_distintos > 1
  ), ambiguos_agrupados as (
    select
      ar.colaborador_id,
      jsonb_agg(to_jsonb(ar.motivo) order by ar.motivo) as motivos
    from ambiguos_raw ar
    group by ar.colaborador_id
  ), insercoes_rows as (
    select g.*
    from grupos g
    where not exists (
      select 1
      from ambiguos_agrupados a
      where a.colaborador_id = g.colaborador_id
    )
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'colaborador_id', a.colaborador_id,
        'nome', coalesce(c.nome_completo, c.nome),
        'motivos', a.motivos
      ) order by coalesce(c.nome_completo, c.nome), a.colaborador_id)
      from ambiguos_agrupados a
      join public.colaboradores c on c.id = a.colaborador_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'colaborador_id', i.colaborador_id,
        'unidade', i.unidade,
        'categoria', i.categoria,
        'conta_pagadora_id', null,
        'salario', i.salario,
        'bonus', i.bonus,
        'comissao', i.comissao,
        'passagem', i.passagem,
        'reembolso', i.reembolso,
        'inss', i.inss,
        'descontos', i.descontos,
        'observacoes', i.observacoes,
        'detalhamento', i.detalhamento,
        'alert_checked', false
      ) order by i.colaborador_id, i.unidade, i.categoria)
      from insercoes_rows i
    ), '[]'::jsonb)
  into v_ambiguos, v_insercoes;

  v_conflitos := '[]'::jsonb;
  if v_destino_status <> 'rascunho' then
    v_conflitos := v_conflitos || jsonb_build_array(
      'destino deve estar em rascunho'
    );
  end if;
  if v_destino_ocupado > 0 then
    v_conflitos := v_conflitos || jsonb_build_array(
      'destino parcialmente preenchido nas unidades pedidas'
    );
  end if;
  if v_origem_linhas = 0 then
    v_conflitos := v_conflitos || jsonb_build_array(
      'origem sem lancamentos nas unidades pedidas'
    );
  end if;

  v_pode_duplicar := jsonb_array_length(v_ambiguos) = 0
    and jsonb_array_length(v_conflitos) = 0;

  select encode(extensions.digest(jsonb_build_object(
    'allocation_version', 'folha-duplicate-v1',
    'origem_folha_id', p_folha_origem_id,
    'destino_folha_id', p_folha_destino_id,
    'unidades', to_jsonb(v_unidades),
    'hash_origem_atual', v_hash_origem_atual,
    'hash_origem_legacy', v_hash_origem_legacy,
    'snapshot_hash_origem', v_snapshot_hash,
    'snapshot_valido', v_snapshot_valido,
    'origem_linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lancamento_id', x.lancamento_id,
        'colaborador_id', x.colaborador_id,
        'unidade', x.unidade,
        'categoria', x.categoria,
        'conta_pagadora_id', x.conta_pagadora_id,
        'salario', x.salario,
        'bonus', x.bonus,
        'comissao', x.comissao,
        'passagem', x.passagem,
        'reembolso', x.reembolso,
        'inss', x.inss,
        'descontos', x.descontos,
        'observacoes', x.observacoes,
        'detalhamento', x.detalhamento
      ) order by x.lancamento_id)
      from (
        select
          lf.id as lancamento_id,
          lf.colaborador_id,
          lf.unidade,
          lf.categoria,
          lf.conta_pagadora_id,
          lf.salario,
          lf.bonus,
          lf.comissao,
          lf.passagem,
          lf.reembolso,
          lf.inss,
          lf.descontos,
          lf.observacoes,
          lf.detalhamento
        from public.lancamentos_folha lf
        where lf.folha_id = p_folha_origem_id
          and lf.unidade = any(v_unidades)
      ) x
    ), '[]'::jsonb),
    'destino_linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lancamento_id', lf.id,
        'unidade', lf.unidade,
        'colaborador_id', lf.colaborador_id
      ) order by lf.id)
      from public.lancamentos_folha lf
      where lf.folha_id = p_folha_destino_id
        and lf.unidade = any(v_unidades)
    ), '[]'::jsonb),
    'ambiguos', v_ambiguos,
    'conflitos', v_conflitos,
    'insercoes', v_insercoes
  )::text, 'sha256'), 'hex')
    into v_source_hash;

  return jsonb_build_object(
    'success', true,
    'origem_folha_id', p_folha_origem_id,
    'destino_folha_id', p_folha_destino_id,
    'unidades', to_jsonb(v_unidades),
    'source_hash', v_source_hash,
    'pode_duplicar', v_pode_duplicar,
    'ambiguos', v_ambiguos,
    'conflitos', v_conflitos,
    'insercoes', v_insercoes,
    'snapshot_dre', jsonb_build_object(
      'hash_origem', v_snapshot_hash,
      'hash_atual', v_hash_origem_atual,
      'hash_legacy', v_hash_origem_legacy,
      'valido', v_snapshot_valido,
      'linhas', v_snapshot_linhas
    )
  );
end;
$$;

create or replace function public.folha_duplicar_lancamentos(
  p_folha_origem_id integer,
  p_folha_destino_id integer,
  p_unidades text[],
  p_source_hash_esperado text,
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
  v_destino_status text;
  v_preflight jsonb;
  v_before jsonb;
  v_after jsonb;
  v_total_antes numeric;
  v_total_depois numeric;
  v_inseridos integer;
  v_esperados integer;
  v_audit_id uuid;
begin
  if p_folha_origem_id = p_folha_destino_id then
    raise exception 'folha de origem e destino devem ser diferentes.';
  end if;

  if p_unidades is null or cardinality(p_unidades) = 0 then
    raise exception 'p_unidades deve conter ao menos uma unidade.';
  end if;

  if exists (
    select 1 from unnest(p_unidades) as u(unidade)
    where u.unidade is null or u.unidade not in ('cg', 'rec', 'bar')
  ) then
    raise exception 'unidades devem ser subconjunto de {cg,rec,bar}.';
  end if;

  if (select count(*) from unnest(p_unidades))
     <> (select count(distinct unidade) from unnest(p_unidades) as u(unidade)) then
    raise exception 'unidades repetidas ou duplicadas nao sao permitidas.';
  end if;

  if nullif(trim(p_source_hash_esperado), '') is null then
    raise exception 'p_source_hash_esperado e obrigatorio.';
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
      raise exception 'ator.tipo nao permitido para service_role nesta fatia.'
        using errcode = '42501';
    end if;
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
    v_ator_nome := coalesce(nullif(p_ator->>'nome', ''), 'Sistema');
  else
    raise exception 'papel nao autorizado para duplicar folha: %', v_role
      using errcode = '42501';
  end if;

  -- Folhas e linhas sao travadas em ordem deterministica para evitar deadlock.
  perform 1
    from public.folhas_mensais f
   where f.id in (p_folha_origem_id, p_folha_destino_id)
   order by f.id
   for update;

  if not exists (
    select 1 from public.folhas_mensais where id = p_folha_origem_id
  ) or not exists (
    select 1 from public.folhas_mensais where id = p_folha_destino_id
  ) then
    raise exception 'folha de origem ou destino nao encontrada.';
  end if;

  select f.status, coalesce(f.total_geral, 0)
    into v_destino_status, v_total_antes
    from public.folhas_mensais f
   where f.id = p_folha_destino_id;

  if v_destino_status <> 'rascunho' then
    raise exception 'destino deve estar em rascunho.';
  end if;

  perform 1
    from public.lancamentos_folha lf
   where lf.folha_id in (p_folha_origem_id, p_folha_destino_id)
   order by lf.folha_id, lf.id
   for update;

  v_preflight := public.folha_duplicar_lancamentos_preflight(
    p_folha_origem_id,
    p_folha_destino_id,
    p_unidades
  );

  if v_preflight->>'source_hash' is distinct from p_source_hash_esperado then
    raise exception 'Os valores mudaram. Atualize o preflight antes de duplicar.';
  end if;

  if coalesce((v_preflight->>'pode_duplicar')::boolean, false) is not true then
    raise exception 'duplicacao abortada atomicamente. ambiguos: %. conflitos: %.',
      coalesce(v_preflight->'ambiguos', '[]'::jsonb),
      coalesce(v_preflight->'conflitos', '[]'::jsonb);
  end if;

  -- Defesa adicional: o plano consolidado deve ter uma unica linha por chave.
  if exists (
    select 1
    from jsonb_to_recordset(v_preflight->'insercoes') as i(
      colaborador_id integer,
      unidade text,
      categoria text
    )
    group by i.colaborador_id, i.unidade, i.categoria
    having count(*) > 1
  ) then
    raise exception 'preflight gerou chave consolidada duplicada.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(lf) order by lf.id), '[]'::jsonb)
    into v_before
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_destino_id;

  v_esperados := jsonb_array_length(v_preflight->'insercoes');
  perform set_config('app.folha_duplicacao_rpc', 'on', true);

  insert into public.lancamentos_folha (
    folha_id,
    colaborador_id,
    unidade,
    categoria,
    conta_pagadora_id,
    salario,
    bonus,
    comissao,
    passagem,
    reembolso,
    inss,
    descontos,
    observacoes,
    detalhamento,
    alert_checked,
    created_at,
    updated_at
  )
  select
    p_folha_destino_id,
    i.colaborador_id,
    i.unidade,
    i.categoria,
    null as conta_pagadora_id,
    i.salario,
    i.bonus,
    i.comissao,
    i.passagem,
    i.reembolso,
    i.inss,
    i.descontos,
    i.observacoes,
    coalesce(i.detalhamento, '{}'::jsonb),
    false as alert_checked,
    now(),
    now()
  from jsonb_to_recordset(v_preflight->'insercoes') as i(
    colaborador_id integer,
    unidade text,
    categoria text,
    salario numeric,
    bonus numeric,
    comissao numeric,
    passagem numeric,
    reembolso numeric,
    inss numeric,
    descontos numeric,
    observacoes text,
    detalhamento jsonb
  );

  get diagnostics v_inseridos = row_count;
  if v_inseridos <> v_esperados then
    raise exception 'falha atomica: esperadas % insercoes e realizadas %.',
      v_esperados, v_inseridos;
  end if;

  perform public.recalc_folha_totais(p_folha_destino_id);

  select coalesce(f.total_geral, 0)
    into v_total_depois
    from public.folhas_mensais f
   where f.id = p_folha_destino_id;

  select coalesce(jsonb_agg(to_jsonb(lf) order by lf.id), '[]'::jsonb)
    into v_after
    from public.lancamentos_folha lf
   where lf.folha_id = p_folha_destino_id;

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
    'lancamentos_folha', 'folha_duplicacao', null,
    'DUPLICAR_LANCAMENTOS_FOLHA',
    jsonb_build_object(
      'origem_folha_id', p_folha_origem_id,
      'destino_folha_id', p_folha_destino_id,
      'unidades', p_unidades,
      'total_geral', v_total_antes,
      'linhas_destino', v_before
    ),
    jsonb_build_object(
      'source_hash', p_source_hash_esperado,
      'inseridos', v_inseridos,
      'total_geral', v_total_depois,
      'linhas_destino', v_after
    ),
    nullif(trim(p_ator->>'motivo'), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'source_hash', p_source_hash_esperado,
    'inseridos', v_inseridos,
    'total_antes', v_total_antes,
    'total_depois', v_total_depois,
    'audit_id', v_audit_id
  );
end;
$$;

-- DRE v4 preservado, agora com valor_pago_direto no hash e apenas o valor
-- aplicavel na liquidacao e nos diagnosticos. Snapshots fechados continuam
-- imutaveis pelo mesmo bloqueio da v4.
create or replace function public.folha_classificar_dre(
  p_folha_id integer,
  p_permitir_backfill_fechada boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_ano integer;
  v_mes integer;
  v_total_geral numeric;
  v_competencia date;
  v_bistro_ref_date date;
  v_bistro_ref_ym text;
  v_bistro_competencia_id uuid;
  v_ruleset_version integer;
  v_hash_origem text;
  v_hash_existente text;
  v_ruleset_existente integer;
  v_snapshot_existente integer := 0;
  v_classificado_por text;
  v_ator_ref text;
  v_numero_hash text;
  v_last4 text;
  v_operacao text;
  v_audit_id uuid;
  v_linhas integer;
  v_pendentes integer;
  v_soma_assinada numeric;
  v_consumos_bistro_sem_desconto jsonb := '[]'::jsonb;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
    if p_permitir_backfill_fechada then
      raise exception 'backfill de folha fechada exige service_role ou postgres.'
        using errcode = '42501';
    end if;
    v_ator_ref := auth.uid()::text;
    v_classificado_por := 'web:' || v_ator_ref;
  elsif v_role in ('service_role', 'postgres') then
    v_ator_ref := v_role;
    v_classificado_por := 'sistema:' || v_role;
  else
    raise exception 'papel nao autorizado para classificar DRE da folha: %', v_role
      using errcode = '42501';
  end if;

  select f.status, f.ano, f.mes, coalesce(f.total_geral, 0)
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

  select count(*), min(s.hash_origem), min(s.ruleset_version)
    into v_snapshot_existente, v_hash_existente, v_ruleset_existente
    from public.folha_classificacao_dre s
   where s.folha_id = p_folha_id;

  if v_status = 'fechada' and v_snapshot_existente > 0 then
    raise exception 'folha fechada com snapshot existente: historico imutavel.';
  end if;

  if v_status = 'fechada' then
    if not p_permitir_backfill_fechada then
      raise exception 'folha fechada sem snapshot: informe p_permitir_backfill_fechada=true.';
    end if;
    if v_role not in ('service_role', 'postgres') then
      raise exception 'backfill de folha fechada exige service_role ou postgres.'
        using errcode = '42501';
    end if;
    v_operacao := 'BACKFILL_DRE';
  elsif v_status = 'aprovada' then
    v_operacao := 'CLASSIFICAR_DRE';
  else
    raise exception 'folha deve estar aprovada ou fechada para classificar DRE; status atual: %.', v_status;
  end if;

  v_competencia := make_date(v_ano, v_mes, 1);
  v_bistro_ref_date := (make_date(v_ano, v_mes, 1) - interval '1 month')::date;
  v_bistro_ref_ym := to_char(v_bistro_ref_date, 'YYYY-MM');

  select bc.id
    into v_bistro_competencia_id
    from public.bistro_competencias bc
   where bc.ano = extract(year from v_bistro_ref_date)::integer
     and bc.mes = extract(month from v_bistro_ref_date)::integer
     and bc.unidade = 'cg'
   order by bc.created_at desc
   limit 1;

  select max(r.ruleset_version)
    into v_ruleset_version
    from public.folha_regra_plano_conta r
   where r.ativo = true
     and r.vigencia_inicio <= v_competencia
     and (r.vigencia_fim is null or r.vigencia_fim >= v_competencia);

  if v_ruleset_version is null then
    raise exception 'nenhum ruleset de classificacao DRE ativo para %.', v_competencia;
  end if;

  -- O helper serializa lancamentos e consumos em ordem canonica e inclui
  -- bistro_consumos.valor_pago_direto no payload das novas classificacoes.
  v_hash_origem := public.folha_dre_hash_origem(p_folha_id, true);

  if v_status = 'aprovada'
     and v_snapshot_existente > 0
     and v_hash_existente = v_hash_origem
     and v_ruleset_existente = v_ruleset_version then
    return jsonb_build_object(
      'success', true,
      'idempotente', true,
      'folha_id', p_folha_id,
      'status', v_status,
      'ruleset_version', v_ruleset_version,
      'hash_origem', v_hash_origem,
      'linhas', v_snapshot_existente
    );
  end if;

  if v_status = 'aprovada' and v_snapshot_existente > 0 then
    delete from public.folha_classificacao_dre where folha_id = p_folha_id;
  end if;

  with componentes as (
    select
      lf.id as lancamento_folha_id,
      lf.colaborador_id,
      public.folha_normaliza_texto(lf.categoria) as categoria_usada,
      public.folha_normaliza_texto(c.tipo) as tipo_usado,
      public.folha_normaliza_texto(c.funcao) as funcao_usada,
      lf.unidade as unidade_usada,
      lf.conta_pagadora_id as conta_pagadora_id_usada,
      x.componente,
      round(x.valor, 2) as valor_original
    from public.lancamentos_folha lf
    join public.colaboradores c on c.id = lf.colaborador_id
    cross join lateral (values
      ('salario'::text, coalesce(lf.salario, 0)::numeric),
      ('bonus'::text, coalesce(lf.bonus, 0)::numeric),
      ('comissao'::text, coalesce(lf.comissao, 0)::numeric),
      ('passagem'::text, coalesce(lf.passagem, 0)::numeric),
      ('reembolso'::text, coalesce(lf.reembolso, 0)::numeric),
      ('inss'::text, coalesce(lf.inss, 0)::numeric)
    ) as x(componente, valor)
    where lf.folha_id = p_folha_id
      and round(x.valor, 2) <> 0
  ), classificados as (
    select
      c.*,
      topo.quantidade as regras_no_topo,
      r.id as regra_id,
      r.plano_conta_id,
      r.tratamento as regra_tratamento,
      r.escopo_dre as regra_escopo_dre,
      r.motivo as regra_motivo
    from componentes c
    left join lateral (
      select r0.prioridade, count(*)::integer as quantidade
      from public.folha_regra_plano_conta r0
      where r0.ruleset_version = v_ruleset_version
        and r0.ativo = true
        and r0.vigencia_inicio <= v_competencia
        and (r0.vigencia_fim is null or r0.vigencia_fim >= v_competencia)
        and r0.componente = c.componente
        and (r0.categoria is null or public.folha_normaliza_texto(r0.categoria) = c.categoria_usada)
        and (r0.tipo is null or public.folha_normaliza_texto(r0.tipo) = c.tipo_usado)
        and (
          r0.funcao_padrao is null
          or (r0.operador = 'exato' and c.funcao_usada = public.folha_normaliza_texto(r0.funcao_padrao))
          or (r0.operador = 'ilike' and c.funcao_usada ilike public.folha_normaliza_texto(r0.funcao_padrao))
        )
      group by r0.prioridade
      order by r0.prioridade desc
      limit 1
    ) topo on true
    left join lateral (
      select r1.*
      from public.folha_regra_plano_conta r1
      where r1.ruleset_version = v_ruleset_version
        and r1.ativo = true
        and r1.vigencia_inicio <= v_competencia
        and (r1.vigencia_fim is null or r1.vigencia_fim >= v_competencia)
        and r1.componente = c.componente
        and r1.prioridade = topo.prioridade
        and (r1.categoria is null or public.folha_normaliza_texto(r1.categoria) = c.categoria_usada)
        and (r1.tipo is null or public.folha_normaliza_texto(r1.tipo) = c.tipo_usado)
        and (
          r1.funcao_padrao is null
          or (r1.operador = 'exato' and c.funcao_usada = public.folha_normaliza_texto(r1.funcao_padrao))
          or (r1.operador = 'ilike' and c.funcao_usada ilike public.folha_normaliza_texto(r1.funcao_padrao))
        )
      order by r1.id
      limit 1
    ) r on true
  )
  insert into public.folha_classificacao_dre (
    folha_id, lancamento_folha_id, sequencia, colaborador_id, competencia,
    categoria_usada, tipo_usado, funcao_usada, unidade_usada,
    conta_pagadora_id_usada, componente, tipo_efeito, valor_original,
    valor_assinado, plano_conta_id, plano_codigo_usado, plano_nome_usado,
    tratamento, escopo_dre, regra_id, ruleset_version, motivo,
    bistro_competencia_id, bistro_ref_ym, classificado_por, hash_origem
  )
  select
    p_folha_id,
    c.lancamento_folha_id,
    1,
    c.colaborador_id,
    v_competencia,
    c.categoria_usada,
    c.tipo_usado,
    c.funcao_usada,
    c.unidade_usada,
    c.conta_pagadora_id_usada,
    c.componente,
    case
      when coalesce(c.regras_no_topo, 0) > 1 then
        case when c.componente = 'inss' then 'deducao' else 'provento' end
      when c.regra_tratamento = 'excluido' then 'excluido'
      when c.componente = 'inss' then 'deducao'
      else 'provento'
    end,
    c.valor_original,
    case when c.componente in ('inss', 'descontos') then -c.valor_original else c.valor_original end,
    case when coalesce(c.regras_no_topo, 0) = 1 then c.plano_conta_id else null end,
    case when coalesce(c.regras_no_topo, 0) = 1 then pc.codigo else null end,
    case when coalesce(c.regras_no_topo, 0) = 1 then pc.nome else null end,
    case
      when coalesce(c.regras_no_topo, 0) > 1 then 'pendente'
      when coalesce(c.regras_no_topo, 0) = 0 then 'pendente'
      else c.regra_tratamento
    end,
    case
      when coalesce(c.regras_no_topo, 0) = 1 then c.regra_escopo_dre
      else 'nenhum'
    end,
    case when coalesce(c.regras_no_topo, 0) = 1 then c.regra_id else null end,
    v_ruleset_version,
    case
      when coalesce(c.regras_no_topo, 0) > 1 then 'conflito de regras na maior prioridade'
      when coalesce(c.regras_no_topo, 0) = 0 then 'nenhuma regra aplicavel'
      else c.regra_motivo
    end,
    v_bistro_competencia_id,
    v_bistro_ref_ym,
    v_classificado_por,
    v_hash_origem
  from classificados c
  left join public.plano_contas pc on pc.id = c.plano_conta_id;

  with desconto_linhas_base as (
    select
      lf.id as lancamento_folha_id,
      lf.colaborador_id,
      public.folha_normaliza_texto(lf.categoria) as categoria_usada,
      public.folha_normaliza_texto(c.tipo) as tipo_usado,
      public.folha_normaliza_texto(c.funcao) as funcao_usada,
      lf.unidade as unidade_usada,
      lf.conta_pagadora_id as conta_pagadora_id_usada,
      round(coalesce(lf.descontos, 0), 2) as desconto_linha,
      coalesce(lf.detalhamento, '{}'::jsonb) ? '__bistro' as tem_meta,
      lf.detalhamento->'__bistro'->>'ref_ym' as meta_ref_ym,
      case
        when jsonb_typeof(lf.detalhamento->'__bistro'->'valor') = 'number'
          then (lf.detalhamento->'__bistro'->>'valor')::numeric
        when coalesce(lf.detalhamento->'__bistro'->>'valor', '') ~ '^-?[0-9]+([.,][0-9]+)?$'
          then replace(lf.detalhamento->'__bistro'->>'valor', ',', '.')::numeric
        else null
      end as meta_valor
    from public.lancamentos_folha lf
    join public.colaboradores c on c.id = lf.colaborador_id
    where lf.folha_id = p_folha_id
      and round(coalesce(lf.descontos, 0), 2) > 0
  ), desconto_linhas as (
    select
      dl.*,
      row_number() over (partition by dl.colaborador_id order by dl.lancamento_folha_id) as linha_numero,
      count(*) over (partition by dl.colaborador_id) as linhas_pessoa
    from desconto_linhas_base dl
  ), bistro_totais as (
    select
      bc.colaborador_id,
      round(sum(greatest(bc.valor - bc.valor_pago_direto, 0)), 2) as bistro_total
    from public.bistro_consumos bc
    where bc.competencia_id = v_bistro_competencia_id
    group by bc.colaborador_id
  ), pessoa_base as (
    select
      dl.colaborador_id,
      round(sum(dl.desconto_linha), 2) as desconto_total,
      round(coalesce(max(bt.bistro_total), 0), 2) as bistro_total,
      least(round(coalesce(max(bt.bistro_total), 0), 2), round(sum(dl.desconto_linha), 2)) as bistro_aplicavel,
      bool_or(dl.tem_meta) as tem_alguma_meta,
      bool_and(
        not dl.tem_meta
        or (
          dl.meta_ref_ym = v_bistro_ref_ym
          and dl.meta_valor is not null
          and dl.meta_valor >= 0
          and round(dl.meta_valor, 2) <= dl.desconto_linha
        )
      ) as meta_linhas_validas,
      round(sum(coalesce(dl.meta_valor, 0)), 2) as meta_total
    from desconto_linhas dl
    left join bistro_totais bt on bt.colaborador_id = dl.colaborador_id
    group by dl.colaborador_id
  ), pessoa_status as (
    select
      pb.*,
      (
        pb.tem_alguma_meta
        and pb.meta_linhas_validas
        and pb.meta_total <= pb.bistro_aplicavel
      ) as usar_metadata
    from pessoa_base pb
  ), proporcionais as (
    select
      dl.*,
      ps.bistro_aplicavel,
      ps.meta_total,
      ps.usar_metadata,
      case
        when ps.desconto_total = 0 then 0
        else round(ps.bistro_aplicavel * dl.desconto_linha / ps.desconto_total, 2)
      end as proporcional_arredondado
    from desconto_linhas dl
    join pessoa_status ps on ps.colaborador_id = dl.colaborador_id
  ), alocadas as (
    select
      p.*,
      round(case
        when p.usar_metadata then coalesce(p.meta_valor, 0)
        when p.bistro_aplicavel <= 0 then 0
        -- A ultima linha absorve o residuo de arredondamento.
        when p.linha_numero = p.linhas_pessoa then
          p.bistro_aplicavel - coalesce(sum(p.proporcional_arredondado) over (
            partition by p.colaborador_id
            order by p.lancamento_folha_id
            rows between unbounded preceding and 1 preceding
          ), 0)
        else p.proporcional_arredondado
      end, 2) as liquidacao_linha
    from proporcionais p
  ), fatias as (
    select
      a.*,
      round(a.desconto_linha - a.liquidacao_linha, 2) as residual_linha
    from alocadas a
  ), fatias_snapshot as (
    select
      f.*, 1 as sequencia, f.liquidacao_linha as valor_fatia,
      'liquidacao'::text as tipo_efeito, 'liquidacao'::text as tratamento,
      'nenhum'::text as escopo_dre, '4.6.1'::text as plano_codigo,
      case when f.usar_metadata
        then 'consumo Bistro identificado pela metadata valida da linha'
        else 'consumo Bistro identificado e rateado proporcionalmente na pessoa'
      end as motivo
    from fatias f
    where f.liquidacao_linha > 0
    union all
    select
      f.*, 2 as sequencia, f.residual_linha as valor_fatia,
      'deducao'::text as tipo_efeito, 'automatico'::text as tratamento,
      'operacional'::text as escopo_dre, '5.3.13'::text as plano_codigo,
      'desconto sem detalhamento estruturado'::text as motivo
    from fatias f
    where f.residual_linha > 0
  )
  insert into public.folha_classificacao_dre (
    folha_id, lancamento_folha_id, sequencia, colaborador_id, competencia,
    categoria_usada, tipo_usado, funcao_usada, unidade_usada,
    conta_pagadora_id_usada, componente, tipo_efeito, valor_original,
    valor_assinado, plano_conta_id, plano_codigo_usado, plano_nome_usado,
    tratamento, escopo_dre, regra_id, ruleset_version, motivo,
    bistro_competencia_id, bistro_ref_ym, classificado_por, hash_origem
  )
  select
    p_folha_id,
    f.lancamento_folha_id,
    f.sequencia,
    f.colaborador_id,
    v_competencia,
    f.categoria_usada,
    f.tipo_usado,
    f.funcao_usada,
    f.unidade_usada,
    f.conta_pagadora_id_usada,
    'descontos',
    f.tipo_efeito,
    f.valor_fatia,
    -f.valor_fatia,
    pc.id,
    pc.codigo,
    pc.nome,
    f.tratamento,
    f.escopo_dre,
    null,
    v_ruleset_version,
    f.motivo,
    v_bistro_competencia_id,
    v_bistro_ref_ym,
    v_classificado_por,
    v_hash_origem
  from fatias_snapshot f
  join public.plano_contas pc on pc.codigo = f.plano_codigo;

  select round(coalesce(sum(s.valor_assinado), 0), 2),
         count(*),
         count(*) filter (where s.tratamento = 'pendente')
    into v_soma_assinada, v_linhas, v_pendentes
    from public.folha_classificacao_dre s
   where s.folha_id = p_folha_id;

  if v_soma_assinada is distinct from round(v_total_geral, 2) then
    raise exception 'soma assinada % nao confere com o total geral % da folha %.',
      v_soma_assinada, round(v_total_geral, 2), p_folha_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'colaborador_id', x.colaborador_id,
    'nome', x.nome,
    'valor', x.valor
  ) order by x.nome), '[]'::jsonb)
    into v_consumos_bistro_sem_desconto
    from (
      select
        bc.colaborador_id,
        coalesce(c.nome_completo, c.nome) as nome,
        round(sum(greatest(bc.valor - bc.valor_pago_direto, 0)), 2) as valor
      from public.bistro_consumos bc
      join public.colaboradores c on c.id = bc.colaborador_id
      where bc.competencia_id = v_bistro_competencia_id
        and greatest(bc.valor - bc.valor_pago_direto, 0) > 0
        and not exists (
          select 1
          from public.lancamentos_folha lf
          where lf.folha_id = p_folha_id
            and lf.colaborador_id = bc.colaborador_id
            and round(coalesce(lf.descontos, 0), 2) > 0
        )
      group by bc.colaborador_id, c.nome_completo, c.nome
    ) x;

  v_numero_hash := encode(extensions.digest(coalesce(v_ator_ref, v_role), 'sha256'), 'hex');
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
    v_classificado_por, v_ator_ref, v_numero_hash, v_last4,
    v_role, 'folha', v_role, v_role,
    'folha_classificacao_dre', 'folha_dre', null,
    v_operacao,
    jsonb_build_object(
      'folha_id', p_folha_id,
      'snapshot_anterior_linhas', v_snapshot_existente,
      'hash_anterior', v_hash_existente,
      'ruleset_anterior', v_ruleset_existente
    ),
    jsonb_build_object(
      'folha_id', p_folha_id,
      'status', v_status,
      'linhas', v_linhas,
      'pendentes', v_pendentes,
      'ruleset_version', v_ruleset_version,
      'hash_origem', v_hash_origem,
      'soma_assinada', v_soma_assinada,
      'bistro_competencia_id', v_bistro_competencia_id,
      'bistro_ref_ym', v_bistro_ref_ym,
      'consumos_bistro_sem_desconto', v_consumos_bistro_sem_desconto
    ),
    case when v_operacao = 'BACKFILL_DRE'
      then 'classificacao retroativa da folha fechada'
      else 'classificacao analitica da folha aprovada'
    end,
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'idempotente', false,
    'operacao', v_operacao,
    'folha_id', p_folha_id,
    'status', v_status,
    'linhas', v_linhas,
    'pendentes', v_pendentes,
    'ruleset_version', v_ruleset_version,
    'hash_origem', v_hash_origem,
    'soma_assinada', v_soma_assinada,
    'total_geral', round(v_total_geral, 2),
    'bistro_competencia_id', v_bistro_competencia_id,
    'bistro_ref_ym', v_bistro_ref_ym,
    'consumos_bistro_sem_desconto', v_consumos_bistro_sem_desconto,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.folha_dre_hash_origem(integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.bistro_consumo_valor_pago_direto_guard()
  from public, anon, authenticated, service_role;

revoke all on function public.bistro_consumo_pagamento_direto_salvar(uuid, numeric, numeric, jsonb) from public, anon;
grant execute on function public.bistro_consumo_pagamento_direto_salvar(uuid, numeric, numeric, jsonb) to authenticated, service_role;

revoke all on function public.folha_sugerir_desconto_bistro(integer) from public, anon;
grant execute on function public.folha_sugerir_desconto_bistro(integer) to authenticated, service_role;

revoke all on function public.folha_aplicar_sugestao_bistro(integer, integer, text, text, jsonb) from public, anon;
grant execute on function public.folha_aplicar_sugestao_bistro(integer, integer, text, text, jsonb) to authenticated, service_role;

revoke all on function public.folha_duplicar_lancamentos_preflight(integer, integer, text[]) from public, anon;
grant execute on function public.folha_duplicar_lancamentos_preflight(integer, integer, text[]) to authenticated, service_role;

revoke all on function public.folha_duplicar_lancamentos(integer, integer, text[], text, jsonb) from public, anon;
grant execute on function public.folha_duplicar_lancamentos(integer, integer, text[], text, jsonb) to authenticated, service_role;

revoke all on function public.folha_classificar_dre(integer, boolean)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.folha_classificar_dre(integer, boolean)
  to authenticated, service_role;
