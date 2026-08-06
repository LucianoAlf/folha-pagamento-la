import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260806_contas_anomalia_memoria_operacional.sql', import.meta.url), 'utf8');

test('migration preserva legado e cria identidade recorrente', () => {
  assert.match(sql, /add column if not exists recorrente_modelo_id uuid/i);
  assert.match(sql, /add column if not exists plano_conta_id uuid/i);
  assert.match(sql, /drop constraint if exists contas_anomalia_notas_status_check/i);
  assert.match(sql, /pendente.*justificada.*corrigir_lancamento.*monitorar.*verificado/is);
  assert.match(sql, /create unique index if not exists contas_anomalia_notas_unique/i);
  assert.match(sql, /enable row level security/i);
});
