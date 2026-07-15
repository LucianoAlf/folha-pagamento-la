import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./20260715_1_folha_fechar_contas_pagar.sql', import.meta.url),
  'utf8'
);

test('migration extends only the required contas pagar classifications', () => {
  assert.match(migration, /drop constraint if exists contas_pagar_tipo_lancamento_check/i);
  assert.match(migration, /'fatura_cartao'\s*,\s*'folha_pagamento'/i);
  assert.match(migration, /drop constraint if exists contas_pagar_fonte_tipo_check/i);
  assert.match(migration, /'cartao'\s*,\s*'folha_pagamento'/i);
  assert.doesNotMatch(migration, /alter table public\.folhas_mensais[\s\S]*add constraint/i);
});

test('folha fechar is preflight guarded, atomic and reconciled', () => {
  assert.match(migration, /create or replace function public\.folha_fechar\(\s*p_folha_id integer,\s*p_ator jsonb/i);
  assert.match(migration, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(migration, /from public\.folhas_mensais[\s\S]*for update/i);
  assert.match(migration, /status da folha deve ser aprovada/i);
  assert.match(migration, /public\.folha_rateio_contas_preflight\(p_folha_id\)/i);
  assert.match(migration, /colaboradores pendentes de conta pagadora/i);
  assert.match(migration, /cp\.fonte_tipo\s*=\s*'folha_pagamento'[\s\S]*cp\.fonte_identificador\s*=\s*p_folha_id::text/i);
  assert.match(migration, /soma das contas geradas .* nao confere com o total geral/i);
  assert.match(migration, /set status = 'fechada'/i);
});

test('folha fechar generates fiscal payables outside the chart-of-accounts DRE', () => {
  assert.match(migration, /insert into public\.contas_pagar/i);
  assert.match(migration, /'Folha de Pagamento - '/i);
  assert.match(migration, /'folha_pagamento'/i);
  assert.match(migration, /plano_conta_id/i);
  assert.match(migration, /null,\s*-- plano_conta_id/i);
  assert.match(migration, /conta_pagadora_id/i);
  assert.match(migration, /empresa_id/i);
  assert.match(migration, /centro_custo_id/i);
  assert.match(migration, /America\/Sao_Paulo/i);
  assert.match(migration, /insert into public\.maria_audit_log/i);
  assert.match(migration, /'FECHAR_FOLHA'/i);
});

test('folha reabrir never cancels a paid or non-pending payable', () => {
  assert.match(migration, /create or replace function public\.folha_reabrir\(\s*p_folha_id integer,\s*p_ator jsonb/i);
  assert.match(migration, /status da folha deve ser fechada/i);
  assert.match(migration, /contas vinculadas nao podem ser canceladas/i);
  assert.match(migration, /cp\.status\s*<>\s*'pendente'/i);
  assert.match(migration, /set status = 'cancelado'/i);
  assert.match(migration, /set status = 'aprovada'/i);
  assert.match(migration, /'REABRIR_FOLHA'/i);
});

test('RPCs reject spoofed actors and expose execute only to authenticated and service role', () => {
  assert.match(migration, /if v_role = 'authenticated'[\s\S]*v_ator_tipo := 'web'/i);
  assert.match(migration, /v_ator_ref := auth\.uid\(\)::text/i);
  assert.match(migration, /papel nao autorizado para fechar folha/i);
  assert.match(migration, /papel nao autorizado para reabrir folha/i);
  assert.match(
    migration,
    /revoke all on function public\.folha_fechar\(integer, jsonb\)\s+from public, anon, authenticated, maria_operacional, maria_leitura/i
  );
  assert.match(
    migration,
    /grant execute on function public\.folha_fechar\(integer, jsonb\)\s+to authenticated, service_role/i
  );
  assert.match(
    migration,
    /revoke all on function public\.folha_reabrir\(integer, jsonb\)\s+from public, anon, authenticated, maria_operacional, maria_leitura/i
  );
  assert.match(
    migration,
    /grant execute on function public\.folha_reabrir\(integer, jsonb\)\s+to authenticated, service_role/i
  );
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on\s+public\.(contas_pagar|folhas_mensais)/i);
});
