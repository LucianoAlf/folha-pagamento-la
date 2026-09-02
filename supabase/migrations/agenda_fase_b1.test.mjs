import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
function readBySuffix(suffix) {
  const f = readdirSync(dir).find((n) => n.endsWith(suffix));
  return f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
}
const schema = readBySuffix('_agenda_rotinas_schema.sql');
const guardLista = readBySuffix('_agenda_rotinas_guard_lista_pai.sql');
const cal = readBySuffix('_agenda_calendario.sql');
const mat = readBySuffix('_agenda_rotinas_materializar.sql');
const matV2 = readBySuffix('_agenda_rotinas_materializar_v2.sql');
const seed = readBySuffix('_agenda_seed_rotinas_financeiro.sql');
const syncV5 = readBySuffix('_agenda_sync_contas_pagar_v5.sql');
const posReview = readBySuffix('_agenda_rotinas_policy_maria_categoria_check.sql');
const todos = [schema, guardLista, cal, mat, matV2, seed, syncV5, posReview].join('\n');

test('schema: agenda_rotinas auto-referente com CHECKs da spec', () => {
  assert.match(schema, /create table if not exists public\.agenda_rotinas/i);
  assert.match(schema, /parent_rotina_id uuid null references public\.agenda_rotinas\(id\) on delete restrict/i);
  assert.match(schema, /frequencia text not null default 'mensal' check \(frequencia in \('mensal'\)\)/i);
  assert.match(schema, /dia_mes smallint null check \(dia_mes between 1 and 31\)/i);
  assert.match(schema, /se_cair_fim_de_semana text not null default 'manter'/i);
  assert.match(schema, /check \(se_cair_fim_de_semana in \('manter','proximo_dia_util','dia_util_anterior'\)\)/i);
  assert.match(schema, /status text not null default 'ativa' check \(status in \('ativa','pausada','encerrada'\)\)/i);
  assert.match(schema, /vigencia_inicio date not null default \(now\(\) at time zone 'America\/Sao_Paulo'\)::date/i);
  assert.match(schema, /constraint agenda_rotinas_dia_check check \(ultimo_dia or dia_mes is not null\)/i);
});

test('schema: tarefas.rotina_id/competencia, CHECK e indice unico nao-parcial sem status', () => {
  assert.match(schema, /add column if not exists rotina_id uuid null references public\.agenda_rotinas\(id\) on delete restrict/i);
  assert.match(schema, /add column if not exists competencia date null/i);
  assert.match(schema, /check \(rotina_id is null or competencia is not null\)/i);
  assert.match(schema, /create unique index if not exists tarefas_rotina_competencia_uniq on public\.tarefas \(rotina_id, competencia\);/i);
  assert.doesNotMatch(schema, /tarefas_rotina_competencia_uniq[^;]*where/i);
});

