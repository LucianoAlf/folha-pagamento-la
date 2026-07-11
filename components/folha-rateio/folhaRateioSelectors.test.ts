import assert from 'node:assert/strict';
import test from 'node:test';

import type { Lancamento } from '../../types.ts';
import type { FolhaContaPagadora } from '../../types/folhaRateio.ts';
import {
  RATEIO_COMPONENTES,
  buildFolhaRateioDraft,
  buildFolhaRateioPayload,
  buildFolhaRateioPessoas,
  fromCents,
  hasProtectedRateioMetadata,
  toCents,
  validateFolhaRateioDraft,
} from './folhaRateioSelectors.ts';

function conta(
  id: string,
  nome: string,
  unidade: 'cg' | 'rec' | 'bar',
  options: { contaAtiva?: boolean; empresaAtiva?: boolean; unidadeAtiva?: boolean } = {},
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
        ativo: options.unidadeAtiva ?? true,
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
  conta('unidade-inativa', 'Unidade inativa', 'cg', { unidadeAtiva: false }),
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
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(10.075), 1008);
  assert.equal(toCents(-10.07), -1007);
  assert.equal(toCents(Number.POSITIVE_INFINITY), 0);
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

test('keeps categories separate and allows the same account across categories', () => {
  const [pessoa] = buildFolhaRateioPessoas(anne, contas);

  assert.equal(pessoa.status, 'conciliado');
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

test('marks duplicate category and account source rows as partial', () => {
  const duplicadas = [
    jeremias[0],
    { ...jeremias[0], id: 22, salario: 100, total: 100 },
  ];

  const [pessoa] = buildFolhaRateioPessoas(duplicadas, contas);

  assert.equal(pessoa.status, 'parcial');
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

  for (const contaPagadoraId of [
    'ausente',
    'inativa',
    'empresa-inativa',
    'unidade-inativa',
    'rec',
  ]) {
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

  const [empresaInativa] = buildFolhaRateioPessoas(
    [{ ...base, conta_pagadora_id: 'empresa-inativa' }],
    contas,
  );
  assert.deepEqual(empresaInativa.contas, []);

  const [unidadeInativa] = buildFolhaRateioPessoas(
    [{ ...base, conta_pagadora_id: 'unidade-inativa' }],
    contas,
  );
  assert.equal(unidadeInativa.status, 'parcial');
  assert.deepEqual(unidadeInativa.contas, []);

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

test('builds a lossless draft with only dynamic eligible destination accounts', () => {
  const draft = buildFolhaRateioDraft(ana, contas.slice(0, 3));
  const categoria = draft.categorias[0];

  assert.deepEqual(Object.keys(categoria.porConta), ['emla', 'kids', 'rec']);
  assert.equal(categoria.porConta.rec.salario, 80000);
  assert.equal(categoria.porConta.rec.bonus, 25000);
  assert.equal(categoria.porConta.emla.salario, 0);
  assert.equal(categoria.totais.salario, 275000);
  assert.deepEqual(categoria.sourceIds, [1, 2, 3]);
  assert.equal(draft.ancoras[1], 'rec');
  assert.equal(draft.ancoras[3], '');
  assert.notStrictEqual(draft.lancamentos, ana);
});

test('refuses empty, mixed-folha, and mixed-collaborator source snapshots', () => {
  assert.throws(
    () => buildFolhaRateioDraft([], contas),
    /ao menos um lancamento/i,
  );
  assert.throws(
    () => buildFolhaRateioDraft(
      [ana[0], { ...ana[1], folha_id: ana[0].folha_id + 1 }],
      contas,
    ),
    /mesma folha/i,
  );
  assert.throws(
    () => buildFolhaRateioDraft(
      [ana[0], { ...ana[1], colaborador_id: ana[0].colaborador_id + 1 }],
      contas,
    ),
    /mesmo colaborador/i,
  );
});

test('filters inactive accounts and accounts outside the supported units from the draft', () => {
  const unsupported = {
    ...conta('unsupported', 'Unsupported', 'cg'),
    empresa: {
      ...conta('unsupported', 'Unsupported', 'cg').empresa!,
      unidade: {
        ...conta('unsupported', 'Unsupported', 'cg').empresa!.unidade!,
        codigo: 'sp',
      },
    },
  } as FolhaContaPagadora;
  const draft = buildFolhaRateioDraft(ana, [...contas, unsupported]);

  assert.deepEqual(Object.keys(draft.categorias[0].porConta), ['emla', 'kids', 'rec', 'bar']);
  assert.deepEqual(draft.contas.map((item) => item.id), ['emla', 'kids', 'rec', 'bar']);
});

test('deduplicates eligible destination accounts by ID and emits one row per category account', () => {
  const source = lancamento(
    {
      id: 49,
      colaborador_id: 49,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'emla',
      salario: 100,
      total: 100,
    },
    { nome: 'Conta Unica', funcao: 'Operacional' },
  );
  const firstAccount = contas[0];
  const duplicateAccount = { ...firstAccount, apelido: 'Duplicada' };

  const draft = buildFolhaRateioDraft([source], [firstAccount, duplicateAccount]);
  const payload = buildFolhaRateioPayload(draft);

  assert.deepEqual(draft.contas, [firstAccount]);
  assert.deepEqual(Object.keys(draft.categorias[0].porConta), ['emla']);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].conta_pagadora_id, 'emla');
});

test('detects plural observations but does not protect a plain all-zero row', () => {
  const plural = {
    ...ana[0],
    id: 50,
    conta_pagadora_id: null,
    observacao: undefined,
    observacoes: 'preservar plural',
  } as Lancamento & { observacoes: string };
  const zero = lancamento(
    {
      id: 51,
      colaborador_id: 2,
      categoria: 'professores',
      unidade: 'cg',
    },
    { nome: 'Ana Paula', funcao: 'RH/DP' },
  );

  assert.equal(hasProtectedRateioMetadata(plural), true);
  const draft = buildFolhaRateioDraft([plural, zero], contas);
  assert.deepEqual(draft.protegidos.map((item) => item.lancamentoId), [50]);
  assert.equal(draft.ancoras[50], '');
  assert.equal(Object.hasOwn(draft.ancoras, 51), false);
});

function completeAnaEmEmLa(draft: ReturnType<typeof buildFolhaRateioDraft>): void {
  const emla = draft.categorias[0].porConta.emla;
  emla.salario = 125000;
  emla.bonus = 20000;
  emla.passagem = 25000;
  emla.inss = 20068;
  draft.ancoras[3] = 'emla';
}

test('reports a one-cent difference without absorbing it into Ana allocation', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);
  draft.categorias[0].porConta.emla.salario = 124999;

  const validation = validateFolhaRateioDraft(draft);
  const salaryDifference = validation.diferencas.find(
    (item) => item.categoria === 'staff_rateado' && item.componente === 'salario',
  );

  assert.equal(validation.valid, false);
  assert.deepEqual(salaryDifference, {
    categoria: 'staff_rateado',
    componente: 'salario',
    esperadoCentavos: 275000,
    alocadoCentavos: 274999,
    restanteCentavos: 1,
  });
  assert.equal(draft.categorias[0].porConta.emla.salario, 124999);
});

test('accepts Ana only after every component and protected anchor are complete', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);

  assert.deepEqual(validateFolhaRateioDraft(draft), {
    valid: true,
    diferencas: [],
    problemas: [],
    message: undefined,
  });
});

