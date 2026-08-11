create table if not exists public.financeiro_cartao_recorrencias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  transacao_origem_id uuid not null unique references public.financeiro_cartao_transacoes(id),
  data_inicio date not null,
  dia_base smallint not null check (dia_base between 1 and 31),
  descricao text not null check (btrim(descricao) <> ''),
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'encerrada')),
  pausada_em timestamptz null,
  encerrada_em timestamptz null,
  motivo_status text null,
  ator_tipo text null,
  ator_ref text null,
  created_by uuid null
);

create table if not exists public.financeiro_cartao_recorrencia_previsoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recorrencia_id uuid not null references public.financeiro_cartao_recorrencias(id),
  fatura_id uuid not null references public.financeiro_cartao_faturas(id),
  cartao_id uuid not null references public.financeiro_cartoes(id),
  competencia date not null,
  data_compra date not null,
  descricao text not null,
  estabelecimento text null,
  valor numeric not null check (valor > 0),
  empresa_id uuid null references public.financeiro_empresas(id),
  plano_conta_id uuid null references public.plano_contas(id),
  centro_custo_id uuid null references public.centros_custo(id),
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('pendente', 'sugerida', 'confirmada')),
  status text not null default 'prevista'
    check (status in ('prevista', 'confirmada', 'dispensada')),
  transacao_confirmada_id uuid null references public.financeiro_cartao_transacoes(id),
  decidida_em timestamptz null,
  decidida_por text null,
  motivo_decisao text null,
  unique (recorrencia_id, competencia)
);

create unique index if not exists financeiro_cartao_recorrencia_previsoes_transacao_uidx
  on public.financeiro_cartao_recorrencia_previsoes (transacao_confirmada_id)
  where transacao_confirmada_id is not null;
create index if not exists financeiro_cartao_recorrencias_cartao_status_idx
  on public.financeiro_cartao_recorrencias (cartao_id, status);
create index if not exists financeiro_cartao_recorrencia_previsoes_fatura_idx
  on public.financeiro_cartao_recorrencia_previsoes (fatura_id, status, data_compra);

drop trigger if exists trg_financeiro_cartao_recorrencias_set_updated_at on public.financeiro_cartao_recorrencias;
create trigger trg_financeiro_cartao_recorrencias_set_updated_at
  before update on public.financeiro_cartao_recorrencias
  for each row execute function public.set_updated_at();

drop trigger if exists trg_financeiro_cartao_recorrencia_previsoes_set_updated_at on public.financeiro_cartao_recorrencia_previsoes;
create trigger trg_financeiro_cartao_recorrencia_previsoes_set_updated_at
  before update on public.financeiro_cartao_recorrencia_previsoes
  for each row execute function public.set_updated_at();

alter table public.financeiro_cartao_recorrencias enable row level security;
alter table public.financeiro_cartao_recorrencia_previsoes enable row level security;

drop policy if exists financeiro_cartao_recorrencias_select_authenticated on public.financeiro_cartao_recorrencias;
create policy financeiro_cartao_recorrencias_select_authenticated
  on public.financeiro_cartao_recorrencias
  for select to authenticated
  using (true);

drop policy if exists financeiro_cartao_recorrencia_previsoes_select_authenticated on public.financeiro_cartao_recorrencia_previsoes;
create policy financeiro_cartao_recorrencia_previsoes_select_authenticated
  on public.financeiro_cartao_recorrencia_previsoes
  for select to authenticated
  using (true);

revoke all on public.financeiro_cartao_recorrencias from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_recorrencias to authenticated, service_role;
revoke all on public.financeiro_cartao_recorrencia_previsoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.financeiro_cartao_recorrencia_previsoes to authenticated, service_role;

create or replace function public.financeiro_cartao_recorrencia_origem_bloqueia_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.financeiro_cartao_recorrencias
     where transacao_origem_id = old.id
  ) then
    raise exception 'Compra de origem de recorrência não pode ser cancelada; encerre a regra e registre o ajuste/estorno separadamente.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_financeiro_cartao_recorrencia_origem_bloqueia_cancelamento on public.financeiro_cartao_transacoes;
create trigger trg_financeiro_cartao_recorrencia_origem_bloqueia_cancelamento
  before delete on public.financeiro_cartao_transacoes
  for each row execute function public.financeiro_cartao_recorrencia_origem_bloqueia_cancelamento();

