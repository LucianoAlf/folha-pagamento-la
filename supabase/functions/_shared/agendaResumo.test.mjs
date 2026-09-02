import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escolherDisparo, montarResumo, parseTimeToHHMM, withinWindow } from './agendaResumo.ts';

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

/* ---------------- decisao de envio (I-4/I-5) ---------------- */

test('escolherDisparo: hora > 21:00 SP dispara no dia seguinte pelo candidato de ontem (I-4)', () => {
  const now = new Date('2026-09-03T10:35:00Z'); // 07:35 SP
  const escolhido = escolherDisparo(now, [
    '2026-09-04T10:30:00Z', // clamp de hoje 22:00 -> amanha 07:30
    '2026-09-03T10:30:00Z', // clamp de ontem 22:00 -> hoje 07:30
  ]);
  assert.equal(escolhido, '2026-09-03T10:30:00.000Z');
});

test('escolherDisparo: 08:00 avaliado as 08:05 SP escolhe o de hoje', () => {
  const now = new Date('2026-09-03T11:05:00Z'); // 08:05 SP
  const escolhido = escolherDisparo(now, ['2026-09-03T11:00:00Z', '2026-09-02T11:00:00Z']);
  assert.equal(escolhido, '2026-09-03T11:00:00.000Z');
});

test('escolherDisparo: nenhum candidato na janela -> null', () => {
  const now = new Date('2026-09-03T11:05:00Z');
  assert.equal(escolherDisparo(now, ['2026-09-03T11:00:00Z'], 4), null);
  assert.equal(escolherDisparo(now, ['2026-09-04T11:00:00Z', '2026-09-02T11:00:00Z']), null);
  assert.equal(escolherDisparo(now, []), null);
});

test('escolherDisparo: candidatos nulos sao ignorados', () => {
  const now = new Date('2026-09-03T11:05:00Z');
  assert.equal(escolherDisparo(now, [null, undefined, '2026-09-03T11:00:00Z']), '2026-09-03T11:00:00.000Z');
  assert.equal(escolherDisparo(now, [null, undefined]), null);
});

test('withinWindow: [t, t+12min] inclusivo nas duas bordas', () => {
  const t = '2026-09-03T11:00:00Z';
  const at = (ms) => new Date(new Date(t).getTime() + ms);
  assert.equal(withinWindow(at(0), t, 12), true);
  assert.equal(withinWindow(at(12 * 60 * 1000), t, 12), true);
  assert.equal(withinWindow(at(-1000), t, 12), false);
  assert.equal(withinWindow(at(12 * 60 * 1000 + 1000), t, 12), false);
});

test('parseTimeToHHMM aceita time do postgres e cai no default', () => {
  assert.deepEqual(parseTimeToHHMM('08:00:00'), { hh: 8, mm: 0 });
  assert.deepEqual(parseTimeToHHMM('22:30'), { hh: 22, mm: 30 });
  assert.deepEqual(parseTimeToHHMM(null), { hh: 8, mm: 0 });
});
