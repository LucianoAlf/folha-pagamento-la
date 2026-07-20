import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./20260719_3_folha_alocacao_dre_privilegios_internos.sql', import.meta.url),
  'utf8'
);

test('service role cannot bypass the four public DRE allocation entrypoints', () => {
  for (const helper of [
    'folha_alocacao_dre_resolve_ator',
    'folha_alocacao_dre_source_hash',
    'folha_alocacao_dre_allocation_hash',
    'folha_alocacao_dre_gravar',
    'folha_alocacao_dre_confirmacao_guard',
    'folha_alocacao_dre_fatia_guard',
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${helper}\\([\\s\\S]*?from service_role`, 'i')
    );
  }

  assert.match(migration, /revoke all on public\.folha_alocacao_dre_confirmacoes from service_role/i);
  assert.match(migration, /revoke all on public\.folha_alocacao_dre_fatias from service_role/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on/i);
});
