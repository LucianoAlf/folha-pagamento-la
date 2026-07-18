import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContasReceberFonteStatus,
  buildContasReceberResumo,
  filterContasReceber,
} from './contasReceberSelectors.ts';

const contas = [
  { id: '1', unidade: 'cg', status: 'recebido', valor_pago: 100, valor_liquido: 100, excluido_da_receita: false, classificacao_status: 'confirmada', aluno_nome: 'Alice' },
  { id: '2', unidade: 'rec', status: 'pendente', valor_pago: null, valor_liquido: 80, excluido_da_receita: false, classificacao_status: 'pendente', aluno_nome: 'Bruno' },
  { id: '3', unidade: 'bar', status: 'pendente', valor_pago: null, valor_liquido: 50, excluido_da_receita: true, classificacao_status: 'excluida', aluno_nome: 'Rateio interno' },
] as any[];

test('resumo usa valor pago no recebido e valor liquido no aberto', () => {
  assert.deepEqual(buildContasReceberResumo(contas), {
    recebido: 100,
    emAberto: 80,
    totalReceita: 180,
    percentualRecebido: 55.56,
    pendentesClassificacao: 1,
    excluidos: 1,
  });
});

test('filtros separam fila manual e rateios excluidos', () => {
  assert.deepEqual(filterContasReceber(contas, { unidade: 'rec', status: 'all', classificacao: 'pendente', busca: '' }).map((item) => item.id), ['2']);
  assert.deepEqual(filterContasReceber(contas, { unidade: 'all', status: 'all', classificacao: 'excluida', busca: 'rateio' }).map((item) => item.id), ['3']);
});

test('fonte usa o timestamp do manifesto e sinaliza dado antigo', () => {
  assert.deepEqual(
    buildContasReceberFonteStatus('2026-07-16T08:00:00Z', new Date('2026-07-17T13:00:00Z')),
    {
      sourceSyncedAt: '2026-07-16T08:00:00Z',
      stale: true,
      ageHours: 29,
    },
  );
  assert.equal(buildContasReceberFonteStatus(null, new Date('2026-07-17T13:00:00Z')).stale, true);
});
