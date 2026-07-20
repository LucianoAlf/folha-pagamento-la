import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('./dre_filtro_unidade_fixture.sql', import.meta.url);
const migrationUrl = new URL('../migrations/20260720_2_dre_filtro_unidade.sql', import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const migrationPath = fileURLToPath(migrationUrl);
const database = 'dre_filtro_unidade_fixture';
const container = `dre-filtro-unidade-${process.pid}-${randomUUID().slice(0, 8)}`;

const setupSql = String.raw`
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role maria_operacional nologin;
create role maria_leitura nologin;

create table public.folhas_mensais (
  id integer primary key,
  ano integer not null,
  mes integer not null,
  status text not null
);

create table public.colaboradores (
  id integer primary key,
  nome text,
  nome_completo text
);

create table public.plano_contas (
  id uuid primary key,
  codigo text not null,
  nome text not null,
  nome_completo text
);

create table public.centros_custo (
  id uuid primary key,
  codigo text,
  nome text not null
);

create table public.financeiro_empresas (
  id uuid primary key,
  razao_social text not null,
  nome_fantasia text,
  label_operacional text
);

create table public.financeiro_contas_bancarias (
  id uuid primary key,
  empresa_id uuid not null references public.financeiro_empresas(id),
  conta text
);

create table public.contas_pagar (
  id uuid primary key,
  competencia date not null,
  data_pagamento timestamptz,
  conta_pagadora_id uuid,
  descricao text not null,
  fonte_tipo text,
  fonte_identificador text,
  valor numeric not null,
  status text not null,
  plano_conta_id uuid,
  centro_custo_id uuid,
  unidade text,
  updated_at timestamptz
);

create table public.financeiro_cartoes (
  id uuid primary key,
  conta_pagadora_id uuid,
  apelido text not null
);

create table public.financeiro_cartao_faturas (
  id uuid primary key,
  cartao_id uuid not null,
  competencia date not null,
  status text not null,
  conta_pagar_id uuid
);

create table public.financeiro_cartao_transacoes (
  id uuid primary key,
  fatura_id uuid not null,
  cartao_id uuid not null,
  descricao text not null,
  estabelecimento text,
  valor numeric not null,
  plano_conta_id uuid,
  centro_custo_id uuid,
  classificacao_status text
);

create table public.contas_receber (
  id uuid primary key,
  competencia date not null,
  data_recebimento date,
  descricao text not null,
  aluno_nome text,
  emusys_fatura_id bigint not null,
  valor_pago numeric,
  valor_liquido numeric not null,
  status text not null,
  excluido_da_receita boolean not null default false,
  classificacao_status text,
  cadastro_match_status text,
  plano_conta_id uuid,
  centro_custo_id uuid,
  unidade text
);

create table public.folha_classificacao_dre (
  folha_id integer not null,
  lancamento_folha_id integer not null,
  componente text not null,
  sequencia integer not null,
  conta_pagadora_id_usada uuid,
  primary key (folha_id, lancamento_folha_id, componente, sequencia)
);

-- Dependency seam only: the migration under test consumes the already-existing
-- allocation resolver. Its rows are fixture-controlled, while all three DRE
-- functions are loaded verbatim from the production migration.
create table public.fixture_folha_alocacao_dre_resolvida (
  folha_id integer not null,
  lancamento_folha_id integer not null,
  sequencia integer not null,
  colaborador_id integer not null,
  competencia date not null,
  categoria_usada text not null,
  tipo_usado text not null,
  funcao_usada text not null,
  componente text not null,
  tipo_efeito text not null,
  valor_original numeric not null,
  valor_assinado_original numeric not null,
  valor_assinado_rateado numeric not null,
  plano_conta_id uuid,
  plano_codigo_usado text,
  plano_nome_usado text,
  tratamento text not null,
  escopo_dre text not null,
  regra_id uuid,
  ruleset_version integer not null,
  motivo text not null,
  bistro_competencia_id uuid,
  bistro_ref_ym text not null,
  hash_origem text not null,
  unidade_dre text,
  percentual_aplicado numeric,
  confirmacao_id uuid,
  source_hash text,
  allocation_hash text,
  estado_alocacao text not null
);

create function public.folha_alocacao_dre_resolver(
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
  select f.*
  from public.fixture_folha_alocacao_dre_resolvida f
  where f.folha_id = p_folha_id
    and (p_colaborador_id is null or f.colaborador_id = p_colaborador_id)
  order by
    f.colaborador_id,
    f.lancamento_folha_id,
    f.componente,
    f.sequencia,
    f.unidade_dre nulls last;
$$;
`;

function runDocker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });

  if (result.error) {
    throw new Error(
      `Docker indisponivel (${result.error.message}). `
      + 'Instale/inicie o Docker para executar o fixture PostgreSQL 17.',
    );
  }

  return result;
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error([
      `${label} falhou (exit ${result.status ?? 'desconhecido'}).`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'));
  }

  return result;
}

