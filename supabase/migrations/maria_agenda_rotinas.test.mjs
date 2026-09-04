import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Fase B parte 2 (02/09/2026): 9 RPCs de ROTINA da Maria sobre agenda_rotinas (B1). Teste estatico;
// o comportamento roda no banco (tests/test_maria_agenda_rotinas.py no workspace da Maria, transacao desfeita).
const dir = fileURLToPath(new URL('./', import.meta.url));
const f = [...readdirSync(dir), ...readdirSync(dir + '/_arquivo').map((n) => '_arquivo/' + n)].find((n) => n.endsWith('_maria_agenda_rpcs_rotinas.sql'));
const sql = f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
const codigo = sql.replace(/--.*$/gm, '');

const RPCS = ['maria_agenda_rotinas_listar', 'maria_agenda_rotina_criar', 'maria_agenda_rotina_editar', 'maria_agenda_rotina_filha_adicionar',
  'maria_agenda_rotina_filha_editar', 'maria_agenda_rotina_filha_remover', 'maria_agenda_rotina_pausar', 'maria_agenda_rotina_reativar', 'maria_agenda_rotina_encerrar'];
const TAREFA = ['maria_agenda_assert', 'maria_agenda_listar', 'maria_agenda_detalhar', 'maria_agenda_criar', 'maria_agenda_editar', 'maria_agenda_remarcar',
  'maria_agenda_concluir', 'maria_agenda_reabrir', 'maria_agenda_cancelar', 'maria_agenda_excluir', 'maria_agenda_listas'];

test('migration define as 9 RPCs de rotina e NAO redefine nada da parte 1 (um autor por prefixo, sem sobrecarga)', () => {
  assert.ok(sql.length > 1000, 'migration _maria_agenda_rpcs_rotinas.sql ausente');
  for (const r of RPCS) assert.match(sql, new RegExp(`create or replace function public\\.${r}\\(`, 'i'), r);
  for (const t of TAREFA) assert.doesNotMatch(sql, new RegExp(`create or replace function public\\.${t}\\(`, 'i'), `${t} redefinida`);
  const defs = sql.match(/create or replace function public\.maria_agenda_\w+\([\s\S]*?\)\s*returns[\s\S]*?as \$\$/gi) || [];
  assert.equal(defs.length, 15, `esperava 15 funcoes (9 RPCs + 6 helpers), achou ${defs.length}`);
  for (const d of defs) if (!/validar_rotina/.test(d)) assert.match(d, /security definer set search_path = public/i, d.slice(0, 80));
});

test('apoia-se no B1: materializador do Super Folha, resolve/ajustar data; nunca apaga molde', () => {
  assert.match(codigo, /agenda_materializar_corrente_e_proximo\('rpc'\)/);
  assert.match(codigo, /agenda_ajustar_data\(public\.agenda_resolve_dia\(/);
  assert.doesNotMatch(codigo, /delete from public\.agenda_rotinas/i);
  assert.match(codigo, /competencia > v_mes and status in \('pendente','em_andamento','adiada'\)/);   // so instancias FUTURAS
});

test('fuso explicito e grants: revoke explicito; rotinas_listar e L, as 8 de escrita sao E', () => {
  assert.doesNotMatch(codigo, /current_date/i);
  assert.doesNotMatch(codigo, /now\(\)::date/i);
  assert.match(sql, /revoke all on function %s from public, anon, authenticated/);
  assert.match(sql, /'public\.maria_agenda_rotinas_listar\(uuid,text,text,text,text\)'/);
  for (const r of RPCS.slice(1)) assert.match(sql, new RegExp(`'public\\.${r}\\([^']*\\)'`), `${r} sem grant`);
});

test('contrato §4.5/§6: idempotencia por mensagem; encerrada terminal; alvo pai/filha trocado recusa; audit em toda escrita', () => {
  assert.match(sql, /mensagem_origem_id = p_mensagem_origem_id and titulo = trim\(p_titulo\) and parent_rotina_id is null/);
  assert.match(sql, /mensagem_origem_id = p_mensagem_origem_id and titulo = trim\(p_titulo\) and parent_rotina_id = v_pai\.id/);
  assert.match(sql, /rotina encerrada nao aceita edicao nem reativacao\./);
  assert.match(sql, /alvo ja e filha: adicione filhas ao pai\./);
  assert.match(sql, /alvo e filha: use maria_agenda_rotina_filha_editar\./);
  const audits = sql.match(/maria_audit_insert\(/g) || [];
  assert.ok(audits.length >= 8, `esperava >= 8 auditorias, achou ${audits.length}`);
});
