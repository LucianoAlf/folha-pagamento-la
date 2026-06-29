import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260628_1_financeiro_empresas.sql', import.meta.url), 'utf8');

test('creates fiscal companies table with operational labels and cost-center FK', () => {
  assert.match(sql, /create table if not exists public\.financeiro_empresas/i);
  assert.match(sql, /label_operacional text/i);
  assert.match(sql, /cnpj text not null unique check \(cnpj ~ '\^\[0-9\]\{14\}\$'\)/i);
  assert.match(sql, /unidade_id uuid not null references public\.centros_custo\(id\)/i);
  assert.match(sql, /alter table public\.financeiro_empresas enable row level security/i);
});

test('seeds the four fiscal companies with exact labels and CNPJs', () => {
  for (const label of ['Kids CG', 'EMLA CG', 'Recreio', 'Barra']) {
    assert.match(sql, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  for (const cnpj of ['26707112000170', '19672908000170', '32134891000165', '42681170000129']) {
    assert.match(sql, new RegExp(cnpj));
  }
});

test('does not grant Maria direct access to company base table', () => {
  assert.match(sql, /grant select on public\.financeiro_empresas to authenticated, service_role/i);
  assert.match(sql, /revoke all on public\.financeiro_empresas from public, anon, maria_operacional, maria_leitura/i);
  assert.doesNotMatch(sql, /grant\s+\w+[\s\S]*public\.financeiro_empresas[\s\S]*to maria_operacional/i);
});