function runPsql(sql, label, extraArgs = []) {
  return requireSuccess(runDocker([
    'exec', '-i', container,
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
    ...extraArgs,
  ], { input: sql }), label);
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    // The official image briefly exposes its bootstrap server before stopping
    // it and exec'ing the final PID 1. Require the final postgres process so a
    // successful pg_isready cannot race that intentional shutdown.
    const finalServer = runDocker([
      'exec', container,
      'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres',
    ]);
    const ready = runDocker([
      'exec', container,
      'pg_isready', '--username', 'postgres', '--dbname', database,
    ]);

    if (finalServer.status === 0 && ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('PostgreSQL 17 nao ficou pronto em 30 segundos.');
}

assert.ok(existsSync(fixturePath), `fixture PostgreSQL ausente: ${fixturePath}`);
assert.ok(existsSync(migrationPath), `migration DRE ausente: ${migrationPath}`);

const dockerInfo = runDocker(['info', '--format', '{{.ServerVersion}}']);
requireSuccess(dockerInfo, 'Docker daemon');

let containerAttempted = false;
try {
  containerAttempted = true;
  const start = runDocker([
    'run', '--detach', '--rm',
    '--name', container,
    '--env', 'POSTGRES_PASSWORD=fixture-only',
    '--env', `POSTGRES_DB=${database}`,
    '--env', 'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only',
    'postgres:17-alpine',
  ]);
  requireSuccess(start, 'criacao do PostgreSQL 17 efemero');

  await waitForPostgres();

  const versionResult = runPsql(
    'show server_version;\n',
    'leitura da versao PostgreSQL',
    ['--tuples-only', '--no-align'],
  );
  const version = versionResult.stdout.trim();
  assert.match(version, /^17\./, `esperado PostgreSQL 17, recebido ${version}`);

  runPsql(setupSql, 'provisionamento do schema minimo');
  runPsql(readFileSync(migrationUrl, 'utf8'), 'aplicacao da migration DRE real');
  const fixtureSql = readFileSync(fixtureUrl, 'utf8');
  const refusedWithoutGuard = runDocker([
    'exec', '-i', container,
    'env', 'PGOPTIONS=',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    refusedWithoutGuard.status,
    0,
    'fixture deveria recusar execucao sem app.dre_fixture_guard',
  );
  assert.match(
    `${refusedWithoutGuard.stdout}\n${refusedWithoutGuard.stderr}`,
    /REFUSED: app\.dre_fixture_guard=local_ci_only/i,
    'fixture recusou sem explicar o marcador local/CI obrigatorio',
  );

  const fixtureResult = runPsql(
    fixtureSql,
    'fixture comportamental DRE',
  );

  process.stdout.write(`[dre-fixture] PostgreSQL ${version}\n`);
  process.stdout.write(fixtureResult.stdout);
  process.stderr.write(fixtureResult.stderr);
} finally {
  if (containerAttempted) {
    const cleanup = runDocker(['rm', '--force', container]);
    if (cleanup.status !== 0 && !/No such container/i.test(cleanup.stderr ?? '')) {
      process.stderr.write(
        `[dre-fixture] aviso: cleanup do container falhou: ${cleanup.stderr}\n`,
      );
    }
  }
}