-- Fase 3: geracao idempotente de previsoes fora do extrato real.
create or replace function public.financeiro_cartao_recorrencias_gerar_previsoes(p_fatura_id uuid, p_ator jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_recorrencia public.financeiro_cartao_recorrencias%rowtype;
  v_previsao public.financeiro_cartao_recorrencia_previsoes%rowtype;
  v_actor jsonb := coalesce(p_ator, '{}'::jsonb);
  v_competencia_candidata date;
  v_data_ocorrencia date;
  v_competencia_ciclo date;
  v_origem_competencia date;
  v_offset integer;
  v_total integer := 0;
  v_inserted integer;
begin
  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = p_fatura_id;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_fatura.cartao_id::text, 0));
  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = p_fatura_id
   for update;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  if v_fatura.status <> 'aberta' then
    return 0;
  end if;

  for v_recorrencia in
    select *
      from public.financeiro_cartao_recorrencias
     where cartao_id = v_fatura.cartao_id
       and status = 'ativa'
     order by id
  loop
    select f.competencia
      into v_origem_competencia
      from public.financeiro_cartao_transacoes t
      join public.financeiro_cartao_faturas f on f.id = t.fatura_id
     where t.id = v_recorrencia.transacao_origem_id;
    if v_origem_competencia is null then
      raise exception 'fatura de origem da recorrencia nao encontrada.';
    end if;
    if v_fatura.competencia <= v_origem_competencia then
      continue;
    end if;

    for v_offset in -1..1 loop
      v_competencia_candidata := (
        date_trunc('month', v_fatura.competencia)::date
        + make_interval(months => v_offset)
      )::date;
      v_data_ocorrencia := public.financeiro_cartao_clamp_dia(
        extract(year from v_competencia_candidata)::int,
        extract(month from v_competencia_candidata)::int,
        v_recorrencia.dia_base
      );

      if v_data_ocorrencia < v_recorrencia.data_inicio then
        continue;
      end if;

      select c.competencia
        into v_competencia_ciclo
        from public.financeiro_cartao_ciclo(v_fatura.cartao_id, v_data_ocorrencia) c;
      if v_competencia_ciclo is distinct from v_fatura.competencia then
        continue;
      end if;

      v_previsao := null;
      insert into public.financeiro_cartao_recorrencia_previsoes (
        recorrencia_id,
        fatura_id,
        cartao_id,
        competencia,
        data_compra,
        descricao,
        estabelecimento,
        valor,
        empresa_id,
        plano_conta_id,
        centro_custo_id,
        classificacao_status
      )
      values (
        v_recorrencia.id,
        v_fatura.id,
        v_fatura.cartao_id,
        v_fatura.competencia,
        v_data_ocorrencia,
        v_recorrencia.descricao,
        v_recorrencia.estabelecimento,
        v_recorrencia.valor,
        v_recorrencia.empresa_id,
        v_recorrencia.plano_conta_id,
        v_recorrencia.centro_custo_id,
        v_recorrencia.classificacao_status
      )
      on conflict (recorrencia_id, competencia) do nothing
      returning * into v_previsao;

      get diagnostics v_inserted = row_count;
      if v_inserted = 1 then
        v_total := v_total + 1;
        perform public.financeiro_cartoes_audit_insert(
          v_actor,
          'financeiro_cartao_recorrencia_previsoes',
          'cartao_recorrencia_previsao',
          v_previsao.id,
          'gerar_previsao_recorrencia',
          null,
          to_jsonb(v_previsao),
          null
        );
      end if;
    end loop;
  end loop;

  return v_total;
end;
$$;