test('schema: guarda de profundidade e mesma lista em trigger', () => {
  assert.match(schema, /create trigger agenda_rotinas_guard_parent before insert or update of parent_rotina_id, lista_id on public\.agenda_rotinas/i);
  assert.match(schema, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(schema, /filha deve estar na mesma lista do pai\./);
});

// R-B1-4: a guarda do banco e a unica barreira do invariante (as RPCs de rotina
// serao de outro time). Mover o pai de lista quebraria "filha na mesma lista do pai".
test('guard lista (R-B1-4): pai com filhas nao muda de lista, guardas antigas de pe', () => {
  assert.match(guardLista, /create or replace function public\.agenda_rotinas_guard_parent\(\)/i);
  assert.match(guardLista, /tg_op = 'UPDATE' and new\.lista_id is distinct from old\.lista_id/i);
  assert.match(guardLista, /exists \(select 1 from public\.agenda_rotinas f where f\.parent_rotina_id = new\.id\)/i);
  assert.match(guardLista, /rotina com filhas nao muda de lista: encerre e crie outra\./);
  assert.match(guardLista, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(guardLista, /filha deve estar na mesma lista do pai\./);
});

test('schema: RLS — leitura pra logados, escrita so admin; materializacoes legivel pela Maria', () => {
  assert.match(schema, /create policy agenda_rotinas_select on public\.agenda_rotinas\s+for select using \(\(select auth\.role\(\)\) = 'authenticated'\)/i);
  assert.match(schema, /create policy agenda_rotinas_insert_admin on public\.agenda_rotinas\s+for insert with check \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create table if not exists public\.agenda_materializacoes/i);
  assert.match(schema, /origem text not null check \(origem in \('cron','rpc','sync','manual'\)\)/i);
  assert.match(schema, /grant select on public\.agenda_materializacoes to maria_leitura, maria_operacional, service_role/i);
  assert.doesNotMatch(schema, /whatsapp_numero|\b55\d{10,11}\b/);
});

test('calendario: resolve_dia immutable, ajustar_data stable, ponto unico de feriados', () => {
  assert.match(cal, /function public\.agenda_resolve_dia\(p_competencia date, p_dia_mes integer, p_ultimo_dia boolean\)\s+returns date language sql immutable/i);
  assert.match(cal, /function public\.agenda_ajustar_data\(p_data date, p_regra text\)\s+returns date/i);
  assert.match(cal, /language plpgsql stable/i);
  assert.match(cal, /agenda_feriados entra AQUI/);
  for (const fn of ['agenda_resolve_dia(date, integer, boolean)', 'agenda_ajustar_data(date, text)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(cal, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(cal, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
});

test('materializador: max(nominal), vigencia por linha, pai fechado, exception por pai, cron inativo', () => {
  assert.match(mat, /function public\.agenda_rotinas_materializar\(p_competencia date, p_origem text default 'rpc'\)/i);
  assert.match(mat, /v_nominal_pai < v_pai\.vigencia_inicio/);
  assert.match(mat, /v_nominal_f >= v_filha\.vigencia_inicio and v_nominal_f > v_nominal_max/);
  assert.match(mat, /agenda_ajustar_data\(v_nominal_max, v_pai\.se_cair_fim_de_semana\)/);
  assert.match(mat, /on conflict \(rotina_id, competencia\) do nothing/i);
  assert.match(mat, /v_pai_status in \('concluida','cancelada'\)/);
  assert.match(mat, /exception when others then/i);
  assert.match(mat, /insert into public\.agenda_materializacoes/i);
  assert.match(mat, /function public\.agenda_materializar_corrente_e_proximo\(p_origem text default 'cron'\)/i);
  assert.match(mat, /'agenda-rotinas-materializar-diario'/);
  assert.match(mat, /'30 10 \* \* \*'/);
  assert.match(mat, /cron\.alter_job\(job_id := jid, active := coalesce\(v_ativo_antes, false\)\)/i);
  for (const fn of ['agenda_rotinas_materializar(date, text)', 'agenda_materializar_corrente_e_proximo(text)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(mat, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(mat, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
});

test('materializador v2: contadores restaurados no exception por pai; origem validada com 22023', () => {
  assert.match(matV2, /function public\.agenda_rotinas_materializar\(p_competencia date, p_origem text default 'rpc'\)/i);
  // o exception por pai desfaz as linhas, nao as variaveis: retrato antes + restauracao no handler
  assert.match(matV2, /v_pais_ret := v_pais; v_filhas_ret := v_filhas; v_pulados_ret := v_pulados;/);
  assert.match(
    matV2,
    /exception when others then[\s\S]*?v_pais := v_pais_ret; v_filhas := v_filhas_ret; v_pulados := v_pulados_ret;/i,
  );
  // origem invalida barrada na entrada, em portugues, com o errcode de parametro
  assert.match(matV2, /not in \('cron','rpc','sync','manual'\)/i);
  assert.match(matV2, /raise exception 'origem invalida: %\.', p_origem using errcode = '22023'/i);
  assert.match(matV2, /revoke all on function public\.agenda_rotinas_materializar\(date, text\) from public, anon, authenticated/i);
  assert.match(matV2, /grant execute on function public\.agenda_rotinas_materializar\(date, text\) to service_role/i);
});

test('seed: idempotente, 10 ativas + 4 encerradas, Light encerrada, sem instancias, FDS por natureza', () => {
  assert.match(seed, /where not exists/i);
  assert.match(seed, /Conciliação de Cartões/);
  assert.match(seed, /Pedir fatura ao Luciano/);
  assert.match(seed, /Depósito de Cheques/);
  assert.match(seed, /Repasses de Cartões – Maquininha/);
  assert.match(seed, /Cashbacks do mês aplicados/);
  assert.match(seed, /Faturamento Mensal/);
  assert.match(seed, /Conferir débito automático Light \(Recreio\)'[\s\S]{0,400}'encerrada'/);
  assert.match(seed, /Rose 01\/09: pode sair/);
  assert.doesNotMatch(seed, /insert into public\.tarefas/i);
  assert.match(seed, /vigencia_inicio[^;]*date '2026-09-01'/i);
  assert.doesNotMatch(seed, /\b55\d{10,11}\b/);
});

test('sync v5: grava agenda_materializacoes com origem sync', () => {
  assert.match(syncV5, /function public\.agenda_sync_contas_pagar\(\)/i);
  assert.match(syncV5, /insert into public\.agenda_materializacoes \(origem, competencia, duracao_ms, criados, atualizados, removidos, detalhes\)/i);
  assert.match(syncV5, /'sync'/);
  assert.match(syncV5, /is distinct from/i);
  assert.match(syncV5, /r\.recorrencia_pai_id = t\.id/i);
  assert.doesNotMatch(syncV5, /do update set[\s\S]*?responsavel_id\s*=/i);
  assert.match(syncV5, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
});

// Pos-review final: o grant de select em agenda_rotinas pros papeis da Maria era inerte sem policy
// (nenhum dos dois papeis tem BYPASSRLS); a categoria da rotina nao tinha o CHECK que tarefas tem.
test('pos-review: policy de leitura Maria, CHECK de categoria e search_path em resolve_dia', () => {
  assert.match(
    posReview,
    /create policy agenda_rotinas_select_maria on public\.agenda_rotinas\s+for select to maria_leitura, maria_operacional using \(true\)/i,
  );
  assert.match(
    posReview,
    /add constraint agenda_rotinas_categoria_check\s+check \(categoria in \('financeiro','rh','administrativo','pessoal','geral'\)\)/i,
  );
  assert.match(posReview, /alter function public\.agenda_resolve_dia\(date, integer, boolean\) set search_path = public/i);
});

test('fuso: nenhum SQL da B1 usa current_date ou now()::date', () => {
  assert.doesNotMatch(todos, /\bcurrent_date\b/i);
  assert.doesNotMatch(todos, /now\(\)::date/i);
});

test('arquivos existem', () => {
  for (const [nome, txt] of Object.entries({ schema, cal, mat, seed, syncV5, posReview })) assert.ok(txt.length > 0, `${nome} vazio/ausente`);
});
