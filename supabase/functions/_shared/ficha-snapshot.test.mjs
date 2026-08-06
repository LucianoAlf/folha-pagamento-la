import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideFichaRefresh,
  hashFichaSnapshot,
} from './ficha-snapshot.mjs';

test('hash da ficha ignora a ordem das chaves do snapshot', async () => {
  const primeiro = await hashFichaSnapshot({ perfil: { primario: 'AMY' }, rider: { respostas: { rende_mais: 'Com planejamento' } } });
  const segundo = await hashFichaSnapshot({ rider: { respostas: { rende_mais: 'Com planejamento' } }, perfil: { primario: 'AMY' } });

  assert.equal(primeiro, segundo);
});

test('reimportacao alterada preserva roteiro e o marca desatualizado', () => {
  assert.deepEqual(
    decideFichaRefresh({ previousHash: 'anterior', nextHash: 'novo', hasInterviewQuestions: true }),
    { changed: true, perguntasDesatualizadas: true },
  );
});

test('primeira importacao ou reimportacao identica nao marca roteiro como desatualizado', () => {
  assert.deepEqual(
    decideFichaRefresh({ previousHash: null, nextHash: 'novo', hasInterviewQuestions: false }),
    { changed: true, perguntasDesatualizadas: false },
  );
  assert.deepEqual(
    decideFichaRefresh({ previousHash: 'igual', nextHash: 'igual', hasInterviewQuestions: true }),
    { changed: false, perguntasDesatualizadas: false },
  );
});