create or replace function public.financeiro_cartao_recorrencia_atualizar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_id uuid;
  v_competencia_efetiva date;
  v_recorrencia public.financeiro_cartao_recorrencias%rowtype;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_before public.financeiro_cartao_recorrencias%rowtype;
  v_after public.financeiro_cartao_recorrencias%rowtype;
  v_classificacao_status text;
  v_descricao text;
  v_estabelecimento text;
  v_valor numeric;
  v_dia_base smallint;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_id := nullif(payload->>'recorrencia_id', '')::uuid;
  if v_id is null then
    raise exception 'recorrencia_id obrigatorio para atualizar recorrencia.';
  end if;
  v_competencia_efetiva := date_trunc('month', nullif(payload->>'competencia_efetiva', '')::date)::date;
  if v_competencia_efetiva is null then
    raise exception 'competencia_efetiva obrigatoria para atualizar recorrencia.';
  end if;

  select * into v_recorrencia
    from public.financeiro_cartao_recorrencias
   where id = v_id;
  if not found then
    raise exception 'recorrencia de cartao nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_recorrencia.cartao_id::text, 0));
  select * into v_before
    from public.financeiro_cartao_recorrencias
   where id = v_id
   for update;
  if not found then
    raise exception 'recorrencia de cartao nao encontrada.';
  end if;
  v_recorrencia := v_before;

  if payload ? 'descricao' then
    v_descricao := nullif(trim(payload->>'descricao'), '');
    if v_descricao is null then
      raise exception 'descricao obrigatoria para atualizar recorrencia.';
    end if;
  else
    v_descricao := v_before.descricao;
  end if;
  if payload ? 'estabelecimento' then
    v_estabelecimento := nullif(trim(payload->>'estabelecimento'), '');
  else
    v_estabelecimento := v_before.estabelecimento;
  end if;
  if payload ? 'valor' then
    if lower(trim(coalesce(payload->>'valor', ''))) in ('nan', 'infinity', '+infinity', '-infinity') then
      raise exception 'valor invalido para atualizar recorrencia.';
    end if;
    v_valor := round(nullif(payload->>'valor', '')::numeric, 2);
  else
    v_valor := round(v_before.valor, 2);
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor deve ser maior que zero para atualizar recorrencia.';
  end if;
  v_dia_base := coalesce(nullif(payload->>'dia_base', '')::smallint, v_before.dia_base);
  if v_dia_base < 1 or v_dia_base > 31 then
    raise exception 'dia_base deve estar entre 1 e 31.';
  end if;

  v_classificacao_status := coalesce(nullif(payload->>'classificacao_status', ''), v_before.classificacao_status);
  if v_classificacao_status not in ('pendente', 'sugerida', 'confirmada') then
    raise exception 'classificacao_status invalido para recorrencia de cartao.';
  end if;
  if v_classificacao_status = 'confirmada' then
    if (case when payload ? 'empresa_id' then nullif(payload->>'empresa_id', '')::uuid else v_before.empresa_id end) is null
       or (case when payload ? 'plano_conta_id' then nullif(payload->>'plano_conta_id', '')::uuid else v_before.plano_conta_id end) is null
       or (case when payload ? 'centro_custo_id' then nullif(payload->>'centro_custo_id', '')::uuid else v_before.centro_custo_id end) is null then
      raise exception 'empresa_id, plano_conta_id e centro_custo_id obrigatorios para classificacao confirmada.';
    end if;
  end if;

  update public.financeiro_cartao_recorrencias
     set descricao = v_descricao,
         estabelecimento = v_estabelecimento,
         valor = v_valor,
         dia_base = v_dia_base,
         empresa_id = case when payload ? 'empresa_id' then nullif(payload->>'empresa_id', '')::uuid else empresa_id end,
         plano_conta_id = case when payload ? 'plano_conta_id' then nullif(payload->>'plano_conta_id', '')::uuid else plano_conta_id end,
         centro_custo_id = case when payload ? 'centro_custo_id' then nullif(payload->>'centro_custo_id', '')::uuid else centro_custo_id end,
         classificacao_status = v_classificacao_status,
         updated_at = now()
   where id = v_before.id
   returning * into v_after;

  update public.financeiro_cartao_recorrencia_previsoes
     set descricao = v_after.descricao,
         estabelecimento = v_after.estabelecimento,
         valor = v_after.valor,
         empresa_id = v_after.empresa_id,
         plano_conta_id = v_after.plano_conta_id,
         centro_custo_id = v_after.centro_custo_id,
         classificacao_status = v_after.classificacao_status,
         updated_at = now()
   where recorrencia_id = v_recorrencia.id
     and status = 'prevista'
     and fatura_id in (
       select id
         from public.financeiro_cartao_faturas
        where cartao_id = v_recorrencia.cartao_id
          and status = 'aberta'
          and competencia >= v_competencia_efetiva
     );

  for v_fatura in
    select *
      from public.financeiro_cartao_faturas
     where cartao_id = v_recorrencia.cartao_id
       and status = 'aberta'
       and competencia >= v_competencia_efetiva
     order by competencia
  loop
    perform public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura.id, v_actor);
  end loop;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_recorrencias',
    'cartao_recorrencia',
    v_after.id,
    'atualizar_recorrencia_cartao',
    to_jsonb(v_before),
    to_jsonb(v_after),
    payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'recorrencia_id', v_after.id,
    'competencia_efetiva', v_competencia_efetiva,
    'status', v_after.status
  );
