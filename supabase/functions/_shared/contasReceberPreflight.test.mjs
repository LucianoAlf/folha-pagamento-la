import assert from 'node:assert/strict';
import test from 'node:test';

import { buildContasReceberPreflightBuckets } from './contasReceberPreflight.ts';

const item = (overrides = {}) => ({
  descricao: 'Parcela 06/2026 do curso de Guitarra',
  status_origem: 'paga',
  valor_liquido: 470,
  valor_pago: 470,
  source_missing: false,
  ...overrides,
});

test('preflight separa vendas avulsas e receitas operacionais de mensalidades', () => {
  const result = buildContasReceberPreflightBuckets([
    item(),
    item({ descricao: 'Venda no controle de estoque. Produto: Bone LA.', valor_liquido: 85, valor_pago: 85 }),
    item({ descricao: 'PG Servico Particular Renan', valor_liquido: 9900, valor_pago: 9900 }),
    item({ descricao: 'Estorno cartao MP', valor_liquido: 63.27, valor_pago: 63.27 }),
    item({ descricao: 'Receita sem regra conhecida', valor_liquido: 10, valor_pago: 10 }),
  ]);

  assert.deepEqual(result.classificacao, {
    mensalidades: 1,
    matriculas_passaportes: 0,
    locacoes: 0,
    vendas_avulsas: 1,
    receitas_operacionais: 2,
    rateios_excluidos: 0,
    pendentes_manuais: 1,
  });
  assert.equal(result.resumo.recebido, 10528.27);
  assert.equal(result.resumo.em_aberto, 0);
});

test('rateio continua excluido e status financeiro independe da classificacao da descricao', () => {
  const result = buildContasReceberPreflightBuckets([
    item({ descricao: 'Rateio interno entre unidades', valor_liquido: 24500, valor_pago: 24500 }),
    item({ descricao: 'Venda no controle de estoque. Produto: Palheta.', status_origem: 'aberta', valor_liquido: 9, valor_pago: null }),
  ]);

  assert.equal(result.classificacao.rateios_excluidos, 1);
  assert.equal(result.classificacao.vendas_avulsas, 1);
  assert.equal(result.resumo.excluido_rateio, 24500);
  assert.equal(result.resumo.em_aberto, 9);
  assert.equal(result.resumo.recebido, 0);
});