test('blocks two protected anchors in the same category and account', () => {
  const protectedRows = [
    { ...ana[0], id: 60, conta_pagadora_id: null, observacao: 'origem A' },
    { ...ana[0], id: 61, conta_pagadora_id: null, detalhamento: { origem: 'B' } },
  ];
  const draft = buildFolhaRateioDraft(protectedRows, contas);
  draft.categorias[0].porConta.rec.salario = 160000;
  draft.categorias[0].porConta.rec.bonus = 50000;
  draft.ancoras[60] = 'rec';
  draft.ancoras[61] = 'rec';

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) => item.codigo === 'ancora_protegida_duplicada'));
  assert.match(validation.message || '', /detalhes.*mesma conta/i);
});

test('requires plural observations to be anchored to an eligible account', () => {
  const plural = {
    ...ana[0],
    id: 62,
    conta_pagadora_id: null,
    observacao: undefined,
    observacoes: 'nota do banco',
  } as Lancamento & { observacoes: string };
  const draft = buildFolhaRateioDraft([plural], contas);
  draft.categorias[0].porConta.rec.salario = 80000;
  draft.categorias[0].porConta.rec.bonus = 25000;

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) => item.codigo === 'ancora_ausente'));
  assert.match(validation.message || '', /linha 62.*conta/i);
});

