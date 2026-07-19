import { supabase } from './supabase.ts';
import type {
  DreConsulta,
  DreCursor,
  DreDetalhesPagina,
  DreFonte,
  DreRegime,
} from '../types/dre.ts';

export async function fetchDreConsulta(
  competencia: string,
  regime: DreRegime,
): Promise<DreConsulta> {
  const { data, error } = await supabase.rpc('dre_consultar', {
    p_competencia: competencia,
    p_regime: regime,
  });
  if (error) throw error;
  if (!data?.success) throw new Error('Nao foi possivel montar o DRE.');
  return data as DreConsulta;
}

export async function fetchDreDetalhes(args: {
  competencia: string;
  regime: DreRegime;
  planoCodigo?: string | null;
  fonte?: DreFonte | null;
  cursor?: DreCursor | null;
  limite?: number;
}): Promise<DreDetalhesPagina> {
  const cursor = args.cursor ?? null;
  const { data, error } = await supabase.rpc('dre_detalhes', {
    p_competencia: args.competencia,
    p_regime: args.regime,
    p_plano_codigo: args.planoCodigo ?? null,
    p_fonte: args.fonte ?? null,
    p_cursor: cursor,
    p_limite: args.limite ?? 50,
  });
  if (error) throw error;
  if (!data?.success) throw new Error('Nao foi possivel abrir os detalhes do DRE.');
  return data as DreDetalhesPagina;
}
