-- Fatia 3: espelho financeiro de contas a receber vindo do LA Report.
-- O LA Report continua sendo a fonte dos fatos; o Super Folha guarda a classificacao gerencial.

create table if not exists public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  la_report_fatura_id uuid not null,
  la_report_unidade_id uuid not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_student_id bigint,
  unidade text not null check (unidade in ('cg', 'rec', 'bar')),
  descricao text not null,
  aluno_nome text,
  curso_nome text,
  cadastro_match_status text not null check (cadastro_match_status in ('unico', 'nao_encontrado', 'duplicado')),
  curso_candidatos jsonb not null default '[]'::jsonb check (jsonb_typeof(curso_candidatos) = 'array'),
  status_origem text not null,
  status text not null check (status in ('recebido', 'pendente', 'cancelado', 'revisar')),
  competencia date not null,
  data_vencimento date,
  data_recebimento date,
  valor_original numeric(14,2) not null default 0,
  valor_pago numeric(14,2),
  juros_e_multa numeric(14,2) not null default 0,
  desconto_aplicado numeric(14,2) not null default 0,
  desconto_fixo numeric(14,2) not null default 0,
  desconto_condicional numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,
  plano_conta_id uuid references public.plano_contas(id),
  centro_custo_id uuid references public.centros_custo(id),
  excluido_da_receita boolean not null default false,
  motivo_exclusao text,
  classificacao_status text not null default 'pendente'
    check (classificacao_status in ('confirmada', 'pendente', 'excluida')),
  classificacao_origem text not null default 'pendente'
    check (classificacao_origem in ('automatica', 'manual', 'pendente', 'exclusao_automatica')),
  classificado_por text,
  classificado_em timestamptz,
  row_source_hash text not null,
  manifest_hash text not null,
  source_updated_at timestamptz,
  source_synced_at timestamptz,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (la_report_unidade_id, emusys_fatura_id)
);

create index if not exists contas_receber_competencia_idx
  on public.contas_receber (competencia, unidade, status);
create index if not exists contas_receber_classificacao_idx
  on public.contas_receber (competencia, classificacao_status, excluido_da_receita);
create index if not exists contas_receber_aluno_idx
  on public.contas_receber (aluno_nome);

create table if not exists public.contas_receber_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  manifest_hash text not null,
  modo text not null default 'apply' check (modo = 'apply'),
  total_itens integer not null,
  manifesto jsonb not null,
  ator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (competencia, manifest_hash)
);

create table if not exists public.contas_receber_operadores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  motivo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rose opera o financeiro real; o perfil HML Financeiro preserva o caminho de QA.
-- Administradores sao autorizados dinamicamente pela funcao abaixo.
insert into public.contas_receber_operadores (user_id, ativo, motivo)
select up.id, true, 'operacao financeira de contas a receber'
  from public.user_profiles up
 where lower(trim(up.nome)) in ('rose', 'hml financeiro')
on conflict (user_id) do update
  set ativo = true,
      motivo = excluded.motivo,
      updated_at = now();

alter table public.contas_receber enable row level security;
alter table public.contas_receber_sync_execucoes enable row level security;
alter table public.contas_receber_operadores enable row level security;

drop policy if exists contas_receber_authenticated_select on public.contas_receber;
create policy contas_receber_authenticated_select on public.contas_receber
  for select to authenticated using (true);

revoke all on public.contas_receber from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.contas_receber to authenticated, service_role;

revoke all on public.contas_receber_sync_execucoes from public, anon, authenticated, maria_operacional, maria_leitura;
grant select, insert on public.contas_receber_sync_execucoes to service_role;

revoke all on public.contas_receber_operadores from public, anon, authenticated, maria_operacional, maria_leitura;
grant select, insert, update, delete on public.contas_receber_operadores to service_role;

create or replace function public.contas_receber_pode_operar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(
      nullif(auth.role(), ''),
      nullif(current_setting('request.jwt.claim.role', true), ''),
      session_user::text
    ) in ('service_role', 'postgres') then true
    when auth.role() <> 'authenticated' or auth.uid() is null then false
    else exists (
      select 1
        from public.user_profiles up
       where up.id = auth.uid()
         and up.role = 'admin'
    ) or exists (
      select 1
        from public.contas_receber_operadores op
       where op.user_id = auth.uid()
         and op.ativo = true
    )
  end;
$$;

revoke all on function public.contas_receber_pode_operar()
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_pode_operar()
  to authenticated, service_role;

