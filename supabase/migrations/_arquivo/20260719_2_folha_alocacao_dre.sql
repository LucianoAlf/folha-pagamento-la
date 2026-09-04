-- Fase 2B-A: alocacao economica da folha por unidade para o DRE.
-- Esta camada nao altera pagamento, conta pagadora ou fechamento da folha.

create table public.folha_alocacao_dre_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  folha_id integer not null references public.folhas_mensais(id),
  colaborador_id integer not null references public.colaboradores(id),
  versao integer not null check (versao > 0),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  allocation_hash text not null check (allocation_hash ~ '^[0-9a-f]{64}$'),
  origem text not null check (origem in ('automatica_unidade_fixa', 'confirmada_operador', 'backfill_privilegiado')),
  confirmado_por text not null,
  confirmado_em timestamptz not null default now(),
  backfill_motivo text,
  ativa boolean not null default true,
  unique (folha_id, colaborador_id, versao),
  check (origem <> 'backfill_privilegiado' or nullif(trim(backfill_motivo), '') is not null)
);

create table public.folha_alocacao_dre_fatias (
  id uuid primary key default gen_random_uuid(),
  confirmacao_id uuid not null references public.folha_alocacao_dre_confirmacoes(id),
  categoria text,
  componente text,
  unidade text not null check (unidade in ('cg', 'rec', 'bar')),
  percentual numeric(9,6) not null check (percentual > 0 and percentual <= 100),
  check (
    (categoria is null and componente is null)
    or (
      categoria is not null
      and componente is not null
      and componente in ('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos')
    )
  )
);

create unique index folha_alocacao_dre_confirmacoes_ativa_uq
  on public.folha_alocacao_dre_confirmacoes (folha_id, colaborador_id)
  where ativa = true;

create index folha_alocacao_dre_confirmacoes_folha_idx
  on public.folha_alocacao_dre_confirmacoes (folha_id, colaborador_id, versao desc);

create unique index folha_alocacao_dre_fatias_base_uq
  on public.folha_alocacao_dre_fatias (confirmacao_id, unidade)
  where categoria is null and componente is null;

create unique index folha_alocacao_dre_fatias_override_uq
  on public.folha_alocacao_dre_fatias (confirmacao_id, categoria, componente, unidade)
  where categoria is not null and componente is not null;

comment on table public.folha_alocacao_dre_confirmacoes is
  'Snapshot versionado da decisao economica por pessoa e folha; independente da conta que pagou.';
comment on table public.folha_alocacao_dre_fatias is
  'Distribuicao-base obrigatoria e overrides completos por categoria+componente.';

alter table public.folha_alocacao_dre_confirmacoes enable row level security;
alter table public.folha_alocacao_dre_fatias enable row level security;

revoke all on public.folha_alocacao_dre_confirmacoes from public, anon, authenticated;
revoke all on public.folha_alocacao_dre_fatias from public, anon, authenticated;

