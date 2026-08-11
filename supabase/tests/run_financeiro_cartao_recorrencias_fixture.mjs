import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('./financeiro_cartao_recorrencias_fixture.sql', import.meta.url);
const migrationUrl = new URL('../migrations/20260810_1_financeiro_cartao_recorrencias.sql', import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const migrationPath = fileURLToPath(migrationUrl);
const database = 'financeiro_cartao_recorrencias_fixture';
const container = 'financeiro-cartao-recorrencias-' + process.pid + '-' + randomUUID().slice(0, 8);
const postgresImage = 'postgres:17.10-alpine';
const fixtureGuard = 'app.cartao_recorrencia_fixture_guard=local_ci_only';

const setupSql = [
  '\\set ON_ERROR_STOP on',
  '',
  'create schema extensions;',
  'create extension if not exists pgcrypto with schema extensions;',
  'create schema auth;',
  'create role anon nologin;',
  'create role authenticated nologin;',
  'create role service_role nologin;',
  'create role maria_operacional nologin;',
  'create role maria_leitura nologin;',
  '',
  'create function auth.uid() returns uuid language sql stable as $$',
  "  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;",
  '$$;',
  'create function auth.role() returns text language sql stable as $$',
  "  select nullif(current_setting('request.jwt.claim.role', true), '');",
  '$$;',
  '',
  'create function public.set_updated_at() returns trigger language plpgsql as $$',
  'begin',
  '  new.updated_at = now();',
  '  return new;',
  'end;',
  '$$;',
  '',
  'create table public.financeiro_empresas (',
  '  id uuid primary key,',
  '  razao_social text not null',
  ');',
  'create table public.plano_contas (',
  '  id uuid primary key,',
  '  codigo text not null,',
  '  nome text not null',
  ');',
  'create table public.centros_custo (',
  '  id uuid primary key,',
  '  codigo text not null,',
  '  nome text not null',
  ');',
  'create table public.financeiro_contas_bancarias (',
  '  id uuid primary key,',
  '  empresa_id uuid not null references public.financeiro_empresas(id),',
  '  conta text not null',
  ');',
  'create table public.financeiro_cartoes (',
  '  id uuid primary key,',
  '  apelido text not null,',
  '  ativo boolean not null default true,',
  '  dia_fechamento smallint not null,',
  '  dia_vencimento smallint not null,',
  '  empresa_id uuid references public.financeiro_empresas(id),',
  '  conta_pagadora_id uuid references public.financeiro_contas_bancarias(id),',
  '  centro_custo_id uuid references public.centros_custo(id)',
  ');',
  'create table public.contas_pagar (',
  '  id uuid primary key default gen_random_uuid(),',
  '  descricao text not null,',
  '  unidade text,',
  '  valor numeric not null,',
  '  data_lancamento date,',
  '  data_vencimento date,',
  '  competencia date not null,',
  '  status text not null,',
  '  data_pagamento timestamptz,',
  '  metodo_pagamento text,',
  '  tipo_lancamento text,',
  '  parcela_atual int,',
  '  total_parcelas int,',
  '  observacoes text,',
  '  fonte_tipo text,',
  '  plano_conta_id uuid,',
  '  centro_custo_id uuid,',
  '  empresa_id uuid,',
  '  conta_pagadora_id uuid,',
  '  updated_at timestamptz not null default now()',
  ');',
  'create table public.financeiro_cartao_faturas (',
  '  id uuid primary key default gen_random_uuid(),',
  '  cartao_id uuid not null references public.financeiro_cartoes(id),',
  '  competencia date not null,',
  '  data_fechamento date not null,',
  '  data_vencimento date not null,',
  '  valor_total numeric not null default 0,',
  "  status text not null default 'aberta',",
  '  observacoes text,',
  '  conta_pagar_id uuid references public.contas_pagar(id),',
  '  updated_at timestamptz not null default now(),',
  '  unique (cartao_id, competencia)',
  ');',
  'create table public.financeiro_cartao_transacoes (',
  '  id uuid primary key default gen_random_uuid(),',
  '  fatura_id uuid not null references public.financeiro_cartao_faturas(id),',
  '  cartao_id uuid not null references public.financeiro_cartoes(id),',
  '  data_compra date not null,',
  '  descricao text not null,',
  '  estabelecimento text,',
  '  valor numeric not null,',
  "  tipo_transacao text not null default 'compra',",
  '  empresa_id uuid references public.financeiro_empresas(id),',
  '  plano_conta_id uuid references public.plano_contas(id),',
  '  centro_custo_id uuid references public.centros_custo(id),',
  "  classificacao_status text not null default 'pendente',",
  '  id_externo text,',
  '  fonte_tipo text,',
  '  ator_tipo text,',
  '  ator_ref text,',
  '  created_by uuid,',
  '  observacoes text,',
  '  created_at timestamptz not null default now(),',
  '  unique (cartao_id, id_externo)',
  ');',
  'create table public.maria_audit_log (',
  '  id uuid primary key default gen_random_uuid(),',
  '  created_at timestamptz not null default now(),',
  '  ator_nome text not null,',
  '  ator_numero text not null,',
  '  ator_numero_hash text not null,',
  '  ator_numero_last4 text not null,',
  '  papel text not null,',
  "  origem text not null default 'whatsapp',",
  '  canal text null,',
  '  invoker_role text null,',
  '  tabela text not null,',
  '  entidade_tipo text not null,',
  '  entidade_id uuid null,',
  '  operacao text not null,',
  '  antes jsonb null,',
  '  depois jsonb null,',
  '  motivo text null,',
  '  texto_original text null',
  ');',
  '',
  'create function public.financeiro_cartoes_resolve_ator(ator jsonb)',
  'returns jsonb language plpgsql security definer set search_path = public as $$',
  'declare v_role text; v_created_by uuid; v_ator_ref text;',
  'begin',
  "  v_role := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), session_user::text);",
  "  if v_role <> 'authenticated' then raise exception 'papel nao autorizado para RPC de cartoes: %', v_role using errcode = '42501'; end if;",
  '  v_created_by := auth.uid();',
  "  v_ator_ref := coalesce(v_created_by::text, 'authenticated');",
  "  return jsonb_build_object('role', v_role, 'ator_tipo', 'web', 'ator_ref', v_ator_ref, 'created_by', v_created_by);",
  'end;',
  '$$;',
  'create function public.financeiro_cartoes_audit_insert(',
  '  p_ator jsonb, p_tabela text, p_entidade_tipo text, p_entidade_id uuid,',
  '  p_operacao text, p_antes jsonb, p_depois jsonb, p_motivo text default null',
  ') returns uuid language plpgsql security definer set search_path = public as $$',
  'declare v_id uuid; v_ator_tipo text; v_ator_ref text; v_numero_hash text; v_last4 text;',
  'begin',
  "  v_ator_tipo := coalesce(nullif(p_ator->>'ator_tipo', ''), 'sistema');",
  "  v_ator_ref := coalesce(nullif(p_ator->>'ator_ref', ''), v_ator_tipo);",
  "  v_numero_hash := encode(extensions.digest(v_ator_ref, 'sha256'), 'hex');",
  "  v_last4 := right(regexp_replace(v_ator_ref, '\\D', '', 'g'), 4);",
  "  if v_last4 = '' then v_last4 := 'n/a'; end if;",
  '  insert into public.maria_audit_log (',
  '    ator_nome, ator_numero, ator_numero_hash, ator_numero_last4, papel, origem, canal, invoker_role,',
  '    tabela, entidade_tipo, entidade_id, operacao, antes, depois, motivo, texto_original',
  '  ) values (',
  "    case v_ator_tipo when 'web' then 'Super Folha Web' when 'maria' then 'Maria' when 'openfinance' then 'Open Finance' else 'Sistema' end,",
  "    v_ator_ref, v_numero_hash, v_last4, v_ator_tipo, 'cartoes', v_ator_tipo,",
  "    coalesce(nullif(p_ator->>'role', ''), nullif(auth.role(), ''), session_user::text),",
  "    p_tabela, p_entidade_tipo, p_entidade_id, p_operacao, p_antes, p_depois, nullif(p_motivo, ''), null",
  '  )',
  '  returning id into v_id;',
  '  return v_id;',
  'end;',
  '$$;',
  '',
  'create function public.financeiro_cartao_clamp_dia(p_ano int, p_mes int, p_dia int)',
  'returns date language sql immutable as $$',
  '  select make_date(',
  '    p_ano, p_mes,',
  "    least(p_dia, extract(day from (date_trunc('month', make_date(p_ano, p_mes, 1)) + interval '1 month - 1 day'))::int)",
  '  );',
  '$$;',
  'create function public.financeiro_cartao_data_fechamento_por_competencia(p_cartao_id uuid, p_competencia date)',
  'returns date language plpgsql stable set search_path = public as $$',
  'declare v_fechamento int; v_vencimento int; v_competencia date; v_data_fechamento date;',
  'begin',
  '  select dia_fechamento, dia_vencimento into v_fechamento, v_vencimento',
  '    from public.financeiro_cartoes where id = p_cartao_id;',
  '  if not found then raise exception \'cartao % nao encontrado.\', p_cartao_id; end if;',
  '  v_competencia := date_trunc(\'month\', p_competencia)::date;',
  '  v_data_fechamento := public.financeiro_cartao_clamp_dia(',
  '    extract(year from v_competencia)::int, extract(month from v_competencia)::int, v_fechamento',
  '  );',
  '  if v_data_fechamento < public.financeiro_cartao_clamp_dia(',
  '    extract(year from v_competencia)::int, extract(month from v_competencia)::int, v_vencimento',
  '  ) then return v_data_fechamento; end if;',
  '  return public.financeiro_cartao_clamp_dia(',
  '    extract(year from (v_competencia - interval \'1 month\'))::int,',
  '    extract(month from (v_competencia - interval \'1 month\'))::int, v_fechamento',
  '  );',
  'end;',
  '$$;',
  'create function public.financeiro_cartao_ciclo(p_cartao_id uuid, p_data date)',
  'returns table (competencia date, data_fechamento date, data_vencimento date)',
  'language plpgsql stable set search_path = public as $$',
  'declare v_fechamento int; v_vencimento int; v_fechamento_atual date; v_mes_fechamento date;',
  'begin',
  '  select dia_fechamento, dia_vencimento into v_fechamento, v_vencimento',
  '    from public.financeiro_cartoes where id = p_cartao_id and ativo = true;',
  '  if not found then raise exception \'cartao % nao encontrado ou inativo.\', p_cartao_id; end if;',
  '  v_fechamento_atual := public.financeiro_cartao_clamp_dia(',
  '    extract(year from p_data)::int, extract(month from p_data)::int, v_fechamento',
  '  );',
  '  if p_data <= v_fechamento_atual then data_fechamento := v_fechamento_atual;',
  '  else data_fechamento := public.financeiro_cartao_clamp_dia(',
  '    extract(year from (date_trunc(\'month\', p_data) + interval \'1 month\'))::int,',
  '    extract(month from (date_trunc(\'month\', p_data) + interval \'1 month\'))::int, v_fechamento',
  '  ); end if;',
  '  v_mes_fechamento := date_trunc(\'month\', data_fechamento)::date;',
  '  data_vencimento := public.financeiro_cartao_clamp_dia(',
  '    extract(year from v_mes_fechamento)::int, extract(month from v_mes_fechamento)::int, v_vencimento',
  '  );',
  '  if data_vencimento <= data_fechamento then data_vencimento := public.financeiro_cartao_clamp_dia(',
  '    extract(year from (v_mes_fechamento + interval \'1 month\'))::int,',
  '    extract(month from (v_mes_fechamento + interval \'1 month\'))::int, v_vencimento',
  '  ); end if;',
  '  competencia := date_trunc(\'month\', data_vencimento)::date;',
  '  return next;',
  'end;',
  '$$;',
  '',
  'create function public.financeiro_cartao_transacao_registrar(payload jsonb, ator jsonb default \'{}\'::jsonb)',
  'returns jsonb language plpgsql security definer set search_path = public as $$',
  'declare v_fatura public.financeiro_cartao_faturas%rowtype; v_transacao public.financeiro_cartao_transacoes%rowtype;',
  'declare v_id_externo text; v_valor numeric;',
  'begin',
  '  select * into v_fatura from public.financeiro_cartao_faturas',
  '   where id = nullif(payload->>\'fatura_id\', \'\')::uuid for update;',
  '  if not found then raise exception \'fatura_id nao encontrada.\'; end if;',
  '  v_id_externo := nullif(trim(payload->>\'id_externo\'), \'\');',
  '  if v_id_externo is not null then',
  '    select * into v_transacao from public.financeiro_cartao_transacoes',
  '     where cartao_id = v_fatura.cartao_id and id_externo = v_id_externo;',
  '    if found then return jsonb_build_object(\'success\', true, \'idempotent\', true, \'transacao_id\', v_transacao.id); end if;',
  '  end if;',
  '  v_valor := round(nullif(payload->>\'valor\', \'\')::numeric, 2);',
  '  if v_valor is null or v_valor = 0 then raise exception \'valor obrigatorio e diferente de zero para transacao de cartao.\'; end if;',
  '  insert into public.financeiro_cartao_transacoes (',
  '    fatura_id, cartao_id, data_compra, descricao, estabelecimento, valor, tipo_transacao,',
  '    empresa_id, plano_conta_id, centro_custo_id, classificacao_status, id_externo, fonte_tipo, ator_tipo, ator_ref, observacoes',
  '  ) values (',
  '    v_fatura.id, v_fatura.cartao_id, nullif(payload->>\'data_compra\', \'\')::date,',
  '    nullif(trim(payload->>\'descricao\'), \'\'), nullif(trim(payload->>\'estabelecimento\'), \'\'), v_valor,',
  '    coalesce(nullif(payload->>\'tipo_transacao\', \'\'), \'compra\'),',
  '    nullif(payload->>\'empresa_id\', \'\')::uuid, nullif(payload->>\'plano_conta_id\', \'\')::uuid,',
  '    nullif(payload->>\'centro_custo_id\', \'\')::uuid, coalesce(nullif(payload->>\'classificacao_status\', \'\'), \'pendente\'),',
  '    v_id_externo, nullif(payload->>\'fonte_tipo\', \'\'), \'sistema\', \'fixture\', nullif(payload->>\'observacoes\', \'\')',
  '  ) returning * into v_transacao;',
  '  update public.financeiro_cartao_faturas',
  '     set valor_total = round(valor_total + v_valor, 2), updated_at = now()',
  '   where id = v_fatura.id;',
  '  perform public.financeiro_cartoes_audit_insert(',
  '    public.financeiro_cartoes_resolve_ator(ator), \'financeiro_cartao_transacoes\', \'cartao_transacao\',',
  '    v_transacao.id, \'registrar_transacao_cartao\', null, to_jsonb(v_transacao), payload->>\'motivo\'',
  '  );',
  '  return jsonb_build_object(\'success\', true, \'idempotent\', false, \'transacao_id\', v_transacao.id);',
  'end;',
  '$$;',
  'create function public.financeiro_cartao_fatura_fechar(p_fatura_id uuid, ator jsonb default \'{}\'::jsonb)',
  'returns jsonb language plpgsql security definer set search_path = public as $$',
  'declare v_fatura public.financeiro_cartao_faturas%rowtype; v_conta_id uuid; v_total numeric;',
  'begin',
  '  select * into v_fatura from public.financeiro_cartao_faturas where id = p_fatura_id for update;',
  '  if not found then raise exception \'fatura de cartao nao encontrada.\'; end if;',
  '  if v_fatura.conta_pagar_id is not null then',
  '    return jsonb_build_object(\'success\', true, \'idempotent\', true, \'fatura_id\', v_fatura.id, \'conta_pagar_id\', v_fatura.conta_pagar_id);',
  '  end if;',
  '  select coalesce(sum(valor), 0) into v_total from public.financeiro_cartao_transacoes where fatura_id = v_fatura.id;',
  '  insert into public.contas_pagar (descricao, valor, competencia, status, data_vencimento, fonte_tipo)',
  '  values (concat(\'Fatura fixture \', to_char(v_fatura.competencia, \'YYYY-MM\')), round(v_total, 2), v_fatura.competencia, \'pendente\', v_fatura.data_vencimento, \'cartao\')',
  '  returning id into v_conta_id;',
  '  update public.financeiro_cartao_faturas',
  '     set valor_total = round(v_total, 2), status = \'fechada\', conta_pagar_id = v_conta_id, updated_at = now()',
  '   where id = v_fatura.id;',
  '  return jsonb_build_object(\'success\', true, \'fatura_id\', v_fatura.id, \'conta_pagar_id\', v_conta_id, \'valor_total\', round(v_total, 2));',
  'end;',
  '$$;'
].join('\n');

function runDocker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  if (result.error) {
    throw new Error(
      'Docker indisponivel (' + result.error.message + '). '
      + 'Instale/inicie o Docker para executar o fixture PostgreSQL 17.',
    );
  }
  return result;
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error([
      label + ' falhou (exit ' + (result.status ?? 'desconhecido') + ').',
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function assertCleanupSucceeded(result) {
  if (result.status === 0 || /No such container/i.test(result.stderr ?? '')) return;
  throw new Error([
    'cleanup do container falhou (exit ' + (result.status ?? 'desconhecido') + ').',
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
      throw new Error('[cleanup:' + reason + '] ' + error.message, { cause: error });
    }
  };
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
    const finalServer = runDocker([
      'exec', container, 'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres',
    ]);
    const ready = runDocker([
      'exec', container, 'pg_isready', '--username', 'postgres', '--dbname', database,
    ]);
    if (finalServer.status === 0 && ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL 17 nao ficou pronto em 30 segundos.');
}

assert.ok(existsSync(fixturePath), 'fixture PostgreSQL ausente: ' + fixturePath);
assert.ok(existsSync(migrationPath), 'migration de recorrencias ausente: ' + migrationPath);
requireSuccess(runDocker(['info', '--format', '{{.ServerVersion}}']), 'Docker daemon');

let containerAttempted = false;
const cleanupContainer = createIdempotentContainerCleanup(runDocker, container);
const handleTerminationSignal = (signal) => {
  let exitCode = signal === 'SIGINT' ? 130 : 143;
  try {
    cleanupContainer('signal:' + signal);
  } catch (error) {
    exitCode = 1;
    process.stderr.write('[financeiro-cartao-recorrencias] ' + error.message + '\n');
  }
  process.exit(exitCode);
};
process.once('SIGINT', () => handleTerminationSignal('SIGINT'));
process.once('SIGTERM', () => handleTerminationSignal('SIGTERM'));

try {
  containerAttempted = true;
  requireSuccess(runDocker([
    'run', '--detach', '--rm',
    '--name', container,
    '--label', 'com.la-music.fixture=financeiro-cartao-recorrencias-postgres',
    '--env', 'POSTGRES_PASSWORD=fixture-only',
    '--env', 'POSTGRES_DB=' + database,
    '--env', 'PGOPTIONS=-c ' + fixtureGuard,
    postgresImage,
  ]), 'criacao do PostgreSQL 17 efemero');

  await waitForPostgres();
  const version = runPsql(
    'show server_version;\n',
    'leitura da versao PostgreSQL',
    ['--tuples-only', '--no-align'],
  ).stdout.trim();
  assert.match(version, /^17\./, 'esperado PostgreSQL 17, recebido ' + version);

  runPsql(setupSql, 'provisionamento do schema minimo');
  runPsql(readFileSync(migrationPath, 'utf8'), 'aplicacao da migration real de recorrencias');

  const refusedWithoutGuard = runDocker([
    'exec', '-i', '--env', 'PGOPTIONS=', container,
    'psql',
    '--username', 'postgres',
    '--dbname', database,
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
  ], { input: readFileSync(fixturePath, 'utf8') });
  assert.notEqual(refusedWithoutGuard.status, 0, 'fixture deveria recusar execucao sem guarda local/CI');
  assert.match(
    (refusedWithoutGuard.stdout ?? '') + '\n' + (refusedWithoutGuard.stderr ?? ''),
    /REFUSED: app\.cartao_recorrencia_fixture_guard=local_ci_only/i,
    'fixture recusou sem explicar a guarda local/CI obrigatoria',
  );

  runPsql(
    readFileSync(fixturePath, 'utf8'),
    'fixture comportamental de recorrencias de cartao',
  );
  const rollbackProof = runPsql([
    'select (',
    "  (select count(*) from public.financeiro_cartoes where id::text like '00000000-0000-0000-0000-00000000ca%')",
    "  + (select count(*) from public.financeiro_empresas where id::text like '00000000-0000-0000-0000-00000000ca%')",
    "  + (select count(*) from public.plano_contas where id::text like '00000000-0000-0000-0000-00000000ca%')",
    "  + (select count(*) from public.centros_custo where id::text like '00000000-0000-0000-0000-00000000ca%')",
    "  + (select count(*) from public.financeiro_contas_bancarias where id::text like '00000000-0000-0000-0000-00000000ca%')",
    "  + (select count(*) from public.financeiro_cartao_faturas where id::text like '00000000-0000-0000-0000-00000000ca%')",
    '  + (select count(*) from public.financeiro_cartao_transacoes)',
    '  + (select count(*) from public.financeiro_cartao_recorrencias)',
    '  + (select count(*) from public.financeiro_cartao_recorrencia_previsoes)',
    '  + (select count(*) from public.contas_pagar)',
    '  + (select count(*) from public.maria_audit_log)',
    ')::text;',
  ].join('\n'), 'prova pos-rollback das sentinelas', ['--tuples-only', '--no-align']).stdout.trim();
  assert.equal(rollbackProof, '0', 'ROLLBACK deixou linhas sentinela persistidas: ' + rollbackProof);

  process.stdout.write('PASS: PostgreSQL 17\n');
  process.stdout.write('rollback_sentinel_rows=0\n');
} finally {
  if (containerAttempted) cleanupContainer('finally');
}
