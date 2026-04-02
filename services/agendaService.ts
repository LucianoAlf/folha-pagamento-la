import { supabase } from './supabase';
import type {
  NotaRapida,
  NotificacaoConfig,
  AgendaKanbanConfigRow,
  AgendaKanbanColumnConfig,
  Tarefa,
  TarefaLista,
  TarefaSubtarefa,
  TarefaTemplate,
} from '../types/agenda';

// =============================================
// LISTAS
// =============================================

export async function fetchListas(): Promise<TarefaLista[]> {
  const { data, error } = await supabase.from('tarefas_listas').select('*').order('ordem');
  if (error) throw error;
  return (data || []) as TarefaLista[];
}

export async function createLista(lista: Partial<TarefaLista>): Promise<TarefaLista> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('tarefas_listas')
    .insert([{ ...lista, created_by: user.user?.id }])
    .select()
    .single();
  if (error) throw error;
  return data as TarefaLista;
}

export async function updateLista(id: string, updates: Partial<TarefaLista>): Promise<TarefaLista> {
  const { data, error } = await supabase
    .from('tarefas_listas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TarefaLista;
}

export async function deleteLista(id: string): Promise<void> {
  const { error } = await supabase.from('tarefas_listas').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// TAREFAS
// =============================================

export async function fetchTarefas(filtros?: {
  lista_id?: string | null;
  status?: Tarefa['status'];
  categoria?: Tarefa['categoria'];
  prioridade?: Tarefa['prioridade'];
  vencimento_inicio?: string; // ISO
  vencimento_fim?: string; // ISO
  includeConcluidas?: boolean;
}): Promise<Tarefa[]> {
  let query = supabase
    .from('tarefas')
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .order('ordem', { ascending: true })
    .order('vencimento_em', { ascending: true, nullsFirst: false });

  if (filtros?.lista_id) query = query.eq('lista_id', filtros.lista_id);
  if (filtros?.status) query = query.eq('status', filtros.status);
  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria);
  if (filtros?.prioridade) query = query.eq('prioridade', filtros.prioridade);
  if (filtros?.vencimento_inicio) query = query.gte('vencimento_em', filtros.vencimento_inicio);
  if (filtros?.vencimento_fim) query = query.lte('vencimento_em', filtros.vencimento_fim);

  if (!filtros?.includeConcluidas) {
    // Para incluir NULL no neq do PostgREST, precisamos ser explícitos ou garantir que o status seja sempre algo.
    // Aqui vamos usar uma abordagem segura: filtrar apenas o que NÃO queremos.
    query = query.or('status.is.null,status.not.in.(concluida,cancelada)');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Tarefa[];
}

export async function fetchTarefasHoje(): Promise<Tarefa[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const { data, error } = await supabase
    .from('tarefas')
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .gte('vencimento_em', hoje.toISOString())
    .lt('vencimento_em', amanha.toISOString())
    .or('status.is.null,status.not.in.(concluida,cancelada)')
    .order('vencimento_em', { ascending: true });

  if (error) throw error;
  return (data || []) as Tarefa[];
}

export async function fetchTarefasAtrasadas(): Promise<Tarefa[]> {
  const agoraISO = new Date().toISOString();

  const { data, error } = await supabase
    .from('tarefas')
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .lt('vencimento_em', agoraISO)
    .in('status', ['pendente', 'em_andamento'])
    .order('vencimento_em', { ascending: true });

  if (error) throw error;
  return (data || []) as Tarefa[];
}

export async function fetchTarefasImportantes(): Promise<Tarefa[]> {
  const { data, error } = await supabase
    .from('tarefas')
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .in('prioridade', ['alta', 'urgente'])
    .or('status.is.null,status.not.in.(concluida,cancelada)')
    .order('prioridade', { ascending: false })
    .order('vencimento_em', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data || []) as Tarefa[];
}

export async function createTarefa(tarefa: Partial<Tarefa>): Promise<Tarefa> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('tarefas')
    .insert([{ ...tarefa, created_by: user.user?.id }])
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .single();
  if (error) throw error;
  return data as Tarefa;
}

export async function createRhAgendaMirrorTask(payload: {
  titulo: string;
  descricao?: string | null;
  vencimento_em?: string | null;
  lista_id?: string | null;
  prioridade?: Tarefa['prioridade'];
  categoria?: Tarefa['categoria'];
  vinculo_tipo: 'rh_processo' | 'rh_etapa' | 'rh_pdi_checkpoint';
  vinculo_id: string;
  unidade?: Tarefa['unidade'];
  lembrete_minutos?: number[];
}): Promise<Tarefa> {
  return createTarefa({
    titulo: payload.titulo,
    descricao: payload.descricao || null,
    vencimento_em: payload.vencimento_em || null,
    lista_id: payload.lista_id || null,
    prioridade: payload.prioridade || 'media',
    categoria: payload.categoria || 'rh',
    vinculo_tipo: payload.vinculo_tipo,
    vinculo_id: payload.vinculo_id,
    unidade: payload.unidade || null,
    dia_inteiro: true,
    is_recorrente: false,
    lembrete_minutos: payload.lembrete_minutos || [],
    tags: ['rh'],
    status: 'pendente',
    ordem: 0,
  });
}

export async function updateTarefa(id: string, updates: Partial<Tarefa>): Promise<Tarefa> {
  const { data, error } = await supabase
    .from('tarefas')
    .update(updates)
    .eq('id', id)
    .select('*, lista:tarefas_listas(*), subtarefas:tarefas_subtarefas(*)')
    .single();
  if (error) throw error;
  return data as Tarefa;
}

export async function updateRhAgendaMirrorTask(id: string, updates: Partial<Tarefa>): Promise<Tarefa> {
  return updateTarefa(id, updates);
}

export async function concluirTarefa(id: string): Promise<Tarefa> {
  return updateTarefa(id, { status: 'concluida', data_conclusao: new Date().toISOString() });
}

export async function completeRhAgendaMirrorTask(id: string): Promise<Tarefa> {
  return concluirTarefa(id);
}

export async function reabrirTarefa(id: string): Promise<Tarefa> {
  return updateTarefa(id, { status: 'pendente', data_conclusao: null });
}

export async function deleteTarefa(id: string): Promise<void> {
  const { error } = await supabase.from('tarefas').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// SUBTAREFAS
// =============================================

export async function createSubtarefa(subtarefa: Partial<TarefaSubtarefa>): Promise<TarefaSubtarefa> {
  const { data, error } = await supabase.from('tarefas_subtarefas').insert([subtarefa]).select().single();
  if (error) throw error;
  return data as TarefaSubtarefa;
}

export async function toggleSubtarefa(id: string, concluida: boolean): Promise<TarefaSubtarefa> {
  const { data, error } = await supabase
    .from('tarefas_subtarefas')
    .update({ concluida })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TarefaSubtarefa;
}

export async function deleteSubtarefa(id: string): Promise<void> {
  const { error } = await supabase.from('tarefas_subtarefas').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// TEMPLATES
// =============================================

export async function fetchTemplates(): Promise<TarefaTemplate[]> {
  const { data, error } = await supabase.from('tarefas_templates').select('*').eq('ativo', true).order('ordem');
  if (error) throw error;
  return (data || []) as TarefaTemplate[];
}

export async function criarTarefaDoTemplate(
  template: TarefaTemplate,
  variaveis?: Record<string, string>,
  overrides?: Partial<Pick<Tarefa, 'lista_id' | 'categoria' | 'prioridade' | 'vencimento_em' | 'dia_inteiro'>>
): Promise<Tarefa> {
  let titulo = template.template?.titulo || template.nome;

  if (variaveis) {
    for (const [key, value] of Object.entries(variaveis)) {
      titulo = titulo.replaceAll(`{${key}}`, value);
    }
  }

  const novaTarefa = await createTarefa({
    titulo,
    lista_id: overrides?.lista_id ?? null,
    categoria: (overrides?.categoria as any) || (template.template?.categoria as any) || 'geral',
    prioridade: (overrides?.prioridade as any) || (template.template?.prioridade as any) || 'media',
    vencimento_em: overrides?.vencimento_em ?? null,
    dia_inteiro: overrides?.dia_inteiro ?? false,
  });

  const subtarefas = template.template?.subtarefas || [];
  for (let i = 0; i < subtarefas.length; i++) {
    await createSubtarefa({
      tarefa_id: novaTarefa.id,
      titulo: subtarefas[i],
      ordem: i,
    });
  }

  return novaTarefa;
}

// =============================================
// NOTAS RÁPIDAS
// =============================================

export async function fetchNotas(): Promise<NotaRapida[]> {
  const { data, error } = await supabase
    .from('notas_rapidas')
    .select('*')
    .order('fixada', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NotaRapida[];
}

export async function createNota(nota: Partial<NotaRapida>): Promise<NotaRapida> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('notas_rapidas')
    .insert([{ ...nota, created_by: user.user?.id }])
    .select()
    .single();
  if (error) throw error;
  return data as NotaRapida;
}

export async function updateNota(id: string, updates: Partial<NotaRapida>): Promise<NotaRapida> {
  const { data, error } = await supabase.from('notas_rapidas').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as NotaRapida;
}

export async function deleteNota(id: string): Promise<void> {
  const { error } = await supabase.from('notas_rapidas').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// CONFIGURAÇÕES
// =============================================

export async function fetchNotificacaoConfig(): Promise<NotificacaoConfig | null> {
  const { data, error } = await supabase.from('notificacao_config').select('*').maybeSingle();
  if (error) throw error;
  return (data || null) as NotificacaoConfig | null;
}

export async function upsertNotificacaoConfig(config: Partial<NotificacaoConfig>): Promise<NotificacaoConfig> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await supabase
    .from('notificacao_config')
    .upsert([{ ...config, user_id: user.user.id }])
    .select()
    .single();
  if (error) throw error;
  return data as NotificacaoConfig;
}

export async function fetchAgendaKanbanConfig(): Promise<AgendaKanbanConfigRow | null> {
  const { data, error } = await supabase.from('agenda_kanban_config').select('user_id,columns,updated_at').maybeSingle();
  if (error) throw error;
  return (data || null) as any;
}

export async function upsertAgendaKanbanConfig(columns: AgendaKanbanColumnConfig[]): Promise<AgendaKanbanConfigRow> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await supabase
    .from('agenda_kanban_config')
    .upsert([{ user_id: user.user.id, columns, updated_at: new Date().toISOString() }])
    .select('user_id,columns,updated_at')
    .single();

  if (error) throw error;
  return data as any;
}

// =============================================
// ESTATÍSTICAS
// =============================================

export async function fetchEstatisticasTarefas() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const fimSemana = new Date(hoje);
  fimSemana.setDate(fimSemana.getDate() + 7);

  const { data, error } = await supabase.from('tarefas').select('id, status, prioridade, vencimento_em');
  if (error) throw error;

  const rows = (data || []) as Array<{
    id: string;
    status: string | null;
    prioridade: string | null;
    vencimento_em: string | null;
  }>;

  const agoraISO = new Date().toISOString();
  const hojeISO = hoje.toISOString();
  const amanhaISO = amanha.toISOString();
  const fimSemanaISO = fimSemana.toISOString();

  const isActive = (s: string | null) => s !== 'concluida' && s !== 'cancelada';

  return {
    total: rows.length,
    pendentes: rows.filter((t) => t.status === 'pendente').length,
    concluidas: rows.filter((t) => t.status === 'concluida').length,
    hoje: rows.filter((t) => !!t.vencimento_em && t.vencimento_em >= hojeISO && t.vencimento_em < amanhaISO && isActive(t.status)).length,
    semana: rows.filter((t) => !!t.vencimento_em && t.vencimento_em >= hojeISO && t.vencimento_em < fimSemanaISO && isActive(t.status)).length,
    atrasadas: rows.filter((t) => !!t.vencimento_em && t.vencimento_em < agoraISO && isActive(t.status)).length,
    urgentes: rows.filter((t) => t.prioridade === 'urgente' && isActive(t.status)).length,
  };
}
