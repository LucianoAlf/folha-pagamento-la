import { supabase } from './supabase';
import type {
  NotaRapida,
  NotificacaoConfig,
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
  const { data, error } = await supabase.from('tarefas_listas').insert([lista]).select().single();
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
    query = query.neq('status', 'concluida').neq('status', 'cancelada');
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
    .neq('status', 'concluida')
    .neq('status', 'cancelada')
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
    .neq('status', 'concluida')
    .neq('status', 'cancelada')
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

export async function concluirTarefa(id: string): Promise<Tarefa> {
  return updateTarefa(id, { status: 'concluida', data_conclusao: new Date().toISOString() });
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
  variaveis?: Record<string, string>
): Promise<Tarefa> {
  let titulo = template.template?.titulo || template.nome;

  if (variaveis) {
    for (const [key, value] of Object.entries(variaveis)) {
      titulo = titulo.replaceAll(`{${key}}`, value);
    }
  }

  const novaTarefa = await createTarefa({
    titulo,
    categoria: (template.template?.categoria as any) || 'geral',
    prioridade: (template.template?.prioridade as any) || 'media',
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

