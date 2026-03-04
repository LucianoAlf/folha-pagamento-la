import { supabase } from './supabase';
import type { Aniversario } from '../types/aniversarios';
import {
  differenceInYears,
  differenceInCalendarDays,
  setYear,
  parseISO,
  startOfDay,
} from 'date-fns';

// =============================================
// HELPERS
// =============================================

/** Calcula idade e dias até o próximo aniversário */
function enrich(row: Aniversario): Aniversario {
  const hoje = startOfDay(new Date());
  const nasc = parseISO(row.data_nascimento);

  const idade = differenceInYears(hoje, nasc);

  let proximo = setYear(nasc, hoje.getFullYear());
  if (proximo < hoje) proximo = setYear(nasc, hoje.getFullYear() + 1);
  const dias = differenceInCalendarDays(proximo, hoje);

  return {
    ...row,
    _idade: idade,
    _proximoAniversario: proximo.toISOString().split('T')[0],
    _diasAteProximo: dias,
  };
}

// =============================================
// CRUD
// =============================================

export async function fetchAniversarios(): Promise<Aniversario[]> {
  const { data, error } = await supabase
    .from('aniversarios')
    .select('*')
    .order('data_nascimento');
  if (error) throw error;
  return (data || []).map(enrich);
}

export async function createAniversario(
  input: Pick<Aniversario, 'nome' | 'data_nascimento' | 'lembrete_tipo'> &
    Partial<Pick<Aniversario, 'notas' | 'lembrete_ativo' | 'colaborador_id' | 'tipo'>>
): Promise<Aniversario> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('aniversarios')
    .insert([{ ...input, created_by: user.user?.id }])
    .select()
    .single();
  if (error) throw error;
  return enrich(data as Aniversario);
}

export async function updateAniversario(
  id: string,
  updates: Partial<Aniversario>
): Promise<Aniversario> {
  const { data, error } = await supabase
    .from('aniversarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return enrich(data as Aniversario);
}

export async function deleteAniversario(id: string): Promise<void> {
  const { error } = await supabase.from('aniversarios').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAniversariosBulk(
  filtro?: 'todos' | 'colaborador' | 'manual'
): Promise<number> {
  let query = supabase.from('aniversarios').delete();
  if (filtro === 'colaborador') query = query.eq('tipo', 'colaborador');
  else if (filtro === 'manual') query = query.eq('tipo', 'manual');
  else query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // delete all (need a truthy filter)

  const { data, error } = await query.select('id');
  if (error) throw error;
  return data?.length || 0;
}

// =============================================
// QUERIES INTELIGENTES
// =============================================

export async function fetchAniversariosDoMes(month?: number): Promise<Aniversario[]> {
  const m = month ?? new Date().getMonth() + 1;
  const { data, error } = await supabase.rpc('get_aniversarios_do_mes', { mes: m }).select('*');
  // Fallback: se a RPC não existir, filtra client-side
  if (error) {
    const todos = await fetchAniversarios();
    return todos.filter((a) => {
      const nascMonth = parseISO(a.data_nascimento).getMonth() + 1;
      return nascMonth === m;
    });
  }
  return (data || []).map(enrich);
}

export async function fetchAniversariosHoje(): Promise<Aniversario[]> {
  const todos = await fetchAniversarios();
  return todos.filter((a) => a._diasAteProximo === 0);
}

// =============================================
// SYNC COM COLABORADORES
// =============================================

/** Preview: retorna quantos serão criados/atualizados sem executar */
export async function previewSyncFromColaboradores(): Promise<{ toCreate: number; toUpdate: number }> {
  const { colaboradores, existMap } = await _fetchSyncData();
  let toCreate = 0;
  let toUpdate = 0;
  for (const c of colaboradores) {
    if (!c.data_nascimento) continue;
    const existing = existMap.get(c.id);
    if (!existing) toCreate++;
    else if (existing.nome !== c.nome) toUpdate++;
  }
  return { toCreate, toUpdate };
}

async function _fetchSyncData() {
  const { data: colaboradores, error: errColab } = await supabase
    .from('colaboradores')
    .select('id, nome, data_nascimento')
    .eq('ativo', true)
    .not('data_nascimento', 'is', null);
  if (errColab) throw errColab;

  const { data: existentes, error: errAniv } = await supabase
    .from('aniversarios')
    .select('id, colaborador_id, nome')
    .eq('tipo', 'colaborador');
  if (errAniv) throw errAniv;

  const existMap = new Map((existentes || []).map((e: any) => [e.colaborador_id, e]));
  return { colaboradores: colaboradores || [], existMap };
}

export async function syncFromColaboradores(): Promise<{ created: number; updated: number }> {
  const { colaboradores, existMap } = await _fetchSyncData();

  const { data: user } = await supabase.auth.getUser();
  let created = 0;
  let updated = 0;

  for (const c of colaboradores) {
    if (!c.data_nascimento) continue;

    const existing = existMap.get(c.id);
    if (!existing) {
      // Criar novo
      const { error } = await supabase.from('aniversarios').insert([{
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        colaborador_id: c.id,
        tipo: 'colaborador',
        lembrete_tipo: 'anual',
        lembrete_ativo: true,
        created_by: user.user?.id,
      }]);
      if (!error) created++;
    } else if (existing.nome !== c.nome) {
      // Atualizar nome se mudou
      const { error } = await supabase
        .from('aniversarios')
        .update({ nome: c.nome })
        .eq('id', existing.id);
      if (!error) updated++;
    }
  }

  return { created, updated };
}
