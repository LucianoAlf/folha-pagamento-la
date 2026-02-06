import { supabase } from './supabase';
import { createLista } from './agendaService';
import type { NotificacaoConfig, Tarefa, TarefaLista } from '../types/agenda';

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
  // Converte yyyy-mm-dd + hh:mm em ISO (UTC) respeitando timezone local do navegador.
  return new Date(`${dateYmd}T${time}:00`).toISOString();
}

function diffDays(fromYmd: string, toYmd: string) {
  const a = new Date(`${fromYmd}T00:00:00`);
  const b = new Date(`${toYmd}T00:00:00`);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabelPt(ano: number, mes: number) {
  const names = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];
  const idx = Math.max(1, Math.min(12, mes)) - 1;
  return `${names[idx]}/${ano}`;
}

async function fetchNotificacaoConfigSafe(): Promise<NotificacaoConfig | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    const uid = user.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from('notificacao_config')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) return null;
    return (data || null) as any;
  } catch {
    return null;
  }
}

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

async function fetchExistingLinkedTasks(input: {
  vinculo_tipo: NonNullable<Tarefa['vinculo_tipo']>;
  vinculo_ids: string[];
}): Promise<Array<Pick<Tarefa, 'id' | 'vinculo_id' | 'vinculo_tipo' | 'status' | 'lista_id'>>> {
  const ids = (input.vinculo_ids || []).filter(Boolean);
  if (!ids.length) return [];

  const out: Array<Pick<Tarefa, 'id' | 'vinculo_id' | 'vinculo_tipo' | 'status' | 'lista_id'>> = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from('tarefas')
      .select('id,vinculo_id,vinculo_tipo,status,lista_id')
      .eq('vinculo_tipo', input.vinculo_tipo)
      .in('vinculo_id', part);
    if (error) throw error;
    out.push(...(((data || []) as any) ?? []));
  }
  return out;
}

