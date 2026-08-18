import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixturePath = fileURLToPath(new URL('./contas_pagar_ajuste_pago_fixture.sql', import.meta.url));
const migrationPath = fileURLToPath(new URL('../migrations/20260818180544_contas_pagar_ajuste_pago_admin.sql', import.meta.url));
const database = 'contas_pagar_ajuste_fixture';
const container = `contas-pagar-ajuste-${process.pid}-${randomUUID().slice(0, 8)}`;
const image = 'postgres:17.10-alpine';

const setupSql = `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role maria_operacional nologin;
create role maria_leitura nologin;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create table public.user_profiles (id uuid primary key, nome text, role text not null);
insert into public.user_profiles values ('00000000-0000-0000-0000-00000000a001', 'Rose', 'admin');
create function public.financeiro_cartoes_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
$$;
create table public.centros_custo (id uuid primary key, codigo text not null, ativo boolean not null);
create table public.financeiro_empresas (id uuid primary key, unidade_id uuid not null references public.centros_custo(id), ativo boolean not null);
create table public.financeiro_contas_bancarias (id uuid primary key, empresa_id uuid not null references public.financeiro_empresas(id), ativo boolean not null);
create table public.plano_contas (id uuid primary key, ativo boolean not null);
create table public.contas_pagar (
  id uuid primary key, descricao text not null, unidade text, valor numeric not null,
  data_lancamento date, data_vencimento date, competencia date not null, status text not null,
  data_pagamento timestamptz, metodo_pagamento text, tipo_lancamento text, plano_conta_id uuid,
  centro_custo_id uuid, empresa_id uuid, conta_pagadora_id uuid, observacoes text,
  updated_at timestamptz not null default now()
);
create table public.maria_audit_log (
  id uuid primary key default extensions.gen_random_uuid(), created_at timestamptz not null default now(),
  ator_nome text not null, ator_numero text not null, ator_numero_hash text not null, ator_numero_last4 text not null,
  papel text not null, origem text not null, canal text, invoker_role text, tabela text not null,
  entidade_tipo text not null, entidade_id uuid, operacao text not null, antes jsonb, depois jsonb,
  motivo text, texto_original text
);
`;

function run(command, args, input) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  run('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=fixture', '-e', `POSTGRES_DB=${database}`, image]);
  const readyDeadline = Date.now() + 30_000;
  let ready = false;
  let consecutiveReadyProbes = 0;
  while (Date.now() < readyDeadline) {
    const probe = spawnSync('docker', ['exec', container, 'psql', '-At', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) {
      consecutiveReadyProbes += 1;
      if (consecutiveReadyProbes >= 2) {
        ready = true;
        break;
      }
    } else {
      consecutiveReadyProbes = 0;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  assert.equal(ready, true, 'PostgreSQL 17 nao ficou pronto dentro de 30s.');
  const databaseExists = run('docker', ['exec', '-i', container, 'psql', '-At', '-U', 'postgres', '-d', 'postgres'], `select 1 from pg_database where datname = '${database}';`).trim();
  if (databaseExists !== '1') {
    run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], `create database ${database};`);
  }
  run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], setupSql);
  run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], readFileSync(migrationPath, 'utf8'));
  const fixtureSql = `set app.contas_pagar_ajuste_fixture_guard = 'local_ci_only';\n${readFileSync(fixturePath, 'utf8')}`;
  run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], fixtureSql);
  const sentinel = run('docker', ['exec', '-i', container, 'psql', '-At', '-U', 'postgres', '-d', database], "select count(*) from public.contas_pagar where id::text like '%a020' or id::text like '%a021';").trim();
  assert.equal(sentinel, '0');
  console.log('PASS: PostgreSQL 17');
  console.log('rollback_sentinel_rows=0');
} finally {
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', windowsHide: true });
}
