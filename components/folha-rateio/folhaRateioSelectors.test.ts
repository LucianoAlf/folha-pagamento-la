import assert from 'node:assert/strict';
import test from 'node:test';

import type { Lancamento } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';
import {
  RATEIO_COMPONENTES,
  buildFolhaRateioPessoas,
  fromCents,
  hasProtectedRateioMetadata,
  toCents,
} from './folhaRateioSelectors.ts';

function conta(
  id: string,
  nome: string,
  unidade: 'cg' | 'rec' | 'bar',
  options: { contaAtiva?: boolean; empresaAtiva?: boolean } = {},
): FolhaContaPagadora {
  return {
    id,
    empresa_id: `empresa-${id}`,
    banco: 'Santander',
    agencia: '0001',
    conta: id,
    apelido: nome,
    ativo: options.contaAtiva ?? true,
    empresa: {
      id: `empresa-${id}`,
      label_operacional: nome,
      unidade_id: `centro-${unidade}`,
      ativo: options.empresaAtiva ?? true,
      unidade: {
        id: `centro-${unidade}`,
        codigo: unidade,
        nome: unidade.toUpperCase(),
        tipo: 'unidade',
        ativo: true,
        ordem: 1,
      },
    },
  };
}

function lancamento(
  input: Partial<Lancamento> & Pick<Lancamento, 'id' | 'colaborador_id' | 'categoria' | 'unidade'>,
  pessoa: { nome: string; funcao: string },
): Lancamento {
  return {
    folha_id: 17,
    conta_pagadora_id: null,
    salario: 0,
    bonus: 0,
    comissao: 0,
    reembolso: 0,
    passagem: 0,
    inss: 0,
    descontos: 0,
    total: 0,
    ...input,
    colaboradores: {
      id: input.colaborador_id,
      nome: pessoa.nome,
      funcao: pessoa.funcao,
    } as Lancamento['colaboradores'],
  };
}

const contas: FolhaContaPagadora[] = [
  conta('emla', 'EMLA CG', 'cg'),
  conta('kids', 'Kids CG', 'cg'),
  conta('rec', 'Recreio', 'rec'),
  conta('bar', 'Barra', 'bar'),
  conta('inativa', 'Conta inativa', 'cg', { contaAtiva: false }),
  conta('empresa-inativa', 'Empresa inativa', 'cg', { empresaAtiva: false }),
];

const ana: Lancamento[] = [
  lancamento(
    {
      id: 1,
      colaborador_id: 2,
      categoria: 'staff_rateado',
      unidade: 'rec',
      conta_pagadora_id: 'rec',
      salario: 800,
      bonus: 250,
      total: 1050,
    },
    { nome: 'Ana Paula', funcao: 'RH/DP' },
  ),
  lancamento(
    {
      id: 2,
      colaborador_id: 2,
      categoria: 'staff_rateado',
      unidade: 'bar',
      conta_pagadora_id: 'bar',
      salario: 700,
      bonus: 250,
      total: 950,
    },
    { nome: 'Ana Paula', funcao: 'RH/DP' },
  ),
  lancamento(
    {
      id: 3,
      colaborador_id: 2,
      categoria: 'staff_rateado',
      unidade: 'cg',
      salario: 1250,
      bonus: 200,
      passagem: 250,
      inss: 200.68,
      total: 1499.32,
      detalhamento: { __bistro: { valor: 0, ref_ym: '2026-07' } },
    },
    { nome: 'Ana Paula', funcao: 'RH/DP' },
  ),
];

const anne: Lancamento[] = [
  lancamento(
    {
      id: 10,
      colaborador_id: 9,
      categoria: 'equipe_operacional',
      unidade: 'rec',
      conta_pagadora_id: 'rec',
      salario: 80,
      total: 80,
    },
    { nome: 'Anne Krissya', funcao: 'Assistente' },
  ),
  lancamento(
    {
      id: 11,
      colaborador_id: 9,
      categoria: 'staff_rateado',
      unidade: 'rec',
      conta_pagadora_id: 'rec',
      bonus: 100,
      total: 100,
    },
    { nome: 'Anne Krissya', funcao: 'Assistente' },
  ),
];

const jeremias: Lancamento[] = [
  lancamento(
    {
      id: 20,
      colaborador_id: 12,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'emla',
      salario: 900.11,
      total: 900.11,
    },
    { nome: 'Jeremias Junior', funcao: 'Operacional' },
  ),
  lancamento(
    {
      id: 21,
      colaborador_id: 12,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'kids',
      salario: 600.22,
      total: 600.22,
    },
    { nome: 'Jeremias Junior', funcao: 'Operacional' },
  ),
];

test('exposes the rateio components and exact cent helpers', () => {
  assert.deepEqual(RATEIO_COMPONENTES, [
    'salario',
    'bonus',
    'comissao',
    'reembolso',
    'passagem',
    'inss',
    'descontos',
  ]);
  assert.equal(toCents(1499.32), 149932);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(fromCents(349932), 3499.32);
});