test('blocks an anchor assigned to an unknown or inactive account', () => {
  for (const contaId of ['unknown', 'inativa']) {
    const draft = buildFolhaRateioDraft(ana, contas);
    completeAnaEmEmLa(draft);
    draft.ancoras[3] = contaId;

    const validation = validateFolhaRateioDraft(draft);

    assert.equal(validation.valid, false, contaId);
    assert.ok(
      validation.problemas.some((item) =>
        item.codigo === 'conta_invalida' && item.contaId === contaId),
      contaId,
    );
  }
});

test('rejects duplicate mutable draft account IDs', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);
  draft.contas.push(draft.contas[0]);

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'conta_duplicada' && item.contaId === 'emla'),
  );
});

test('rejects a missing account matrix entry before payload dereferences it', () => {
  const zero = lancamento(
    {
      id: 64,
      colaborador_id: 64,
      categoria: 'professores',
      unidade: 'cg',
    },
    { nome: 'Matriz', funcao: 'Professor' },
  );
  const draft = buildFolhaRateioDraft([zero], contas);
  draft.ancoras[64] = 'emla';
  delete draft.categorias[0].porConta.emla;

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'matriz_conta_ausente' && item.contaId === 'emla'),
  );
  assert.throws(
    () => buildFolhaRateioPayload(draft),
    (error: Error) => !(error instanceof TypeError) && error.message === validation.message,
  );
});

test('rejects extra account keys and incomplete component entries in the matrix', () => {
  const withExtra = buildFolhaRateioDraft(anne, contas);
  withExtra.categorias[0].porConta.extra = {
    salario: 0,
    bonus: 0,
    comissao: 0,
    reembolso: 0,
    passagem: 0,
    inss: 0,
    descontos: 0,
  };

  const extraValidation = validateFolhaRateioDraft(withExtra);
  assert.ok(extraValidation.problemas.some((item) =>
    item.codigo === 'matriz_conta_extra' && item.contaId === 'extra'),
  );

  const incomplete = buildFolhaRateioDraft(anne, contas);
  delete (incomplete.categorias[0].porConta.rec as Partial<
    typeof incomplete.categorias[0]['porConta'][string]
  >).salario;

  const incompleteValidation = validateFolhaRateioDraft(incomplete);
  assert.ok(incompleteValidation.problemas.some((item) =>
    item.codigo === 'matriz_componentes_invalidos'
    && item.contaId === 'rec'
    && item.componente === 'salario'),
  );

  const undefinedComponent = buildFolhaRateioDraft(anne, contas);
  (undefinedComponent.categorias[0].porConta.rec as Partial<
    typeof undefinedComponent.categorias[0]['porConta'][string]
  >).salario = undefined;
  assert.ok(validateFolhaRateioDraft(undefinedComponent).problemas.some((item) =>
    item.codigo === 'matriz_componentes_invalidos'
    && item.contaId === 'rec'
    && item.componente === 'salario'),
  );
});

test('rejects an ineligible account injected into mutable draft accounts', () => {
  const draft = buildFolhaRateioDraft(anne, contas);
  draft.contas.push(contas.find((item) => item.id === 'inativa')!);

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'conta_invalida' && item.contaId === 'inativa'),
  );
});

test('validates multiple categories independently', () => {
  const draft = buildFolhaRateioDraft(anne, contas);
  draft.categorias[0].porConta.rec.bonus = 9999;

  const validation = validateFolhaRateioDraft(draft);

  assert.deepEqual(
    validation.diferencas.map((item) => [item.categoria, item.componente, item.restanteCentavos]),
    [['staff_rateado', 'bonus', 1]],
  );
  assert.equal(
    validation.diferencas.some((item) => item.categoria === 'equipe_operacional'),
    false,
  );
});

test('rejects an empty mutable source snapshot', () => {
  const draft = buildFolhaRateioDraft(anne, contas);
  const emptySnapshotDraft = { ...draft, sourceSnapshot: [] };

  const validation = validateFolhaRateioDraft(emptySnapshotDraft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) => item.codigo === 'draft_vazio'));
});

