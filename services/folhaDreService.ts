import { supabase } from './supabase';
import type { FolhaDreSnapshotRow } from '../components/bistro/folhaBistroModel';

export async function fetchFolhaDreSnapshot(folhaId: number): Promise<FolhaDreSnapshotRow[]> {
  const { data, error } = await supabase
    .from('vw_folha_dre_analitico')
    .select('lancamento_folha_id,colaborador_id,componente,tipo_efeito,valor_original,bistro_ref_ym')
    .eq('folha_id', folhaId);

  if (error) throw error;
  return (data || []) as FolhaDreSnapshotRow[];
}
