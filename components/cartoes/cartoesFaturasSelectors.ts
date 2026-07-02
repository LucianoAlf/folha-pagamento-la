import type {
  CartaoTipoTransacao,
  CartaoFaturaStatus,
  FinanceiroCartaoFatura,
  FinanceiroCartaoTransacaoImportadaPayload,
  FinanceiroCartaoTransacao,
} from '../../types/cartoes';
import type { FinanceiroEmpresa, PlanoConta } from '../../types/contasPagar';
import { isPlanoContaSelecionavel } from '../contas/planoContasSelectors.ts';

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

export function getFaturaAcaoFechamento(
  fatura: Pick<FinanceiroCartaoFatura, 'status'>
): 'fechar' | 'reabrir' | null {
  if (fatura.status === 'aberta') return 'fechar';
  if (fatura.status === 'fechada') return 'reabrir';
  return null;
}

export function isCartaoFiscalCompletoParaFechar(
  fatura: Pick<FinanceiroCartaoFatura, 'cartao'>
): boolean {
  const cartao = fatura.cartao;
  return Boolean(cartao?.empresa_id && cartao?.conta_pagadora_id && cartao?.centro_custo_id);
}

export function getFaturaPendenciasClassificacao(
  fatura: Pick<FinanceiroCartaoFatura, 'classificacao'>
): number {
  const classificacao = fatura.classificacao;
  if (!classificacao) return 0;
  return Number(classificacao.pendentes || 0) + Number(classificacao.sugeridas || 0);
}

export type TransacaoImportadaInput = {
  fatura_id?: string | null;
  descricao: string;
  data_compra: string;
  valor: number | null;
  tipo_transacao?: CartaoTipoTransacao;
  estabelecimento?: string | null;
  observacoes?: string | null;
  is_parcela?: boolean;
  parcela_atual?: number | null;
  total_parcelas?: number | null;
  empresa_id?: string | null;
  centro_custo_id?: string | null;
  plano_conta_id?: string | null;
  plano_conta?: (Pick<PlanoConta, 'ativo' | 'natureza' | 'nivel'> & Partial<PlanoConta>) | null;
};

export type TransacaoImportadaClassificacaoState = 'pendente' | 'confirmada' | 'parcial';

export const TRANSACAO_IMPORTADA_CLASSIFICACAO_PARCIAL_MESSAGE =
  'Complete empresa e plano para classificar agora, ou deixe ambos em branco para adicionar como pendente.';

export function isFaturaImportacaoManualDisponivel(
  fatura: Pick<FinanceiroCartaoFatura, 'status'>
): boolean {
  return fatura.status === 'aberta';
}

export function getTransacaoImportadaClassificacaoState(
  input: Pick<
    TransacaoImportadaInput,
    'empresa_id' | 'centro_custo_id' | 'plano_conta_id' | 'plano_conta'
  >
): TransacaoImportadaClassificacaoState {
  const hasEmpresa = Boolean(String(input.empresa_id || '').trim());
  const hasCentro = Boolean(String(input.centro_custo_id || '').trim());
  const hasPlano = Boolean(String(input.plano_conta_id || '').trim());

  if (!hasEmpresa && !hasCentro && !hasPlano) return 'pendente';

  if (hasEmpresa && hasCentro && hasPlano && input.plano_conta && isPlanoContaSelecionavel(input.plano_conta)) {
    return 'confirmada';
  }

  return 'parcial';
}

export function validateTransacaoImportadaInput(input: TransacaoImportadaInput): string | null {
  if (!String(input.descricao || '').trim()) return 'Informe a descricao da transacao.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.data_compra || ''))) return 'Informe uma data valida.';
  if (input.valor == null || !Number.isFinite(input.valor) || input.valor === 0) {
    return 'Informe um valor diferente de zero.';
  }

  if (input.is_parcela) {
    const parcelaAtual = Number(input.parcela_atual || 0);
    const totalParcelas = Number(input.total_parcelas || 0);
    if (
      !Number.isInteger(parcelaAtual) ||
      !Number.isInteger(totalParcelas) ||
      parcelaAtual < 1 ||
      totalParcelas < 2 ||
      parcelaAtual > totalParcelas
    ) {
      return 'Informe parcelas no formato correto.';
    }
  }

  if (getTransacaoImportadaClassificacaoState(input) === 'parcial') {
    return TRANSACAO_IMPORTADA_CLASSIFICACAO_PARCIAL_MESSAGE;
  }

  return null;
}

export function buildTransacaoImportadaPayload(
  input: TransacaoImportadaInput,
  idExterno: string
): FinanceiroCartaoTransacaoImportadaPayload {
  const tipo = input.tipo_transacao || 'compra';
  const valorAbs = Math.abs(Number(input.valor || 0));
  const payload: FinanceiroCartaoTransacaoImportadaPayload = {
    fatura_id: String(input.fatura_id || ''),
    descricao: String(input.descricao || '').trim(),
    data_compra: input.data_compra,
    valor: tipo === 'estorno' ? -valorAbs : valorAbs,
    tipo_transacao: tipo,
    estabelecimento: input.estabelecimento?.trim() || null,
    id_externo: idExterno,
    observacoes: input.observacoes?.trim() || null,
    motivo: 'Importacao manual pelo app web.',
  };

  if (input.is_parcela) {
    payload.parcela_atual = Number(input.parcela_atual);
    payload.total_parcelas = Number(input.total_parcelas);
  }

  if (getTransacaoImportadaClassificacaoState(input) === 'confirmada') {
    payload.classificacao_status = 'confirmada';
    payload.empresa_id = input.empresa_id || null;
    payload.centro_custo_id = input.centro_custo_id || null;
    payload.plano_conta_id = input.plano_conta_id || null;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== '')
  ) as FinanceiroCartaoTransacaoImportadaPayload;
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