test('consolidates Ana into one partial person with Rec and Bar chips', () => {
  const [pessoa] = buildFolhaRateioPessoas(ana, contas);

  assert.equal(pessoa.colaboradorId, 2);
  assert.equal(pessoa.nome, 'Ana Paula');
  assert.equal(pessoa.funcao, 'RH/DP');
  assert.equal(pessoa.totalCentavos, 349932);
  assert.equal(pessoa.status, 'parcial');
  assert.deepEqual(
    pessoa.contas.map(({ contaId, nome, empresa, totalCentavos }) => ({
      contaId,
      nome,
      empresa,
      totalCentavos,
    })),
    [
      { contaId: 'rec', nome: 'Recreio', empresa: 'Recreio', totalCentavos: 105000 },
      { contaId: 'bar', nome: 'Barra', empresa: 'Barra', totalCentavos: 95000 },
    ],
  );
  assert.strictEqual(pessoa.lancamentos[0], ana[0]);
  assert.strictEqual(pessoa.lancamentos[2], ana[2]);
});

test('keeps multiple categories separate in the required order with component totals', () => {
  const [pessoa] = buildFolhaRateioPessoas(anne, contas);

  assert.deepEqual(
    pessoa.categorias.map(({ categoria, totalCentavos }) => ({ categoria, totalCentavos })),
    [
      { categoria: 'staff_rateado', totalCentavos: 10000 },
      { categoria: 'equipe_operacional', totalCentavos: 8000 },
    ],
  );
  assert.equal(pessoa.categorias[0].componentesCentavos.bonus, 10000);
  assert.equal(pessoa.categorias[1].componentesCentavos.salario, 8000);
  assert.equal(pessoa.componentesCentavos.salario, 8000);
  assert.equal(pessoa.componentesCentavos.bonus, 10000);
});

test('marks coherent EMLA and Kids rows as reconciled', () => {
  const [pessoa] = buildFolhaRateioPessoas(jeremias, contas);

  assert.equal(pessoa.status, 'conciliado');
  assert.equal(pessoa.totalCentavos, 150033);
  assert.deepEqual(
    pessoa.contas.map(({ contaId, totalCentavos }) => [contaId, totalCentavos]),
    [
      ['emla', 90011],
      ['kids', 60022],
    ],
  );
});

test('distinguishes unassigned from missing, inactive, and incoherent accounts', () => {
  const base = lancamento(
    {
      id: 30,
      colaborador_id: 30,
      categoria: 'professores',
      unidade: 'cg',
      salario: 100,
      total: 100,
    },
    { nome: 'Professor', funcao: 'Professor' },
  );

  assert.equal(buildFolhaRateioPessoas([base], contas)[0].status, 'a_conciliar');

  for (const contaPagadoraId of ['ausente', 'inativa', 'empresa-inativa', 'rec']) {
    const [pessoa] = buildFolhaRateioPessoas(
      [{ ...base, conta_pagadora_id: contaPagadoraId }],
      contas,
    );
    assert.equal(pessoa.status, 'parcial', contaPagadoraId);
  }

  const [inativa] = buildFolhaRateioPessoas(
    [{ ...base, conta_pagadora_id: 'inativa' }],
    contas,
  );
  assert.deepEqual(inativa.contas, []);

  const [incoerente] = buildFolhaRateioPessoas(
    [{ ...base, conta_pagadora_id: 'rec' }],
    contas,
  );
  assert.deepEqual(incoerente.contas.map((item) => item.contaId), ['rec']);
});

test('orders people by accent-insensitive name', () => {
  const agata = lancamento(
    { id: 40, colaborador_id: 40, categoria: 'professores', unidade: 'cg' },
    { nome: 'Agata Lima', funcao: 'Professora' },
  );
  agata.colaboradores!.nome = '\u00c1gata Lima';
  const anaOutra = lancamento(
    { id: 41, colaborador_id: 41, categoria: 'professores', unidade: 'cg' },
    { nome: 'Ana Clara', funcao: 'Professora' },
  );
  const zoe = lancamento(
    { id: 42, colaborador_id: 42, categoria: 'professores', unidade: 'cg' },
    { nome: 'Zoe Alves', funcao: 'Professora' },
  );

  assert.deepEqual(
    buildFolhaRateioPessoas([zoe, anaOutra, agata], contas).map((pessoa) => pessoa.nome),
    ['\u00c1gata Lima', 'Ana Clara', 'Zoe Alves'],
  );
});

test('detects protected structured details and observations', () => {
  assert.equal(hasProtectedRateioMetadata(ana[2]), true);
  assert.equal(hasProtectedRateioMetadata({ ...ana[0], detalhamento: { nota: 'preservar' } }), true);
  assert.equal(hasProtectedRateioMetadata({ ...ana[0], observacao: 'preservar' }), true);
  assert.equal(hasProtectedRateioMetadata({ ...ana[0], detalhamento: {}, observacao: '  ' }), false);
});