end;
$$;

create or replace function public.financeiro_cartao_recorrencia_criar(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_recorrencia public.financeiro_cartao_recorrencias%rowtype;
  v_transacao public.financeiro_cartao_transacoes%rowtype;
  v_transacao_result jsonb;
  v_next_open jsonb;
  v_cartao_id uuid;
  v_fatura_id uuid;
  v_transacao_id uuid;
  v_previsao_id uuid;
  v_data_compra date;
  v_data_compra_competencia date;
  v_proxima_data date;
  v_mes_candidato date;
  v_candidato_competencia date;
  v_descricao text;
  v_estabelecimento text;
  v_tipo text;
  v_valor numeric;
  v_dia_base smallint;
  v_client_token text;
  v_id_externo text;
  v_classificacao_status text;
  v_is_parcela boolean;
  v_idempotent boolean := false;
  v_idx integer;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_fatura_id := nullif(payload->>'fatura_id', '')::uuid;
  if v_fatura_id is null then
    raise exception 'fatura_id obrigatorio para recorrencia de cartao.';
  end if;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = v_fatura_id;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  v_cartao_id := nullif(payload->>'cartao_id', '')::uuid;
  if v_cartao_id is not null and v_cartao_id <> v_fatura.cartao_id then
    raise exception 'cartao da recorrencia nao corresponde a fatura.';
  end if;
  v_cartao_id := v_fatura.cartao_id;

  perform pg_advisory_xact_lock(hashtextextended(v_cartao_id::text, 0));
  select * into v_fatura
    from public.financeiro_cartao_faturas
   where id = v_fatura_id
   for update;
  if not found then
    raise exception 'fatura de cartao nao encontrada.';
  end if;

  v_client_token := nullif(trim(payload->>'client_token'), '');
  if v_client_token is null then
    raise exception 'client_token obrigatorio para recorrencia de cartao.';
  end if;
  if nullif(trim(payload->>'id_externo'), '') is not null
     and nullif(trim(payload->>'id_externo'), '') <> v_client_token then
    raise exception 'id_externo deve ser igual ao client_token para recorrencia de cartao.';
  end if;
  v_id_externo := v_client_token;

  select * into v_transacao
    from public.financeiro_cartao_transacoes
   where cartao_id = v_cartao_id
     and id_externo = v_id_externo
   limit 1;
  if found then
    if v_transacao.fatura_id <> v_fatura.id then
      raise exception 'client_token ja vinculado a outra fatura do mesmo cartao.';
    end if;
    select * into v_recorrencia
      from public.financeiro_cartao_recorrencias
     where transacao_origem_id = v_transacao.id
     for update;
    if found then
      select id into v_previsao_id
        from public.financeiro_cartao_recorrencia_previsoes
       where recorrencia_id = v_recorrencia.id
         and competencia > v_fatura.competencia
       order by competencia
       limit 1;
      return jsonb_build_object(
        'success', true,
        'transacao_id', v_transacao.id,
        'recorrencia_id', v_recorrencia.id,
        'previsao_id', v_previsao_id,
        'idempotent', true
      );
    end if;
  end if;

  if v_fatura.status <> 'aberta' then
    raise exception 'fatura de cartao deve estar aberta para criar recorrencia.';
  end if;

  v_tipo := coalesce(nullif(payload->>'tipo_transacao', ''), 'compra');
  if v_tipo = 'compra' then
    null;
  else
    raise exception 'recorrencia de cartao aceita somente tipo compra.';
  end if;

  v_is_parcela := coalesce(nullif(payload->>'is_parcela', '')::boolean, false)
    or coalesce(nullif(payload->>'total_parcelas', '')::int, 1) > 1
    or nullif(payload->>'compra_parcelada_id', '') is not null
    or nullif(payload->>'parcela_atual', '') is not null;
  if v_is_parcela is not true then
    null;
  else
    raise exception 'recorrencia de cartao nao pode ser parcelada.';
  end if;

  v_data_compra := nullif(payload->>'data_compra', '')::date;
  if v_data_compra is null then
    raise exception 'data_compra obrigatoria para recorrencia de cartao.';
  end if;
  select c.competencia
    into v_data_compra_competencia
    from public.financeiro_cartao_ciclo(v_cartao_id, v_data_compra) c;
  if v_data_compra_competencia is distinct from v_fatura.competencia then
    raise exception 'data_compra nao pertence a competencia da fatura.';
  end if;
  v_descricao := nullif(trim(payload->>'descricao'), '');
  if v_descricao is null then
    raise exception 'descricao obrigatoria para recorrencia de cartao.';
  end if;
  v_estabelecimento := nullif(trim(payload->>'estabelecimento'), '');
  if lower(trim(coalesce(payload->>'valor', ''))) in ('nan', 'infinity', '+infinity', '-infinity') then
    raise exception 'valor invalido para criar recorrencia.';
  end if;
  v_valor := round(nullif(payload->>'valor', '')::numeric, 2);
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor deve ser maior que zero para recorrencia de cartao.';
  end if;
  v_dia_base := coalesce(nullif(payload->>'dia_base', '')::smallint, extract(day from v_data_compra)::smallint);
  if v_dia_base < 1 or v_dia_base > 31 then
    raise exception 'dia_base deve estar entre 1 e 31.';
  end if;

  v_classificacao_status := coalesce(nullif(payload->>'classificacao_status', ''), 'pendente');
  if v_classificacao_status not in ('pendente', 'sugerida', 'confirmada') then
    raise exception 'classificacao_status invalido para recorrencia de cartao.';
  end if;
  if v_classificacao_status = 'confirmada' then
    if nullif(payload->>'empresa_id', '') is null
       or nullif(payload->>'plano_conta_id', '') is null
       or nullif(payload->>'centro_custo_id', '') is null then
      raise exception 'empresa_id, plano_conta_id e centro_custo_id obrigatorios para classificacao confirmada.';
    end if;
  end if;

  v_transacao_result := public.financeiro_cartao_transacao_registrar(
    jsonb_strip_nulls(jsonb_build_object(
      'fatura_id', v_fatura.id,
      'cartao_id', v_cartao_id,
      'data_compra', v_data_compra,
      'descricao', v_descricao,
      'estabelecimento', v_estabelecimento,
      'valor', v_valor,
      'tipo_transacao', v_tipo,
      'empresa_id', nullif(payload->>'empresa_id', ''),
      'plano_conta_id', nullif(payload->>'plano_conta_id', ''),
      'centro_custo_id', nullif(payload->>'centro_custo_id', ''),
      'classificacao_status', v_classificacao_status,
      'id_externo', v_id_externo,
      'fonte_tipo', coalesce(nullif(payload->>'fonte_tipo', ''), v_actor->>'ator_tipo'),
      'observacoes', nullif(payload->>'observacoes', ''),
      'motivo', payload->>'motivo'
    )),
    ator
  );
  v_transacao_id := nullif(v_transacao_result->>'transacao_id', '')::uuid;
  if v_transacao_id is null then
    raise exception 'transacao de origem nao retornada.';
  end if;
  v_idempotent := coalesce((v_transacao_result->>'idempotent')::boolean, false);

  select * into v_recorrencia
    from public.financeiro_cartao_recorrencias
   where transacao_origem_id = v_transacao_id
   for update;
  if found then
    select id into v_previsao_id
      from public.financeiro_cartao_recorrencia_previsoes
     where recorrencia_id = v_recorrencia.id
       and competencia > v_fatura.competencia
     order by competencia
     limit 1;
    return jsonb_build_object(
      'success', true,
      'transacao_id', v_transacao_id,
      'recorrencia_id', v_recorrencia.id,
      'previsao_id', v_previsao_id,
      'idempotent', true
    );
  end if;
  if v_idempotent then
    raise exception 'id_externo ja esta associado a transacao sem recorrencia.';
  end if;

  insert into public.financeiro_cartao_recorrencias (
    cartao_id,
    transacao_origem_id,
    data_inicio,
    dia_base,
    descricao,
    estabelecimento,
    valor,
    empresa_id,
    plano_conta_id,
    centro_custo_id,
    classificacao_status,
    ator_tipo,
    ator_ref,
    created_by
  )
  values (
    v_cartao_id,
    v_transacao_id,
    v_data_compra,
    v_dia_base,
    v_descricao,
    v_estabelecimento,
    v_valor,
    nullif(payload->>'empresa_id', '')::uuid,
    nullif(payload->>'plano_conta_id', '')::uuid,
    nullif(payload->>'centro_custo_id', '')::uuid,
    v_classificacao_status,
    v_actor->>'ator_tipo',
    v_actor->>'ator_ref',
    nullif(v_actor->>'created_by', '')::uuid
  )
  returning * into v_recorrencia;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_recorrencias',
    'cartao_recorrencia',
    v_recorrencia.id,
    'criar_recorrencia_cartao',
    null,
    to_jsonb(v_recorrencia),
    payload->>'motivo'
  );

  v_mes_candidato := date_trunc('month', v_data_compra + interval '1 month')::date;
  v_previsao_id := null;
  for v_idx in 1..24 loop
    v_proxima_data := public.financeiro_cartao_clamp_dia(
      extract(year from v_mes_candidato)::int,
      extract(month from v_mes_candidato)::int,
      v_dia_base
    );
    select c.competencia
      into v_candidato_competencia
      from public.financeiro_cartao_ciclo(v_cartao_id, v_proxima_data) c;
    if v_candidato_competencia <= v_fatura.competencia then
      v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
      continue;
    end if;

    v_next_open := public.financeiro_cartao_fatura_abrir(
      jsonb_build_object(
        'cartao_id', v_cartao_id,
        'data_compra', v_proxima_data,
        'motivo', payload->>'motivo'
      ),
      ator
    );
    if coalesce(v_next_open->>'status', '') <> 'aberta' then
      v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
      continue;
    end if;

    select id into v_previsao_id
      from public.financeiro_cartao_recorrencia_previsoes
     where recorrencia_id = v_recorrencia.id
       and fatura_id = nullif(v_next_open->>'fatura_id', '')::uuid
       and competencia > v_fatura.competencia
     limit 1;
    if v_previsao_id is not null then
      exit;
    end if;
    v_mes_candidato := (v_mes_candidato + interval '1 month')::date;
  end loop;
  if v_previsao_id is null then
    raise exception 'nao foi possivel gerar previsao na proxima fatura aberta.';
  end if;

  return jsonb_build_object(
    'success', true,
    'transacao_id', v_transacao_id,
    'recorrencia_id', v_recorrencia.id,
    'previsao_id', v_previsao_id,
    'idempotent', false
  );
