import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarResumo } from './agendaResumo.ts';

const payload = {
  nome: 'Rose',
  itens: Array.from({ length: 9 }, (_, i) => ({
    id: `t${i}`, titulo: `Rotina ${i + 1}`, prioridade: i === 0 ? 'urgente' : 'media',
    vencimento_em: '2026-09-02T12:00:00Z', dia_inteiro: true, parent_id: i === 1 ? 't0' : null,
  })),
  atrasadas: [
    { id: 'a1', titulo: 'Conciliar 8641', prioridade: 'alta', vencimento_em: '2026-08-17T12:00:00Z' },
    { id: 'a2', titulo: 'Relatório Mensal', prioridade: 'media', vencimento_em: '2026-08-05T12:00:00Z' },
  ],
  pagar: { n: 7, total: 4321.5 },
  pagar_atrasadas: { n: 2, total: 100 },
};

test('resumo diario lista TODAS as tarefas (sem "... e mais N") e agrega Pagar: numa linha', () => {
  const msg = montarResumo(payload, { tipo: 'diario', dataLabel: 'quarta-feira, 02 de setembro' });
  assert.match(msg, /BOM DIA, ROSE!/);
  for (let i = 1; i <= 9; i++) assert.match(msg, new RegExp(`Rotina ${i}\\b`));
  assert.doesNotMatch(msg, /e mais/);
  assert.match(msg, /• 9 tarefas para hoje/);
  assert.match(msg, /• 2 atrasadas/);
  assert.match(msg, /7 contas hoje — R\$\s?4\.321,50/);
  assert.match(msg, /detalhe no laudo/);
  assert.match(msg, /2 contas atrasadas — R\$\s?100,00/);
  assert.match(msg, /Conciliar 8641/);
  assert.match(msg, /Relatório Mensal/);
});

test('filha aparece indentada sob o pai', () => {
  const msg = montarResumo(payload, { tipo: 'diario', dataLabel: 'x' });
  assert.match(msg, /↳ Rotina 2/);
});

test('sem contas -> sem linha de contas; semanal usa cabecalho proprio', () => {
  const msg = montarResumo({ ...payload, pagar: { n: 0, total: 0 }, pagar_atrasadas: { n: 0, total: 0 } }, { tipo: 'semanal', dataLabel: 'x' });
  assert.doesNotMatch(msg, /contas hoje/);
  assert.match(msg, /RESUMO SEMANAL/);
  assert.match(msg, /PRÓXIMAS TAREFAS/);
});
