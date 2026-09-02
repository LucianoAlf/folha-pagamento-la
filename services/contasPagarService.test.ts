import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildParcelasContaPagar } from './contasPagarParcelas.ts';
import { assertCodigoBarrasValido, isCodigoBarrasValido, resolveCodigoMesBadge } from './contasPagarCodigoMes.ts';

const serviceSource = () => readFileSync(new URL('./contasPagarService.ts', import.meta.url), 'utf8');

test('buildParcelasContaPagar assigns competencia from each parcela vencimento', () => {
  const parcelas = buildParcelasContaPagar(
    {
      descricao: 'IPTU Loja 172 - (Recreio)',
      valor: 100,
      data_vencimento: '2026-07-07',
      competencia: '2026-07-01',
      tipo_lancamento: 'parcelada',
      parcela_atual: 1,
      total_parcelas: 5,
      status: 'pendente',
      unidade: 'rec',
    },
    [100, 100, 100, 100, 100],
    'user-1'
  );

  assert.deepEqual(
    parcelas.map((p) => p.data_vencimento),
    ['2026-07-07', '2026-08-07', '2026-09-07', '2026-10-07', '2026-11-07']
  );
  assert.deepEqual(
    parcelas.map((p) => p.competencia),
    ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']
  );
});

test('buildParcelasContaPagar assigns the same parcelamento_id to sibling parcelas', () => {
  const parcelas = buildParcelasContaPagar(
    {
      descricao: 'Teste Parcelamento',
      valor: 50,
      data_vencimento: '2026-07-10',
      competencia: '2026-07-01',
      tipo_lancamento: 'parcelada',
      parcela_atual: 1,
      total_parcelas: 3,
      status: 'pendente',
      unidade: 'rec',
    },
    [50, 50, 50],
    'user-1'
  );

  const ids = parcelas.map((p) => p.parcelamento_id);
  assert.equal(new Set(ids).size, 1);
  assert.match(String(ids[0]), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('contasPagarService relies on parcelamento_id instead of legacy descricao/unidade parcelamento matching', () => {
  const source = serviceSource();

  assert.doesNotMatch(source, /\.like\('descricao'/);
  assert.doesNotMatch(source, /baseDesc/);
});

test('createContaPagar assigns parcelamento_id to single-row parcelada inserts', () => {
  const source = serviceSource();

  assert.match(source, /contaInsert\.tipo_lancamento === 'parcelada'/);
  assert.match(source, /contaInsert\.parcelamento_id = contaInsert\.parcelamento_id \|\| crypto\.randomUUID\(\)/);
});

test('resolveCodigoMesBadge treats fixed PIX as collected even when monthly code is unavailable', () => {
  assert.equal(
    resolveCodigoMesBadge(
      {
        status: 'pendente',
        pix_chave_fixa: 'pix-fixo-da-conta',
      },
      {
        codigo_barras: null,
        chave_pix: null,
        qr_pix_payload: null,
        status_coleta: 'indisponivel',
      }
    ),
    'coletado'
  );
});

test('resolveCodigoMesBadge does not trust collected status when barcode is free text', () => {
  assert.equal(
    resolveCodigoMesBadge(
      {
        status: 'pendente',
        pix_chave_fixa: null,
      },
      {
        codigo_barras: 'Já existem no Super Folha — precisam de baixa',
        chave_pix: null,
        qr_pix_payload: null,
        status_coleta: 'coletado',
      },
      'hoje'
    ),
    'atualizar'
  );
});

test('codigo de barras accepts only barcode/linha digitavel format', () => {
  assert.equal(isCodigoBarrasValido('23792.95203 90000.076712 74000.107602 4 15340000175957'), true);
  assert.equal(isCodigoBarrasValido('83650000003044960048100000000000000000000000'), true);
  assert.equal(
    isCodigoBarrasValido(
      '23792.37205 90002.400373 61002.788208 1 14980000306182 - Anne R$3.061,82\n23792.37205 90002.400373 60002.788200 4 14980000306181 - Luciano R$3.061,81'
    ),
    false
  );
  assert.equal(
    isCodigoBarrasValido('23792.37205 90002.400373 61002.788208 1 14980000306182 - Anne R$3.061,82'),
    false
  );
  assert.equal(isCodigoBarrasValido('Já existem no Super Folha — precisam de baixa'), false);
  assert.equal(isCodigoBarrasValido('pago'), false);
  assert.throws(
    () => assertCodigoBarrasValido('Já existem no Super Folha — precisam de baixa'),
    /Código de barras inválido/
  );
});

test('upsertCodigoMes clears Maria stamp by default for human edits', () => {
  const source = serviceSource();

  assert.match(source, /const humanInput/);
  assert.match(source, /assertCodigoBarrasValido\(input\.codigo_barras\)/);
  assert.match(source, /registrado_por_agente:\s*false/);
  assert.match(source, /agente_nome:\s*null/);
  assert.match(source, /confirmado_por_nome:\s*null/);
  assert.match(source, /observacao_operacional:\s*null/);
  assert.match(source, /\.upsert\(\[humanInput\]/);
});

test('paid account adjustments use the audited RPC instead of a direct update', () => {
  const source = serviceSource();

  assert.match(source, /export async function ajustarContaPaga/);
  assert.match(source, /\.rpc\('contas_pagar_ajustar_paga'/);
  assert.match(source, /conta_id/);
  assert.match(source, /motivo/);
});

test('resolveCodigoMesBadge: conta em debito automatico nunca pede codigo do mes', () => {
  assert.equal(
    resolveCodigoMesBadge({ status: 'pendente', pix_chave_fixa: null, debito_automatico: true }, null, 'hoje'),
    'debito_automatico'
  );
  assert.equal(
    resolveCodigoMesBadge(
      { status: 'pendente', pix_chave_fixa: null, debito_automatico: true },
      { codigo_barras: null, chave_pix: null, qr_pix_payload: null, status_coleta: 'indisponivel' },
      'vencida'
    ),
    'debito_automatico'
  );
  assert.equal(
    resolveCodigoMesBadge({ status: 'pendente', pix_chave_fixa: null, debito_automatico: false }, null, 'hoje'),
    'atualizar'
  );
});

test('relatorio do dia tem fonte unica: o cliente nao remonta a mensagem (regressao do rodape vazio)', () => {
  const src = serviceSource();
  // O molde mora em supabase/functions/_shared/relatorioContasDia.ts. Uma segunda copia aqui
  // divergiu em silencio e deixou o preview da tela sem "SALDO EM CONTAS" (30/08 a 02/09).
  assert.doesNotMatch(src, /\*SALDO EM CONTAS\*/);
  assert.doesNotMatch(src, /montarRelatorioMensagem/);
  assert.doesNotMatch(src, /DÉBITO AUTOMÁTICO — não pagar manualmente/);
  assert.match(src, /supabase\.functions\.invoke\('contas-pagar-dia-gerar'/);
});
