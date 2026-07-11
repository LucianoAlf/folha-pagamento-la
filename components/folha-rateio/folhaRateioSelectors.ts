import type { CollaboratorDepartment, Lancamento } from '../../types.ts';
import type { FolhaContaPagadora, FolhaRateioFatiaInput } from '../../types/folhaRateio.ts';

export const RATEIO_COMPONENTES = [
  'salario',
  'bonus',
  'comissao',
  'reembolso',
  'passagem',
  'inss',
  'descontos',
] as const;

export type RateioComponente = (typeof RATEIO_COMPONENTES)[number];
export type FolhaRateioStatus = 'a_conciliar' | 'parcial' | 'conciliado';
export type FolhaRateioComponentesCentavos = Record<RateioComponente, number>;

export type FolhaRateioDraftCategoria = {
  categoria: CollaboratorDepartment;
  totais: FolhaRateioComponentesCentavos;
  porConta: Record<string, FolhaRateioComponentesCentavos>;
  sourceIds: number[];
};

export type FolhaRateioDraftProtegido = {
  lancamentoId: number;
  categoria: CollaboratorDepartment;
  label: string;
  linhaZerada: boolean;
};

export type FolhaRateioSourceSnapshotItem = Readonly<{
  id: number;
  folhaId: number;
  colaboradorId: number;
  categoria: CollaboratorDepartment;
  contaPagadoraId: string | null;
  componentesOriginais: Readonly<FolhaRateioComponentesCentavos>;
  componentesCentavos: Readonly<FolhaRateioComponentesCentavos>;
  protegido: boolean;
  linhaZerada: boolean;
}>;

export type FolhaRateioDraft = {
  folhaId: number;
  colaboradorId: number;
  contas: FolhaContaPagadora[];
  categorias: FolhaRateioDraftCategoria[];
  ancoras: Record<number, string>;
  protegidos: FolhaRateioDraftProtegido[];
  lancamentos: Lancamento[];
  readonly sourceSnapshot: readonly FolhaRateioSourceSnapshotItem[];
};

export type FolhaRateioDraftDifference = {
  categoria: CollaboratorDepartment;
  componente: RateioComponente;
  esperadoCentavos: number;
  alocadoCentavos: number;
  restanteCentavos: number;
};

export type FolhaRateioDraftProblemCode =
  | 'diferenca'
  | 'ancora_ausente'
  | 'conta_invalida'
  | 'ancora_protegida_duplicada'
  | 'ancora_sem_valores'
  | 'centavos_invalidos'
  | 'valor_negativo'
  | 'precisao_origem_invalida'
  | 'conta_duplicada'
  | 'matriz_conta_ausente'
  | 'matriz_conta_extra'
  | 'matriz_componentes_invalidos'
  | 'draft_vazio'
  | 'categoria_ausente'
  | 'categoria_extra'
  | 'categoria_duplicada'
  | 'totais_adulterados'
  | 'source_ids_adulterados'
  | 'valor_origem_negativo'
  | 'snapshot_identidade_invalida';

export type FolhaRateioDraftProblem = {
  codigo: FolhaRateioDraftProblemCode;
  mensagem: string;
  categoria?: CollaboratorDepartment;
  componente?: RateioComponente;
  lancamentoId?: number;
  contaId?: string;
};

export type FolhaRateioDraftValidation = {
  valid: boolean;
  diferencas: FolhaRateioDraftDifference[];
  problemas: FolhaRateioDraftProblem[];
  message?: string;
};

export type FolhaRateioPessoaCategoria = {
  categoria: CollaboratorDepartment;
  totalCentavos: number;
  componentesCentavos: FolhaRateioComponentesCentavos;
};

export type FolhaRateioPessoaConta = {
  contaId: string;
  nome: string;
  empresa: string;
  totalCentavos: number;
};

export type FolhaRateioPessoa = {
  colaboradorId: number;
  nome: string;
  funcao: string;
  totalCentavos: number;
  componentesCentavos: FolhaRateioComponentesCentavos;
  categorias: FolhaRateioPessoaCategoria[];
  contas: FolhaRateioPessoaConta[];
  status: FolhaRateioStatus;
  lancamentos: Lancamento[];
};

