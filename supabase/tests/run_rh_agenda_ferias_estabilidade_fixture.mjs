import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../migrations/20260805_4_rh_agenda_ferias_estabilidade.sql', import.meta.url);
const fixtureUrl = new URL('./rh_agenda_ferias_estabilidade_fixture.sql', import.meta.url);
const migrationPath = fileURLToPath(migrationUrl);
const fixturePath = fileURLToPath(fixtureUrl);
const database = 'rh_agenda_ferias_fixture';
const container = `rh-agenda-ferias-${process.pid}-${randomUUID().slice(0, 8)}`;
const image = 'postgres:17.10-alpine';

const setupSql = String.raw`
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.rh_processos (id uuid primary key);
create table public.rh_processo_etapas (
  id uuid primary key,
  processo_id uuid not null references public.rh_processos(id) on delete cascade
);
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  vinculo_tipo text,
  vinculo_id uuid
);

create table public.colaboradores (
  id integer primary key,
  nome text not null,
  nome_completo text,
  foto_url text,
  funcao text,
  departamento text,
  data_admissao date,
  status text,
  salario_base numeric,
  tipo text
);
create table public.ferias_periodos_aquisitivos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer not null references public.colaboradores(id),
  status text,
  dias_saldo numeric,
  esta_vencido boolean,
  concessivo_fim date
);
create table public.ferias_programacoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer not null references public.colaboradores(id),
  status text,
  data_inicio date
);

insert into public.rh_processos(id) values ('00000000-0000-0000-0000-000000000011');
insert into public.rh_processo_etapas(id, processo_id)
values ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000011');
insert into public.tarefas(titulo, vinculo_tipo, vinculo_id) values
  ('VALIDA: processo', 'rh_processo', '00000000-0000-0000-0000-000000000011'),
  ('VALIDA: etapa', 'rh_etapa', '00000000-0000-0000-0000-000000000012'),
  ('ORFA: processo', 'rh_processo', '00000000-0000-0000-0000-000000000091'),
  ('ORFA: etapa', 'rh_etapa', '00000000-0000-0000-0000-000000000092'),
  ('GENERICA: preservar', 'outro_tipo', '00000000-0000-0000-0000-000000000091');

insert into public.colaboradores values
  (1, 'Pessoa vencida', null, null, 'RH', 'Staff', current_date - 1000, 'active', 1000, 'clt'),
  (2, 'Pessoa proxima', null, null, 'RH', 'Staff', current_date - 500, 'active', 1000, 'clt');
insert into public.ferias_periodos_aquisitivos(colaborador_id,status,dias_saldo,esta_vencido,concessivo_fim) values
  (1, 'vencido', 0, true, current_date - 30),
  (1, 'vencido', 0, true, current_date - 10),
  (1, 'ativo', 30, false, current_date + 90),
  (2, 'ativo', 30, false, current_date + 15);
insert into public.ferias_programacoes(colaborador_id,status,data_inicio) values
  (1, 'programado', current_date + 5),
  (1, 'aprovado', current_date + 15),
  (1, 'programado', current_date + 25);
`;

function docker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000, ...options,
  });
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error([label, result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result;
}

function psql(sql, label) {
  return requireSuccess(docker([
    'exec', '-i', container, 'psql', '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
  ], { input: sql }), label);
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const finalServer = docker([
      'exec', container, 'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres',
    ]);
    const ready = docker(['exec', container, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (finalServer.status === 0 && ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL 17 nao ficou pronto em 30 segundos.');
}

assert.ok(existsSync(migrationPath), `migration ausente: ${migrationPath}`);
assert.ok(existsSync(fixturePath), `fixture ausente: ${fixturePath}`);
requireSuccess(docker(['info', '--format', '{{.ServerVersion}}']), 'Docker daemon indisponivel');

let started = false;
try {
  requireSuccess(docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=fixture-only', '--env', `POSTGRES_DB=${database}`, image,
  ]), 'Falha ao criar PostgreSQL efemero');
  started = true;
  await waitForPostgres();
  psql(setupSql, 'Falha ao provisionar schema minimo');
  psql(readFileSync(migrationUrl, 'utf8'), 'Falha ao aplicar migration real');
  const result = psql(readFileSync(fixtureUrl, 'utf8'), 'Fixture comportamental falhou');
  assert.match(result.stdout, /RH_AGENDA_FERIAS_FIXTURE_OK/);
  process.stdout.write('[rh-agenda-ferias-fixture] PostgreSQL 17\n');
  process.stdout.write(result.stdout);
} finally {
  if (started) docker(['rm', '--force', container]);
}
