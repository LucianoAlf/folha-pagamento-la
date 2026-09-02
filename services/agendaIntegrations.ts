import { supabase } from './supabase';
import { createLista } from './agendaService';
import type { NotificacaoConfig, Tarefa, TarefaLista } from '../types/agenda';

/* ------------------------------------------------------------------ */
/* Tipos internos                                                      */
/* ------------------------------------------------------------------ */

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

function toDueISO(dateYmd: string, time = '09:00') {
  return new Date(`${dateYmd}T${time}:00`).toISOString();
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
      // vencimento_em NAO entra no patch: so no insert. Se entrasse, todo load da Agenda reescrevia
      // o vencimento pra "agora", e com lembrete de 30 min a folha pendente virava ping por load (I-3).
      dia_inteiro: false,
      status: f.status === 'aprovada' ? 'concluida' : 'pendente',
      data_conclusao: f.status === 'aprovada' ? new Date().toISOString() : null,
      vinculo_tipo: 'folha_pagamento',
      vinculo_id: folhaVinculoId,
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
    };

    const found = byVinculo.get(String(folhaVinculoId));
    if (!found) inserts.push({ ...patch, vencimento_em: new Date().toISOString(), ordem: 10 });
    else updates.push({ id: found.id, ...patch });
  }

  if (inserts.length) {
    // upsert idempotente: dois loads simultaneos da Agenda corriam pro 23505 do tarefas_vinculo_uniq
    // (indice nao-parcial, o PostgREST infere o arbitro pelas colunas).
    const { error: insErr } = await supabase
      .from('tarefas')
      .upsert(inserts, { onConflict: 'vinculo_tipo,vinculo_id', ignoreDuplicates: true });
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

  console.log('[agendaIntegrations] Starting sync (Folha; contas a pagar sao espelhadas pelo cron agenda-sync-contas-10min)...');

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

  const rh = await ensureListByName({
    listas,
    nome: 'RH',
    icone: '👩‍💼',
    cor: '#a78bfa',
  });

  try {
    await syncFolhaAsAgendaTasks({ listaRhId: rh.id, cfg });
  } catch (e: any) {
    console.error('[agendaIntegrations] syncFolha FAILED:', e?.message || e);
  }

  console.log('[agendaIntegrations] Sync complete');
}
