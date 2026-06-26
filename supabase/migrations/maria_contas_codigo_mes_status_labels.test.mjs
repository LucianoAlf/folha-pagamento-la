import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./20260626_maria_contas_codigo_mes_status_labels.sql', import.meta.url);

test('Maria document status RPC uses Contas a Pagar status labels', () => {
  assert.equal(existsSync(migrationUrl), true, 'missing status-label alignment migration');

  const sql = readFileSync(migrationUrl, 'utf8');
  assert.match(sql, /status_coleta text/);
  assert.match(sql, /'status_coleta',\s*'COLETADO'/);
  assert.match(sql, /'COLETADO'/);
  assert.match(sql, /'COLETAR'/);
  assert.match(sql, /'SEM CÓDIGO'/);
  assert.doesNotMatch(sql, /'documento_status'/);
});
