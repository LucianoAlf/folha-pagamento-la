import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_2_financeiro_contas_bancarias.sql', import.meta.url), 'utf8');

test('creates bank accounts table owned by fiscal company', () => {
  assert.match(sql, /create table if not exists public\.financeiro_contas_bancarias/i);
  assert.match(sql, /empresa_id uuid not null references public\.financeiro_empresas\(id\)/i);
  assert.match(sql, /tipo text not null default 'corrente' check \(tipo in \('corrente','poupanca','pagamento'\)\)/i);
  assert.match(sql, /unique \(banco, agencia, conta\)/i);
  assert.match(sql, /alter table public\.financeiro_contas_bancarias enable row level security/i);
});

test('seeds the four Santander 1534 accounts', () => {
  for (const conta of ['13002360-2', '13002359-2', '13002361-9', '13002358-5']) {
    assert.match(sql, new RegExp(conta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sql, /Santander/i);
  assert.match(sql, /1534/);
});

test('does not grant Maria direct access to bank-account base table', () => {
  assert.match(sql, /grant select on public\.financeiro_contas_bancarias to authenticated, service_role/i);
  assert.match(sql, /revoke all on public\.financeiro_contas_bancarias from public, anon, maria_operacional, maria_leitura/i);
  assert.doesNotMatch(sql, /grant\s+\w+[\s\S]*public\.financeiro_contas_bancarias[\s\S]*to maria_operacional/i);
});