create or replace function public.folha_alocacao_dre_resolve_ator(p_ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_tipo text;
  v_ref text;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role = 'authenticated' then
    v_tipo := 'web';
    v_ref := auth.uid()::text;
    if v_ref is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
  elsif v_role in ('service_role', 'postgres') then
    v_tipo := 'sistema';
    v_ref := coalesce(nullif(p_ator->>'ref', ''), v_role);
  else
    raise exception 'papel nao autorizado para alocacao DRE da folha: %', v_role
      using errcode = '42501';
  end if;

  return jsonb_build_object('role', v_role, 'tipo', v_tipo, 'ref', v_ref);
end;
$$;

create or replace function public.folha_alocacao_dre_source_hash(
  p_folha_id integer,
  p_colaborador_id integer
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
begin
  if not exists (
    select 1
      from public.folha_classificacao_dre d
     where d.folha_id = p_folha_id
       and d.colaborador_id = p_colaborador_id
  ) then
    raise exception 'colaborador_id % nao pertence ao snapshot DRE da folha %.',
      p_colaborador_id, p_folha_id;
  end if;

  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'folha_id', p_folha_id,
          'colaborador_id', p_colaborador_id,
          'is_rateado', coalesce(c.is_rateado, false),
          'unidade_fixa', lower(nullif(trim(c.unidade_fixa), '')),
          'linhas', coalesce(
            jsonb_agg(
              jsonb_build_object(
                'lancamento_folha_id', d.lancamento_folha_id,
                'componente', d.componente,
                'sequencia', d.sequencia,
                'categoria_usada', d.categoria_usada,
                'tipo_usado', d.tipo_usado,
                'funcao_usada', d.funcao_usada,
                'conta_pagadora_id_usada', d.conta_pagadora_id_usada,
                'valor_original', d.valor_original,
                'valor_assinado', d.valor_assinado,
                'plano_conta_id', d.plano_conta_id,
                'tratamento', d.tratamento,
                'escopo_dre', d.escopo_dre,
                'ruleset_version', d.ruleset_version,
                'hash_origem', d.hash_origem
              )
              order by d.lancamento_folha_id, d.componente, d.sequencia
            ),
            '[]'::jsonb
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
    into v_hash
    from public.colaboradores c
    join public.folha_classificacao_dre d
      on d.colaborador_id = c.id
     and d.folha_id = p_folha_id
   where c.id = p_colaborador_id
   group by c.id, c.is_rateado, c.unidade_fixa;

  return v_hash;
end;
$$;

create or replace function public.folha_alocacao_dre_allocation_hash(p_fatias jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
begin
  if p_fatias is null or jsonb_typeof(p_fatias) <> 'array' then
    raise exception 'p_fatias deve ser um array.';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'categoria', nullif(trim(x.categoria), ''),
              'componente', nullif(trim(x.componente), ''),
              'unidade', lower(trim(x.unidade)),
              'percentual', x.percentual
            )
            order by
              coalesce(nullif(trim(x.categoria), ''), ''),
              coalesce(nullif(trim(x.componente), ''), ''),
              lower(trim(x.unidade))
          ),
          '[]'::jsonb
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
    into v_hash
    from jsonb_to_recordset(p_fatias) as x(
      categoria text,
      componente text,
      unidade text,
      percentual numeric
    );

  return v_hash;
end;
$$;

create or replace function public.folha_alocacao_dre_confirmacao_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'historico de alocacao DRE e imutavel.' using errcode = '42501';
  end if;

  if current_setting('app.folha_alocacao_dre_rpc', true) <> 'on'
     or old.ativa <> true
     or new.ativa <> false
     or (to_jsonb(new) - 'ativa') is distinct from (to_jsonb(old) - 'ativa') then
    raise exception 'confirmacao de alocacao DRE so pode ser desativada pela RPC versionada.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_folha_alocacao_dre_confirmacao_guard
before update or delete on public.folha_alocacao_dre_confirmacoes
for each row execute function public.folha_alocacao_dre_confirmacao_guard();

create or replace function public.folha_alocacao_dre_fatia_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'fatias de alocacao DRE sao imutaveis; crie uma nova versao.'
    using errcode = '42501';
end;
$$;

create trigger trg_folha_alocacao_dre_fatia_guard
before update or delete on public.folha_alocacao_dre_fatias
for each row execute function public.folha_alocacao_dre_fatia_guard();

create or replace function public.folha_alocacao_dre_gravar(
  p_folha_id integer,
  p_colaborador_id integer,
  p_fatias jsonb,
  p_source_hash text,
  p_origem text,
  p_confirmado_por text,
  p_backfill_motivo text,
  p_actor jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active public.folha_alocacao_dre_confirmacoes%rowtype;
  v_confirmacao_id uuid;
  v_versao integer;
  v_allocation_hash text;
  v_fatias_normalizadas jsonb;
  v_audit_id uuid;
  v_numero_hash text;
  v_last4 text;
begin
  if p_fatias is null
     or jsonb_typeof(p_fatias) <> 'array'
     or jsonb_array_length(p_fatias) = 0 then
    raise exception 'p_fatias deve ser um array nao vazio.';
  end if;

  drop table if exists pg_temp.folha_alocacao_dre_input;
  create temporary table pg_temp.folha_alocacao_dre_input (
    categoria text,
    componente text,
    unidade text not null,
    percentual numeric not null
  ) on commit drop;

  insert into pg_temp.folha_alocacao_dre_input (categoria, componente, unidade, percentual)
  select
    nullif(trim(x.categoria), ''),
    nullif(trim(x.componente), ''),
    lower(trim(x.unidade)),
    x.percentual
  from jsonb_to_recordset(p_fatias) as x(
    categoria text,
    componente text,
    unidade text,
    percentual numeric
  );

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where unidade not in ('cg', 'rec', 'bar')
        or percentual <= 0
        or percentual > 100
        or ((categoria is null) <> (componente is null))
        or (
          componente is not null
          and componente not in ('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos')
        )
  ) then
    raise exception 'fatias contem unidade, percentual ou escopo invalido.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     group by categoria, componente, unidade
    having count(*) > 1
  ) then
    raise exception 'unidade repetida dentro da mesma distribuicao.';
  end if;

  if not exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where categoria is null and componente is null
  ) then
    raise exception 'uma distribuicao-base completa e obrigatoria.';
  end if;

  if (
    select coalesce(sum(percentual), 0)
      from pg_temp.folha_alocacao_dre_input
     where categoria is null and componente is null
  ) <> 100 then
    raise exception 'percentuais da distribuicao-base devem somar 100.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input
     where categoria is not null and componente is not null
     group by categoria, componente
    having sum(percentual) <> 100
  ) then
    raise exception 'percentuais de cada override devem somar 100.';
  end if;

  if exists (
    select 1
      from pg_temp.folha_alocacao_dre_input i
     where i.categoria is not null
       and not exists (
         select 1
           from public.folha_classificacao_dre d
          where d.folha_id = p_folha_id
            and d.colaborador_id = p_colaborador_id
            and d.categoria_usada = i.categoria
            and d.componente = i.componente
       )
  ) then
    raise exception 'override nao corresponde a categoria e componente do snapshot DRE.';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'categoria', categoria,
             'componente', componente,
             'unidade', unidade,
             'percentual', percentual
           )
           order by coalesce(categoria, ''), coalesce(componente, ''), unidade
         )
    into v_fatias_normalizadas
    from pg_temp.folha_alocacao_dre_input;

  v_allocation_hash := public.folha_alocacao_dre_allocation_hash(v_fatias_normalizadas);

  select *
    into v_active
    from public.folha_alocacao_dre_confirmacoes
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id
     and ativa = true
   for update;

  if found
     and v_active.source_hash = p_source_hash
     and v_active.allocation_hash = v_allocation_hash then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'confirmacao_id', v_active.id,
      'versao', v_active.versao,
      'source_hash', v_active.source_hash,
      'allocation_hash', v_active.allocation_hash
    );
  end if;

  select coalesce(max(versao), 0) + 1
    into v_versao
    from public.folha_alocacao_dre_confirmacoes
   where folha_id = p_folha_id
     and colaborador_id = p_colaborador_id;

  if v_active.id is not null then
    perform set_config('app.folha_alocacao_dre_rpc', 'on', true);
    update public.folha_alocacao_dre_confirmacoes
       set ativa = false
     where id = v_active.id;
  end if;

  insert into public.folha_alocacao_dre_confirmacoes (
    folha_id,
    colaborador_id,
    versao,
    source_hash,
    allocation_hash,
    origem,
    confirmado_por,
    backfill_motivo,
    ativa
  )
  values (
    p_folha_id,
    p_colaborador_id,
    v_versao,
    p_source_hash,
    v_allocation_hash,
    p_origem,
    p_confirmado_por,
    nullif(trim(p_backfill_motivo), ''),
    true
  )
  returning id into v_confirmacao_id;

  insert into public.folha_alocacao_dre_fatias (
    confirmacao_id, categoria, componente, unidade, percentual
  )
  select v_confirmacao_id, categoria, componente, unidade, percentual
    from pg_temp.folha_alocacao_dre_input
   order by coalesce(categoria, ''), coalesce(componente, ''), unidade;

  v_numero_hash := encode(
    extensions.digest(coalesce(p_actor->>'ref', p_actor->>'tipo', 'sistema'), 'sha256'),
    'hex'
  );
  v_last4 := right(regexp_replace(coalesce(p_actor->>'ref', ''), '\D', '', 'g'), 4);
  if v_last4 = '' then
    v_last4 := 'n/a';
  end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  )
  values (
    case when p_actor->>'tipo' = 'web' then 'Super Folha Web' else 'Sistema' end,
    p_actor->>'ref',
    v_numero_hash,
    v_last4,
    p_actor->>'tipo',
    'folha',
    p_actor->>'tipo',
    p_actor->>'role',
    'folha_alocacao_dre_confirmacoes',
    'folha_alocacao_dre',
    v_confirmacao_id,
    'ALOCACAO_DRE',
    case when v_active.id is null then null else to_jsonb(v_active) end,
    jsonb_build_object(
      'folha_id', p_folha_id,
      'colaborador_id', p_colaborador_id,
      'confirmacao_id', v_confirmacao_id,
      'versao', v_versao,
      'source_hash', p_source_hash,
      'allocation_hash', v_allocation_hash,
      'origem', p_origem,
      'fatias', v_fatias_normalizadas
    ),
    nullif(trim(p_backfill_motivo), ''),
    null
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'confirmacao_id', v_confirmacao_id,
    'versao', v_versao,
    'source_hash', p_source_hash,
    'allocation_hash', v_allocation_hash,
    'audit_id', v_audit_id
  );
