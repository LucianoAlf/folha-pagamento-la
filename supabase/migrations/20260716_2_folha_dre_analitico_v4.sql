-- DRE analitico v4.2.
-- O snapshot separa classificacao gerencial da obrigacao agregada criada em
-- contas_pagar e congela as premissas usadas em cada competencia.

create or replace function public.folha_normaliza_texto(p_valor text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(p_valor, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create table public.folha_regra_plano_conta (
  id uuid primary key default gen_random_uuid(),
  ruleset_version integer not null check (ruleset_version > 0),
  categoria text,
  tipo text,
  componente text not null check (
    componente in ('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos')
  ),
  operador text not null check (operador in ('exato', 'ilike')),
  funcao_padrao text,
  prioridade integer not null,
  plano_conta_id uuid references public.plano_contas(id),
  tratamento text not null check (tratamento in ('automatico', 'excluido', 'liquidacao', 'pendente')),
  escopo_dre text not null check (escopo_dre in ('operacional', 'fora_operacional', 'nenhum')),
  motivo text not null,
  vigencia_inicio date not null default date '2000-01-01',
  vigencia_fim date,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index folha_regra_plano_conta_ruleset_idx
  on public.folha_regra_plano_conta (ruleset_version, componente, ativo, prioridade desc);

comment on table public.folha_regra_plano_conta is
  'Rulesets versionadas para classificar componentes da folha no snapshot analitico.';

do $$
declare
  v_faltantes text;
begin
  select string_agg(c.codigo, ', ' order by c.codigo)
    into v_faltantes
    from (
      values
        ('4.3.1'), ('4.4.3'), ('4.5.4'), ('4.6.1'), ('4.6.3'),
        ('5.3.1'), ('5.3.3'), ('5.3.4'), ('5.3.13'), ('5.3.14'),
        ('5.3.15'), ('5.3.16'), ('5.3.17'), ('7.2.8')
    ) as c(codigo)
    left join public.plano_contas p
      on p.codigo = c.codigo
     and p.ativo = true
     and p.nivel = 3
     and p.natureza = 'saida'
   where p.id is null;

  if v_faltantes is not null then
    raise exception 'planos obrigatorios ausentes ou invalidos: %', v_faltantes;
  end if;
end;
$$;

with regras (
  ruleset_version, categoria, tipo, componente, operador, funcao_padrao,
  prioridade, plano_codigo, tratamento, escopo_dre, motivo, observacao
) as (
  values
    (1, null, 'pensao', 'salario', 'exato', null, 1000, null, 'excluido', 'nenhum',
      'pensao repassada pela folha; nao e despesa de pessoal', 'Sinal positivo preservado porque a origem e salario'),
    (1, 'professores', 'clt', 'salario', 'exato', null, 900, '5.3.14', 'automatico', 'operacional',
      'salario de professor CLT', null),
    (1, 'professores', 'estagiario', 'salario', 'exato', null, 900, '5.3.14', 'automatico', 'operacional',
      'salario de professor estagiario', null),
    (1, 'professores', 'pj', 'salario', 'exato', null, 900, '5.3.15', 'automatico', 'operacional',
      'salario de professor horista PJ', null),
    (1, null, null, 'salario', 'ilike', '%assistente pedagogico%professor%', 850, '5.3.15', 'automatico', 'operacional',
      'cargo hibrido assistente pedagogico e professor', null),
    (1, null, null, 'salario', 'ilike', '%assistente de projetos%professor%', 850, '5.3.15', 'automatico', 'operacional',
      'cargo hibrido assistente de projetos e professor', null),
    (1, null, null, 'salario', 'ilike', '%producao musical bandas%professor%', 850, '5.3.15', 'automatico', 'operacional',
      'cargo hibrido producao musical e professor', null),
    (1, null, null, 'salario', 'exato', 'gerente barra - lider comercial geral', 840, '5.3.1', 'automatico', 'operacional',
      'gerencia de unidade e lideranca comercial geral', null),
    (1, null, 'pj', 'salario', 'ilike', '%professor%', 800, '5.3.15', 'automatico', 'operacional',
      'professor PJ fora da categoria principal', null),
    (1, null, 'pj', 'salario', 'exato', 'profesor', 805, '5.3.15', 'automatico', 'operacional',
      'professor PJ com grafia historica profesor', null),
    (1, null, 'clt', 'salario', 'ilike', '%professor%', 800, '5.3.14', 'automatico', 'operacional',
      'professor CLT fora da categoria principal', null),
    (1, null, 'estagiario', 'salario', 'ilike', '%professor%', 800, '5.3.14', 'automatico', 'operacional',
      'professor estagiario fora da categoria principal', null),
    (1, null, null, 'salario', 'exato', 'atendente bistro', 800, '5.3.17', 'automatico', 'operacional',
      'salario de atendente Bistro', null),
    (1, null, null, 'salario', 'ilike', '%administrativo%', 700, '5.3.1', 'automatico', 'operacional',
      'salario administrativo', 'Abrange assistente, auxiliar e abreviacoes administrativas'),
    (1, null, null, 'salario', 'exato', 'gerente', 700, '5.3.1', 'automatico', 'operacional',
      'salario de gerente', null),
    (1, null, null, 'salario', 'exato', 'servicos gerais', 700, '5.3.1', 'automatico', 'operacional',
      'salario de servicos gerais', null),
    (1, null, null, 'salario', 'exato', 'manutencao', 700, '5.3.1', 'automatico', 'operacional',
      'salario de manutencao', null),
    (1, null, null, 'salario', 'exato', 'financeiro', 700, '5.3.1', 'automatico', 'operacional',
      'salario do financeiro', null),
    (1, null, null, 'salario', 'exato', 'rh/dp', 700, '5.3.1', 'automatico', 'operacional',
      'salario de RH e DP', null),
    (1, null, null, 'salario', 'exato', 'sucesso do cliente', 700, '5.3.1', 'automatico', 'operacional',
      'salario de sucesso do cliente', null),
    (1, null, null, 'salario', 'ilike', 'coordenacao%', 700, '5.3.1', 'automatico', 'operacional',
      'salario de coordenacao LAMK ou LAMS', null),
    (1, null, null, 'salario', 'exato', 'comercial', 700, '5.3.16', 'automatico', 'operacional',
      'salario comercial', null),
    (1, null, null, 'salario', 'exato', 'lider marketing', 700, '5.3.16', 'automatico', 'operacional',
      'salario de lider de marketing', null),
    (1, null, null, 'salario', 'exato', 'video maker', 700, '5.3.16', 'automatico', 'operacional',
      'salario de video maker', null),
    (1, null, 'estagiario', 'salario', 'exato', null, 750, '5.3.4', 'automatico', 'operacional',
      'bolsa de estagio nao docente', null),

    (1, null, null, 'bonus', 'exato', null, 10, '5.3.3', 'automatico', 'operacional',
      'bonus da folha', null),
    (1, null, null, 'passagem', 'exato', null, 10, '4.4.3', 'automatico', 'operacional',
      'auxilio transporte e combustivel', null),

    (1, null, null, 'comissao', 'exato', 'atendente bistro', 1000, '4.6.3', 'automatico', 'operacional',
      'comissao Bistro', 'Regra preventiva para Lucia; prioridade acima do fallback'),
    (1, 'professores', null, 'comissao', 'exato', null, 900, '4.3.1', 'automatico', 'operacional',
      'comissao de professor por aula', null),
    (1, null, null, 'comissao', 'ilike', '%comercial%', 800, '4.5.4', 'automatico', 'operacional',
      'comissao de vendas comercial', null),
    (1, null, null, 'comissao', 'exato', 'lider marketing', 800, '4.5.4', 'automatico', 'operacional',
      'comissao de vendas da lideranca de marketing', null),
    (1, null, null, 'comissao', 'exato', null, 10, '5.3.3', 'automatico', 'operacional',
      'comissao de staff nao comercial tratada como bonus', null),

    (1, null, null, 'reembolso', 'exato', null, 10, '7.2.8', 'automatico', 'fora_operacional',
      'reembolso rastreado fora do subtotal operacional', null),
    (1, null, null, 'inss', 'exato', null, 10, null, 'excluido', 'nenhum',
      'retencao de INSS do empregado', null)
)
insert into public.folha_regra_plano_conta (
  ruleset_version, categoria, tipo, componente, operador, funcao_padrao,
  prioridade, plano_conta_id, tratamento, escopo_dre, motivo,
  vigencia_inicio, ativo, observacao
)
select
  r.ruleset_version,
  r.categoria,
  r.tipo,
  r.componente,
  r.operador,
  r.funcao_padrao,
  r.prioridade,
  p.id,
  r.tratamento,
  r.escopo_dre,
  r.motivo,
  date '2000-01-01',
  true,
  r.observacao
from regras r
left join public.plano_contas p on p.codigo = r.plano_codigo;

create table public.folha_classificacao_dre (
  folha_id integer not null references public.folhas_mensais(id),
  lancamento_folha_id integer not null references public.lancamentos_folha(id),
  sequencia integer not null default 1 check (sequencia > 0),
  colaborador_id integer not null references public.colaboradores(id),
  competencia date not null,
  categoria_usada text not null,
  tipo_usado text not null,
  funcao_usada text not null,
  unidade_usada text not null,
  conta_pagadora_id_usada uuid references public.financeiro_contas_bancarias(id),
  componente text not null check (
    componente in ('salario', 'bonus', 'comissao', 'passagem', 'reembolso', 'inss', 'descontos')
  ),
  tipo_efeito text not null check (tipo_efeito in ('provento', 'deducao', 'liquidacao', 'excluido')),
  valor_original numeric not null,
  valor_assinado numeric not null,
  plano_conta_id uuid references public.plano_contas(id),
  plano_codigo_usado text,
  plano_nome_usado text,
  tratamento text not null check (tratamento in ('automatico', 'excluido', 'liquidacao', 'pendente')),
  escopo_dre text not null check (escopo_dre in ('operacional', 'fora_operacional', 'nenhum')),
  regra_id uuid references public.folha_regra_plano_conta(id),
  ruleset_version integer not null,
  motivo text not null,
  bistro_competencia_id uuid references public.bistro_competencias(id),
  bistro_ref_ym text not null check (bistro_ref_ym ~ '^\d{4}-\d{2}$'),
  classificado_em timestamptz not null default now(),
  classificado_por text not null,
  hash_origem text not null,
  primary key (folha_id, lancamento_folha_id, componente, sequencia)
);

create index folha_classificacao_dre_folha_plano_idx
  on public.folha_classificacao_dre (folha_id, plano_conta_id, escopo_dre);
create index folha_classificacao_dre_colaborador_idx
  on public.folha_classificacao_dre (folha_id, colaborador_id);
create index folha_classificacao_dre_hash_idx
  on public.folha_classificacao_dre (folha_id, ruleset_version, hash_origem);

comment on table public.folha_classificacao_dre is
  'Snapshot contabil por componente/fatia; nao consulta o cadastro atual para reinterpretar historico.';

alter table public.folha_regra_plano_conta enable row level security;
alter table public.folha_classificacao_dre enable row level security;

create policy folha_regra_plano_conta_authenticated_select
  on public.folha_regra_plano_conta for select to authenticated using (true);
create policy folha_classificacao_dre_authenticated_select
  on public.folha_classificacao_dre for select to authenticated using (true);

revoke all on public.folha_regra_plano_conta from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.folha_regra_plano_conta to authenticated, service_role;

revoke all on public.folha_classificacao_dre from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.folha_classificacao_dre to authenticated, service_role;

revoke all on function public.folha_normaliza_texto(text)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.folha_normaliza_texto(text)
  to authenticated, service_role;

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
  v_hash_payload text;
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
      select jsonb_agg(jsonb_build_object(
        'id', bc.id,
        'colaborador_id', bc.colaborador_id,
        'valor', bc.valor
      ) order by bc.id)
      from public.bistro_consumos bc
      where bc.competencia_id = v_bistro_competencia_id
    ), '[]'::jsonb)
  )::text
    into v_hash_payload;

  v_hash_origem := encode(extensions.digest(v_hash_payload, 'sha256'), 'hex');

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
    select bc.colaborador_id, round(sum(bc.valor), 2) as bistro_total
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
        round(sum(bc.valor), 2) as valor
      from public.bistro_consumos bc
      join public.colaboradores c on c.id = bc.colaborador_id
      where bc.competencia_id = v_bistro_competencia_id
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