async function syncContasAsAgendaTasks(input: { listaFinanceiroId: string; cfg: NotificacaoConfig | null }) {
  const hoje = todayYmd();

  // Janela: atrasadas recentes (até -90d) + futuras (até +45d)
  const start = new Date(`${hoje}T00:00:00`);
  start.setDate(start.getDate() - 90);
  const end = new Date(`${hoje}T00:00:00`);
  end.setDate(end.getDate() + 45);

  const startYmd = start.toISOString().slice(0, 10);
  const endYmd = end.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('contas_pagar')
    .select('id,descricao,unidade,valor,data_vencimento,status,data_pagamento,metodo_pagamento,categoria:categorias_despesa(nome)')
    .neq('status', 'cancelado')
    .gte('data_vencimento', startYmd)
    .lte('data_vencimento', endYmd)
    .order('data_vencimento', { ascending: true });
  if (error) throw error;

  const contas = (data || []) as ContaPagarRow[];
  if (!contas.length) return;

  const contaIds = contas.map((c) => c.id);
  const existing = await fetchExistingLinkedTasks({ vinculo_tipo: 'conta_pagar', vinculo_ids: contaIds });
  const byVinculo = new Map(existing.map((t) => [String(t.vinculo_id), t]));

  const { data: user } = await supabase.auth.getUser();
  const createdBy = user.user?.id ?? null;

  const inserts: Partial<Tarefa>[] = [];
  const updates: Array<Partial<Tarefa> & { id: string }> = [];

  for (const c of contas) {
    const due = c.data_vencimento;
    const d = diffDays(hoje, due); // >0 futuro, 0 hoje, <0 vencida

    // Prioridade automática simples
    const prioridade: Tarefa['prioridade'] =
      c.status === 'pago' ? 'baixa' : d < 0 ? 'urgente' : d === 0 ? 'alta' : d <= 3 ? 'media' : 'baixa';

    // Se o usuário desligar alertas futuros, ainda queremos atrasadas + hoje.
    const allowFuture =
      (input.cfg?.contas_alerta_3d ?? true) || (input.cfg?.contas_alerta_1d ?? true) || (input.cfg?.contas_alerta_no_dia ?? true);
    if (!allowFuture && d > 0) continue;

    const status: Tarefa['status'] = c.status === 'pago' ? 'concluida' : 'pendente';
    const dataConclusao = c.status === 'pago' ? (c.data_pagamento ? toDueISO(c.data_pagamento, '12:00') : new Date().toISOString()) : null;

    const titulo = `Pagar: ${c.descricao}`;
    const descParts = [
      c.categoria?.nome ? `Categoria: ${c.categoria.nome}` : null,
      `Valor: ${brl(Number(c.valor) || 0)}`,
      c.unidade ? `Unidade: ${String(c.unidade).toUpperCase()}` : null,
      c.metodo_pagamento ? `Método: ${c.metodo_pagamento}` : null,
      '',
      'Origem: Contas a Pagar (tarefa automática)',
    ].filter(Boolean);

    const patch: Partial<Tarefa> = {
      titulo,
      descricao: descParts.join('\n'),
      lista_id: input.listaFinanceiroId,
      categoria: 'financeiro',
      prioridade,
      tags: ['contas-a-pagar', 'auto'],
      unidade: (c.unidade as any) || null,
      vencimento_em: toDueISO(due, (input.cfg?.contas_alerta_hora || '09:00').slice(0, 5)),
      dia_inteiro: true,
      status,
      data_conclusao: dataConclusao,
      vinculo_tipo: 'conta_pagar',
      vinculo_id: c.id,
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
      created_by: createdBy as any,
    };

    const found = byVinculo.get(c.id);
    if (!found) inserts.push({ ...patch, ordem: 10 } as any);
    else updates.push({ id: found.id, ...patch } as any);
  }

  if (inserts.length) {
    const { error: insErr } = await supabase.from('tarefas').insert(inserts);
    if (insErr) throw insErr;
  }

  // Atualizações: por simplicidade, upsert por id (evita N updates)
  if (updates.length) {
    const { error: upErr } = await supabase.from('tarefas').upsert(updates, { onConflict: 'id' });
    if (upErr) throw upErr;
  }
}

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
  if (error) throw error;

  const folhas = (data || []) as FolhaRow[];
  if (!folhas.length) return;

  const latest = folhas[0];
  const pending = folhas.filter((f) => f.status === 'pendente');

  const vinculos: string[] = [];
  if (latest?.id) vinculos.push(String(latest.id));
  for (const f of pending) vinculos.push(String(f.id));
  const existing = await fetchExistingLinkedTasks({ vinculo_tipo: 'folha_pagamento', vinculo_ids: vinculos });
  const byVinculo = new Map(existing.map((t) => [String(t.vinculo_id), t]));

  const { data: user } = await supabase.auth.getUser();
  const createdBy = user.user?.id ?? null;

  const inserts: Partial<Tarefa>[] = [];
  const updates: Array<Partial<Tarefa> & { id: string }> = [];

  // 1) Fechamento do mês (tarefa planejada)
  if (fechamentoAtivo && latest?.id) {
    const mm = String(latest.mes).padStart(2, '0');
    const dd = String(Math.min(28, Math.max(1, fechamentoDia))).padStart(2, '0');
    const dueYmd = `${latest.ano}-${mm}-${dd}`;

    const titulo = `Fechar Folha: ${monthLabelPt(latest.ano, latest.mes)}`;
    const patch: Partial<Tarefa> = {
      titulo,
      descricao: `Origem: Folha de Pagamento (tarefa automática)\nStatus atual: ${String(latest.status)}`,
      lista_id: input.listaRhId,
      categoria: 'rh',
      prioridade: 'alta',
      tags: ['folha', 'auto'],
      vencimento_em: toDueISO(dueYmd, '09:00'),
      dia_inteiro: true,
      status: latest.status === 'aprovada' ? 'concluida' : 'pendente',
      data_conclusao: latest.status === 'aprovada' ? new Date().toISOString() : null,
      vinculo_tipo: 'folha_pagamento',
      vinculo_id: String(latest.id),
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
      created_by: createdBy as any,
      ordem: 20,
    };

    const found = byVinculo.get(String(latest.id));
    if (!found) inserts.push(patch as any);
    else updates.push({ id: found.id, ...patch } as any);
  }

  // 2) Aprovação pendente (se existir)
  for (const f of pending) {
    const titulo = `Aprovar Folha: ${monthLabelPt(f.ano, f.mes)}`;
    const patch: Partial<Tarefa> = {
      titulo,
      descricao: `Origem: Folha de Pagamento (tarefa automática)\nStatus atual: ${String(f.status)}`,
      lista_id: input.listaRhId,
      categoria: 'rh',
      prioridade: 'urgente',
      tags: ['folha', 'auto'],
      vencimento_em: new Date().toISOString(), // aparece no Meu Dia
      dia_inteiro: false,
      status: f.status === 'aprovada' ? 'concluida' : 'pendente',
      data_conclusao: f.status === 'aprovada' ? new Date().toISOString() : null,
      vinculo_tipo: 'folha_pagamento',
      vinculo_id: String(f.id),
      lembrete_minutos: [30],
      is_recorrente: false,
      recorrencia: null,
      recorrencia_pai_id: null,
      created_by: createdBy as any,
      ordem: 10,
    };

    const found = byVinculo.get(String(f.id));
    if (!found) inserts.push(patch as any);
    else updates.push({ id: found.id, ...patch } as any);
  }

  if (inserts.length) {
    const { error: insErr } = await supabase.from('tarefas').insert(inserts);
    if (insErr) throw insErr;
  }

  if (updates.length) {
    const { error: upErr } = await supabase.from('tarefas').upsert(updates, { onConflict: 'id' });
    if (upErr) throw upErr;
  }
}

/**
 * Sincroniza integrações premium da Agenda:
 * - Contas a Pagar → tarefas na lista "Financeiro"
 * - Folha → tarefas na lista "RH"
 *
 * Importante: idempotente por busca prévia (vinculo_tipo/vinculo_id).
 */
export async function syncAgendaIntegrations(): Promise<void> {
  // Se não tiver sessão, não tenta (evita erros barulhentos no boot)
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) return;

  const cfg = await fetchNotificacaoConfigSafe();

  const { data: listasData, error: listasErr } = await supabase
    .from('tarefas_listas')
    .select('*')
    .order('ordem', { ascending: true });
  if (listasErr) throw listasErr;

  const listas = (listasData || []) as TarefaLista[];

  const financeiro = await ensureListByName({
    listas,
    nome: 'Financeiro',
    icone: '💰',
    cor: '#8b5cf6',
  });

  // Se criamos a lista, recarrega para não ficar com cache mental ruim.
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

  await Promise.all([
    syncContasAsAgendaTasks({ listaFinanceiroId: financeiro.id, cfg }),
    syncFolhaAsAgendaTasks({ listaRhId: rh.id, cfg }),
  ]);
}

