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
const containerLabel = 'com.la-music.fixture=dre-filtro-unidade-postgres';
const postgresImage = 'postgres:17.10-alpine';

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

function assertCleanupSucceeded(result) {
  if (result.status === 0 || /No such container/i.test(result.stderr ?? '')) {
    return;
  }

  throw new Error([
    `cleanup do container falhou (exit ${result.status ?? 'desconhecido'}).`,
    result.stdout?.trim(),
    result.stderr?.trim(),
  ].filter(Boolean).join('\n'));
}

function createIdempotentContainerCleanup(runDockerFn, containerName) {
  let cleaned = false;

  return (reason) => {
    if (cleaned) return;

    const result = runDockerFn(['rm', '--force', containerName]);
    try {
      assertCleanupSucceeded(result);
      cleaned = true;
    } catch (error) {
      throw new Error(`[cleanup:${reason}] ${error.message}`, { cause: error });
    }
  };
}

assert.throws(
  () => assertCleanupSucceeded({ status: 1, stderr: 'permission denied' }),
  /cleanup do container falhou/i,
  'cleanup deve falhar fechado quando docker rm falha',
);
assert.doesNotThrow(
  () => assertCleanupSucceeded({ status: 1, stderr: 'No such container' }),
  'cleanup pode ignorar somente container ja inexistente',
);
assert.doesNotThrow(() => {
  const calls = [];
  const cleanup = createIdempotentContainerCleanup(
    (args) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
    'dre-fixture-cleanup-test',
  );
  cleanup('signal:SIGINT');
  cleanup('signal:SIGTERM');
  cleanup('finally');
  assert.deepEqual(calls, [[
    'rm', '--force', 'dre-fixture-cleanup-test',
  ]]);
}, 'cleanup por sinal/finally deve ser idempotente');

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
const cleanupContainer = createIdempotentContainerCleanup(runDocker, container);
const handleTerminationSignal = (signal) => {
  let exitCode = signal === 'SIGINT' ? 130 : 143;
  try {
    cleanupContainer(`signal:${signal}`);
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`[dre-fixture] ${error.message}\n`);
  }
  process.exit(exitCode);
};
process.once('SIGINT', () => handleTerminationSignal('SIGINT'));
process.once('SIGTERM', () => handleTerminationSignal('SIGTERM'));

try {
  containerAttempted = true;
  const start = runDocker([
    'run', '--detach', '--rm',
    '--name', container,
    '--label', containerLabel,
    '--env', 'POSTGRES_PASSWORD=fixture-only',
    '--env', `POSTGRES_DB=${database}`,
    '--env', 'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only',
    postgresImage,
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

  const nullRequiredMetric = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=null_folha_sem_alocacao_valor_origem',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    nullRequiredMetric.status,
    0,
    'fixture deveria falhar quando valor_origem obrigatorio e removido',
  );
  assert.match(
    `${nullRequiredMetric.stdout}\n${nullRequiredMetric.stderr}`,
    /cenario C competencia: folha_sem_alocacao obrigatoria ausente ou incompleta/i,
    'fixture nao explicou qual estrutura obrigatoria ficou nula',
  );

  const rotatedDreDetails = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=rotate_dre_detalhes_units',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    rotatedDreDetails.status,
    0,
    'fixture deveria falhar quando filtros de dre_detalhes sao rotacionados',
  );
  assert.match(
    `${rotatedDreDetails.stdout}\n${rotatedDreDetails.stderr}`,
    /cenario B detalhes: unidade cg recebeu rec/i,
    'fixture nao discriminou a unidade errada retornada por dre_detalhes',
  );

  const rotatedDreConsult = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=rotate_dre_consultar_units',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    rotatedDreConsult.status,
    0,
    'fixture deveria falhar quando filtros de dre_consultar sao rotacionados',
  );
  assert.match(
    `${rotatedDreConsult.stdout}\n${rotatedDreConsult.stderr}`,
    /cenario C competencia: KPI receita da unidade cg esperado 200\.11, recebido 0/i,
    'fixture nao discriminou os KPIs da unidade errada em dre_consultar',
  );

  const missingGroupFive = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=missing_group_5',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    missingGroupFive.status,
    0,
    'fixture deveria falhar quando grupo 5 obrigatorio e removido',
  );
  assert.match(
    `${missingGroupFive.stdout}\n${missingGroupFive.stderr}`,
    /cenario C competencia: grupo 5 obrigatorio ausente ou nulo no consolidado/i,
    'fixture nao explicou qual grupo obrigatorio ficou ausente',
  );

  const missingGroupFour = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=missing_group_4',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    missingGroupFour.status,
    0,
    'fixture deveria falhar quando grupo 4 obrigatorio e removido',
  );
  assert.match(
    `${missingGroupFour.stdout}\n${missingGroupFour.stderr}`,
    /cenario C competencia: grupo 4 obrigatorio ausente ou nulo no consolidado/i,
    'fixture nao detectou remocao fora do grupo 5',
  );

  const missingPlanFive = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=missing_plan_5_1_01',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    missingPlanFive.status,
    0,
    'fixture deveria falhar quando plano 5.1.01 obrigatorio e removido',
  );
  assert.match(
    `${missingPlanFive.stdout}\n${missingPlanFive.stderr}`,
    /cenario C competencia: plano 5\.1\.01 obrigatorio ausente ou nulo no consolidado/i,
    'fixture nao explicou qual plano obrigatorio ficou ausente',
  );

  const missingPlanSix = runDocker([
    'exec', '-i', container,
    'env',
    'PGOPTIONS=-c app.dre_fixture_guard=local_ci_only -c app.dre_fixture_mutation=missing_plan_6_1_01',
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureSql });
  assert.notEqual(
    missingPlanSix.status,
    0,
    'fixture deveria falhar quando plano 6.1.01 obrigatorio e removido',
  );
  assert.match(
    `${missingPlanSix.stdout}\n${missingPlanSix.stderr}`,
    /cenario C competencia: plano 6\.1\.01 obrigatorio ausente ou nulo no consolidado/i,
    'fixture nao detectou remocao fora do plano 5.1.01',
  );

  const fixtureResult = runPsql(
    fixtureSql,
    'fixture comportamental DRE',
  );
  const rollbackProof = runPsql(String.raw`
select
  (select count(*) from public.folhas_mensais where id in (910001, 910002))
  + (select count(*) from public.colaboradores where id in (930001, 930002, 930003))
  + (select count(*) from public.folha_classificacao_dre where folha_id in (910001, 910002))
  + (select count(*) from public.fixture_folha_alocacao_dre_resolvida where folha_id in (910001, 910002))
  + (select count(*) from public.contas_pagar where id::text like '00000000-0000-0000-0000-0000000004%')
  + (select count(*) from public.financeiro_cartao_transacoes where id = '00000000-0000-0000-0000-000000000502')
  + (select count(*) from public.contas_receber where id in (
      '00000000-0000-0000-0000-000000000701',
      '00000000-0000-0000-0000-000000000702'
    ));
`, 'prova pos-rollback dos IDs sentinela', ['--tuples-only', '--no-align']);
  assert.equal(
    rollbackProof.stdout.trim(),
    '0',
    `ROLLBACK deixou linhas sentinela persistidas: ${rollbackProof.stdout.trim()}`,
  );

  process.stdout.write(`[dre-fixture] PostgreSQL ${version}\n`);
  process.stdout.write('[dre-fixture] rollback_sentinel_rows=0\n');
  process.stdout.write(fixtureResult.stdout);
  process.stderr.write(fixtureResult.stderr);
} finally {
  if (containerAttempted) {
    cleanupContainer('finally');
  }
}
