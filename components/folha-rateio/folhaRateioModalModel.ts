import type { CollaboratorDepartment } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';
import {
  RATEIO_COMPONENTES,
  type FolhaRateioComponentesCentavos,
  type FolhaRateioDraft,
  type FolhaRateioDraftCategoria,
  type RateioComponente,
} from './folhaRateioSelectors.ts';

export type FolhaRateioTotals = {
  sourceNetCentavos: number;
  distributedNetCentavos: number;
  differenceCentavos: number;
};

export type FolhaRateioSuggestion = {
  contaId: string;
  unidade: 'rec' | 'bar';
};

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBrlCents(centavos: number): string {
  return brlFormatter
    .format(centavos / 100)
    .replace(/[\u00a0\u202f]/g, ' ');
}

export function parseBrlCents(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s/g, '')
    .replace(/^(-?)R\$/i, '$1');

  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, decimalPart = ''] = unsigned.split(',');
  const whole = Number(wholePart.replace(/\./g, ''));
  const decimals = Number(decimalPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(decimals)) return null;

  const centavos = (whole * 100) + decimals;
  if (!Number.isSafeInteger(centavos)) return null;
  return negative ? -centavos : centavos;
}

function assertIntegerCentavos(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error('O valor precisa ser informado em centavos inteiros.');
  }
}

function cloneComponentes(
  componentes: FolhaRateioComponentesCentavos,
): FolhaRateioComponentesCentavos {
  return { ...componentes };
}

function emptyComponentes(): FolhaRateioComponentesCentavos {
  return {
    salario: 0,
    bonus: 0,
    comissao: 0,
    reembolso: 0,
    passagem: 0,
    inss: 0,
    descontos: 0,
  };
}

export function updateFolhaRateioCell(
  draft: FolhaRateioDraft,
  categoriaId: CollaboratorDepartment,
  contaId: string,
  componente: RateioComponente,
  centavos: number,
): FolhaRateioDraft {
  assertIntegerCentavos(centavos);
  const categoriaIndex = draft.categorias.findIndex(
    (categoria) => categoria.categoria === categoriaId,
  );
  if (categoriaIndex < 0) throw new Error('Categoria nao encontrada no rascunho.');

  const categoria = draft.categorias[categoriaIndex];
  const contaComponentes = categoria.porConta[contaId];
  if (!contaComponentes) throw new Error('Conta nao encontrada no rascunho.');

  const nextCategoria: FolhaRateioDraftCategoria = {
    ...categoria,
    porConta: {
      ...categoria.porConta,
      [contaId]: {
        ...contaComponentes,
        [componente]: centavos,
      },
    },
  };
  const categorias = [...draft.categorias];
  categorias[categoriaIndex] = nextCategoria;
  return { ...draft, categorias };
}

export function updateFolhaRateioAnchor(
  draft: FolhaRateioDraft,
  lancamentoId: number,
  contaId: string,
): FolhaRateioDraft {
  if (!Object.prototype.hasOwnProperty.call(draft.ancoras, lancamentoId)) {
    throw new Error('Fatia protegida nao encontrada no rascunho.');
  }
  if (contaId && !draft.contas.some((conta) => conta.id === contaId)) {
    throw new Error('Conta nao encontrada no rascunho.');
  }
  return {
    ...draft,
    ancoras: {
      ...draft.ancoras,
      [lancamentoId]: contaId,
    },
  };
}

export function getComponentRemainingCentavos(
  categoria: FolhaRateioDraftCategoria,
  componente: RateioComponente,
): number {
  const distributed = Object.values(categoria.porConta).reduce(
    (total, componentes) => total + componentes[componente],
    0,
  );
  return categoria.totais[componente] - distributed;
}

export function getActiveRateioComponents(
  categoria: FolhaRateioDraftCategoria,
): RateioComponente[] {
  return RATEIO_COMPONENTES.filter((componente) =>
    categoria.totais[componente] !== 0
    || Object.values(categoria.porConta).some(
      (componentes) => componentes[componente] !== 0,
    ));
}

export function getNetCentavos(
  componentes: FolhaRateioComponentesCentavos,
): number {
  return componentes.salario
    + componentes.bonus
    + componentes.comissao
    + componentes.reembolso
    + componentes.passagem
    - componentes.inss
    - componentes.descontos;
}

export function getCategoryDistributedNetCentavos(
  categoria: FolhaRateioDraftCategoria,
): number {
  return Object.values(categoria.porConta).reduce(
    (total, componentes) => total + getNetCentavos(componentes),
    0,
  );
}

export function getFolhaRateioTotals(draft: FolhaRateioDraft): FolhaRateioTotals {
  const sourceNetCentavos = draft.categorias.reduce(
    (total, categoria) => total + getNetCentavos(categoria.totais),
    0,
  );
  const distributedNetCentavos = draft.categorias.reduce(
    (total, categoria) => total + getCategoryDistributedNetCentavos(categoria),
    0,
  );
  return {
    sourceNetCentavos,
    distributedNetCentavos,
    differenceCentavos: sourceNetCentavos - distributedNetCentavos,
  };
}

export function getFolhaRateioSuggestion(
  draft: FolhaRateioDraft,
  categoriaId: CollaboratorDepartment,
): FolhaRateioSuggestion | null {
  const sources = draft.sourceSnapshot.filter(
    (source) => source.categoria === categoriaId,
  );
  if (
    sources.length === 0
    || sources.some((source) => Boolean(source.contaPagadoraId?.trim()))
  ) {
    return null;
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const lancamentos = draft.lancamentos.filter((item) => sourceIds.has(item.id));
  if (lancamentos.length !== sources.length) return null;
  const unidades = new Set(lancamentos.map((item) => item.unidade));
  if (unidades.size !== 1) return null;
  const [unidade] = unidades;
  if (unidade !== 'rec' && unidade !== 'bar') return null;

  const matchingAccounts = draft.contas.filter(
    (conta) => conta.empresa?.unidade?.codigo === unidade,
  );
  if (matchingAccounts.length !== 1) return null;
  return { contaId: matchingAccounts[0].id, unidade };
}

export function applyFolhaRateioSuggestion(
  draft: FolhaRateioDraft,
  categoriaId: CollaboratorDepartment,
  contaId: string,
): FolhaRateioDraft {
  const categoriaIndex = draft.categorias.findIndex(
    (categoria) => categoria.categoria === categoriaId,
  );
  if (categoriaIndex < 0) throw new Error('Categoria nao encontrada no rascunho.');

  const categoria = draft.categorias[categoriaIndex];
  if (!categoria.porConta[contaId]) throw new Error('Conta nao encontrada no rascunho.');
  const porConta = Object.fromEntries(
    Object.keys(categoria.porConta).map((currentContaId) => [
      currentContaId,
      currentContaId === contaId
        ? cloneComponentes(categoria.totais)
        : emptyComponentes(),
    ]),
  );
  const categorias = [...draft.categorias];
  categorias[categoriaIndex] = { ...categoria, porConta };
  return { ...draft, categorias };
}

export function getContaPagadoraLabel(conta: FolhaContaPagadora): string {
  const empresa = conta.empresa?.label_operacional?.trim()
    || conta.empresa?.nome_fantasia?.trim()
    || conta.empresa?.razao_social?.trim()
    || 'Empresa';
  const banco = conta.apelido?.trim() || conta.banco.trim() || 'Conta';
  const digits = conta.conta.replace(/\D/g, '');
  const final = digits ? `final ${digits.slice(-4)}` : conta.conta.trim();
  return [empresa, banco, final].filter(Boolean).join(' - ');
}
