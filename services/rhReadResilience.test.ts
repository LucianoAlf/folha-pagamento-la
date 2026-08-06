import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRhRead, withSupabaseReadTimeout } from './rhReadResilience.ts';

test('repete uma vez quando a leitura recebe erro transitorio', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(calls === 1 ? 'temporario' : '[]', { status: calls === 1 ? 503 : 200 });
  };

  const response = await fetchRhRead('https://example.test/colaboradores', {}, {
    fetchImpl,
    retryDelayMs: 0,
    timeoutMs: 100,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('nao repete 403 porque permissao nao e falha transitoria', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('negado', { status: 403 });
  };

  const response = await fetchRhRead('https://example.test/colaboradores', {}, {
    fetchImpl,
    retryDelayMs: 0,
    timeoutMs: 100,
  });

  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test('encerra requisicoes travadas e retorna erro acionavel', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  };

  await assert.rejects(
    fetchRhRead('https://example.test/colaboradores', {}, {
      fetchImpl,
      label: 'colaboradores do RH',
      retryDelayMs: 0,
      timeoutMs: 5,
    }),
    /colaboradores do RH demorou alem do esperado/i,
  );
  assert.equal(calls, 2);
});

test('traduz falha de rede depois da tentativa automatica', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    fetchRhRead('https://example.test/colaboradores', {}, {
      fetchImpl,
      label: 'A lista de colaboradores do RH',
      retryDelayMs: 0,
      timeoutMs: 50,
    }),
    /lista de colaboradores do RH falhou ao acessar o Supabase/i,
  );
  assert.equal(calls, 2);
});

test('cancela uma consulta Supabase pendurada', async () => {
  let aborted = false;
  await assert.rejects(
    withSupabaseReadTimeout(
      (signal) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      }),
      { label: 'A consulta de teste', timeoutMs: 5 },
    ),
    /consulta de teste demorou alem do esperado/i,
  );
  assert.equal(aborted, true);
});
