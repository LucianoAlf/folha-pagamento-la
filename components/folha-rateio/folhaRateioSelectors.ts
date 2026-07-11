import type { CollaboratorDepartment, Lancamento } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';

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
  return hasDetalhamento || Boolean(lancamento.observacao?.trim());
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
  return Boolean(
    conta?.ativo
    && conta.empresa?.ativo === true
    && conta.empresa.unidade?.ativo === true
  );
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
