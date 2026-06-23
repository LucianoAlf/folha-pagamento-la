import { supabase } from './supabase';
import { createLista } from './agendaService';
import type { NotificacaoConfig, Tarefa, TarefaLista } from '../types/agenda';

/* ------------------------------------------------------------------ */
/* Tipos internos                                                      */
/* ------------------------------------------------------------------ */

type ContaPagarRow = {
  id: string;
  descricao: string;
  unidade: 'cg' | 'rec' | 'bar' | null;
  valor: number | null;
  data_vencimento: string; // yyyy-mm-dd
  status: 'pendente' | 'pago' | 'cancelado' | string;
  data_pagamento: string | null;
  metodo_pagamento: string | null;
  categoria?: { nome?: string | null } | null;
};

type FolhaRow = {
  id: number;
  ano: number;
  mes: number;
  status: 'rascunho' | 'pendente' | 'aprovada' | string;
  updated_at?: string | null;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fnv1a64(str: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

function hex64(n: bigint) {
  return n.toString(16).padStart(16, '0');
}

function stableUuidFromString(input: string) {
  const a = fnv1a64(input);
  const b = fnv1a64(input.split('').reverse().join(''));
  const hex = (hex64(a) + hex64(b)).slice(0, 32);
  const withVersion = hex.slice(0, 12) + '4' + hex.slice(13);
  const variantNibble = ((parseInt(withVersion.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  const withVariant = withVersion.slice(0, 16) + variantNibble + withVersion.slice(17);
  return `${withVariant.slice(0, 8)}-${withVariant.slice(8, 12)}-${withVariant.slice(12, 16)}-${withVariant.slice(16, 20)}-${withVariant.slice(20, 32)}`;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function brl(n: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  } catch {
    return `R$ ${Number(n || 0).toFixed(2)}`;
  }
}

function toDueISO(dateYmd: string, time = '09:00') {
  return new Date(`${dateYmd}T${time}:00`).toISOString();
}

function diffDays(fromYmd: string, toYmd: string) {
  const a = new Date(`${fromYmd}T00:00:00`);
  const b = new Date(`${toYmd}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabelPt(ano: number, mes: number) {
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Math.max(0, Math.min(11, mes - 1))]}/${ano}`;
}

/* ------------------------------------------------------------------ */
/* Notificacao config (safe)                                           */
/* ------------------------------------------------------------------ */

async function fetchNotificacaoConfigSafe(): Promise<NotificacaoConfig | null> {
  try {
    const { data, error } = await supabase.from('notificacao_config').select('*').maybeSingle();
    if (error) return null;
    return (data || null) as any;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Ensure list by name                                                 */
/* ------------------------------------------------------------------ */

async function ensureListByName(input: {
  listas: TarefaLista[];
  nome: string;
  icone: string;
  cor: string;
}): Promise<{ id: string; created: boolean }> {
  const target = (input.nome || '').trim().toLowerCase();
  const found = input.listas.find((l) => !l.is_smart && (l.nome || '').trim().toLowerCase() === target);
  if (found?.id) return { id: found.id, created: false };

  const maxOrder = (input.listas || []).reduce((acc, l) => Math.max(acc, Number(l.ordem || 0) || 0), 0);
  const created = await createLista({
    nome: input.nome,
    descricao: null,
    cor: input.cor,
    icone: input.icone,
    ordem: maxOrder + 10,
    is_smart: false,
    smart_filter: null,
    is_default: false,
  } as any);
  return { id: created.id, created: true };
}

/* ------------------------------------------------------------------ */
/* Fetch existing linked tasks                                         */
/* ------------------------------------------------------------------ */

async function fetchExistingLinkedTasks(input: {
  vinculo_tipo: NonNullable<Tarefa['vinculo_tipo']>;
  vinculo_ids: string[];
}): Promise<Array<Pick<Tarefa, 'id' | 'vinculo_id' | 'vinculo_tipo' | 'status' | 'lista_id' | 'created_at'>>> {
  const ids = (input.vinculo_ids || []).filter(Boolean);
  if (!ids.length) return [];

  const out: Array<Pick<Tarefa, 'id' | 'vinculo_id' | 'vinculo_tipo' | 'status' | 'lista_id' | 'created_at'>> = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from('tarefas')
      .select('id,vinculo_id,vinculo_tipo,status,lista_id,created_at')
      .eq('vinculo_tipo', input.vinculo_tipo)
      .in('vinculo_id', part);
    if (error) {
      console.warn('[agendaIntegrations] fetchExistingLinkedTasks error:', error.message);
      throw error;
    }
    out.push(...(((data || []) as any) ?? []));
  }
  return out;
}

/** Remove tarefas automáticas cuja conta foi excluída ou cancelada. */
async function cleanupOrphanContaTasks(listaFinanceiroId: string): Promise<number> {
  const { data: tasks, error } = await supabase
    .from('tarefas')
    .select('id, vinculo_id')
    .eq('lista_id', listaFinanceiroId)
    .eq('vinculo_tipo', 'conta_pagar')
    .not('vinculo_id', 'is', null);

  if (error) throw error;
  if (!tasks?.length) return 0;

  const vinculoIds = [...new Set(tasks.map((t) => String(t.vinculo_id)).filter(Boolean))];
  const validIds = new Set<string>();

  for (const part of chunk(vinculoIds, 100)) {
    const { data: contas, error: errContas } = await supabase
      .from('contas_pagar')
      .select('id, status')
      .in('id', part);
    if (errContas) throw errContas;
    for (const c of contas || []) {
      if (c.status !== 'cancelado' && c.status !== 'finalizado') {
        validIds.add(String(c.id));
      }
    }
  }

  const orphanIds = tasks
    .filter((t) => t.vinculo_id && !validIds.has(String(t.vinculo_id)))
    .map((t) => t.id);

  if (!orphanIds.length) return 0;

  for (const part of chunk(orphanIds, 100)) {
    const { error: delErr } = await supabase.from('tarefas').delete().in('id', part);
    if (delErr) throw delErr;
  }

  console.log('[agendaIntegrations] cleanupOrphanContaTasks: removed', orphanIds.length);
  return orphanIds.length;
}

/** Mantém 1 tarefa por conta (a mais recente) — evita duplicata na agenda. */
async function dedupeContaTasksByVinculo(listaFinanceiroId: string): Promise<number> {
  const { data: tasks, error } = await supabase
    .from('tarefas')
    .select('id, vinculo_id, created_at')
    .eq('lista_id', listaFinanceiroId)
    .eq('vinculo_tipo', 'conta_pagar')
    .not('vinculo_id', 'is', null);

  if (error) throw error;
  if (!tasks?.length) return 0;

  const byVinculo = new Map<string, Array<{ id: string; created_at: string }>>();
  for (const t of tasks) {
    const k = String(t.vinculo_id);
    const group = byVinculo.get(k) || [];
    group.push({ id: t.id, created_at: t.created_at });
    byVinculo.set(k, group);
  }

  const toDelete: string[] = [];
  for (const group of byVinculo.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    toDelete.push(...group.slice(1).map((t) => t.id));
  }

  if (!toDelete.length) return 0;

  for (const part of chunk(toDelete, 100)) {
    const { error: delErr } = await supabase.from('tarefas').delete().in('id', part);
    if (delErr) throw delErr;
  }

  console.log('[agendaIntegrations] dedupeContaTasksByVinculo: removed', toDelete.length);
  return toDelete.length;
}

function pickPrimaryLinkedTask(
  rows: Array<Pick<Tarefa, 'id' | 'vinculo_id' | 'created_at'>>
): Map<string, Pick<Tarefa, 'id' | 'vinculo_id' | 'created_at'>> {
  const byVinculo = new Map<string, Pick<Tarefa, 'id' | 'vinculo_id' | 'created_at'>>();
  for (const row of rows) {
    const k = String(row.vinculo_id);
    const prev = byVinculo.get(k);
    if (!prev || new Date(row.created_at || 0) > new Date(prev.created_at || 0)) {
      byVinculo.set(k, row);
    }
  }
  return byVinculo;
}

/* ------------------------------------------------------------------ */
/* SYNC: Contas a Pagar -> Agenda                                      */
/* ------------------------------------------------------------------ */

async function syncContasAsAgendaTasks(input: { listaFinanceiroId: string; cfg: NotificacaoConfig | null }) {
  const hoje = todayYmd();

  // Janela: atrasadas recentes (ate -90d) + futuras (ate +45d)
  const start = new Date(`${hoje}T00:00:00`);
  start.setDate(start.getDate() - 90);
  const end = new Date(`${hoje}T00:00:00`);
  end.setDate(end.getDate() + 45);

  const startYmd = start.toISOString().slice(0, 10);
  const endYmd = end.toISOString().slice(0, 10);

  console.log('[agendaIntegrations] syncContas: window', startYmd, '->', endYmd, 'listaId:', input.listaFinanceiroId);

  const { data, error } = await supabase
    .from('contas_pagar')
    .select('id,descricao,unidade,valor,data_vencimento,status,data_pagamento,metodo_pagamento,categoria:categorias_despesa(nome)')
    .neq('status', 'cancelado')
    .gte('data_vencimento', startYmd)
    .lte('data_vencimento', endYmd)
    .order('data_vencimento', { ascending: true });

  if (error) {
    console.warn('[agendaIntegrations] syncContas fetch error:', error.message);
    throw error;
  }

  const contas = (data || []) as ContaPagarRow[];
  console.log('[agendaIntegrations] syncContas: found', contas.length, 'contas in window');
  if (!contas.length) {
    await cleanupOrphanContaTasks(input.listaFinanceiroId);
    await dedupeContaTasksByVinculo(input.listaFinanceiroId);
    return;
  }

  const contaIds = contas.map((c) => c.id);
  const existing = await fetchExistingLinkedTasks({ vinculo_tipo: 'conta_pagar', vinculo_ids: contaIds });
  const byVinculo = pickPrimaryLinkedTask(existing);
  console.log('[agendaIntegrations] syncContas: existing linked tasks:', existing.length);

  const inserts: Record<string, any>[] = [];
  const updates: Array<Record<string, any> & { id: string }> = [];

  for (const c of contas) {
    const due = c.data_vencimento;
    const d = diffDays(hoje, due);

    const prioridade: Tarefa['prioridade'] =
      c.status === 'pago' ? 'baixa' : d < 0 ? 'urgente' : d === 0 ? 'alta' : d <= 3 ? 'media' : 'baixa';

    const status: Tarefa['status'] = c.status === 'pago' ? 'concluida' : 'pendente';
    const dataConclusao = c.status === 'pago' ? (c.data_pagamento ? toDueISO(c.data_pagamento.slice(0, 10), '12:00') : new Date().toISOString()) : null;

    const titulo = `Pagar: ${c.descricao}`;
    const descParts = [
      c.categoria?.nome ? `Categoria: ${c.categoria.nome}` : null,
      `Valor: ${brl(Number(c.valor) || 0)}`,
      c.unidade ? `Unidade: ${String(c.unidade).toUpperCase()}` : null,
      c.metodo_pagamento ? `Metodo: ${c.metodo_pagamento}` : null,
      '',
      'Origem: Contas a Pagar (tarefa automatica)',
    ].filter(Boolean);

    const patch: Record<string, any> = {
      titulo,
      descricao: descParts.join('\n'),
      lista_id: input.listaFinanceiroId,
      categoria: 'financeiro',
      prioridade,
      tags: ['contas-a-pagar', 'auto'],
      unidade: (c.unidade as any) || null,
      vencimento_em: toDueISO(due, '09:00'),
      dia_inteiro: true,
      status,
      data_conclusao: dataConclusao,
      vinculo_tipo: 'conta_pagar',
      vinculo_id: c.id,
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
    };

    const found = byVinculo.get(c.id);
    if (!found) {
      inserts.push({ ...patch, ordem: 10 });
    } else {
      updates.push({ id: found.id, ...patch });
    }
  }

  console.log('[agendaIntegrations] syncContas: inserts:', inserts.length, 'updates:', updates.length);

  if (inserts.length) {
    const { error: insErr } = await supabase.from('tarefas').insert(inserts);
    if (insErr) {
      console.error('[agendaIntegrations] syncContas INSERT error:', insErr.message, insErr.details, insErr.hint);
      throw insErr;
    }
    console.log('[agendaIntegrations] syncContas: inserted', inserts.length, 'tasks');
  }

  if (updates.length) {
    const { error: upErr } = await supabase.from('tarefas').upsert(updates, { onConflict: 'id' });
    if (upErr) {
      console.error('[agendaIntegrations] syncContas UPSERT error:', upErr.message, upErr.details, upErr.hint);
      throw upErr;
    }
    console.log('[agendaIntegrations] syncContas: updated', updates.length, 'tasks');
  }

  await cleanupOrphanContaTasks(input.listaFinanceiroId);
  await dedupeContaTasksByVinculo(input.listaFinanceiroId);
}

/* ------------------------------------------------------------------ */
/* SYNC: Folha -> Agenda                                               */
/* ------------------------------------------------------------------ */

async function syncFolhaAsAgendaTasks(input: { listaRhId: string; cfg: NotificacaoConfig | null }) {
  const cfg = input.cfg;
  const fechamentoAtivo = cfg?.folha_alerta_fechamento_ativo ?? true;
  const fechamentoDia = Number(cfg?.folha_alerta_fechamento_dia ?? 25) || 25;

  const { data, error } = await supabase
    .from('folhas_mensais')
    .select('id,ano,mes,status,updated_at')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(6);

  if (error) {
    console.warn('[agendaIntegrations] syncFolha fetch error:', error.message);
    throw error;
  }

  const folhas = (data || []) as FolhaRow[];
  if (!folhas.length) return;

  const latest = folhas[0];
  const pending = folhas.filter((f) => f.status === 'pendente');

  const vinculos: string[] = [];
  if (latest?.id) vinculos.push(stableUuidFromString(`folha:${latest.id}`));
  for (const f of pending) vinculos.push(stableUuidFromString(`folha:${f.id}`));
  const existing = await fetchExistingLinkedTasks({ vinculo_tipo: 'folha_pagamento', vinculo_ids: vinculos });
  const byVinculo = new Map(existing.map((t) => [String(t.vinculo_id), t]));

  const inserts: Record<string, any>[] = [];
  const updates: Array<Record<string, any> & { id: string }> = [];

  if (fechamentoAtivo && latest?.id) {
    const folhaVinculoId = stableUuidFromString(`folha:${latest.id}`);
    const mm = String(latest.mes).padStart(2, '0');
    const dd = String(Math.min(28, Math.max(1, fechamentoDia))).padStart(2, '0');
    const dueYmd = `${latest.ano}-${mm}-${dd}`;

    const titulo = `Fechar Folha: ${monthLabelPt(latest.ano, latest.mes)}`;
    const patch: Record<string, any> = {
      titulo,
      descricao: `Origem: Folha de Pagamento (tarefa automatica)\nFolha ID: ${latest.id}\nStatus atual: ${String(latest.status)}`,
      lista_id: input.listaRhId,
      categoria: 'rh',
      prioridade: 'alta',
      tags: ['folha', 'auto'],
      vencimento_em: toDueISO(dueYmd, '09:00'),
      dia_inteiro: true,
      status: latest.status === 'aprovada' ? 'concluida' : 'pendente',
      data_conclusao: latest.status === 'aprovada' ? new Date().toISOString() : null,
      vinculo_tipo: 'folha_pagamento',
      vinculo_id: folhaVinculoId,
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
      ordem: 20,
    };

    const found = byVinculo.get(String(folhaVinculoId));
    if (!found) inserts.push(patch);
    else updates.push({ id: found.id, ...patch });
  }

  for (const f of pending) {
    const folhaVinculoId = stableUuidFromString(`folha:${f.id}`);
    const titulo = `Aprovar Folha: ${monthLabelPt(f.ano, f.mes)}`;
    const patch: Record<string, any> = {
      titulo,
      descricao: `Origem: Folha de Pagamento (tarefa automatica)\nFolha ID: ${f.id}\nStatus atual: ${String(f.status)}`,
      lista_id: input.listaRhId,
      categoria: 'rh',
      prioridade: 'urgente',
      tags: ['folha', 'auto'],
      vencimento_em: new Date().toISOString(),
      dia_inteiro: false,
      status: f.status === 'aprovada' ? 'concluida' : 'pendente',
      data_conclusao: f.status === 'aprovada' ? new Date().toISOString() : null,
      vinculo_tipo: 'folha_pagamento',
      vinculo_id: folhaVinculoId,
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
      ordem: 10,
    };

    const found = byVinculo.get(String(folhaVinculoId));
    if (!found) inserts.push(patch);
    else updates.push({ id: found.id, ...patch });
  }

  if (inserts.length) {
    const { error: insErr } = await supabase.from('tarefas').insert(inserts);
    if (insErr) {
      console.error('[agendaIntegrations] syncFolha INSERT error:', insErr.message);
      throw insErr;
    }
  }

  if (updates.length) {
    const { error: upErr } = await supabase.from('tarefas').upsert(updates, { onConflict: 'id' });
    if (upErr) {
      console.error('[agendaIntegrations] syncFolha UPSERT error:', upErr.message);
      throw upErr;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entrada principal                                                   */
/* ------------------------------------------------------------------ */

export async function syncAgendaIntegrations(): Promise<void> {
  // Se nao tiver sessao, nao tenta (evita erros barulhentos no boot)
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    console.warn('[agendaIntegrations] No active session, skipping sync');
    return;
  }

  console.log('[agendaIntegrations] Starting sync...');

  const cfg = await fetchNotificacaoConfigSafe();

  const { data: listasData, error: listasErr } = await supabase
    .from('tarefas_listas')
    .select('*')
    .order('ordem', { ascending: true });

  if (listasErr) {
    console.error('[agendaIntegrations] Failed to fetch listas:', listasErr.message);
    throw listasErr;
  }

  const listas = (listasData || []) as TarefaLista[];

  const financeiro = await ensureListByName({
    listas,
    nome: 'Financeiro',
    icone: '💰',
    cor: '#8b5cf6',
  });

  const listas2 =
    financeiro.created
      ? (((await supabase.from('tarefas_listas').select('*').order('ordem')).data || []) as TarefaLista[])
      : listas;

  const rh = await ensureListByName({
    listas: listas2,
    nome: 'RH',
    icone: '👩‍💼',
    cor: '#a78bfa',
  });

  // Sync contas (nao deixa folha derrubar financeiro)
  try {
    await syncContasAsAgendaTasks({ listaFinanceiroId: financeiro.id, cfg });
  } catch (e: any) {
    console.error('[agendaIntegrations] syncContas FAILED:', e?.message || e);
  }

  try {
    await syncFolhaAsAgendaTasks({ listaRhId: rh.id, cfg });
  } catch (e: any) {
    console.error('[agendaIntegrations] syncFolha FAILED:', e?.message || e);
  }

  console.log('[agendaIntegrations] Sync complete');
}