end;
$$;

create or replace function public.folha_alocacao_dre_preflight(p_folha_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  if not exists (select 1 from public.folhas_mensais where id = p_folha_id) then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  with universo as (
    select
      d.colaborador_id,
      max(c.nome) as nome,
      coalesce(bool_or(coalesce(c.is_rateado, false)), false) as is_rateado,
      lower(nullif(trim(max(c.unidade_fixa)), '')) as unidade_fixa,
      count(distinct d.conta_pagadora_id_usada) filter (
        where d.conta_pagadora_id_usada is not null
      ) as contas_pagadoras,
      public.folha_alocacao_dre_source_hash(p_folha_id, d.colaborador_id) as source_hash
    from public.folha_classificacao_dre d
    join public.colaboradores c on c.id = d.colaborador_id
    where d.folha_id = p_folha_id
    group by d.colaborador_id
  ),
  estado as (
    select
      u.*,
      a.id as confirmacao_id,
      a.versao,
      a.origem,
      a.source_hash as source_hash_confirmado,
      a.allocation_hash,
      case
        when a.id is not null and a.source_hash = u.source_hash then 'pronto'
        when a.id is not null then 'desatualizada'
        when u.is_rateado then 'pendente'
        when u.unidade_fixa in ('cg', 'rec', 'bar') then 'pendente_automatica'
        else 'sem_alocacao'
      end as estado,
      (u.contas_pagadoras > 1 and not u.is_rateado) as multiplas_contas_sem_rateio
    from universo u
    left join public.folha_alocacao_dre_confirmacoes a
      on a.folha_id = p_folha_id
     and a.colaborador_id = u.colaborador_id
     and a.ativa = true
  ),
  resumo as (
    select
      count(*)::integer as total,
      count(*) filter (where estado = 'pronto')::integer as prontos,
      count(*) filter (where estado <> 'pronto')::integer as pendentes,
      count(*) filter (where estado = 'sem_alocacao')::integer as sem_alocacao,
      count(*) filter (where multiplas_contas_sem_rateio)::integer as avisos,
      (count(*) > 0 and count(*) filter (where estado <> 'pronto') = 0) as pronto_para_dre,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'colaborador_id', colaborador_id,
            'nome', nome,
            'is_rateado', is_rateado,
            'unidade_fixa', unidade_fixa,
            'contas_pagadoras', contas_pagadoras,
            'estado', estado,
            'multiplas_contas_sem_rateio', multiplas_contas_sem_rateio,
            'confirmacao_id', confirmacao_id,
            'versao', versao,
            'origem', origem,
            'source_hash', source_hash,
            'source_hash_confirmado', source_hash_confirmado,
            'allocation_hash', allocation_hash
          )
          order by nome, colaborador_id
        ),
        '[]'::jsonb
      ) as colaboradores
    from estado
  )
  select jsonb_build_object(
    'folha_id', p_folha_id,
    'total', total,
    'prontos', prontos,
    'pendentes', pendentes,
    'sem_alocacao', sem_alocacao,
    'avisos', avisos,
    'pronto_para_dre', pronto_para_dre,
    'colaboradores', colaboradores
  )
    into v_resultado
    from resumo;

  return coalesce(
    v_resultado,
    jsonb_build_object(
      'folha_id', p_folha_id,
      'total', 0,
      'prontos', 0,
      'pendentes', 0,
      'sem_alocacao', 0,
      'avisos', 0,
      'pronto_para_dre', false,
      'colaboradores', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.folha_alocacao_dre_salvar(
  p_folha_id integer,
  p_colaborador_id integer,
  p_fatias jsonb,
  p_source_hash_esperado text,
  p_ator jsonb default '{}'::jsonb,
  p_backfill_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor jsonb;
  v_status text;
  v_colaborador public.colaboradores%rowtype;
  v_source_hash text;
  v_origem text;
  v_resultado jsonb;
begin
  if nullif(trim(p_source_hash_esperado), '') is null then
    raise exception 'p_source_hash_esperado e obrigatorio.';
  end if;

  v_actor := public.folha_alocacao_dre_resolve_ator(p_ator);
  perform pg_advisory_xact_lock(p_folha_id, p_colaborador_id);

  select status
    into v_status
    from public.folhas_mensais
   where id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  if v_status not in ('rascunho', 'aprovada', 'fechada') then
    raise exception 'status da folha nao permite alocacao DRE: %.', v_status;
  end if;

  if v_status = 'fechada' then
    if v_actor->>'role' not in ('service_role', 'postgres') then
      raise exception 'backfill de folha fechada exige service_role ou postgres.'
        using errcode = '42501';
    end if;
    if nullif(trim(p_backfill_motivo), '') is null then
      raise exception 'p_backfill_motivo e obrigatorio para folha fechada.';
    end if;
    v_origem := 'backfill_privilegiado';
  else
    v_origem := 'confirmada_operador';
  end if;

  select *
    into v_colaborador
    from public.colaboradores
   where id = p_colaborador_id
   for update;

  if not found then
    raise exception 'colaborador_id % nao encontrado.', p_colaborador_id;
  end if;

  if coalesce(v_colaborador.is_rateado, false) = false then
    raise exception 'salvamento manual e exclusivo para colaborador com is_rateado=true.';
  end if;

  v_source_hash := public.folha_alocacao_dre_source_hash(p_folha_id, p_colaborador_id);
  if v_source_hash <> p_source_hash_esperado then
    raise exception 'source_hash mudou; recarregue o preflight antes de salvar.'
      using errcode = '40001';
  end if;

  v_resultado := public.folha_alocacao_dre_gravar(
    p_folha_id,
    p_colaborador_id,
    p_fatias,
    v_source_hash,
    v_origem,
    v_actor->>'ref',
    p_backfill_motivo,
    v_actor
  );

  return v_resultado || jsonb_build_object(
    'preflight', public.folha_alocacao_dre_preflight(p_folha_id)
  );
end;
$$;

create or replace function public.folha_alocacao_dre_gerar_automaticas(
  p_folha_id integer,
  p_ator jsonb default '{}'::jsonb,
  p_backfill_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor jsonb;
  v_status text;
  v_origem text;
  v_registro record;
  v_source_hash text;
  v_resultado jsonb;
  v_processados integer := 0;
begin
  v_actor := public.folha_alocacao_dre_resolve_ator(p_ator);

  select status
    into v_status
    from public.folhas_mensais
   where id = p_folha_id
   for update;

  if not found then
    raise exception 'folha_id % nao encontrada.', p_folha_id;
  end if;

  if v_status not in ('rascunho', 'aprovada', 'fechada') then
    raise exception 'status da folha nao permite alocacao DRE: %.', v_status;
  end if;

  if v_status = 'fechada' then
    if v_actor->>'role' not in ('service_role', 'postgres') then
      raise exception 'backfill de folha fechada exige service_role ou postgres.'
        using errcode = '42501';
    end if;
    if nullif(trim(p_backfill_motivo), '') is null then
      raise exception 'p_backfill_motivo e obrigatorio para folha fechada.';
    end if;
    v_origem := 'backfill_privilegiado';
  else
    v_origem := 'automatica_unidade_fixa';
  end if;

  for v_registro in
    select distinct d.colaborador_id, lower(trim(c.unidade_fixa)) as unidade
      from public.folha_classificacao_dre d
      join public.colaboradores c on c.id = d.colaborador_id
     where d.folha_id = p_folha_id
       and coalesce(c.is_rateado, false) = false
       and lower(trim(c.unidade_fixa)) in ('cg', 'rec', 'bar')
     order by d.colaborador_id
  loop
    perform pg_advisory_xact_lock(p_folha_id, v_registro.colaborador_id);
    v_source_hash := public.folha_alocacao_dre_source_hash(
      p_folha_id,
      v_registro.colaborador_id
    );

    v_resultado := public.folha_alocacao_dre_gravar(
      p_folha_id,
      v_registro.colaborador_id,
      jsonb_build_array(
        jsonb_build_object(
          'categoria', null,
          'componente', null,
          'unidade', v_registro.unidade,
          'percentual', 100.000000::numeric
        )
      ),
      v_source_hash,
      v_origem,
      v_actor->>'ref',
      p_backfill_motivo,
      v_actor
    );
    v_processados := v_processados + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'folha_id', p_folha_id,
    'processados', v_processados,
    'preflight', public.folha_alocacao_dre_preflight(p_folha_id)
  );
end;
$$;

create or replace function public.folha_alocacao_dre_resolver(
  p_folha_id integer,
  p_colaborador_id integer default null
)
returns table (
  folha_id integer,
  lancamento_folha_id integer,
  sequencia integer,
  colaborador_id integer,
  competencia date,
  categoria_usada text,
  tipo_usado text,
  funcao_usada text,
  componente text,
  tipo_efeito text,
  valor_original numeric,
  valor_assinado_original numeric,
  valor_assinado_rateado numeric,
  plano_conta_id uuid,
  plano_codigo_usado text,
  plano_nome_usado text,
  tratamento text,
  escopo_dre text,
  regra_id uuid,
  ruleset_version integer,
  motivo text,
  bistro_competencia_id uuid,
  bistro_ref_ym text,
  hash_origem text,
  unidade_dre text,
  percentual_aplicado numeric,
  confirmacao_id uuid,
  source_hash text,
  allocation_hash text,
  estado_alocacao text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hashes as (
    select
      d.colaborador_id,
      public.folha_alocacao_dre_source_hash(p_folha_id, d.colaborador_id) as source_hash
    from public.folha_classificacao_dre d
    where d.folha_id = p_folha_id
      and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
    group by d.colaborador_id
  ),
  confirmacoes as (
    select
      h.colaborador_id,
      h.source_hash,
      c.id,
      c.allocation_hash,
      case
        when c.id is null then 'sem_alocacao'
        when c.source_hash <> h.source_hash then 'desatualizada'
        else 'pronto'
      end as estado
    from hashes h
    left join public.folha_alocacao_dre_confirmacoes c
      on c.folha_id = p_folha_id
     and c.colaborador_id = h.colaborador_id
     and c.ativa = true
  ),
  escolhidas as (
    select
      d.*,
      c.id as confirmacao_id,
      c.source_hash,
      c.allocation_hash,
      c.estado,
      f.unidade,
      f.percentual
    from public.folha_classificacao_dre d
    join confirmacoes c on c.colaborador_id = d.colaborador_id
    left join lateral (
      select f.unidade, f.percentual
        from public.folha_alocacao_dre_fatias f
       where c.estado = 'pronto'
         and f.confirmacao_id = c.id
         and (
           (
             exists (
               select 1
                 from public.folha_alocacao_dre_fatias override_f
                where override_f.confirmacao_id = c.id
                  and override_f.categoria = d.categoria_usada
                  and override_f.componente = d.componente
             )
             and d.categoria_usada = f.categoria
             and d.componente = f.componente
           )
           or (
             not exists (
               select 1
                 from public.folha_alocacao_dre_fatias override_f
                where override_f.confirmacao_id = c.id
                  and override_f.categoria = d.categoria_usada
                  and override_f.componente = d.componente
             )
             and f.categoria is null
             and f.componente is null
           )
         )
    ) f on true
    where d.folha_id = p_folha_id
      and (p_colaborador_id is null or d.colaborador_id = p_colaborador_id)
  ),
  calculo as (
    select
      e.*,
      round(abs(e.valor_assinado) * 100)::bigint as valor_centavos,
      floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)::bigint as centavos_base,
      (
        round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100
        - floor(round(abs(e.valor_assinado) * 100)::numeric * e.percentual / 100)
      ) as resto
    from escolhidas e
    where e.estado = 'pronto'
      and e.unidade is not null
  ),
  ranqueado as (
    select
      c.*,
      c.valor_centavos - sum(c.centavos_base) over (
        partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
      ) as centavos_faltantes,
      row_number() over (
        partition by c.folha_id, c.lancamento_folha_id, c.componente, c.sequencia
        order by c.resto desc, c.unidade asc
      ) as ordem_resto
    from calculo c
  ),
  resolvidas as (
    select
      r.folha_id,
      r.lancamento_folha_id,
      r.sequencia,
      r.colaborador_id,
      r.competencia,
      r.categoria_usada,
      r.tipo_usado,
      r.funcao_usada,
      r.componente,
      r.tipo_efeito,
      r.valor_original,
      r.valor_assinado as valor_assinado_original,
      (
        case when r.valor_assinado < 0 then -1 else 1 end
        * (
          r.centavos_base
          + case when r.ordem_resto <= r.centavos_faltantes then 1 else 0 end
        )::numeric / 100
      ) as valor_assinado_rateado,
      r.plano_conta_id,
      r.plano_codigo_usado,
      r.plano_nome_usado,
      r.tratamento,
      r.escopo_dre,
      r.regra_id,
      r.ruleset_version,
      r.motivo,
      r.bistro_competencia_id,
      r.bistro_ref_ym,
      r.hash_origem,
      r.unidade as unidade_dre,
      r.percentual as percentual_aplicado,
      r.confirmacao_id,
      r.source_hash,
      r.allocation_hash,
      'pronto'::text as estado_alocacao
    from ranqueado r
  ),
  sem_alocacao as (
    select
      e.folha_id,
      e.lancamento_folha_id,
      e.sequencia,
      e.colaborador_id,
      e.competencia,
      e.categoria_usada,
      e.tipo_usado,
      e.funcao_usada,
      e.componente,
      e.tipo_efeito,
      e.valor_original,
      e.valor_assinado as valor_assinado_original,
      e.valor_assinado as valor_assinado_rateado,
      e.plano_conta_id,
      e.plano_codigo_usado,
      e.plano_nome_usado,
      e.tratamento,
      e.escopo_dre,
      e.regra_id,
      e.ruleset_version,
      e.motivo,
      e.bistro_competencia_id,
      e.bistro_ref_ym,
      e.hash_origem,
      null::text as unidade_dre,
      null::numeric as percentual_aplicado,
      e.confirmacao_id,
      e.source_hash,
      e.allocation_hash,
      e.estado as estado_alocacao
    from escolhidas e
    where e.estado <> 'pronto'
  )
  select * from resolvidas
  union all
  select * from sem_alocacao
  order by colaborador_id, lancamento_folha_id, componente, sequencia, unidade_dre nulls last;
$$;

revoke all on function public.folha_alocacao_dre_resolve_ator(jsonb)
  from public, anon, authenticated;
revoke all on function public.folha_alocacao_dre_source_hash(integer, integer)
  from public, anon, authenticated;
revoke all on function public.folha_alocacao_dre_allocation_hash(jsonb)
  from public, anon, authenticated;
revoke all on function public.folha_alocacao_dre_gravar(integer, integer, jsonb, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.folha_alocacao_dre_confirmacao_guard()
  from public, anon, authenticated;
revoke all on function public.folha_alocacao_dre_fatia_guard()
  from public, anon, authenticated;

revoke all on function public.folha_alocacao_dre_preflight(integer)
  from public, anon, authenticated;
grant execute on function public.folha_alocacao_dre_preflight(integer)
  to authenticated, service_role;

revoke all on function public.folha_alocacao_dre_salvar(integer, integer, jsonb, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.folha_alocacao_dre_salvar(integer, integer, jsonb, text, jsonb, text)
  to authenticated, service_role;

revoke all on function public.folha_alocacao_dre_gerar_automaticas(integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.folha_alocacao_dre_gerar_automaticas(integer, jsonb, text)
  to authenticated, service_role;

revoke all on function public.folha_alocacao_dre_resolver(integer, integer)
  from public, anon, authenticated;
grant execute on function public.folha_alocacao_dre_resolver(integer, integer)
  to authenticated, service_role;