end;
$$;

-- M12 permanece a porta de abertura de fatura; somente o hook de previsoes foi adicionado.
create or replace function public.financeiro_cartao_fatura_abrir(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_cartao_id uuid;
  v_cartao public.financeiro_cartoes%rowtype;
  v_data_compra date;
  v_competencia date;
  v_data_fechamento date;
  v_data_vencimento date;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_inserted int;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_cartao_id := nullif(payload->>'cartao_id', '')::uuid;
  if v_cartao_id is null then
    raise exception 'cartao_id obrigatorio para abrir fatura de cartao.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = v_cartao_id
     and ativo = true;
  if not found then
    raise exception 'cartao nao encontrado ou inativo.';
  end if;

  v_data_compra := nullif(payload->>'data_compra', '')::date;
  v_competencia := nullif(payload->>'competencia', '')::date;
  if v_data_compra is null and v_competencia is null then
    raise exception 'data_compra ou competencia obrigatoria para abrir fatura de cartao.';
  end if;

  if v_data_compra is not null then
    select c.competencia, c.data_fechamento, c.data_vencimento
      into v_competencia, v_data_fechamento, v_data_vencimento
      from public.financeiro_cartao_ciclo(v_cartao_id, v_data_compra) c;
  else
    v_competencia := date_trunc('month', v_competencia)::date;
    v_data_fechamento := public.financeiro_cartao_data_fechamento_por_competencia(v_cartao_id, v_competencia);
    v_data_vencimento := public.financeiro_cartao_clamp_dia(
      extract(year from v_competencia)::int,
      extract(month from v_competencia)::int,
      v_cartao.dia_vencimento
    );
  end if;

  insert into public.financeiro_cartao_faturas (
    cartao_id,
    competencia,
    data_fechamento,
    data_vencimento,
    valor_total,
    status,
    observacoes
  )
  values (
    v_cartao_id,
    v_competencia,
    v_data_fechamento,
    v_data_vencimento,
    0,
    'aberta',
    nullif(payload->>'observacoes', '')
  )
  on conflict (cartao_id, competencia) do nothing;

  get diagnostics v_inserted = row_count;

  select * into v_fatura
    from public.financeiro_cartao_faturas
   where cartao_id = v_cartao_id
     and competencia = v_competencia;
  if not found then
    raise exception 'falha ao resolver fatura de cartao.';
  end if;

  if v_inserted = 1 then
    perform public.financeiro_cartoes_audit_insert(
      v_actor,
      'financeiro_cartao_faturas',
      'cartao_fatura',
      v_fatura.id,
      'abrir_fatura_cartao',
      null,
      to_jsonb(v_fatura),
      payload->>'motivo'
    );
  end if;

  perform public.financeiro_cartao_recorrencias_gerar_previsoes(v_fatura.id, v_actor);

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_fatura.id,
    'competencia', v_fatura.competencia,
    'data_fechamento', v_fatura.data_fechamento,
    'data_vencimento', v_fatura.data_vencimento,
    'status', v_fatura.status,
    'criada', v_inserted = 1
  );
