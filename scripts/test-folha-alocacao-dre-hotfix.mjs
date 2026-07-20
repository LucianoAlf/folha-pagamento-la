import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipHotfix = process.argv.includes('--skip-hotfix');
const container = `folha-rateio-precision-${process.pid}`;

const files = {
  setup: join(root, 'supabase/tests/hotfix/folha_alocacao_dre_hotfix_setup.sql'),
  base: join(root, 'supabase/migrations/20260719_2_folha_alocacao_dre.sql'),
  privileges: join(root, 'supabase/migrations/20260719_3_folha_alocacao_dre_privilegios_internos.sql'),
  hotfix: join(root, 'supabase/migrations/20260720_1_folha_alocacao_dre_precisao_numerica.sql'),
  test: join(root, 'supabase/tests/hotfix/folha_alocacao_dre_numeric_precision.test.sql'),
};

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`docker ${args.join(' ')} failed\n${detail}`);
  }
  return result.stdout.trim();
}

function runSql(label, sql, extraArgs = []) {
  try {
    return docker(
      ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extraArgs],
      { input: sql }
    );
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

function readSql(path) {
  return readFileSync(path, 'utf8');
}

const aclSnapshotSql = `
select p.oid::text || '|' || p.proname || '|' || coalesce(p.proacl::text, '<null>')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'folha_alocacao_dre_allocation_hash',
     'folha_alocacao_dre_gravar',
     'folha_alocacao_dre_resolver'
   )
 order by p.proname;
`;

try {
  docker([
    'run', '--rm', '--detach', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:15-alpine',
  ]);

  let ready = false;
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf8',
    });
    if (probe.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks === 3) {
        ready = true;
        break;
      }
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, 'PostgreSQL descartável não ficou pronto');

  runSql('setup', readSql(files.setup));
  runSql('migration 2B-A', readSql(files.base));
  runSql('hardening 2B-A', readSql(files.privileges));

  const aclBefore = runSql('ACL snapshot before', aclSnapshotSql, ['-A', '-t']);

  if (!skipHotfix) {
    runSql('hotfix migration', readSql(files.hotfix));
  }

  const aclAfter = runSql('ACL snapshot after', aclSnapshotSql, ['-A', '-t']);
  assert.equal(aclAfter, aclBefore, 'CREATE OR REPLACE alterou OIDs ou ACLs das funções');

  runSql('behavioral PostgreSQL test', readSql(files.test));
  console.log(`PASS: PostgreSQL real (${skipHotfix ? 'baseline sem hotfix' : 'hotfix aplicada'})`);
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' });
}
