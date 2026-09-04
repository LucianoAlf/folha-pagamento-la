-- Fase 4 / Fatia C: Maria sugere classificacao fiscal de transacoes de cartao.
-- Backend puro: regras editaveis + historico confirmado; nunca confirma automaticamente.

create extension if not exists pgcrypto with schema extensions;

-- A Fatia B.1 criou esta funcao no banco vivo. Versionamos aqui para ambientes limpos.
create or replace function public.maria_cartoes_normalizar_texto(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(
    regexp_replace(
      translate(
        upper(coalesce(p_texto, '')),
        U&'\00C1\00C0\00C3\00C2\00C4\00C9\00C8\00CA\00CB\00CD\00CC\00CE\00CF\00D3\00D2\00D5\00D4\00D6\00DA\00D9\00DB\00DC\00C7' || '*./_-',
        'AAAAAEEEEIIIIOOOOOUUUUC     '
      ),
      '[^A-Z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.maria_classificacao_regras (
  id uuid primary key default gen_random_uuid(),
  palavra_chave text not null,
  plano_conta_id uuid null references public.plano_contas(id),
  escopo text not null default 'cartao' check (escopo in ('cartao','geral','contas_pagar')),
  prioridade int not null default 100,
  confianca_base numeric not null default 0.90 check (confianca_base >= 0 and confianca_base <= 1),
  ativo boolean not null default true,
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists maria_classificacao_regras_chave_escopo_uidx
  on public.maria_classificacao_regras (palavra_chave, escopo);

create index if not exists maria_classificacao_regras_ativo_escopo_idx
  on public.maria_classificacao_regras (ativo, escopo, prioridade desc);

create or replace function public.maria_classificacao_regras_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.palavra_chave := public.maria_cartoes_normalizar_texto(new.palavra_chave);
  if new.palavra_chave = '' then
    raise exception 'palavra_chave obrigatoria para regra de classificacao.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_maria_classificacao_regras_before_write on public.maria_classificacao_regras;
create trigger trg_maria_classificacao_regras_before_write
  before insert or update on public.maria_classificacao_regras
  for each row execute function public.maria_classificacao_regras_before_write();

alter table public.maria_classificacao_regras enable row level security;

drop policy if exists maria_classificacao_regras_select_maria on public.maria_classificacao_regras;
create policy maria_classificacao_regras_select_maria
  on public.maria_classificacao_regras
  for select
  to maria_operacional, maria_leitura
  using (true);

revoke all on public.maria_classificacao_regras from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.maria_classificacao_regras to maria_operacional, maria_leitura;
grant all on public.maria_classificacao_regras to service_role;

do $$
declare
  v_iof uuid;
  v_openai uuid;
begin
  select id into v_iof
    from public.plano_contas
   where codigo = '4.1.6'
     and nivel = 3
     and natureza = 'saida'
     and ativo = true;

  if v_iof is null then
    raise exception 'plano 4.1.6 Taxas Bancarias nao encontrado ou invalido.';
  end if;

  select id into v_openai
    from public.plano_contas
   where codigo = '5.2.11'
     and nivel = 3
     and natureza = 'saida'
     and ativo = true;

  if v_openai is null then
    raise exception 'plano 5.2.11 Softwares e Plataformas nao encontrado ou invalido.';
  end if;

  insert into public.maria_classificacao_regras (
    palavra_chave,
    plano_conta_id,
    escopo,
    prioridade,
    confianca_base,
    ativo,
    observacao
  )
  values
    ('IOF DESPESA NO EXTERIOR', v_iof, 'cartao', 200, 0.95, true, 'Seed Maria: IOF de compra internacional em cartao.'),
    ('OPENAI', v_openai, 'cartao', 190, 0.90, true, 'Seed Maria: OpenAI/ChatGPT em cartao.'),
    ('QUATRO CANTOS', null::uuid, 'cartao', 210, 0.90, true, 'Seed Maria: regra explicita sem sugestao; humano decide.')
  on conflict (palavra_chave, escopo) do update
     set plano_conta_id = excluded.plano_conta_id,
         prioridade = excluded.prioridade,
         confianca_base = excluded.confianca_base,
         ativo = true,
         observacao = excluded.observacao,
         updated_at = now();
end $$;

create or replace function public.maria_cartoes_sugerir_classificacao(
  p_ator_numero text,
  p_papel text,
  p_canal text,
  p_cartao_id uuid,
  p_competencia date,
  p_aplicar boolean default false,
  p_limiar_confianca numeric default 0.80,
  p_texto_original text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.maria_whatsapp_atores%rowtype;
  v_ator_numero text;
  v_cartao public.financeiro_cartoes%rowtype;
  v_cartao_ator jsonb;
  v_fatura public.financeiro_cartao_faturas%rowtype;
  v_empresa_id uuid;
  v_centro_custo_id uuid;
  v_total_pendentes int := 0;
  v_sugeridas int := 0;
  v_pendentes int := 0;
  v_conflitos int := 0;
  v_linhas jsonb := '[]'::jsonb;
  v_transacao record;
  v_texto_norm text;
  v_regra record;
  v_regra_sem_sugestao boolean;
  v_historico_plano_id uuid;
  v_historico_top_count int;
  v_historico_total int;
  v_historico_second_count int;
  v_historico_conflito boolean;
  v_plano_id uuid;
  v_plano_codigo text;
  v_confianca numeric;
  v_origem text;
  v_acao text;
  v_triade_valida boolean;
  v_classificar_result jsonb;
begin
  v_actor := public.maria_assert_actor(p_ator_numero, p_papel, array[
    'owner_full',
    'finance_ops_write_safe',
    'finance_assistant_write_safe'
  ]);

  v_ator_numero := public.maria_normalizar_numero(p_ator_numero);
  v_cartao_ator := jsonb_build_object('tipo', 'maria', 'ref', v_ator_numero);

  if p_cartao_id is null then
    raise exception 'p_cartao_id obrigatorio.';
  end if;

  if p_competencia is null then
    raise exception 'p_competencia obrigatoria.';
  end if;

  if p_limiar_confianca is null or p_limiar_confianca < 0 or p_limiar_confianca > 1 then
    raise exception 'p_limiar_confianca deve estar entre 0 e 1.';
  end if;

  select * into v_cartao
    from public.financeiro_cartoes
   where id = p_cartao_id
     and ativo = true;

  if not found then
    raise exception 'cartao nao encontrado ou inativo.';
  end if;

  v_empresa_id := v_cartao.empresa_id;
  v_centro_custo_id := v_cartao.centro_custo_id;

  select * into v_fatura
    from public.financeiro_cartao_faturas f
   where f.cartao_id = p_cartao_id
     and f.competencia = date_trunc('month', p_competencia)::date;

  if not found then
    return jsonb_build_object(
      'success', true,
      'fatura_id', null,
      'total_pendentes', 0,
      'sugeridas', 0,
      'pendentes', 0,
      'conflitos', 0,
      'aplicado', coalesce(p_aplicar, false),
      'linhas', '[]'::jsonb
    );
  end if;

  for v_transacao in
    select t.id, t.descricao, t.estabelecimento
      from public.financeiro_cartao_transacoes t
     where t.fatura_id = v_fatura.id
       and t.classificacao_status = 'pendente'
     order by t.data_compra, t.created_at, t.id
  loop
    v_total_pendentes := v_total_pendentes + 1;
    v_texto_norm := public.maria_cartoes_normalizar_texto(
      coalesce(v_transacao.descricao, '') || ' ' || coalesce(v_transacao.estabelecimento, '')
    );

    v_regra_sem_sugestao := false;
    v_historico_conflito := false;
    v_plano_id := null;
    v_plano_codigo := null;
    v_confianca := null;
    v_origem := null;
    v_acao := 'pendente';
    v_triade_valida := false;
    v_historico_plano_id := null;
    v_historico_top_count := 0;
    v_historico_total := 0;
    v_historico_second_count := 0;

    select
      r.id,
      r.palavra_chave,
      r.plano_conta_id,
      r.confianca_base,
      r.prioridade,
      p.codigo as plano_codigo
      into v_regra
      from public.maria_classificacao_regras r
      left join public.plano_contas p on p.id = r.plano_conta_id
     where r.ativo = true
       and r.escopo in ('cartao','geral')
       and position(r.palavra_chave in v_texto_norm) > 0
     order by r.prioridade desc, r.confianca_base desc, r.created_at asc
     limit 1;

    if found and v_regra.plano_conta_id is null then
      v_regra_sem_sugestao := true;
    end if;

    if v_regra_sem_sugestao then
      v_acao := 'pendente';
      v_origem := 'regra_sem_sugestao';
    elsif found then
      v_plano_id := v_regra.plano_conta_id;
      v_plano_codigo := v_regra.plano_codigo;
      v_confianca := v_regra.confianca_base;
      v_origem := 'regra';
    end if;

    if v_plano_id is null and not v_regra_sem_sugestao then
      with tokens as (
        select distinct token
          from regexp_split_to_table(v_texto_norm, ' ') as token
         where length(token) >= 4
      ),
      historico_plano as (
        select ht.plano_conta_id, count(*)::int as ocorrencias
          from public.financeiro_cartao_transacoes ht
         where ht.plano_conta_id is not null
           and ht.classificacao_status = 'confirmada'
           and ht.id <> v_transacao.id
           and exists (
             select 1
               from tokens tk
              where position(tk.token in public.maria_cartoes_normalizar_texto(coalesce(ht.descricao, '') || ' ' || coalesce(ht.estabelecimento, ''))) > 0
           )
         group by ht.plano_conta_id
        union all
        select cp.plano_conta_id, count(*)::int as ocorrencias
          from public.contas_pagar cp
         where cp.plano_conta_id is not null
           and coalesce(cp.status, '') <> 'cancelado'
           and exists (
             select 1
               from tokens tk
              where position(tk.token in public.maria_cartoes_normalizar_texto(coalesce(cp.descricao, '') || ' ' || coalesce(cp.observacoes, ''))) > 0
           )
         group by cp.plano_conta_id
      ),
      historico_agg as (
        select plano_conta_id, sum(ocorrencias)::int as ocorrencias
          from historico_plano
         group by plano_conta_id
      ),
      ranked as (
        select
          plano_conta_id,
          ocorrencias,
          sum(ocorrencias) over ()::int as total,
          row_number() over (order by ocorrencias desc, plano_conta_id) as rn
        from historico_agg
      )
      select r1.plano_conta_id,
             r1.ocorrencias,
             r1.total,
             coalesce(r2.ocorrencias, 0)
        into v_historico_plano_id,
             v_historico_top_count,
             v_historico_total,
             v_historico_second_count
        from ranked r1
        left join ranked r2 on r2.rn = 2
       where r1.rn = 1;

      if v_historico_plano_id is not null then
        if v_historico_second_count > 0
           and (v_historico_second_count::numeric / greatest(v_historico_total, 1)) >= 0.35 then
          v_historico_conflito := true;
          v_acao := 'conflito';
          v_origem := 'historico_conflito';
        else
          v_plano_id := v_historico_plano_id;
          v_confianca := round(least(0.90, 0.65 + (v_historico_top_count::numeric / greatest(v_historico_total, 1)) * 0.25), 2);
          v_origem := 'historico';

          select p.codigo into v_plano_codigo
            from public.plano_contas p
           where p.id = v_plano_id;
        end if;
      else
        v_origem := coalesce(v_origem, 'sem_historico');
      end if;
    end if;

    if v_plano_id is not null and not v_historico_conflito then
      select exists (
        select 1
          from public.plano_contas p
          join public.financeiro_empresas e on e.id = v_empresa_id
         where p.id = v_plano_id
           and p.nivel = 3
           and p.natureza = 'saida'
           and p.ativo = true
           and e.ativo = true
           and e.unidade_id = v_centro_custo_id
      ) into v_triade_valida;

      if v_triade_valida and v_confianca >= p_limiar_confianca then
        v_acao := 'sugerida';
      elsif v_confianca < p_limiar_confianca then
        v_acao := 'pendente';
        v_origem := coalesce(v_origem, 'baixa_confianca');
      else
        v_acao := 'pendente';
        v_origem := coalesce(v_origem, 'triade_invalida');
      end if;
    end if;

    if p_aplicar and v_acao = 'sugerida' then
      v_classificar_result := public.financeiro_cartao_transacao_classificar(
        jsonb_build_object(
          'transacao_id', v_transacao.id,
          'classificacao_status', 'sugerida',
          'plano_conta_id', v_plano_id,
          'empresa_id', v_empresa_id,
          'centro_custo_id', v_centro_custo_id,
          'motivo', coalesce(nullif(p_motivo, ''), 'Sugestao de classificacao da Maria')
        ),
        v_cartao_ator
      );
    end if;

    if v_acao = 'sugerida' then
      v_sugeridas := v_sugeridas + 1;
    elsif v_acao = 'conflito' then
      v_conflitos := v_conflitos + 1;
    else
      v_pendentes := v_pendentes + 1;
    end if;

    v_linhas := v_linhas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'transacao_id', v_transacao.id,
      'descricao', v_transacao.descricao,
      'acao', v_acao,
      'plano_sugerido_codigo', case when v_acao = 'sugerida' then v_plano_codigo else null end,
      'confianca', case when v_acao = 'sugerida' then v_confianca else null end,
      'origem', v_origem
    )));
  end loop;

  if p_aplicar then
    perform public.maria_audit_insert(
      v_actor,
      p_ator_numero,
      p_canal,
      'financeiro_cartao_faturas',
      'cartao_fatura',
      v_fatura.id,
      'sugerir_classificacao_cartao',
      null,
      jsonb_build_object(
        'cartao_id', p_cartao_id,
        'competencia', date_trunc('month', p_competencia)::date,
        'total_pendentes', v_total_pendentes,
        'sugeridas', v_sugeridas,
        'pendentes', v_pendentes,
        'conflitos', v_conflitos,
        'aplicado', true
      ),
      p_motivo,
      p_texto_original
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'fatura_id', v_fatura.id,
    'total_pendentes', v_total_pendentes,
    'sugeridas', v_sugeridas,
    'pendentes', v_pendentes,
    'conflitos', v_conflitos,
    'aplicado', coalesce(p_aplicar, false),
    'linhas', v_linhas
  );
end;
$$;

revoke all on function public.maria_cartoes_sugerir_classificacao(
  text, text, text, uuid, date, boolean, numeric, text, text
) from public, anon, authenticated, maria_leitura;

grant execute on function public.maria_cartoes_sugerir_classificacao(
  text, text, text, uuid, date, boolean, numeric, text, text
) to maria_operacional;

comment on table public.maria_classificacao_regras is
  'Regras editaveis da Maria para sugerir plano de contas em transacoes de cartao; NULL significa sem sugestao.';

comment on function public.maria_cartoes_sugerir_classificacao(
  text, text, text, uuid, date, boolean, numeric, text, text
) is
  'Maria operational RPC: sugere classificacao fiscal de transacoes pendentes de cartao por regras e historico confirmado; nunca confirma automaticamente.';