end;
$$;

create or replace function public.financeiro_cartao_recorrencia_alterar_status(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_id uuid;
  v_novo_status text;
  v_motivo text;
  v_before public.financeiro_cartao_recorrencias%rowtype;
  v_recorrencia public.financeiro_cartao_recorrencias%rowtype;
  v_after public.financeiro_cartao_recorrencias%rowtype;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_id := nullif(payload->>'recorrencia_id', '')::uuid;
  if v_id is null then
    raise exception 'recorrencia_id obrigatorio para alterar status.';
  end if;
  v_novo_status := coalesce(nullif(payload->>'status', ''), nullif(payload->>'novo_status', ''));
  if v_novo_status not in ('ativa', 'pausada', 'encerrada') then
    raise exception 'status de recorrencia invalido.';
  end if;
  v_motivo := nullif(trim(payload->>'motivo'), '');

  select * into v_recorrencia
    from public.financeiro_cartao_recorrencias
   where id = v_id;
  if not found then
    raise exception 'recorrencia de cartao nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_recorrencia.cartao_id::text, 0));
  select * into v_before
    from public.financeiro_cartao_recorrencias
   where id = v_id
   for update;
  if not found then
    raise exception 'recorrencia de cartao nao encontrada.';
  end if;
  v_recorrencia := v_before;

  if v_novo_status = 'ativa' then
    if v_recorrencia.status = 'pausada' then
      null;
    else
      raise exception 'somente recorrencia pausada pode ser retomada.';
    end if;
  end if;
  if v_novo_status = 'pausada' and v_recorrencia.status not in ('ativa', 'pausada') then
    raise exception 'recorrencia encerrada nao pode ser pausada.';
  end if;
  if v_novo_status = 'encerrada' and v_recorrencia.status = 'encerrada' then
    return jsonb_build_object('success', true, 'recorrencia_id', v_before.id, 'status', v_before.status, 'idempotent', true);
  end if;

  update public.financeiro_cartao_recorrencias
     set status = v_novo_status,
         pausada_em = case when v_novo_status = 'pausada' then coalesce(pausada_em, now()) else pausada_em end,
         encerrada_em = case when v_novo_status = 'encerrada' then coalesce(encerrada_em, now()) else encerrada_em end,
         motivo_status = coalesce(v_motivo, motivo_status),
         ator_tipo = v_actor->>'ator_tipo',
         ator_ref = v_actor->>'ator_ref',
         updated_at = now()
   where id = v_before.id
   returning * into v_after;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_recorrencias',
    'cartao_recorrencia',
    v_after.id,
    'alterar_status_recorrencia_cartao',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_motivo
  );

  return jsonb_build_object(
    'success', true,
    'recorrencia_id', v_after.id,
    'status', v_after.status,
    'idempotent', false
  );
