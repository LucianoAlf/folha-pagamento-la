import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./20260626_maria_contas_codigo_mes_carimbo.sql', import.meta.url), 'utf8');

test('Maria code-month stamp migration adds visible metadata and sanitized status RPC', () => {
  assert.match(sql, /add column if not exists registrado_por_agente boolean/);
  assert.match(sql, /add column if not exists confirmado_por_nome text/);
  assert.match(sql, /create or replace function public\.maria_contas_documento_status/);
  assert.match(sql, /tipo_documento_registrado text/);
  assert.match(sql, /revoke select on public\.contas_pagar_codigo_mes from maria_operacional, maria_leitura/);
});

test('Maria register RPC returns sanitized payload without raw payment code fields', () => {
  const returnBlock = sql.match(/return jsonb_build_object\([\s\S]*?\n  \);\nend;\n\$\$;/)?.[0] || '';

  assert.match(returnBlock, /'documento_status', 'registrado'/);
  assert.match(returnBlock, /'registrado_por'/);
  assert.match(returnBlock, /'confirmado_por'/);
  assert.doesNotMatch(returnBlock, /codigo_barras|chave_pix|qr_pix_payload|to_jsonb\(v_after\)/);
});