const CATEGORIAS_ORDEM: CollaboratorDepartment[] = [
  'staff_rateado',
  'equipe_operacional',
  'professores',
];

export function toCents(value: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;

  const scaledValue = numericValue * 100;
  const epsilon = Math.sign(scaledValue) * Number.EPSILON * Math.abs(scaledValue);
  return Math.round(scaledValue + epsilon);
}

export const fromCents = (value: number): number => value / 100;

export function hasProtectedRateioMetadata(lancamento: Lancamento): boolean {
  const hasDetalhamento = Boolean(
    lancamento.detalhamento && Object.keys(lancamento.detalhamento).length > 0,
  );
  const observacoes = (lancamento as Lancamento & { observacoes?: string | null }).observacoes;
  return hasDetalhamento
    || Boolean(lancamento.observacao?.trim())
    || Boolean(observacoes?.trim());
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

function addComponentes(
  target: FolhaRateioComponentesCentavos,
  lancamento: Lancamento,
): void {
  for (const componente of RATEIO_COMPONENTES) {
    target[componente] += toCents(lancamento[componente]);
  }
}

function addComponentesCentavos(
  target: FolhaRateioComponentesCentavos,
  source: Readonly<FolhaRateioComponentesCentavos>,
): void {
  for (const componente of RATEIO_COMPONENTES) {
    target[componente] += source[componente];
  }
}

function contaNome(conta: FolhaContaPagadora): string {
  return conta.apelido?.trim() || `${conta.banco} ${conta.conta}`.trim();
}

function empresaNome(conta: FolhaContaPagadora): string {
  const empresa = conta.empresa;
  return (
    empresa?.label_operacional?.trim()
    || empresa?.nome_fantasia?.trim()
    || empresa?.razao_social?.trim()
    || ''
  );
}

function isContaElegivel(conta: FolhaContaPagadora | undefined): boolean {
  const unidade = conta?.empresa?.unidade;
  return Boolean(
    conta?.ativo
    && conta.empresa?.ativo === true
    && unidade?.ativo === true
    && (unidade.codigo === 'cg' || unidade.codigo === 'rec' || unidade.codigo === 'bar')
  );
}

function hasInvalidSourcePrecision(value: number): boolean {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return true;

  const scaledValue = numericValue * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaledValue)) * 4;
  return Math.abs(scaledValue - Math.round(scaledValue)) > tolerance;
}

function createSourceSnapshot(
  lancamentos: Lancamento[],
): readonly FolhaRateioSourceSnapshotItem[] {
  return Object.freeze(lancamentos.map((lancamento) => {
    const componentesOriginais = emptyComponentes();
    const componentesCentavos = emptyComponentes();
    for (const componente of RATEIO_COMPONENTES) {
      componentesOriginais[componente] = Number(lancamento[componente]);
      componentesCentavos[componente] = toCents(lancamento[componente]);
    }
    const frozenOriginais = Object.freeze(componentesOriginais);
    const frozenCentavos = Object.freeze(componentesCentavos);
    return Object.freeze({
      id: lancamento.id,
      folhaId: lancamento.folha_id,
      colaboradorId: lancamento.colaborador_id,
      categoria: lancamento.categoria,
      contaPagadoraId: lancamento.conta_pagadora_id?.trim() || null,
      componentesOriginais: frozenOriginais,
      componentesCentavos: frozenCentavos,
      protegido: hasProtectedRateioMetadata(lancamento),
      linhaZerada: RATEIO_COMPONENTES.every(
        (componente) => frozenCentavos[componente] === 0,
      ),
    } satisfies FolhaRateioSourceSnapshotItem);
  }));
}

function protectedLabel(lancamento: Lancamento, linhaZerada: boolean): string {
  if (linhaZerada) return `Linha ${lancamento.id} sem valores`;
  if (lancamento.detalhamento && Object.keys(lancamento.detalhamento).length > 0) {
    return `Detalhes da linha ${lancamento.id}`;
  }
  return `Observacao da linha ${lancamento.id}`;
}

