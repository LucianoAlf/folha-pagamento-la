import type { CentroCusto, PlanoConta } from '../../types/contasPagar.ts';

export type UnidadeContaLegada = 'cg' | 'rec' | 'bar';
type PlanoContaSelecionavelInput = Pick<PlanoConta, 'ativo' | 'natureza' | 'nivel'> & Partial<PlanoConta>;
type PlanoContaLabelInput = Pick<PlanoConta, 'codigo' | 'nome'> & Partial<PlanoConta>;
type PlanoContaSearchInput = Pick<PlanoConta, 'codigo' | 'nome'> & Partial<PlanoConta>;
type CentroCustoCodigoInput = Pick<CentroCusto, 'codigo'> & Partial<CentroCusto>;
type PlanoContaParentInput = Pick<PlanoConta, 'id' | 'nome' | 'nivel'> & Partial<PlanoConta>;

export type PlanoContaMaisUsadoInput = {
  plano_conta_id: string | null;
  total: number;
};

export type PlanoContaMaisUsadoResolved<T extends PlanoContaSelecionavelInput & PlanoContaSearchInput = PlanoConta> = {
  plano: T;
  total: number;
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isPlanoContaSelecionavel(plano: PlanoContaSelecionavelInput): boolean {
  return plano.ativo === true && plano.natureza === 'saida' && plano.nivel === 3;
}

export function formatPlanoContaLabel(plano: PlanoContaLabelInput): string {
  return `${plano.codigo} ${plano.nome}`;
}

export function matchesPlanoContaSearch(
  plano: PlanoContaSearchInput,
  query: string
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${plano.codigo} ${plano.nome}`).includes(q);
}

export function comparePlanoContaCodigo<T extends Pick<PlanoConta, 'codigo'>>(a: T, b: T): number {
  return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function filterSelectablePlanos<T extends PlanoContaSelecionavelInput & PlanoContaSearchInput>(
  planos: T[],
  query: string
): T[] {
  return planos
    .filter((plano) => isPlanoContaSelecionavel(plano))
    .filter((plano) => matchesPlanoContaSearch(plano, query))
    .sort(comparePlanoContaCodigo);
}

export function getPlanoContaParentName(
  plano: Pick<PlanoConta, 'parent_id'> & Partial<PlanoConta>,
  byId: Map<string, PlanoContaParentInput>
): string {
  let current = plano.parent_id ? byId.get(plano.parent_id) : undefined;
  while (current) {
    if (current.nivel === 2) return current.nome;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return '';
}

export function resolvePlanosMaisUsados<T extends PlanoContaSelecionavelInput & PlanoContaSearchInput>(
  planos: T[],
  usos: PlanoContaMaisUsadoInput[]
): PlanoContaMaisUsadoResolved<T>[] {
  const byId = new Map(planos.map((plano) => [plano.id, plano]));
  return usos.flatMap((uso) => {
    if (!uso.plano_conta_id) return [];
    const plano = byId.get(uso.plano_conta_id);
    if (!plano || !isPlanoContaSelecionavel(plano)) return [];
    return [{ plano, total: uso.total }];
  });
}

export function centroCustoToUnidade(centro?: CentroCustoCodigoInput | null): UnidadeContaLegada | null {
  if (centro?.codigo === 'cg' || centro?.codigo === 'rec' || centro?.codigo === 'bar') {
    return centro.codigo;
  }
  return null;
}
