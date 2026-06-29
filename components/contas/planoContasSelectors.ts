import type { CentroCusto, FinanceiroEmpresa, PlanoConta } from '../../types/contasPagar.ts';

export type UnidadeContaLegada = 'cg' | 'rec' | 'bar';
type PlanoContaSelecionavelInput = Pick<PlanoConta, 'ativo' | 'natureza' | 'nivel'> & Partial<PlanoConta>;
type PlanoContaLabelInput = Pick<PlanoConta, 'codigo' | 'nome'> & Partial<PlanoConta>;
type PlanoContaSearchInput = Pick<PlanoConta, 'codigo' | 'nome'> & Partial<PlanoConta>;
type CentroCustoCodigoInput = Pick<CentroCusto, 'codigo'> & Partial<CentroCusto>;
type PlanoContaParentInput = Pick<PlanoConta, 'id' | 'nome' | 'nivel'> & Partial<PlanoConta>;
type ContaPlanoDisplayInput = {
  descricao?: string | null;
  unidade?: string | null;
  plano_conta?: PlanoContaLabelInput | null;
  centro_custo?: (Partial<CentroCusto> & { nome?: string | null }) | null;
  empresa?: (Partial<FinanceiroEmpresa> & { label_operacional?: string | null }) | null;
  tipo_lancamento?: string | null;
};

export type PlanoContaMaisUsadoInput = {
  plano_conta_id: string | null;
  total: number;
};

export type PlanoContaMaisUsadoResolved<T extends PlanoContaSelecionavelInput & PlanoContaSearchInput = PlanoConta> = {
  plano: T;
  total: number;
};

export type PlanoContaViewerTreeNode<T extends PlanoConta = PlanoConta> = {
  plano: T;
  children: PlanoContaViewerTreeNode<T>[];
};

export type PlanoContaViewerTree<T extends PlanoConta = PlanoConta> = {
  roots: PlanoContaViewerTreeNode<T>[];
  defaultExpandedIds: Set<string>;
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isCodigoPlanoSearch(query: string): boolean {
  return /^\d+(?:\.\d+)*$/.test(query);
}

function matchesCodigoPlano(codigo: string | null | undefined, query: string): boolean {
  const normalizedCodigo = normalizeSearch(codigo || '').replace(/\s+/g, '');
  const normalizedQuery = normalizeSearch(query).replace(/\s+/g, '');
  if (!normalizedCodigo || !isCodigoPlanoSearch(normalizedQuery)) return false;
  if (normalizedCodigo === normalizedQuery) return true;
  return normalizedCodigo.startsWith(`${normalizedQuery}.`);
}

export function isPlanoContaSelecionavel(plano: PlanoContaSelecionavelInput): boolean {
  return plano.ativo === true && plano.natureza === 'saida' && plano.nivel === 3;
}

export function formatPlanoContaLabel(plano: PlanoContaLabelInput): string {
  return `${plano.codigo} ${plano.nome}`;
}

export function formatContaPlanoLabel(conta: ContaPlanoDisplayInput): string {
  if (conta.plano_conta) return formatPlanoContaLabel(conta.plano_conta);
  return 'Sem plano';
}

export function formatContaPlanoCodigo(conta: ContaPlanoDisplayInput): string {
  return conta.plano_conta?.codigo || 'Sem plano';
}

export function formatContaCentroCustoLabel(conta: ContaPlanoDisplayInput): string {
  if (conta.tipo_lancamento === 'eventual' && conta.empresa?.label_operacional) return conta.empresa.label_operacional;
  if (conta.centro_custo?.nome) return conta.centro_custo.nome;
  return (conta.unidade || 'todas').toUpperCase();
}

export function matchesPlanoContaSearch(
  plano: PlanoContaSearchInput,
  query: string
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (isCodigoPlanoSearch(q)) return matchesCodigoPlano(plano.codigo, q);
  return normalizeSearch(`${plano.codigo} ${plano.nome}`).includes(q);
}

export function matchesContaPlanoCentroSearch(conta: ContaPlanoDisplayInput, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (isCodigoPlanoSearch(q)) {
    if (matchesCodigoPlano(conta.plano_conta?.codigo, q)) return true;
    return normalizeSearch(
      [
        conta.descricao || '',
        conta.plano_conta?.nome || '',
        conta.empresa?.label_operacional || '',
        conta.centro_custo?.nome || '',
        conta.unidade || '',
      ].join(' ')
    ).includes(q);
  }

  return normalizeSearch(
    [
      conta.descricao || '',
      conta.plano_conta?.codigo || '',
      conta.plano_conta?.nome || '',
      conta.empresa?.label_operacional || '',
      conta.centro_custo?.nome || '',
      conta.unidade || '',
    ].join(' ')
  ).includes(q);
}

export function comparePlanoContaCodigo<T extends Pick<PlanoConta, 'codigo'>>(a: T, b: T): number {
  return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function clonePlanoContaNode<T extends PlanoConta>(node: PlanoContaViewerTreeNode<T>): PlanoContaViewerTreeNode<T> {
  return {
    plano: node.plano,
    children: node.children.map(clonePlanoContaNode),
  };
}

export function buildPlanoContaViewerTree<T extends PlanoConta>(
  planos: T[],
  query = ''
): PlanoContaViewerTree<T> {
  const nodes = planos
    .filter((plano) => plano.natureza === 'saida')
    .map((plano) => ({ plano, children: [] as PlanoContaViewerTreeNode<T>[] }));

  const byId = new Map(nodes.map((node) => [node.plano.id, node]));
  const roots: PlanoContaViewerTreeNode<T>[] = [];

  for (const node of nodes) {
    const parent = node.plano.parent_id ? byId.get(node.plano.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (items: PlanoContaViewerTreeNode<T>[]) => {
    items.sort((a, b) => comparePlanoContaCodigo(a.plano, b.plano));
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const filterNode = (node: PlanoContaViewerTreeNode<T>): PlanoContaViewerTreeNode<T> | null => {
    const matchesSelf = matchesPlanoContaSearch(node.plano, trimmedQuery);
    if (matchesSelf) return clonePlanoContaNode(node);

    const children = node.children
      .map(filterNode)
      .filter((child): child is PlanoContaViewerTreeNode<T> => Boolean(child));

    if (!children.length) return null;
    return { plano: node.plano, children };
  };

  const visibleRoots = hasQuery
    ? roots
        .map(filterNode)
        .filter((node): node is PlanoContaViewerTreeNode<T> => Boolean(node))
    : roots.map(clonePlanoContaNode);

  const defaultExpandedIds = new Set<string>();
  const collectExpanded = (node: PlanoContaViewerTreeNode<T>) => {
    if (hasQuery) {
      if (node.children.length > 0) defaultExpandedIds.add(node.plano.id);
    } else if (node.plano.nivel <= 2) {
      defaultExpandedIds.add(node.plano.id);
    }
    node.children.forEach(collectExpanded);
  };
  visibleRoots.forEach(collectExpanded);

  return { roots: visibleRoots, defaultExpandedIds };
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
