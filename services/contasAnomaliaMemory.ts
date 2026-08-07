import { supabase } from './supabase.ts';
import {
  MAX_HUMAN_NOTE_LENGTH,
  normalizeMemoryStatus,
  type MemoryStatus,
} from '../shared/contasVariationMemory.ts';

export type ContasAnomaliaNotaStatus = MemoryStatus;

export type ContasAnomaliaNota = {
  id: string;
  competencia_ym: string;
  unidade: string;
  anomaly_key: string;
  conta_id: string | null;
  recorrente_modelo_id: string | null;
  plano_conta_id: string | null;
  nota: string;
  status: ContasAnomaliaNotaStatus | null;
  updated_at: string;
};

const NOTE_SELECT = 'id,competencia_ym,unidade,anomaly_key,conta_id,recorrente_modelo_id,plano_conta_id,nota,status,updated_at';

type SupabaseLike = {
  auth: { getUser: () => Promise<{ data?: { user?: { id?: string | null } | null } }> };
  from: (table: string) => any;
};

export function createContasAnomaliaMemoryApi(client: SupabaseLike = supabase) {
  async function fetchContasAnomaliaNotas(competenciaYM: string, unidade: string): Promise<Record<string, ContasAnomaliaNota>> {
    let query = client
      .from('contas_anomalia_notas')
      .select(NOTE_SELECT)
      .eq('competencia_ym', competenciaYM);
    if (unidade !== 'todas') query = query.eq('unidade', unidade);
    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;
    const result: Record<string, ContasAnomaliaNota> = {};
    for (const row of data || []) {
      const note = { ...row, status: normalizeMemoryStatus(row.status) } as ContasAnomaliaNota;
      // Consolidado can contain the same anomaly key for multiple units. Keep
      // a composite alias so one row never hides another in the page cache.
      const compositeKey = `${note.unidade}|${note.anomaly_key}`;
      result[compositeKey] = note;
      if (unidade !== 'todas' || !result[note.anomaly_key]) result[note.anomaly_key] = note;
    }
    return result;
  }

  async function upsertContasAnomaliaNota(input: {
    competenciaYM: string;
    unidade: string;
    anomalyKey: string;
    contaId: string | null;
    recorrenteModeloId: string | null;
    planoContaId: string | null;
    nota: string;
    status: ContasAnomaliaNotaStatus | null;
  }): Promise<ContasAnomaliaNota> {
    if (input.nota.length > MAX_HUMAN_NOTE_LENGTH) {
      throw new Error('A justificativa pode ter no máximo 2.000 caracteres.');
    }
    const { data: userData } = await client.auth.getUser();
    const { data, error } = await client
      .from('contas_anomalia_notas')
      .upsert({
        competencia_ym: input.competenciaYM,
        unidade: input.unidade,
        anomaly_key: input.anomalyKey,
        conta_id: input.contaId,
        recorrente_modelo_id: input.recorrenteModeloId,
        plano_conta_id: input.planoContaId,
        nota: input.nota,
        status: input.status,
        created_by: userData?.user?.id || null,
      }, { onConflict: 'competencia_ym,unidade,anomaly_key' })
      .select(NOTE_SELECT)
      .single();
    if (error) throw error;
    return { ...data, status: normalizeMemoryStatus(data.status) } as ContasAnomaliaNota;
  }

  return { fetchContasAnomaliaNotas, upsertContasAnomaliaNota };
}

export const { fetchContasAnomaliaNotas, upsertContasAnomaliaNota } = createContasAnomaliaMemoryApi();
