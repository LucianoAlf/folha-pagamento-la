import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Fase B parte 1 (02/09/2026): RPCs de TAREFA da Maria. Teste estatico da migration; o teste de
// comportamento roda no banco (tests/test_maria_agenda_rpcs.py no workspace da Maria, transacao desfeita).
const dir = fileURLToPath(new URL('./', import.meta.url));
const f = readdirSync(dir).find((n) => n.endsWith('_maria_agenda_rpcs_tarefas.sql'));
const sql = f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';

const RPCS_L = ['maria_agenda_listas', 'maria_agenda_listar', 'maria_agenda_detalhar'];
const RPCS_E = ['maria_agenda_criar', 'maria_agenda_editar', 'maria_agenda_remarcar', 'maria_agenda_concluir', 'maria_agenda_reabrir', 'maria_agenda_cancelar', 'maria_agenda_excluir'];

test('migration existe e define assert + 10 RPCs de tarefa, todas security definer com search_path', () => {
  assert.ok(sql.length > 1000, 'migration _maria_agenda_rpcs_tarefas.sql ausente');
  assert.match(sql, /create or replace function public\.maria_agenda_assert\(/i);
  for (const r of [...RPCS_L, ...RPCS_E]) assert.match(sql, new RegExp(`create or replace function public\\.${r}\\(`, 'i'), r);
  const defs = sql.match(/create or replace function public\.maria_agenda_\w+\([\s\S]*?\)\s*returns[\s\S]*?as \$\$/gi) || [];
  assert.ok(defs.length >= 18, `esperava >= 18 funcoes, achou ${defs.length}`);
  for (const d of defs) if (!/montar_vencimento/.test(d)) assert.match(d, /security definer set search_path = public/i, d.slice(0, 80));
});

test('fuso explicito: nada de current_date / now()::date no codigo (comentarios fora)', () => {
  const codigo = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(codigo, /current_date/i);
  assert.doesNotMatch(codigo, /now\(\)::date/i);
  assert.match(codigo, /America\/Sao_Paulo/);
});

test('grants: revoke explicito de public/anon/authenticated; L inclui maria_leitura; E nao', () => {
  assert.match(sql, /revoke all on function %s from public, anon, authenticated/);
  assert.match(sql, /grant execute on function %s to service_role, maria_operacional, maria_leitura/);
  assert.match(sql, /grant execute on function %s to service_role, maria_operacional'/);
  for (const r of RPCS_L) assert.match(sql, new RegExp(`'public\\.${r}\\([^']*\\)'`), `${r} sem entrada de grant`);
  for (const r of RPCS_E) assert.match(sql, new RegExp(`'public\\.${r}\\([^']*\\)'`), `${r} sem entrada de grant`);
});

test('regras do contrato: espelho conta_pagar recusa concluir com hint dar_baixa; idempotencia por mensagem; audit em toda escrita', () => {
  assert.match(sql, /conclua pela baixa da conta/);
  assert.match(sql, /maria_contas_dar_baixa\(p_conta_id=%s\)/);
  assert.match(sql, /mensagem_origem_id = p_mensagem_origem_id and titulo = trim\(p_titulo\)/);
  const audits = sql.match(/maria_audit_insert\(/g) || [];
  assert.ok(audits.length >= RPCS_E.length, `esperava >= ${RPCS_E.length} chamadas de auditoria, achou ${audits.length}`);
  assert.match(sql, /pai com filhas pendentes/);
  assert.match(sql, /filha de pai concluido: reabra o pai primeiro/);
  assert.match(sql, /instancia de rotina nao se exclui: use cancelar/);
});
