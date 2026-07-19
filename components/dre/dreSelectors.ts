import type {
  DreConsulta,
  DreCoberturaFonte,
  DreModoVisual,
  DreReconciliacaoFonte,
} from '../../types/dre.ts';

export interface DreDisplayRow {
  codigo: string;
  nome: string;
  grupoCodigo: string;
  natureza: 'entrada' | 'saida';
  valorResultado: number;
  valorExibido: number;
  linhasClassificadas?: number;
}

export function getDreDisplayRows(
  dre: Pick<DreConsulta, 'grupos' | 'planos'>,
  modo: DreModoVisual,
): DreDisplayRow[] {
  if (modo === 'simples') {
    return dre.grupos.map((grupo) => ({
      codigo: grupo.codigo,
      nome: grupo.nome,
      grupoCodigo: grupo.codigo,
      natureza: grupo.codigo === '3' ? 'entrada' : 'saida',
      valorResultado: Number(grupo.valor_resultado || 0),
      valorExibido: Math.abs(Number(grupo.valor_resultado || 0)),
      linhasClassificadas: Number(grupo.linhas_classificadas || 0),
    }));
  }

  return dre.planos.map((plano) => ({
    codigo: plano.plano_codigo,
    nome: plano.plano_nome,
    grupoCodigo: plano.grupo_codigo,
    natureza: plano.natureza,
    valorResultado: Number(plano.valor_resultado || 0),
    valorExibido: Math.abs(Number(plano.valor_resultado || 0)),
  }));
}

export function buildDreCoverageMessage(cobertura: DreCoberturaFonte[]): string | null {
  const ausentes = cobertura
    .filter((item) => item.estado === 'sem_dados')
    .map((item) => item.label);

  if (ausentes.length === 0) return null;
  return `Sem dados aplicados: ${ausentes.join(', ')}.`;
}

export function buildDreReconciliationTotals(reconciliacao: DreReconciliacaoFonte[]) {
  return reconciliacao.reduce(
    (acc, item) => ({
      classificadoDre: acc.classificadoDre + Number(item.classificado_dre || 0),
      emRevisao: acc.emRevisao + Number(item.em_revisao || 0),
      semPlano: acc.semPlano + Number(item.sem_plano || 0),
      cancelado: acc.cancelado + Number(item.cancelado || 0),
      excluido: acc.excluido + Number(item.excluido || 0),
      totalOrigem: acc.totalOrigem + Number(item.total_origem || 0),
    }),
    {
      classificadoDre: 0,
      emRevisao: 0,
      semPlano: 0,
      cancelado: 0,
      excluido: 0,
      totalOrigem: 0,
    },
  );
}

export function getDreErrorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error ?? '');
  if (/dre_(consultar|detalhes)|schema cache|could not find the function/i.test(message)) {
    return 'A leitura da DRE ainda não está disponível neste ambiente.';
  }
  return 'Não foi possível carregar a DRE. Tente novamente.';
}