test('cross-checks missing, extra, and duplicate draft categories against the source snapshot', () => {
  const missing = buildFolhaRateioDraft(anne, contas);
  missing.categorias = missing.categorias.filter(
    (categoria) => categoria.categoria !== 'staff_rateado',
  );
  assert.ok(validateFolhaRateioDraft(missing).problemas.some((item) =>
    item.codigo === 'categoria_ausente' && item.categoria === 'staff_rateado'),
  );

  const extra = buildFolhaRateioDraft(anne, contas);
  extra.categorias.push({
    ...extra.categorias[0],
    categoria: 'professores',
    totais: { ...extra.categorias[0].totais },
    porConta: Object.fromEntries(Object.entries(extra.categorias[0].porConta).map(
      ([contaId, componentes]) => [contaId, { ...componentes }],
    )),
    sourceIds: [...extra.categorias[0].sourceIds],
  });
  assert.ok(validateFolhaRateioDraft(extra).problemas.some((item) =>
    item.codigo === 'categoria_extra' && item.categoria === 'professores'),
  );

  const duplicate = buildFolhaRateioDraft(anne, contas);
  duplicate.categorias.push(duplicate.categorias[0]);
  assert.ok(validateFolhaRateioDraft(duplicate).problemas.some((item) =>
    item.codigo === 'categoria_duplicada'
    && item.categoria === duplicate.categorias[0].categoria),
  );
});

test('cross-checks mutable totals and source IDs against exact source-derived values', () => {
  const tamperedTotals = buildFolhaRateioDraft(anne, contas);
  tamperedTotals.categorias[0].totais.bonus += 1;
  const totalsValidation = validateFolhaRateioDraft(tamperedTotals);
  assert.ok(totalsValidation.problemas.some((item) =>
    item.codigo === 'totais_adulterados'
    && item.categoria === 'staff_rateado'
    && item.componente === 'bonus'),
  );
  assert.deepEqual(totalsValidation.diferencas, []);

  const extraTotal = buildFolhaRateioDraft(anne, contas);
  (extraTotal.categorias[0].totais as Record<string, number>).extra = 0;
  assert.ok(validateFolhaRateioDraft(extraTotal).problemas.some((item) =>
    item.codigo === 'totais_adulterados'
    && item.categoria === 'staff_rateado'),
  );

  const tamperedIds = buildFolhaRateioDraft(ana, contas);
  tamperedIds.categorias[0].sourceIds.reverse();
  assert.ok(validateFolhaRateioDraft(tamperedIds).problemas.some((item) =>
    item.codigo === 'source_ids_adulterados'
    && item.categoria === 'staff_rateado'),
  );
});

test('rejects a negative original source component with a source-data problem', () => {
  const source = lancamento(
    {
      id: 65,
      colaborador_id: 65,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'emla',
      salario: -1,
      total: -1,
    },
    { nome: 'Origem Negativa', funcao: 'Operacional' },
  );
  const draft = buildFolhaRateioDraft([source], contas);

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'valor_origem_negativo'
    && item.lancamentoId === 65
    && item.componente === 'salario'),
  );
  assert.match(validation.message || '', /origem.*negativ/i);
});

test('returns only the highest-priority concise validation message', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  const validation = validateFolhaRateioDraft(draft);
  const missingAnchor = validation.problemas.find((item) => item.codigo === 'ancora_ausente');

  assert.ok(validation.problemas.length > 2);
  assert.ok(missingAnchor);
  assert.equal(validation.message, missingAnchor.mensagem);
  assert.doesNotMatch(validation.message || '', /staff_rateado\/salario/);
  assert.ok((validation.message?.length || 0) < 160);
});

test('rejects fractional cents instead of silently rounding draft values', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);
  draft.categorias[0].porConta.emla.salario = 124999.5;

  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) => item.codigo === 'centavos_invalidos'));
  assert.equal(draft.categorias[0].porConta.emla.salario, 124999.5);
});

test('rejects original source components with more than two decimal places before rounding', () => {
  const source = lancamento(
    {
      id: 63,
      colaborador_id: 63,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'emla',
      salario: 1.005,
      total: 1.005,
    },
    { nome: 'Precisao', funcao: 'Operacional' },
  );

  const draft = buildFolhaRateioDraft([source], contas);
  const validation = validateFolhaRateioDraft(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'precisao_origem_invalida'
    && item.lancamentoId === 63
    && item.componente === 'salario'),
  );
  assert.match(validation.message || '', /origem.*duas casas decimais/i);
  assert.equal(source.salario, 1.005);
  assert.notStrictEqual(draft.lancamentos[0], source);
});

