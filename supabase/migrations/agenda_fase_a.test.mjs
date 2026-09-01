import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
function readBySuffix(suffix) {
  const f = readdirSync(dir).find((n) => n.endsWith(suffix));
  return f ? readFileSync(new URL(`./${f}`, import.meta.url), 'utf8') : '';
}
const schema = readBySuffix('_agenda_fase_a_schema.sql');
const rls = readBySuffix('_notificacao_config_rls_por_usuario.sql');
const dest = readBySuffix('_agenda_destinatarios_lembretes.sql');
const devidosFix = readBySuffix('_agenda_lembretes_devidos_horizonte_por_momento.sql');
const sync = readBySuffix('_agenda_sync_contas_pagar.sql');
const syncV2 = readBySuffix('_agenda_sync_contas_pagar_v2.sql');
const syncV3 = readBySuffix('_agenda_sync_contas_pagar_v3.sql');
const todos = [schema, rls, dest, devidosFix, sync, syncV2, syncV3].join('\n');

test('schema: colunas, membros, ator.user_id, indice unico de vinculo nao-parcial', () => {
  assert.match(schema, /add column if not exists parent_id uuid null references public\.tarefas\(id\) on delete set null/i);
  assert.match(schema, /add column if not exists responsavel_id uuid null references public\.user_profiles\(id\)/i);
  assert.match(schema, /add column if not exists concluida_por uuid null references public\.user_profiles\(id\)/i);
  assert.match(schema, /add column if not exists mensagem_origem_id text null/i);
  assert.match(schema, /create unique index if not exists tarefas_vinculo_uniq on public\.tarefas \(vinculo_tipo, vinculo_id\);/i);
  assert.doesNotMatch(schema, /tarefas_vinculo_uniq[^;]*where/i);
  assert.match(schema, /create table if not exists public\.tarefas_listas_membros/i);
  assert.match(schema, /primary key \(lista_id, user_id\)/i);
  assert.match(schema, /alter table public\.maria_whatsapp_atores add column if not exists user_id uuid null references public\.user_profiles\(id\)/i);
});

test('schema: triggers de profundidade e de delete', () => {
  assert.match(schema, /create trigger tarefas_guard_parent before insert or update of parent_id on public\.tarefas/i);
  assert.match(schema, /profundidade maxima 1: filha nao pode ter filha\./);
  assert.match(schema, /create trigger tarefas_guard_delete before delete on public\.tarefas/i);
  assert.match(schema, /pai com filha ativa nao pode ser excluido\./);
});