create or replace view public.vw_folha_dre_analitico
with (security_invoker = true)
as
select
  s.*,
  case when s.escopo_dre = 'operacional' then s.valor_assinado else 0::numeric end
    as valor_dre_operacional,
  case when s.escopo_dre = 'fora_operacional' then s.valor_assinado else 0::numeric end
    as valor_dre_fora_operacional,
  case when s.tipo_efeito = 'liquidacao' then s.valor_original else 0::numeric end
    as valor_liquidacao,
  case when s.tipo_efeito = 'excluido' then s.valor_original else 0::numeric end
    as valor_excluido
from public.folha_classificacao_dre s;

comment on view public.vw_folha_dre_analitico is
  'Snapshot analitico da folha. A unidade representa a conta pagadora (visao de caixa), nao a lotacao gerencial.';

revoke all on function public.folha_classificar_dre(integer, boolean)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.folha_classificar_dre(integer, boolean)
  to authenticated, service_role;

revoke all on public.vw_folha_dre_analitico
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant select on public.vw_folha_dre_analitico to authenticated, service_role;

comment on function public.folha_classificar_dre(integer, boolean) is
  'Classifica a folha em snapshot DRE versionado; backfill de folha fechada e exclusivo de service_role/postgres.';

-- Mantem integralmente o fechamento financeiro vigente e encaixa o snapshot
-- antes de a folha se tornar imutavel. A analise e secundaria e best-effort.
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
  v_classificacao_dre jsonb;
  v_classificacao_erro text;
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
      null,
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

  begin
    v_classificacao_dre := public.folha_classificar_dre(p_folha_id, false);
  exception when others then
    get stacked diagnostics v_classificacao_erro = message_text;
    raise warning 'folha_fechar: classificacao DRE falhou sem bloquear o fechamento da folha %: %',
      p_folha_id, v_classificacao_erro;
  end;

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
      'contas_geradas', v_contas_geradas,
      'classificacao_dre', v_classificacao_dre,
      'classificacao_dre_erro', v_classificacao_erro
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
    'classificacao_dre', v_classificacao_dre,
    'classificacao_dre_erro', v_classificacao_erro,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.folha_fechar(integer, jsonb)
  from public, anon, authenticated, maria_operacional, maria_leitura;
grant execute on function public.folha_fechar(integer, jsonb)
  to authenticated, service_role;

comment on function public.folha_fechar(integer, jsonb) is
  'Fecha uma folha aprovada e rateada, gera obrigacoes no dia 10 e tenta congelar o snapshot DRE sem bloquear a operacao financeira.';