export function buildFolhaRateioDraft(
  lancamentos: Lancamento[],
  contas: FolhaContaPagadora[],
): FolhaRateioDraft {
  if (lancamentos.length === 0) {
    throw new Error('O rateio exige ao menos um lancamento de origem.');
  }
  const sourceSnapshot = createSourceSnapshot(lancamentos);
  const primeiroSource = sourceSnapshot[0];
  if (sourceSnapshot.some((source) => source.folhaId !== primeiroSource.folhaId)) {
    throw new Error('Todos os lancamentos do rateio devem pertencer a mesma folha.');
  }
  if (sourceSnapshot.some((source) =>
    source.colaboradorId !== primeiroSource.colaboradorId)) {
    throw new Error('Todos os lancamentos do rateio devem pertencer ao mesmo colaborador.');
  }

  const contaIds = new Set<string>();
  const contasElegiveis = contas.filter((conta) => {
    if (!isContaElegivel(conta) || contaIds.has(conta.id)) return false;
    contaIds.add(conta.id);
    return true;
  });
  const contasElegiveisPorId = new Map(contasElegiveis.map((conta) => [conta.id, conta]));
  const categoriasPorId = new Map<CollaboratorDepartment, FolhaRateioDraftCategoria>();
  const ancoras: Record<number, string> = {};
  const protegidos: FolhaRateioDraftProtegido[] = [];

  sourceSnapshot.forEach((source, index) => {
    const lancamento = lancamentos[index];
    let categoria = categoriasPorId.get(source.categoria);
    if (!categoria) {
      categoria = {
        categoria: source.categoria,
        totais: emptyComponentes(),
        porConta: Object.fromEntries(
          contasElegiveis.map((conta) => [conta.id, emptyComponentes()]),
        ),
        sourceIds: [],
      };
      categoriasPorId.set(source.categoria, categoria);
    }

    categoria.sourceIds.push(source.id);
    addComponentesCentavos(categoria.totais, source.componentesCentavos);

    const contaId = source.contaPagadoraId || '';
    if (contasElegiveisPorId.has(contaId)) {
      addComponentesCentavos(categoria.porConta[contaId], source.componentesCentavos);
      ancoras[source.id] = contaId;
    }

    if (source.protegido || source.linhaZerada) {
      protegidos.push({
        lancamentoId: source.id,
        categoria: source.categoria,
        label: protectedLabel(lancamento, source.linhaZerada),
        linhaZerada: source.linhaZerada,
      });
      ancoras[source.id] ||= '';
    }
  });

  return {
    folhaId: primeiroSource.folhaId,
    colaboradorId: primeiroSource.colaboradorId,
    contas: contasElegiveis,
    categorias: CATEGORIAS_ORDEM.flatMap((categoria) => {
      const draftCategoria = categoriasPorId.get(categoria);
      return draftCategoria ? [draftCategoria] : [];
    }),
    ancoras,
    protegidos,
    lancamentos: lancamentos.map((lancamento) => ({ ...lancamento })),
    sourceSnapshot,
  };
}

function categoriaHasValues(
  categoria: FolhaRateioDraftCategoria,
  contaId: string,
): boolean {
  const componentes = categoria.porConta[contaId];
  return Boolean(
    componentes
    && RATEIO_COMPONENTES.some((componente) => componentes[componente] !== 0),
  );
}

type FolhaRateioSourceCategoria = {
  totais: FolhaRateioComponentesCentavos;
  sourceIds: number[];
};

function buildSourceCategorias(
  sourceSnapshot: readonly FolhaRateioSourceSnapshotItem[],
): Map<CollaboratorDepartment, FolhaRateioSourceCategoria> {
  const categorias = new Map<CollaboratorDepartment, FolhaRateioSourceCategoria>();
  for (const source of sourceSnapshot) {
    let categoria = categorias.get(source.categoria);
    if (!categoria) {
      categoria = { totais: emptyComponentes(), sourceIds: [] };
      categorias.set(source.categoria, categoria);
    }
    categoria.sourceIds.push(source.id);
    addComponentesCentavos(categoria.totais, source.componentesCentavos);
  }
  return categorias;
}