test('keeps an independent frozen source snapshot when caller and UI rows are mutated', () => {
  const source = lancamento(
    {
      id: 66,
      colaborador_id: 66,
      categoria: 'equipe_operacional',
      unidade: 'cg',
      conta_pagadora_id: 'emla',
      salario: 100,
      total: 100,
    },
    { nome: 'Snapshot', funcao: 'Operacional' },
  );
  const draft = buildFolhaRateioDraft([source], contas);
  const snapshot = draft.sourceSnapshot[0];

  assert.notStrictEqual(snapshot, source);
  assert.notStrictEqual(snapshot.componentesCentavos, draft.categorias[0].totais);
  assert.notStrictEqual(snapshot.componentesCentavos, draft.categorias[0].porConta.emla);
  assert.equal(Object.isFrozen(draft.sourceSnapshot), true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.componentesCentavos), true);

  source.salario = 50;
  draft.lancamentos[0].salario = 50;
  draft.categorias[0].totais.salario = 5000;
  draft.categorias[0].porConta.emla.salario = 5000;

  const validation = validateFolhaRateioDraft(draft);
  const salaryDifference = validation.diferencas.find((item) => item.componente === 'salario');

  assert.equal(snapshot.componentesOriginais.salario, 100);
  assert.equal(snapshot.componentesCentavos.salario, 10000);
  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) => item.codigo === 'totais_adulterados'));
  assert.deepEqual(salaryDifference, {
    categoria: 'equipe_operacional',
    componente: 'salario',
    esperadoCentavos: 10000,
    alocadoCentavos: 5000,
    restanteCentavos: 5000,
  });
});

test('rejects a negative allocated cent even when another account compensates the total', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);
  draft.categorias[0].porConta.emla.salario = -1;
  draft.categorias[0].porConta.kids.salario = 125001;

  const validation = validateFolhaRateioDraft(draft);

  assert.deepEqual(validation.diferencas, []);
  assert.equal(validation.valid, false);
  assert.ok(validation.problemas.some((item) =>
    item.codigo === 'valor_negativo'
    && item.contaId === 'emla'
    && item.componente === 'salario'),
  );
  assert.match(validation.message || '', /negativ/i);
});

test('builds Ana payload with the protected EMLA ID and exact existing Rec and Bar IDs', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);

  const payload = buildFolhaRateioPayload(draft);

  assert.deepEqual(payload, [
    {
      lancamento_id: 3,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'emla',
      salario: 1250,
      bonus: 200,
      comissao: 0,
      passagem: 250,
      reembolso: 0,
      inss: 200.68,
      descontos: 0,
    },
    {
      lancamento_id: 1,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'rec',
      salario: 800,
      bonus: 250,
      comissao: 0,
      passagem: 0,
      reembolso: 0,
      inss: 0,
      descontos: 0,
    },
    {
      lancamento_id: 2,
      categoria: 'staff_rateado',
      conta_pagadora_id: 'bar',
      salario: 700,
      bonus: 250,
      comissao: 0,
      passagem: 0,
      reembolso: 0,
      inss: 0,
      descontos: 0,
    },
  ]);
});

test('omits a plain all-zero row without blocking validation', () => {
  const zero = lancamento(
    {
      id: 80,
      colaborador_id: 80,
      categoria: 'professores',
      unidade: 'cg',
    },
    { nome: 'Zero', funcao: 'Professor' },
  );
  const draft = buildFolhaRateioDraft([zero], contas);
  const validation = validateFolhaRateioDraft(draft);
  const payload = buildFolhaRateioPayload(draft);

  assert.equal(validation.valid, true);
  assert.deepEqual(draft.protegidos, []);
  assert.equal(Object.hasOwn(draft.ancoras, 80), false);
  assert.deepEqual(payload, []);
});

test('preserves an all-zero row with metadata exactly once after it is anchored', () => {
  const zero = lancamento(
    {
      id: 80,
      colaborador_id: 80,
      categoria: 'professores',
      unidade: 'cg',
      observacao: 'Manter origem do ajuste',
    },
    { nome: 'Zero protegido', funcao: 'Professor' },
  );
  const draft = buildFolhaRateioDraft([zero], contas);
  draft.ancoras[80] = 'emla';

  const payload = buildFolhaRateioPayload(draft);

  assert.deepEqual(draft.protegidos.map((item) => item.lancamentoId), [80]);
  assert.equal(payload.length, 1);
  assert.deepEqual(payload[0], {
    lancamento_id: 80,
    categoria: 'professores',
    conta_pagadora_id: 'emla',
    salario: 0,
    bonus: 0,
    comissao: 0,
    passagem: 0,
    reembolso: 0,
    inss: 0,
    descontos: 0,
  });
});