test('schema: membros — leitura pra logados, escrita so admin (fonte de autorizacao da Maria)', () => {
  assert.match(schema, /create policy listas_membros_select on public\.tarefas_listas_membros\s+for select using \(\(select auth\.role\(\)\) = 'authenticated'\)/i);
  assert.match(schema, /create policy listas_membros_insert_admin on public\.tarefas_listas_membros\s+for insert with check \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create policy listas_membros_update_admin on public\.tarefas_listas_membros\s+for update using \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.match(schema, /create policy listas_membros_delete_admin on public\.tarefas_listas_membros\s+for delete using \(public\.financeiro_cartoes_is_admin\(\)\)/i);
  assert.doesNotMatch(schema, /tarefas_listas_membros\s+for all using/i);
});

test('schema: seed de membros e atores sem telefone', () => {
  assert.match(schema, /cf0e4bf0-d056-4b55-83c1-92b81f6be9c4/); // Rose
  assert.match(schema, /81305959-dc68-4f8e-b54f-dd055dabcfd4/); // Ana
  assert.match(schema, /41351a8b-68bf-48d5-a5d1-69c1a2848f5d/); // Luciano
  assert.doesNotMatch(schema, /whatsapp_numero/i);
  assert.doesNotMatch(schema, /\b55\d{10,11}\b/);
});

test('rls: notificacao_config por usuario e drop do indice sem destinatario', () => {
  assert.match(rls, /drop policy if exists auth_config on public\.notificacao_config/i);
  assert.match(rls, /for insert with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(rls, /for select using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(rls, /drop index if exists public\.unique_lembrete_envio/i);
});

test('funcoes: destinatarios, momento (janela 07:30-21:00), devidos, resumo_usuario + grants fechados', () => {
  assert.match(dest, /function public\.agenda_destinatarios\(p_tarefa_id uuid\)/i);
  assert.match(dest, /function public\.agenda_momento_lembrete\(p_vencimento timestamptz, p_dia_inteiro boolean, p_minutos integer\)/i);
  assert.match(dest, /time '07:30'/);
  assert.match(dest, /time '21:00'/);
  assert.match(dest, /function public\.agenda_lembretes_devidos\(p_ate timestamptz\)/i);
  assert.match(dest, /function public\.agenda_resumo_usuario\(p_user_id uuid, p_data date, p_dias integer/i);
  for (const fn of ['agenda_destinatarios(uuid)', 'agenda_momento_lembrete(timestamptz, boolean, integer)', 'agenda_lembretes_devidos(timestamptz)', 'agenda_resumo_usuario(uuid, date, integer)']) {
    const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(dest, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`, 'i'), fn);
    assert.match(dest, new RegExp(`grant execute on function public\\.${esc} to service_role`, 'i'), fn);
  }
  // p_ate e horizonte de momento: o corte alarga pelo offset efetivo da linha (achado #1 da revisao).
  assert.match(devidosFix, /vencimento_em <= p_ate \+ coalesce\(t\.lembrete_minutos\[1\], nc\.lembrete_padrao_minutos, 30\) \* interval '1 minute'/i);
  assert.match(devidosFix, /revoke all on function public\.agenda_lembretes_devidos\(timestamptz\) from public, anon, authenticated/i);
  assert.match(devidosFix, /grant execute on function public\.agenda_lembretes_devidos\(timestamptz\) to service_role/i);
});

test('sync: funcao, cron *\\/10, colunas de dono, orfa so por conta invalida, grants fechados', () => {
  assert.match(sync, /function public\.agenda_sync_contas_pagar\(\)/i);
  assert.match(sync, /function public\.agenda_brl\(p numeric\)\s+returns text language sql stable/i);
  assert.doesNotMatch(sync, /agenda_brl\(p numeric\)\s+returns text language sql immutable/i);
  assert.match(sync, /on conflict \(vinculo_tipo, vinculo_id\) do update set/i);
  assert.doesNotMatch(sync, /do update set[\s\S]*?responsavel_id\s*=/i);
  assert.doesNotMatch(sync, /do update set[\s\S]*?parent_id\s*=/i);
  assert.match(sync, /c\.status not in \('cancelado','finalizado'\)/i);
  assert.match(sync, /'agenda-sync-contas-10min'/);
  assert.match(sync, /'\*\/10 \* \* \* \*'/);
  assert.match(sync, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
  assert.match(sync, /grant execute on function public\.agenda_sync_contas_pagar\(\) to service_role/i);
  // v2 (revisao): orfa com filha ativa preservada, cron preserva estado.
  assert.match(syncV2, /and not exists \(select 1 from public\.tarefas f where f\.parent_id = t\.id and f\.status in \('pendente','em_andamento','adiada'\)\)/i);
  assert.match(syncV2, /cron\.alter_job\(job_id := jid, active := coalesce\(v_ativo_antes, false\)\)/i);
  assert.doesNotMatch(syncV2, /do update set[\s\S]*?responsavel_id\s*=/i);
  assert.match(syncV2, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
  // v3 (R13): data_conclusao = data de calendario UTC do pagamento, ao meio-dia SP.
  assert.match(syncV3, /coalesce\(\(data_pagamento at time zone 'UTC'\)::date,\s*\(now\(\) at time zone 'America\/Sao_Paulo'\)::date\)::timestamp \+ time '12:00'\) at time zone 'America\/Sao_Paulo'/i);
  assert.match(syncV3, /and not exists \(select 1 from public\.tarefas f where f\.parent_id = t\.id and f\.status in \('pendente','em_andamento','adiada'\)\)/i);
  assert.match(syncV3, /revoke all on function public\.agenda_sync_contas_pagar\(\) from public, anon, authenticated/i);
});

test('fuso: nenhuma funcao agenda_% usa current_date ou now()::date', () => {
  assert.doesNotMatch(todos, /\bcurrent_date\b/i);
  assert.doesNotMatch(todos, /now\(\)::date/i);
  assert.match(todos, /at time zone 'America\/Sao_Paulo'/);
});

test('arquivos existem', () => {
  for (const [nome, txt] of Object.entries({ schema, rls, dest, sync })) assert.ok(txt.length > 0, `${nome} vazio/ausente`);
});
