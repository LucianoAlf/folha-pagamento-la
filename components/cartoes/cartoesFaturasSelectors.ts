import type {
  CartaoFaturaStatus,
  FinanceiroCartaoFatura,
  FinanceiroCartaoTransacao,
} from '../../types/cartoes';
import type { FinanceiroEmpresa } from '../../types/contasPagar';

export type FaturasFiltro = {
  cartaoId: string;
  empresaId: string;
  status: string;
  competencia: string;
};

export type FaturasResumo = {
  totalAberto: number;
  proximaFatura: FinanceiroCartaoFatura | null;
  porStatus: Record<CartaoFaturaStatus, number>;
};

const STATUS_FATURA: CartaoFaturaStatus[] = ['aberta', 'fechada', 'paga', 'cancelada'];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function attachClassificacaoResumo(
  faturas: FinanceiroCartaoFatura[],
  transacoes: FinanceiroCartaoTransacao[]
): FinanceiroCartaoFatura[] {
  const byFatura = new Map<string, FinanceiroCartaoTransacao[]>();
  transacoes.forEach((transacao) => {
    const list = byFatura.get(transacao.fatura_id) || [];
    list.push(transacao);
    byFatura.set(transacao.fatura_id, list);
  });

  return faturas.map((fatura) => {
    const itens = byFatura.get(fatura.id) || [];
    const confirmadas = itens.filter((item) => item.classificacao_status === 'confirmada').length;
    const sugeridas = itens.filter((item) => item.classificacao_status === 'sugerida').length;
    const pendentes = itens.filter((item) => item.classificacao_status !== 'confirmada' && item.classificacao_status !== 'sugerida').length;
    const total = itens.length;

    return {
      ...fatura,
      classificacao: {
        total,
        confirmadas,
        sugeridas,
        pendentes,
        percentualConfirmado: total > 0 ? Math.round((confirmadas / total) * 100) : 0,
      },
    };
  });
}

export function filterAndSortFaturas(
  faturas: FinanceiroCartaoFatura[],
  filtro: FaturasFiltro
): FinanceiroCartaoFatura[] {
  return faturas
    .filter((fatura) => filtro.cartaoId === 'all' || fatura.cartao_id === filtro.cartaoId)
    .filter((fatura) => filtro.empresaId === 'all' || fatura.cartao?.empresa_id === filtro.empresaId)
    .filter((fatura) => filtro.status === 'all' || fatura.status === filtro.status)
    .filter((fatura) => filtro.competencia === 'all' || fatura.competencia?.slice(0, 7) === filtro.competencia)
    .sort((a, b) => {
      const vencimento = String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''));
      if (vencimento !== 0) return vencimento;
      return String(a.cartao?.apelido || '').localeCompare(String(b.cartao?.apelido || ''));
    });
}

export function buildFaturasResumo(faturas: FinanceiroCartaoFatura[]): FaturasResumo {
  const porStatus = STATUS_FATURA.reduce<Record<CartaoFaturaStatus, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<CartaoFaturaStatus, number>);

  faturas.forEach((fatura) => {
    if (STATUS_FATURA.includes(fatura.status as CartaoFaturaStatus)) {
      porStatus[fatura.status as CartaoFaturaStatus] += 1;
    }
  });

  const abertas = faturas
    .filter((fatura) => fatura.status === 'aberta')
    .sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')));

  return {
    totalAberto: roundCurrency(abertas.reduce((sum, fatura) => sum + Number(fatura.valor_total || 0), 0)),
    proximaFatura: abertas[0] || null,
    porStatus,
  };
}

export function getCompetenciasOptions(faturas: FinanceiroCartaoFatura[]): string[] {
  return Array.from(
    new Set(
      faturas
        .map((fatura) => fatura.competencia?.slice(0, 7))
        .filter((competencia): competencia is string => Boolean(competencia))
    )
  ).sort();
}

export function getTransacoesDaFatura(
  transacoes: FinanceiroCartaoTransacao[],
  faturaId: string
): FinanceiroCartaoTransacao[] {
  return transacoes
    .filter((transacao) => transacao.fatura_id === faturaId)
    .sort((a, b) => {
      const data = String(a.data_compra || '').localeCompare(String(b.data_compra || ''));
      if (data !== 0) return data;
      return String(a.descricao || '').localeCompare(String(b.descricao || ''));
    });
}

export function isFaturaClassificacaoBloqueada(
  fatura: Pick<FinanceiroCartaoFatura, 'status'>
): boolean {
  return fatura.status === 'cancelada';
}

export function getCentroCustoIdDaEmpresa(
  empresas: Pick<FinanceiroEmpresa, 'id' | 'unidade_id'>[],
  empresaId: string | null | undefined
): string {
  if (!empresaId) return '';
  return empresas.find((empresa) => empresa.id === empresaId)?.unidade_id || '';
}

function isMariaValue(value: string | null | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'maria';
}

export function hasAutoriaMaria(
  transacao: Pick<FinanceiroCartaoTransacao, 'ator_tipo' | 'fonte_tipo' | 'classificado_por'>,
  escopo: 'lancamento' | 'classificacao'
): boolean {
  if (escopo === 'classificacao') return isMariaValue(transacao.classificado_por);
  return isMariaValue(transacao.ator_tipo) || isMariaValue(transacao.fonte_tipo);
}