function sameIds(actual: number[], expected: number[]): boolean {
  return actual.length === expected.length
    && actual.every((id, index) => id === expected[index]);
}

function problemPriority(codigo: FolhaRateioDraftProblemCode): number {
  if (codigo === 'draft_vazio') return 0;
  if (codigo === 'valor_origem_negativo' || codigo === 'precisao_origem_invalida') return 10;
  if (
    codigo === 'categoria_ausente'
    || codigo === 'categoria_extra'
    || codigo === 'categoria_duplicada'
    || codigo === 'totais_adulterados'
    || codigo === 'source_ids_adulterados'
    || codigo === 'snapshot_identidade_invalida'
  ) return 20;
  if (
    codigo === 'conta_duplicada'
    || codigo === 'matriz_conta_ausente'
    || codigo === 'matriz_conta_extra'
    || codigo === 'matriz_componentes_invalidos'
    || codigo === 'conta_invalida'
  ) return 30;
  if (
    codigo === 'ancora_ausente'
    || codigo === 'ancora_protegida_duplicada'
    || codigo === 'ancora_sem_valores'
  ) return 40;
  if (codigo === 'centavos_invalidos' || codigo === 'valor_negativo') return 50;
  return 60;
}

export function validateFolhaRateioDraft(
  draft: FolhaRateioDraft,
): FolhaRateioDraftValidation {
  const diferencas: FolhaRateioDraftDifference[] = [];
  const problemas: FolhaRateioDraftProblem[] = [];
  const contasElegiveis = new Set<string>();
  const contaIdsVistos = new Set<string>();
  for (const conta of draft.contas) {
    if (contaIdsVistos.has(conta.id)) {
      problemas.push({
        codigo: 'conta_duplicada',
        mensagem: `A conta ${conta.id} aparece mais de uma vez no rateio.`,
        contaId: conta.id,
      });
    } else {
      contaIdsVistos.add(conta.id);
    }
    if (isContaElegivel(conta)) {
      contasElegiveis.add(conta.id);
    } else {
      problemas.push({
        codigo: 'conta_invalida',
        mensagem: `A conta ${conta.id} nao esta ativa ou elegivel para o rateio.`,
        contaId: conta.id,
      });
    }
  }
  const sourcesPorId = new Map(draft.sourceSnapshot.map((source) => [source.id, source]));
  const categoriasPorId = new Map(
    draft.categorias.map((categoria) => [categoria.categoria, categoria]),
  );
  const sourceCategorias = buildSourceCategorias(draft.sourceSnapshot);
  const draftCategorias = new Map<CollaboratorDepartment, FolhaRateioDraftCategoria[]>();

  if (draft.sourceSnapshot.length === 0) {
    problemas.push({
      codigo: 'draft_vazio',
      mensagem: 'O rateio nao possui lancamentos de origem.',
    });
  }

  const primeiroSource = draft.sourceSnapshot[0];
  if (
    primeiroSource
    && (
      draft.folhaId !== primeiroSource.folhaId
      || draft.colaboradorId !== primeiroSource.colaboradorId
      || draft.sourceSnapshot.some((source) =>
        source.folhaId !== primeiroSource.folhaId
        || source.colaboradorId !== primeiroSource.colaboradorId)
    )
  ) {
    problemas.push({
      codigo: 'snapshot_identidade_invalida',
      mensagem: 'A identidade da origem do rateio foi alterada.',
    });
  }

  for (const categoria of draft.categorias) {
    const ocorrencias = draftCategorias.get(categoria.categoria) || [];
    ocorrencias.push(categoria);
    draftCategorias.set(categoria.categoria, ocorrencias);
  }

  for (const [categoriaId, ocorrencias] of draftCategorias) {
    if (ocorrencias.length > 1) {
      problemas.push({
        codigo: 'categoria_duplicada',
        mensagem: 'O rateio possui uma categoria duplicada.',
        categoria: categoriaId,
      });
    }
    if (!sourceCategorias.has(categoriaId)) {
      problemas.push({
        codigo: 'categoria_extra',
        mensagem: 'O rateio possui uma categoria que nao existe na origem.',
        categoria: categoriaId,
      });
    }
  }

  for (const [categoriaId, sourceCategoria] of sourceCategorias) {
    const ocorrencias = draftCategorias.get(categoriaId) || [];
    if (ocorrencias.length === 0) {
      problemas.push({
        codigo: 'categoria_ausente',
        mensagem: 'Uma categoria da origem foi removida do rateio.',
        categoria: categoriaId,
      });
      continue;
    }

    const categoria = ocorrencias[0];
    if (Object.keys(categoria.totais).some((key) =>
      !RATEIO_COMPONENTES.includes(key as RateioComponente))) {
      problemas.push({
        codigo: 'totais_adulterados',
        mensagem: 'Os totais originais do rateio foram alterados.',
        categoria: categoriaId,
      });
    }
    for (const componente of RATEIO_COMPONENTES) {
      if (categoria.totais[componente] === sourceCategoria.totais[componente]) continue;
      problemas.push({
        codigo: 'totais_adulterados',
        mensagem: 'Os totais originais do rateio foram alterados.',
        categoria: categoriaId,
        componente,
      });
    }
    if (!sameIds(categoria.sourceIds, sourceCategoria.sourceIds)) {
      problemas.push({
        codigo: 'source_ids_adulterados',
        mensagem: 'As linhas de origem da categoria foram alteradas.',
        categoria: categoriaId,
      });
    }
  }

  for (const source of draft.sourceSnapshot) {
    for (const componente of RATEIO_COMPONENTES) {
      if (source.componentesOriginais[componente] < 0) {
        problemas.push({
          codigo: 'valor_origem_negativo',
          mensagem: 'A origem do rateio possui um valor negativo.',
          categoria: source.categoria,
          componente,
          lancamentoId: source.id,
        });
      }
      if (!hasInvalidSourcePrecision(source.componentesOriginais[componente])) continue;
      problemas.push({
        codigo: 'precisao_origem_invalida',
        mensagem: `A origem da linha ${source.id} em ${componente} deve ter no maximo duas casas decimais.`,
        categoria: source.categoria,
        componente,
        lancamentoId: source.id,
      });
    }
  }

  for (const categoria of draft.categorias) {
    const contaIdsDaMatriz = new Set(Object.keys(categoria.porConta));
    for (const contaId of contasElegiveis) {
      if (!contaIdsDaMatriz.has(contaId)) {
        problemas.push({
          codigo: 'matriz_conta_ausente',
          mensagem: `A matriz do rateio nao possui a conta ${contaId}.`,
          categoria: categoria.categoria,
          contaId,
        });
        continue;
      }

      const componentes = categoria.porConta[contaId];
      for (const componente of RATEIO_COMPONENTES) {
        if (
          componentes
          && Object.prototype.hasOwnProperty.call(componentes, componente)
          && typeof componentes[componente] === 'number'
          && Number.isFinite(componentes[componente])
        ) continue;
        problemas.push({
          codigo: 'matriz_componentes_invalidos',
          mensagem: `A matriz da conta ${contaId} esta incompleta.`,
          categoria: categoria.categoria,
          componente,
          contaId,
        });
      }
      const componentKeys = componentes ? Object.keys(componentes) : [];
      if (componentKeys.some((key) =>
        !RATEIO_COMPONENTES.includes(key as RateioComponente))) {
        problemas.push({
          codigo: 'matriz_componentes_invalidos',
          mensagem: `A matriz da conta ${contaId} possui componentes desconhecidos.`,
          categoria: categoria.categoria,
          contaId,
        });
      }
    }

    for (const contaId of contaIdsDaMatriz) {
      if (!contasElegiveis.has(contaId)) {
        problemas.push({
          codigo: 'matriz_conta_extra',
          mensagem: `A matriz do rateio possui a conta inesperada ${contaId}.`,
          categoria: categoria.categoria,
          contaId,
        });
      }
    }

    const sourceCategoria = sourceCategorias.get(categoria.categoria);
    if (!sourceCategoria) continue;

    for (const componente of RATEIO_COMPONENTES) {
      const esperadoCentavos = sourceCategoria.totais[componente];
      const valores = draft.contas.map(
        (conta) => categoria.porConta[conta.id]?.[componente] ?? 0,
      );

      draft.contas.forEach((conta, index) => {
        if (valores[index] >= 0) return;
        problemas.push({
          codigo: 'valor_negativo',
          mensagem: `O valor de ${componente} na conta ${conta.id} nao pode ser negativo.`,
          categoria: categoria.categoria,
          componente,
          contaId: conta.id,
        });
      });

      if (!Number.isInteger(esperadoCentavos) || valores.some((valor) => !Number.isInteger(valor))) {
        problemas.push({
          codigo: 'centavos_invalidos',
          mensagem: `Os valores de ${componente} em ${categoria.categoria} devem usar centavos inteiros.`,
          categoria: categoria.categoria,
          componente,
        });
      }

      const alocadoCentavos = valores.reduce((total, valor) => total + valor, 0);
      if (alocadoCentavos !== esperadoCentavos) {
        const diferenca = {
          categoria: categoria.categoria,
          componente,
          esperadoCentavos,
          alocadoCentavos,
          restanteCentavos: esperadoCentavos - alocadoCentavos,
        } satisfies FolhaRateioDraftDifference;
        diferencas.push(diferenca);
        problemas.push({
          codigo: 'diferenca',
          mensagem: `${categoria.categoria}/${componente} possui diferenca de ${diferenca.restanteCentavos} centavo(s).`,
          categoria: categoria.categoria,
          componente,
        });
      }
    }
  }

  for (const [rawLancamentoId, rawContaId] of Object.entries(draft.ancoras)) {
    const lancamentoId = Number(rawLancamentoId);
    const contaId = rawContaId?.trim();
    if (!contaId) continue;

    const source = sourcesPorId.get(lancamentoId);
    if (!source || !contasElegiveis.has(contaId)) {
      problemas.push({
        codigo: 'conta_invalida',
        mensagem: `A ancora da linha ${lancamentoId} aponta para a conta invalida ${contaId}.`,
        categoria: source?.categoria ?? draft.categorias[0]?.categoria ?? 'staff_rateado',
        lancamentoId,
        contaId,
      });
    }
  }

  const protectedAnchors = new Map<string, number[]>();
  for (const source of draft.sourceSnapshot) {
    if (!source.protegido && !source.linhaZerada) continue;
    const contaId = draft.ancoras[source.id]?.trim();
    if (!contaId) {
      problemas.push({
        codigo: 'ancora_ausente',
        mensagem: `A linha ${source.id} precisa escolher uma conta para preservar seus detalhes.`,
        categoria: source.categoria,
        lancamentoId: source.id,
      });
      continue;
    }
    if (!contasElegiveis.has(contaId)) continue;

    const key = `${source.categoria}\u0000${contaId}`;
    const ids = protectedAnchors.get(key) || [];
    ids.push(source.id);
    protectedAnchors.set(key, ids);

    const categoria = categoriasPorId.get(source.categoria);
    if (categoria && !source.linhaZerada && !categoriaHasValues(categoria, contaId)) {
      problemas.push({
        codigo: 'ancora_sem_valores',
        mensagem: `A conta ${contaId} da linha ${source.id} precisa receber valores desta categoria.`,
        categoria: source.categoria,
        lancamentoId: source.id,
        contaId,
      });
    }
  }

  for (const [key, ids] of protectedAnchors) {
    if (ids.length < 2) continue;
    const separatorIndex = key.indexOf('\u0000');
    const categoria = key.slice(0, separatorIndex) as CollaboratorDepartment;
    const contaId = key.slice(separatorIndex + 1);
    problemas.push({
      codigo: 'ancora_protegida_duplicada',
      mensagem: `Duas linhas com detalhes protegidos nao podem usar a mesma conta ${contaId} em ${categoria}.`,
      categoria,
      contaId,
    });
  }

  const valid = problemas.length === 0;
  const primaryProblem = problemas.reduce<FolhaRateioDraftProblem | undefined>(
    (primary, problema) =>
      !primary || problemPriority(problema.codigo) < problemPriority(primary.codigo)
        ? problema
        : primary,
    undefined,
  );
  return {
    valid,
    diferencas,
    problemas,
    message: valid ? undefined : primaryProblem?.mensagem,
  };
}