test('normalizes a protected anchor before carrying its source ID into the payload', () => {
  const zero = lancamento(
    {
      id: 81,
      colaborador_id: 81,
      categoria: 'professores',
      unidade: 'cg',
      detalhamento: { origem: 'ajuste' },
    },
    { nome: 'Zero Espacado', funcao: 'Professor' },
  );
  const draft = buildFolhaRateioDraft([zero], contas);
  draft.ancoras[81] = ' emla ';

  const payload = buildFolhaRateioPayload(draft);

  assert.equal(payload.length, 1);
  assert.equal(payload[0].conta_pagadora_id, 'emla');
  assert.equal(payload[0].lancamento_id, 81);
});

test('never reuses an ID and leaves new extra destination rows with null IDs', () => {
  const sources = [
    lancamento(
      {
        id: 90,
        colaborador_id: 90,
        categoria: 'equipe_operacional',
        unidade: 'rec',
        conta_pagadora_id: 'rec',
        salario: 100,
        total: 100,
      },
      { nome: 'Destino', funcao: 'Operacional' },
    ),
    lancamento(
      {
        id: 91,
        colaborador_id: 90,
        categoria: 'equipe_operacional',
        unidade: 'bar',
        conta_pagadora_id: 'bar',
        salario: 100,
        total: 100,
      },
      { nome: 'Destino', funcao: 'Operacional' },
    ),
  ];
  const draft = buildFolhaRateioDraft(sources, contas);
  const porConta = draft.categorias[0].porConta;
  porConta.emla.salario = 5000;
  porConta.kids.salario = 5000;
  porConta.rec.salario = 5000;
  porConta.bar.salario = 5000;

  const payload = buildFolhaRateioPayload(draft);
  const byAccount = Object.fromEntries(payload.map((item) => [item.conta_pagadora_id, item]));
  const ids = payload.flatMap((item) => item.lancamento_id === null ? [] : [item.lancamento_id]);

  assert.equal(byAccount.rec.lancamento_id, 90);
  assert.equal(byAccount.bar.lancamento_id, 91);
  assert.equal(byAccount.emla.lancamento_id, null);
  assert.equal(byAccount.kids.lancamento_id, null);
  assert.equal(new Set(ids).size, ids.length);
});

test('uses snapshot accounts for payload ID selection after UI rows are mutated', () => {
  const sources = [
    lancamento(
      {
        id: 92,
        colaborador_id: 92,
        categoria: 'equipe_operacional',
        unidade: 'rec',
        conta_pagadora_id: 'rec',
        salario: 100,
        total: 100,
      },
      { nome: 'Snapshot IDs', funcao: 'Operacional' },
    ),
    lancamento(
      {
        id: 93,
        colaborador_id: 92,
        categoria: 'equipe_operacional',
        unidade: 'bar',
        conta_pagadora_id: 'bar',
        salario: 100,
        total: 100,
      },
      { nome: 'Snapshot IDs', funcao: 'Operacional' },
    ),
  ];
  const draft = buildFolhaRateioDraft(sources, contas);
  draft.lancamentos[0].conta_pagadora_id = 'bar';
  draft.lancamentos[1].conta_pagadora_id = 'rec';
  draft.ancoras[92] = '';
  draft.ancoras[93] = '';

  const payload = buildFolhaRateioPayload(draft);
  const byAccount = Object.fromEntries(payload.map((item) => [item.conta_pagadora_id, item]));

  assert.equal(byAccount.rec.lancamento_id, 92);
  assert.equal(byAccount.bar.lancamento_id, 93);
});

test('refuses to build payload from an invalid draft using the validation message', () => {
  const draft = buildFolhaRateioDraft(ana, contas);
  completeAnaEmEmLa(draft);
  draft.categorias[0].porConta.emla.salario = 124999;
  const validation = validateFolhaRateioDraft(draft);

  assert.throws(
    () => buildFolhaRateioPayload(draft),
    (error: Error) => error.message === validation.message,
  );
});
