import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Fase 2 debito automatico (02/09/2026), lado da Maria — contrato em Docs/handoffs/2026-09-02-debito-automatico-fase2.md.
// Teste estatico da migration; o comportamento roda no banco (tests/test_maria_debito_automatico.py no workspace da Maria,
// transacao desfeita). A migration foi aplicada por MCP e carrega a versao do servidor no nome.
const dir = fileURLToPath(new URL('./', import.meta.url));
const f = [...readdirSync(dir), ...readdirSync(dir + '/_arquivo').map((n) => '_arquivo/' + n)].find((n) => n.endsWith('_maria_debito_automatico_fase2.sql'));
const sql = f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
const codigo = sql.replace(/--.*$/gm, '');

test('migration existe: view com a flag na ultima coluna; 3 RPCs de criar ganham p_debito_automatico sem overload; eventual fora', () => {
  assert.ok(sql.length > 1000, 'migration _maria_debito_automatico_fase2.sql ausente');
  assert.match(sql, /create or replace view public\.vw_maria_contas_pagar as[\s\S]*updated_at,\s*debito_automatico\s*from public\.contas_pagar/i);
  for (const r of ['maria_contas_unica_criar', 'maria_contas_recorrente_criar', 'maria_contas_parcelada_criar']) assert.match(sql, new RegExp(`'${r}'`), r);
  assert.doesNotMatch(sql, /'maria_contas_eventual_criar'/);        // eventual e gasto avulso: o app forca false, a RPC nao ganha o parametro
  assert.match(sql, /p_debito_automatico boolean DEFAULT false/);
  assert.match(sql, /drop function public\.%I\(%s\)/);              // assinatura muda -> drop + create (sem overload)
  assert.match(sql, /overload indevido/);
  assert.match(sql, /coalesce\(p_debito_automatico, false\)/);
  assert.match(sql, /maria_debito_fase2_prosrc_bkp_20260902/);      // backup antes de mexer
});

test('baixa assume Débito Automático; codigo do mes recusa conta flagada; digest e situacao expoem a flag', () => {
  assert.match(sql, /v_metodo := 'Débito Automático'/);
  assert.match(sql, /metodo_pagamento obrigatorio para baixa/);
  assert.match(sql, /não há código do mês para coletar/);
  assert.match(sql, /'contas_debito_automatico', v_c_deb/);
  assert.match(sql, /'sem_baixa'/);
  assert.match(sql, /'debito_automatico', debito_automatico, 'parcela', parcela_atual/);
});

test('RPC liga/desliga: molde (assert_actor, for update, audit), eventual recusa, propaga por modelo e por parcelamento', () => {
  assert.match(sql, /create or replace function public\.maria_contas_definir_debito_automatico\(/);
  assert.match(sql, /security definer set search_path = public/);
  assert.match(sql, /maria_assert_actor\(p_ator_numero, p_papel, array\['owner_full','finance_ops_write_safe','finance_assistant_write_safe'\]\)/);
  assert.match(sql, /for update;/);
  assert.match(sql, /conta eventual nao aceita debito automatico/);
  assert.match(sql, /recorrente_modelo_id = v_modelo_id and c\.status = 'pendente' and c\.competencia >= v_before\.competencia/);
  assert.match(sql, /c\.parcelamento_id = v_before\.parcelamento_id and c\.status = 'pendente'/);
  assert.match(sql, /'ligar_debito_automatico' else 'desligar_debito_automatico'/);
  assert.ok((sql.match(/maria_audit_insert\(/g) || []).length >= 1, 'auditoria na escrita');
});

test('fuso explicito e grants: sem current_date; revoke public/anon/authenticated; leitura so em digest e situacao', () => {
  assert.doesNotMatch(codigo, /current_date/i);
  assert.doesNotMatch(codigo, /now\(\)::date/i);
  assert.match(sql, /revoke all on function public\.%I\(%s\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.%I\(%s\) to service_role, maria_operacional/);
  assert.match(sql, /leitura text\[\] := array\['maria_agenda_digest_grupo','maria_contas_situacao_mes'\]/);
  assert.match(sql, /revoke all on function public\.maria_contas_definir_debito_automatico\(uuid, boolean, text, text, text, text, text, boolean\) from public, anon, authenticated/);
  assert.match(sql, /esperava 9 funcoes/);
});