type FolhaRateioPayloadTarget = {
  categoria: FolhaRateioDraftCategoria;
  contaId: string;
  componentes: FolhaRateioComponentesCentavos;
  lancamentoId: number | null;
};

export function buildFolhaRateioPayload(
  draft: FolhaRateioDraft,
): FolhaRateioFatiaInput[] {
  const validation = validateFolhaRateioDraft(draft);
  if (!validation.valid) {
    throw new Error(validation.message || 'O rateio possui pendencias e nao pode ser salvo.');
  }

  const sourcesPorId = new Map(draft.sourceSnapshot.map((source) => [source.id, source]));
  const protegidosPorId = new Set(
    draft.sourceSnapshot
      .filter((source) => source.protegido || source.linhaZerada)
      .map((source) => source.id),
  );
  const idsUsados = new Set<number>();
  const targets: FolhaRateioPayloadTarget[] = [];

  for (const categoria of draft.categorias) {
    const categoryTargets: FolhaRateioPayloadTarget[] = [];
    for (const conta of draft.contas) {
      const componentes = categoria.porConta[conta.id];
      if (!componentes) continue;
      const hasValues = RATEIO_COMPONENTES.some((componente) => componentes[componente] !== 0);
      const hasRequiredAnchor = draft.sourceSnapshot.some((source) =>
        source.categoria === categoria.categoria
        && (source.protegido || source.linhaZerada)
        && draft.ancoras[source.id]?.trim() === conta.id,
      );
      if (hasValues || hasRequiredAnchor) {
        categoryTargets.push({
          categoria,
          contaId: conta.id,
          componentes,
          lancamentoId: null,
        });
      }
    }

    const sourceIds = draft.sourceSnapshot
      .filter((source) => source.categoria === categoria.categoria)
      .map((source) => source.id);
    const unprotectedSourceIds = sourceIds.filter((id) => !protegidosPorId.has(id));

    for (const target of categoryTargets) {
      const protectedId = sourceIds.find((id) =>
        !idsUsados.has(id)
        && protegidosPorId.has(id)
        && draft.ancoras[id]?.trim() === target.contaId,
      );
      if (protectedId !== undefined) {
        target.lancamentoId = protectedId;
        idsUsados.add(protectedId);
      }
    }

    for (const target of categoryTargets) {
      if (target.lancamentoId !== null) continue;
      const exactId = unprotectedSourceIds.find((id) => {
        if (idsUsados.has(id)) return false;
        const source = sourcesPorId.get(id);
        const chosenAccount = draft.ancoras[id]?.trim();
        return source?.contaPagadoraId === target.contaId
          && (!chosenAccount || chosenAccount === target.contaId);
      });
      if (exactId !== undefined) {
        target.lancamentoId = exactId;
        idsUsados.add(exactId);
      }
    }

    for (const target of categoryTargets) {
      if (target.lancamentoId !== null) continue;
      const movedId = unprotectedSourceIds.find((id) =>
        !idsUsados.has(id) && draft.ancoras[id]?.trim() === target.contaId,
      );
      if (movedId !== undefined) {
        target.lancamentoId = movedId;
        idsUsados.add(movedId);
      }
    }

    for (const target of categoryTargets) {
      if (target.lancamentoId !== null) continue;
      const unusedId = unprotectedSourceIds.find((id) => !idsUsados.has(id));
      if (unusedId !== undefined) {
        target.lancamentoId = unusedId;
        idsUsados.add(unusedId);
      }
    }

    targets.push(...categoryTargets);
  }

  return targets.map(({ categoria, contaId, componentes, lancamentoId }) => ({
    lancamento_id: lancamentoId,
    categoria: categoria.categoria,
    conta_pagadora_id: contaId,
    salario: fromCents(componentes.salario),
    bonus: fromCents(componentes.bonus),
    comissao: fromCents(componentes.comissao),
    passagem: fromCents(componentes.passagem),
    reembolso: fromCents(componentes.reembolso),
    inss: fromCents(componentes.inss),
    descontos: fromCents(componentes.descontos),
  }));
}