end;
$$;

create or replace function public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(payload jsonb, ator jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
  v_previsao_id uuid;
  v_transacao_id uuid;
  v_decisao text;
  v_before public.financeiro_cartao_recorrencia_previsoes%rowtype;
  v_after public.financeiro_cartao_recorrencia_previsoes%rowtype;
  v_transacao public.financeiro_cartao_transacoes%rowtype;
begin
  v_actor := public.financeiro_cartoes_resolve_ator(ator);
  v_previsao_id := nullif(payload->>'previsao_id', '')::uuid;
  v_transacao_id := nullif(payload->>'transacao_id', '')::uuid;
  v_decisao := nullif(payload->>'decisao', '');
  if v_previsao_id is null or v_transacao_id is null then
    raise exception 'previsao_id e transacao_id obrigatorios para decidir vinculo.';
  end if;
  if v_decisao not in ('confirmar', 'manter_separadas') then
    raise exception 'decisao de vinculo invalida.';
  end if;

  select * into v_before
    from public.financeiro_cartao_recorrencia_previsoes
   where id = v_previsao_id
   for update;
  if not found then
    raise exception 'previsao de recorrencia nao encontrada.';
  end if;
  if v_before.status <> 'prevista' then
    raise exception 'previsao de recorrencia ja foi decidida.';
  end if;

  select * into v_transacao
    from public.financeiro_cartao_transacoes
   where id = v_transacao_id
   for update;
  if not found then
    raise exception 'transacao real nao encontrada para vinculo.';
  end if;
  if v_before.cartao_id <> v_transacao.cartao_id
     or v_before.fatura_id <> v_transacao.fatura_id then
    raise exception 'previsao e transacao devem pertencer a mesma fatura e cartao.';
  end if;

  if v_decisao = 'confirmar' then
    update public.financeiro_cartao_recorrencia_previsoes
       set status = 'confirmada',
           transacao_confirmada_id = v_transacao.id,
           decidida_em = now(),
           decidida_por = v_actor->>'ator_tipo',
           motivo_decisao = nullif(payload->>'motivo', ''),
           updated_at = now()
     where id = v_before.id
     returning * into v_after;
  else
    update public.financeiro_cartao_recorrencia_previsoes
       set status = 'dispensada',
           decidida_em = now(),
           decidida_por = v_actor->>'ator_tipo',
           motivo_decisao = coalesce(nullif(payload->>'motivo', ''), 'Mantidas separadas por decisão operacional.'),
           updated_at = now()
     where id = v_before.id
     returning * into v_after;
  end if;

  perform public.financeiro_cartoes_audit_insert(
    v_actor,
    'financeiro_cartao_recorrencia_previsoes',
    'cartao_recorrencia_previsao',
    v_after.id,
    case when v_decisao = 'confirmar' then 'confirmar_vinculo_recorrencia' else 'manter_previsao_separada' end,
    to_jsonb(v_before),
    to_jsonb(v_after),
    payload->>'motivo'
  );

  return jsonb_build_object(
    'success', true,
    'previsao_id', v_after.id,
    'transacao_id', v_transacao.id,
    'status', v_after.status,
    'decisao', v_decisao
  );
end;
$$;

-- As previsoes sao internas; apenas as quatro portas operacionais sao chamadas pelo browser.
revoke all on function public.financeiro_cartao_recorrencias_gerar_previsoes(uuid, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartao_recorrencias_gerar_previsoes(uuid, jsonb) from authenticated;
revoke execute on function public.financeiro_cartao_recorrencias_gerar_previsoes(uuid, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;

revoke all on function public.financeiro_cartao_fatura_abrir(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke execute on function public.financeiro_cartao_fatura_abrir(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_fatura_abrir(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_recorrencia_criar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartao_recorrencia_criar(jsonb, jsonb) from authenticated;
revoke execute on function public.financeiro_cartao_recorrencia_criar(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_recorrencia_criar(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_recorrencia_atualizar(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartao_recorrencia_atualizar(jsonb, jsonb) from authenticated;
revoke execute on function public.financeiro_cartao_recorrencia_atualizar(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_recorrencia_atualizar(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_recorrencia_alterar_status(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartao_recorrencia_alterar_status(jsonb, jsonb) from authenticated;
revoke execute on function public.financeiro_cartao_recorrencia_alterar_status(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_recorrencia_alterar_status(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(jsonb, jsonb) from public, anon, maria_operacional, maria_leitura;
revoke all on function public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(jsonb, jsonb) from authenticated;
revoke execute on function public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(jsonb, jsonb) from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.financeiro_cartao_recorrencia_previsao_decidir_vinculo(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.financeiro_cartao_recorrencia_origem_bloqueia_cancelamento() from public, anon, authenticated, maria_operacional, maria_leitura;
revoke execute on function public.financeiro_cartao_recorrencia_origem_bloqueia_cancelamento() from public, anon, authenticated, maria_operacional, maria_leitura;