create or replace function public.contas_receber_sync_aplicar(
  p_competencia date,
  p_manifest_hash text,
  p_itens jsonb,
  p_manifesto jsonb,
  p_ator jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_item jsonb;
  v_plano_mensalidade uuid;
  v_plano_matricula uuid;
  v_plano_locacao uuid;
  v_descricao_normalizada text;
  v_plano_automatico uuid;
  v_centro_automatico uuid;
  v_excluido_automatico boolean;
  v_motivo_exclusao text;
  v_status text;
  v_classificacao_status text;
  v_classificacao_origem text;
  v_total integer := 0;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_manuais_preservados integer := 0;
  v_existente public.contas_receber%rowtype;
begin
  v_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user::text
  );

  if v_role not in ('service_role', 'postgres') then
    raise exception 'sincronizacao de contas a receber exige service_role.' using errcode = '42501';
  end if;

  if p_competencia is null or p_competencia <> date_trunc('month', p_competencia)::date then
    raise exception 'competencia deve ser o primeiro dia do mes.';
  end if;
  if nullif(trim(p_manifest_hash), '') is null then
    raise exception 'manifest_hash obrigatorio.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens deve ser um array.';
  end if;
  if p_manifesto is null or jsonb_typeof(p_manifesto) <> 'object' then
    raise exception 'manifesto deve ser um objeto.';
  end if;
  if coalesce(p_manifesto->>'manifest_hash', '') <> p_manifest_hash then
    raise exception 'manifest_hash diverge do manifesto.';
  end if;
  if jsonb_array_length(p_itens) <> coalesce(
    nullif(p_manifesto->>'total_itens', '')::integer,
    nullif(p_manifesto->>'total_linhas', '')::integer,
    -1
  ) then
    raise exception 'quantidade de itens diverge do manifesto.';
  end if;

  select id into v_plano_mensalidade
    from public.plano_contas
   where codigo = '3.1.1' and nivel = 3 and natureza = 'entrada' and ativo = true;
  select id into v_plano_matricula
    from public.plano_contas
   where codigo = '3.1.2' and nivel = 3 and natureza = 'entrada' and ativo = true;
  select id into v_plano_locacao
    from public.plano_contas
   where codigo = '3.4.1' and nivel = 3 and natureza = 'entrada' and ativo = true;

  if v_plano_mensalidade is null or v_plano_matricula is null or v_plano_locacao is null then
    raise exception 'planos automaticos 3.1.1, 3.1.2 e 3.4.1 precisam estar ativos como folhas de entrada.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if (v_item->>'competencia')::date <> p_competencia then
      raise exception 'item % pertence a outra competencia.', v_item->>'emusys_fatura_id';
    end if;
    if coalesce(v_item->>'manifest_hash', p_manifest_hash) <> p_manifest_hash then
      raise exception 'item % possui manifest_hash divergente.', v_item->>'emusys_fatura_id';
    end if;

    v_descricao_normalizada := translate(
      lower(coalesce(v_item->>'descricao', '')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );
    v_plano_automatico := null;
    v_centro_automatico := null;
    v_excluido_automatico := false;
    v_motivo_exclusao := null;
    v_classificacao_status := 'pendente';
    v_classificacao_origem := 'pendente';

    if v_descricao_normalizada ~ '^\s*parcela' then
      v_plano_automatico := v_plano_mensalidade;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ '(passaporte|matricula)' then
      v_plano_automatico := v_plano_matricula;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ 'loca(c|ç)(a|ã)o' then
      v_plano_automatico := v_plano_locacao;
      v_classificacao_status := 'confirmada';
      v_classificacao_origem := 'automatica';
    elsif v_descricao_normalizada ~ 'rateio' then
      v_excluido_automatico := true;
      v_motivo_exclusao := 'Rateio interno excluido automaticamente da receita.';
      v_classificacao_status := 'excluida';
      v_classificacao_origem := 'exclusao_automatica';
    end if;

    select id into v_centro_automatico
      from public.centros_custo
     where lower(codigo) = v_item->>'unidade'
       and ativo = true
     limit 1;
    if v_centro_automatico is null then
      raise exception 'centro de custo ativo nao encontrado para a unidade %.', v_item->>'unidade';
    end if;

    v_status := case lower(coalesce(v_item->>'status_origem', ''))
      when 'paga' then 'recebido'
      when 'pago' then 'recebido'
      when 'aberta' then 'pendente'
      when 'pendente' then 'pendente'
      when 'cancelada' then 'cancelado'
      when 'cancelado' then 'cancelado'
      else 'revisar'
    end;

    select * into v_existente
      from public.contas_receber
     where la_report_unidade_id = (v_item->>'la_report_unidade_id')::uuid
       and emusys_fatura_id = (v_item->>'emusys_fatura_id')::bigint;

    if found then
      v_atualizados := v_atualizados + 1;
      if v_existente.classificacao_origem = 'manual' then
        v_manuais_preservados := v_manuais_preservados + 1;
      end if;
    else
      v_inseridos := v_inseridos + 1;
    end if;

    insert into public.contas_receber (
      la_report_fatura_id, la_report_unidade_id, emusys_fatura_id,
      emusys_matricula_id, emusys_student_id, unidade, descricao,
      aluno_nome, curso_nome, cadastro_match_status, curso_candidatos,
      status_origem, status, competencia, data_vencimento, data_recebimento,
      valor_original, valor_pago, juros_e_multa, desconto_aplicado,
      desconto_fixo, desconto_condicional, valor_liquido,
      plano_conta_id, centro_custo_id, excluido_da_receita, motivo_exclusao,
      classificacao_status, classificacao_origem, classificado_por, classificado_em,
      row_source_hash, manifest_hash, source_updated_at, source_synced_at,
      imported_at, updated_at
    ) values (
      (v_item->>'la_report_fatura_id')::uuid,
      (v_item->>'la_report_unidade_id')::uuid,
      (v_item->>'emusys_fatura_id')::bigint,
      nullif(v_item->>'emusys_matricula_id', '')::bigint,
      nullif(v_item->>'emusys_student_id', '')::bigint,
      v_item->>'unidade', v_item->>'descricao',
      nullif(v_item->>'aluno_nome', ''), nullif(v_item->>'curso_nome', ''),
      v_item->>'cadastro_match_status', coalesce(v_item->'curso_candidatos', '[]'::jsonb),
      v_item->>'status_origem', v_status, p_competencia,
      nullif(v_item->>'data_vencimento', '')::date,
      nullif(v_item->>'data_recebimento', '')::date,
      coalesce((v_item->>'valor_original')::numeric, 0),
      nullif(v_item->>'valor_pago', '')::numeric,
      coalesce((v_item->>'juros_e_multa')::numeric, 0),
      coalesce((v_item->>'desconto_aplicado')::numeric, 0),
      coalesce((v_item->>'desconto_fixo')::numeric, 0),
      coalesce((v_item->>'desconto_condicional')::numeric, 0),
      coalesce((v_item->>'valor_liquido')::numeric, 0),
      v_plano_automatico, v_centro_automatico, v_excluido_automatico, v_motivo_exclusao,
      v_classificacao_status, v_classificacao_origem,
      case when v_classificacao_status = 'confirmada' then 'sincronizacao-automatica' end,
      case when v_classificacao_status = 'confirmada' then now() end,
      v_item->>'row_source_hash', p_manifest_hash,
      nullif(v_item->>'source_updated_at', '')::timestamptz,
      nullif(v_item->>'source_synced_at', '')::timestamptz,
      now(), now()
    )
    on conflict (la_report_unidade_id, emusys_fatura_id) do update set
      la_report_fatura_id = excluded.la_report_fatura_id,
      emusys_matricula_id = excluded.emusys_matricula_id,
      emusys_student_id = excluded.emusys_student_id,
      unidade = excluded.unidade,
      descricao = excluded.descricao,
      aluno_nome = excluded.aluno_nome,
      curso_nome = excluded.curso_nome,
      cadastro_match_status = excluded.cadastro_match_status,
      curso_candidatos = excluded.curso_candidatos,
      status_origem = excluded.status_origem,
      status = excluded.status,
      competencia = excluded.competencia,
      data_vencimento = excluded.data_vencimento,
      data_recebimento = excluded.data_recebimento,
      valor_original = excluded.valor_original,
      valor_pago = excluded.valor_pago,
      juros_e_multa = excluded.juros_e_multa,
      desconto_aplicado = excluded.desconto_aplicado,
      desconto_fixo = excluded.desconto_fixo,
      desconto_condicional = excluded.desconto_condicional,
      valor_liquido = excluded.valor_liquido,
      plano_conta_id = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.plano_conta_id
        else excluded.plano_conta_id
      end,
      centro_custo_id = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.centro_custo_id
        else excluded.centro_custo_id
      end,
      excluido_da_receita = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.excluido_da_receita
        else excluded.excluido_da_receita
      end,
      motivo_exclusao = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.motivo_exclusao
        else excluded.motivo_exclusao
      end,
      classificacao_status = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.classificacao_status
        else excluded.classificacao_status
      end,
      classificacao_origem = case
        when contas_receber.classificacao_origem = 'manual' then 'manual'
        else excluded.classificacao_origem
      end,
      classificado_por = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.classificado_por
        else excluded.classificado_por
      end,
      classificado_em = case
        when contas_receber.classificacao_origem = 'manual' then contas_receber.classificado_em
        else excluded.classificado_em
      end,
      row_source_hash = excluded.row_source_hash,
      manifest_hash = excluded.manifest_hash,
      source_updated_at = excluded.source_updated_at,
      source_synced_at = excluded.source_synced_at,
      imported_at = now(),
      updated_at = now();

    v_total := v_total + 1;
  end loop;

  insert into public.contas_receber_sync_execucoes (
    competencia, manifest_hash, modo, total_itens, manifesto, ator
  ) values (
    p_competencia, p_manifest_hash, 'apply', v_total, p_manifesto, p_ator
  )
  on conflict (competencia, manifest_hash) do nothing;

  return jsonb_build_object(
    'success', true,
    'competencia', p_competencia,
    'manifest_hash', p_manifest_hash,
    'total', v_total,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'classificacoes_manuais_preservadas', v_manuais_preservados
  );
end;
$$;

revoke all on function public.contas_receber_sync_aplicar(date, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_sync_aplicar(date, text, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.contas_receber_classificar(
  p_conta_receber_id uuid,
  p_plano_conta_id uuid default null,
  p_excluido_da_receita boolean default false,
  p_motivo_exclusao text default null,
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
  v_conta public.contas_receber%rowtype;
  v_centro_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_numero_hash text;
  v_last4 text;
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
    if v_ator_ref is null then
      raise exception 'usuario autenticado sem auth.uid().' using errcode = '42501';
    end if;
    if not public.contas_receber_pode_operar() then
      raise exception 'acesso financeiro nao autorizado.' using errcode = '42501';
    end if;
  elsif v_role in ('service_role', 'postgres') then
    v_ator_tipo := 'sistema';
    v_ator_ref := coalesce(nullif(p_ator->>'ref', ''), 'service_role');
  else
    raise exception 'papel nao autorizado para classificar contas a receber.' using errcode = '42501';
  end if;

  select * into v_conta
    from public.contas_receber
   where id = p_conta_receber_id
   for update;
  if not found then
    raise exception 'conta a receber nao encontrada.';
  end if;
  v_before := to_jsonb(v_conta);

  if p_excluido_da_receita then
    if nullif(trim(p_motivo_exclusao), '') is null then
      raise exception 'informe o motivo da exclusao da receita.';
    end if;
    p_plano_conta_id := null;
  else
    if p_plano_conta_id is null then
      raise exception 'plano_conta_id obrigatorio para confirmar a classificacao.';
    end if;
    perform 1
      from public.plano_contas
     where id = p_plano_conta_id
       and nivel = 3
       and natureza = 'entrada'
       and ativo = true;
    if not found then
      raise exception 'plano deve ser uma folha de entrada ativa.';
    end if;
  end if;

  select id into v_centro_id
    from public.centros_custo
   where lower(codigo) = v_conta.unidade
     and ativo = true
   limit 1;
  if v_centro_id is null then
    raise exception 'centro de custo ativo nao encontrado para a unidade %.', v_conta.unidade;
  end if;

  update public.contas_receber
     set plano_conta_id = p_plano_conta_id,
         centro_custo_id = v_centro_id,
         excluido_da_receita = p_excluido_da_receita,
         motivo_exclusao = case when p_excluido_da_receita then trim(p_motivo_exclusao) else null end,
         classificacao_status = case when p_excluido_da_receita then 'excluida' else 'confirmada' end,
         classificacao_origem = 'manual',
         classificado_por = v_ator_ref,
         classificado_em = now(),
         updated_at = now()
   where id = p_conta_receber_id
   returning * into v_conta;
  v_after := to_jsonb(v_conta);

  v_numero_hash := encode(extensions.digest(coalesce(v_ator_ref, v_ator_tipo), 'sha256'), 'hex');
  v_last4 := right(regexp_replace(coalesce(v_ator_ref, ''), '\D', '', 'g'), 4);
  if v_last4 = '' then v_last4 := 'n/a'; end if;

  insert into public.maria_audit_log (
    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4,
    papel, origem, canal, invoker_role, tabela, entidade_tipo,
    entidade_id, operacao, antes, depois, motivo, texto_original
  ) values (
    case when v_ator_tipo = 'web' then 'Super Folha Web' else 'Sistema' end,
    v_ator_ref, v_numero_hash, v_last4, v_ator_tipo, 'contas_receber',
    v_ator_tipo, v_role, 'contas_receber', 'classificacao_receita',
    p_conta_receber_id, 'CLASSIFICAR_RECEITA', v_before, v_after,
    p_motivo_exclusao, null
  ) returning id into v_audit_id;

  return jsonb_build_object('success', true, 'conta', v_after, 'audit_id', v_audit_id);
end;
$$;

revoke all on function public.contas_receber_classificar(uuid, uuid, boolean, text, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.contas_receber_classificar(uuid, uuid, boolean, text, jsonb)
  to authenticated, service_role;