function isContaCoerente(lancamento: Lancamento, conta: FolhaContaPagadora | undefined): boolean {
  return Boolean(
    isContaElegivel(conta)
    && conta.empresa.unidade?.codigo === lancamento.unidade,
  );
}

function nomeSemAcento(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function buildFolhaRateioPessoas(
  lancamentos: Lancamento[],
  contas: FolhaContaPagadora[],
): FolhaRateioPessoa[] {
  const contasPorId = new Map(contas.map((conta) => [conta.id, conta]));
  const lancamentosPorPessoa = new Map<number, Lancamento[]>();

  for (const lancamento of lancamentos) {
    const atuais = lancamentosPorPessoa.get(lancamento.colaborador_id) || [];
    atuais.push(lancamento);
    lancamentosPorPessoa.set(lancamento.colaborador_id, atuais);
  }

  const pessoas = Array.from(lancamentosPorPessoa, ([colaboradorId, linhas]) => {
    const primeiroColaborador = linhas.find((linha) => linha.colaboradores)?.colaboradores;
    const componentesCentavos = emptyComponentes();
    const categoriasPorId = new Map<CollaboratorDepartment, FolhaRateioPessoaCategoria>();
    const chipsPorConta = new Map<string, FolhaRateioPessoaConta>();
    let totalCentavos = 0;
    let linhasAtribuidas = 0;
    let linhasCoerentes = 0;

    for (const linha of linhas) {
      const linhaTotalCentavos = toCents(linha.total);
      totalCentavos += linhaTotalCentavos;
      addComponentes(componentesCentavos, linha);

      let categoria = categoriasPorId.get(linha.categoria);
      if (!categoria) {
        categoria = {
          categoria: linha.categoria,
          totalCentavos: 0,
          componentesCentavos: emptyComponentes(),
        };
        categoriasPorId.set(linha.categoria, categoria);
      }
      categoria.totalCentavos += linhaTotalCentavos;
      addComponentes(categoria.componentesCentavos, linha);

      const contaId = linha.conta_pagadora_id?.trim();
      if (!contaId) continue;

      linhasAtribuidas += 1;
      const conta = contasPorId.get(contaId);
      if (isContaCoerente(linha, conta)) linhasCoerentes += 1;

      if (!isContaElegivel(conta)) continue;
      const chipAtual = chipsPorConta.get(contaId);
      if (chipAtual) {
        chipAtual.totalCentavos += linhaTotalCentavos;
      } else {
        chipsPorConta.set(contaId, {
          contaId,
          nome: contaNome(conta),
          empresa: empresaNome(conta),
          totalCentavos: linhaTotalCentavos,
        });
      }
    }

    const status: FolhaRateioStatus = linhasAtribuidas === 0
      ? 'a_conciliar'
      : linhasCoerentes === linhas.length
        ? 'conciliado'
        : 'parcial';

    return {
      colaboradorId,
      nome: primeiroColaborador?.nome || `Colaborador ${colaboradorId}`,
      funcao: primeiroColaborador?.funcao || '',
      totalCentavos,
      componentesCentavos,
      categorias: CATEGORIAS_ORDEM.flatMap((categoria) => {
        const valor = categoriasPorId.get(categoria);
        return valor ? [valor] : [];
      }),
      contas: Array.from(chipsPorConta.values()),
      status,
      lancamentos: linhas,
    } satisfies FolhaRateioPessoa;
  });

  return pessoas.sort((a, b) =>
    nomeSemAcento(a.nome).localeCompare(nomeSemAcento(b.nome), 'pt-BR', { sensitivity: 'base' }),
  );
}
