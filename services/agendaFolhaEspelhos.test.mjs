import assert from 'node:assert/strict';
import test from 'node:test';
import { planejarFechamentoEspelhosFolha, statusFechamentoEspelhoFolha } from './agendaFolhaEspelhos.ts';

const folhas = [
  { id: 31, status: 'aprovada', vinculo: 'v31' }, // latest (ago/2026)
  { id: 17, status: 'fechada', vinculo: 'v17' },
  { id: 16, status: 'pendente', vinculo: 'v16' },
  { id: 15, status: 'aprovada', vinculo: 'v15' }, // a folha do fantasma Mai/2026
  { id: 13, status: 'rascunho', vinculo: 'v13' },
];
const ativos = new Set(['v31', 'v16']); // latest + pendentes

test('statusFechamentoEspelhoFolha: pendente segue aberto; rascunho cancela; aprovada/fechada concluem', () => {
  assert.equal(statusFechamentoEspelhoFolha('pendente'), null);
  assert.equal(statusFechamentoEspelhoFolha('rascunho'), 'cancelada');
  assert.equal(statusFechamentoEspelhoFolha('aprovada'), 'concluida');
  assert.equal(statusFechamentoEspelhoFolha('fechada'), 'concluida');
  assert.equal(statusFechamentoEspelhoFolha('paga'), 'concluida');
});

test('espelho aberto de folha aprovada fora do conjunto ativo -> concluir (o caso do fantasma Mai/2026)', () => {
  const plano = planejarFechamentoEspelhosFolha({
    folhas, ativos,
    existentes: [{ id: 't15', vinculo_id: 'v15', status: 'pendente' }],
  });
  assert.deepEqual(plano, { concluir: ['t15'], cancelar: [] });
});

test('espelho aberto de folha que voltou a rascunho -> cancelar', () => {
  const plano = planejarFechamentoEspelhosFolha({
    folhas, ativos,
    existentes: [{ id: 't13', vinculo_id: 'v13', status: 'em_andamento' }],
  });
  assert.deepEqual(plano, { concluir: [], cancelar: ['t13'] });
});

test('espelhos do conjunto ativo (latest e pendentes) nunca sao tocados, mesmo com folha aprovada', () => {
  const plano = planejarFechamentoEspelhosFolha({
    folhas, ativos,
    existentes: [
      { id: 't31', vinculo_id: 'v31', status: 'pendente' },
      { id: 't16', vinculo_id: 'v16', status: 'pendente' },
    ],
  });
  assert.deepEqual(plano, { concluir: [], cancelar: [] });
});

test('espelho ja fechado (concluida/cancelada) e espelho sem folha correspondente sao ignorados', () => {
  const plano = planejarFechamentoEspelhosFolha({
    folhas, ativos,
    existentes: [
      { id: 't17', vinculo_id: 'v17', status: 'concluida' },
      { id: 't15c', vinculo_id: 'v15', status: 'cancelada' },
      { id: 'tX', vinculo_id: 'v999', status: 'pendente' },
      { id: 'tN', vinculo_id: null, status: 'pendente' },
    ],
  });
  assert.deepEqual(plano, { concluir: [], cancelar: [] });
});

test('varios espelhos: classifica cada um e mantem a ordem de entrada', () => {
  const plano = planejarFechamentoEspelhosFolha({
    folhas, ativos,
    existentes: [
      { id: 't15', vinculo_id: 'v15', status: 'pendente' },
      { id: 't13', vinculo_id: 'v13', status: 'adiada' },
      { id: 't17', vinculo_id: 'v17', status: 'pendente' },
    ],
  });
  assert.deepEqual(plano, { concluir: ['t15', 't17'], cancelar: ['t13'] });
});
