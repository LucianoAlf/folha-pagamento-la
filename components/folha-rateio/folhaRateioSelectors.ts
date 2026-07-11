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

export type FolhaRateioDraft = {
  folhaId: number;
  colaboradorId: number;
  contas: FolhaContaPagadora[];
  categorias: FolhaRateioDraftCategoria[];
  ancoras: Record<number, string>;
  protegidos: FolhaRateioDraftProtegido[];
  lancamentos: Lancamento[];
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
  | 'centavos_invalidos';

export type FolhaRateioDraftProblem = {
  codigo: FolhaRateioDraftProblemCode;
  mensagem: string;
  categoria: CollaboratorDepartment;
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

function isLancamentoZerado(lancamento: Lancamento): boolean {
  return RATEIO_COMPONENTES.every((componente) => toCents(lancamento[componente]) === 0);
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
  const contasElegiveis = contas.filter(isContaElegivel);
  const contasElegiveisPorId = new Map(contasElegiveis.map((conta) => [conta.id, conta]));
  const categoriasPorId = new Map<CollaboratorDepartment, FolhaRateioDraftCategoria>();
  const ancoras: Record<number, string> = {};
  const protegidos: FolhaRateioDraftProtegido[] = [];

  for (const lancamento of lancamentos) {
    let categoria = categoriasPorId.get(lancamento.categoria);
    if (!categoria) {
      categoria = {
        categoria: lancamento.categoria,
        totais: emptyComponentes(),
        porConta: Object.fromEntries(
          contasElegiveis.map((conta) => [conta.id, emptyComponentes()]),
        ),
        sourceIds: [],
      };
      categoriasPorId.set(lancamento.categoria, categoria);
    }

    categoria.sourceIds.push(lancamento.id);
    addComponentes(categoria.totais, lancamento);

    const contaId = lancamento.conta_pagadora_id?.trim() || '';
    if (contasElegiveisPorId.has(contaId)) {
      addComponentes(categoria.porConta[contaId], lancamento);
      ancoras[lancamento.id] = contaId;
    }

    const linhaZerada = isLancamentoZerado(lancamento);
    if (hasProtectedRateioMetadata(lancamento) || linhaZerada) {
      protegidos.push({
        lancamentoId: lancamento.id,
        categoria: lancamento.categoria,
        label: protectedLabel(lancamento, linhaZerada),
        linhaZerada,
      });
      ancoras[lancamento.id] ||= '';
    }
  }

  return {
    folhaId: lancamentos[0]?.folha_id ?? 0,
    colaboradorId: lancamentos[0]?.colaborador_id ?? 0,
    contas: contasElegiveis,
    categorias: CATEGORIAS_ORDEM.flatMap((categoria) => {
      const draftCategoria = categoriasPorId.get(categoria);
      return draftCategoria ? [draftCategoria] : [];
    }),
    ancoras,
    protegidos,
    lancamentos,
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

export function validateFolhaRateioDraft(
  draft: FolhaRateioDraft,
): FolhaRateioDraftValidation {
  const diferencas: FolhaRateioDraftDifference[] = [];
  const problemas: FolhaRateioDraftProblem[] = [];
  const contasElegiveis = new Set(draft.contas.filter(isContaElegivel).map((conta) => conta.id));
  const lancamentosPorId = new Map(draft.lancamentos.map((lancamento) => [lancamento.id, lancamento]));
  const categoriasPorId = new Map(
    draft.categorias.map((categoria) => [categoria.categoria, categoria]),
  );
  for (const categoria of draft.categorias) {
    for (const contaId of Object.keys(categoria.porConta)) {
      if (!contasElegiveis.has(contaId)) {
        problemas.push({
          codigo: 'conta_invalida',
          mensagem: `A conta ${contaId} nao esta ativa ou elegivel para o rateio.`,
          categoria: categoria.categoria,
          contaId,
        });
      }
    }

    for (const componente of RATEIO_COMPONENTES) {
      const esperadoCentavos = categoria.totais[componente];
      const valores = draft.contas.map(
        (conta) => categoria.porConta[conta.id]?.[componente] ?? 0,
      );

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

    const lancamento = lancamentosPorId.get(lancamentoId);
    if (!lancamento || !contasElegiveis.has(contaId)) {
      problemas.push({
        codigo: 'conta_invalida',
        mensagem: `A ancora da linha ${lancamentoId} aponta para a conta invalida ${contaId}.`,
        categoria: lancamento?.categoria ?? draft.categorias[0]?.categoria ?? 'staff_rateado',
        lancamentoId,
        contaId,
      });
    }
  }

  const protectedAnchors = new Map<string, number[]>();
  for (const protegido of draft.protegidos) {
    const contaId = draft.ancoras[protegido.lancamentoId]?.trim();
    if (!contaId) {
      problemas.push({
        codigo: 'ancora_ausente',
        mensagem: `A linha ${protegido.lancamentoId} precisa escolher uma conta para preservar seus detalhes.`,
        categoria: protegido.categoria,
        lancamentoId: protegido.lancamentoId,
      });
      continue;
    }
    if (!contasElegiveis.has(contaId)) continue;

    const key = `${protegido.categoria}\u0000${contaId}`;
    const ids = protectedAnchors.get(key) || [];
    ids.push(protegido.lancamentoId);
    protectedAnchors.set(key, ids);

    const categoria = categoriasPorId.get(protegido.categoria);
    if (categoria && !protegido.linhaZerada && !categoriaHasValues(categoria, contaId)) {
      problemas.push({
        codigo: 'ancora_sem_valores',
        mensagem: `A conta ${contaId} da linha ${protegido.lancamentoId} precisa receber valores desta categoria.`,
        categoria: protegido.categoria,
        lancamentoId: protegido.lancamentoId,
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
  return {
    valid,
    diferencas,
    problemas,
    message: valid ? undefined : problemas.map((problema) => problema.mensagem).join(' '),
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

  const lancamentosPorId = new Map(draft.lancamentos.map((lancamento) => [lancamento.id, lancamento]));
  const protegidosPorId = new Map(
    draft.protegidos.map((protegido) => [protegido.lancamentoId, protegido]),
  );
  const idsUsados = new Set<number>();
  const targets: FolhaRateioPayloadTarget[] = [];

  for (const categoria of draft.categorias) {
    const categoryTargets: FolhaRateioPayloadTarget[] = [];
    for (const conta of draft.contas) {
      const componentes = categoria.porConta[conta.id];
      const hasValues = RATEIO_COMPONENTES.some((componente) => componentes[componente] !== 0);
      const hasRequiredAnchor = draft.protegidos.some((protegido) =>
        protegido.categoria === categoria.categoria
        && draft.ancoras[protegido.lancamentoId]?.trim() === conta.id,
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

    const sourceIds = categoria.sourceIds.filter((id) => lancamentosPorId.has(id));
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
        const source = lancamentosPorId.get(id);
        const chosenAccount = draft.ancoras[id]?.trim();
        return source?.conta_pagadora_id?.trim() === target.contaId
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
