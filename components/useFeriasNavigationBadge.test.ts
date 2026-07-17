import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFeriasBadgeStore,
  createSessionAwareFeriasBadgeCache,
  toFeriasNavigationBadge,
  type FeriasBadgeCounts,
  type FeriasBadgeStore,
} from './useFeriasNavigationBadge.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const counts = (vencidos: number, proximos = 0): FeriasBadgeCounts => ({
  vencidos,
  proximos,
});

test('origem descreve colaboradores com singular e plural para cada estado', () => {
  assert.deepEqual(toFeriasNavigationBadge(counts(1)), {
    count: 1,
    variant: 'danger',
    pulse: true,
    accessibleLabel: '1 colaborador com férias vencidas',
  });
  assert.deepEqual(toFeriasNavigationBadge(counts(2)), {
    count: 2,
    variant: 'danger',
    pulse: true,
    accessibleLabel: '2 colaboradores com férias vencidas',
  });
  assert.deepEqual(toFeriasNavigationBadge(counts(0, 1)), {
    count: 1,
    variant: 'warning',
    accessibleLabel: '1 colaborador com férias a vencer em até 30 dias',
  });
  assert.deepEqual(toFeriasNavigationBadge(counts(0, 3)), {
    count: 3,
    variant: 'warning',
    accessibleLabel: '3 colaboradores com férias a vencer em até 30 dias',
  });
  assert.equal(toFeriasNavigationBadge(counts(0)), undefined);
});

test('cache separa sessoes e reaproveita apenas dados da mesma sessao', async () => {
  const cache = createSessionAwareFeriasBadgeCache({ ttlMs: 60_000, now: () => 100 });
  let loads = 0;

  assert.deepEqual(
    await cache.get('user-a', async () => {
      loads += 1;
      return counts(1);
    }),
    counts(1),
  );
  assert.deepEqual(
    await cache.get('user-a', async () => {
      throw new Error('nao deveria recarregar user-a');
    }),
    counts(1),
  );
  assert.deepEqual(
    await cache.get('user-b', async () => {
      loads += 1;
      return counts(0, 2);
    }),
    counts(0, 2),
  );
  assert.equal(loads, 2);
});

test('cache deduplica inflight da mesma sessao', async () => {
  const cache = createSessionAwareFeriasBadgeCache();
  const pending = deferred<FeriasBadgeCounts>();
  let loads = 0;
  const load = () => {
    loads += 1;
    return pending.promise;
  };

  const first = cache.get('user-a', load);
  const second = cache.get('user-a', load);
  assert.equal(loads, 1);
  pending.resolve(counts(3));
  assert.deepEqual(await Promise.all([first, second]), [counts(3), counts(3)]);
});

test('cache limpa rejeicao para permitir retry', async () => {
  const cache = createSessionAwareFeriasBadgeCache();
  let loads = 0;

  await assert.rejects(
    cache.get('user-a', async () => {
      loads += 1;
      throw new Error('falha temporaria');
    }),
    /falha temporaria/,
  );
  assert.deepEqual(
    await cache.get('user-a', async () => {
      loads += 1;
      return counts(4);
    }),
    counts(4),
  );
  assert.equal(loads, 2);
});

test('invalidacao impede inflight antigo de sobrescrever o cache atual', async () => {
  const cache = createSessionAwareFeriasBadgeCache();
  const stale = deferred<FeriasBadgeCounts>();
  const staleRequest = cache.get('user-a', () => stale.promise);

  cache.invalidate('user-a');
  assert.deepEqual(await cache.get('user-a', async () => counts(0, 5)), counts(0, 5));
  stale.resolve(counts(9));
  assert.deepEqual(await staleRequest, counts(9));
  assert.deepEqual(
    await cache.get('user-a', async () => {
      throw new Error('resultado antigo contaminou o cache');
    }),
    counts(0, 5),
  );
});

test('store compartilha auth, limpa imediatamente e ignora resposta da sessao anterior', async () => {
  const bootstrap = deferred<string | null>();
  const oldSession = deferred<FeriasBadgeCounts>();
  let authListener: ((event: string, userId: string | null) => void) | undefined;
  let authSubscriptions = 0;
  let authUnsubscriptions = 0;
  let currentAuthUser: string | null = null;
  let loads = 0;

  const store: FeriasBadgeStore = createFeriasBadgeStore({
    getSessionUserId: () => bootstrap.promise,
    subscribeAuthState: (listener) => {
      authSubscriptions += 1;
      authListener = listener;
      return () => {
        authUnsubscriptions += 1;
      };
    },
    loadCounts: () => {
      loads += 1;
      return currentAuthUser === 'user-a' ? oldSession.promise : Promise.resolve(counts(2));
    },
  });
  const firstSeen: Array<ReturnType<FeriasBadgeStore['getSnapshot']>> = [];
  const secondSeen: Array<ReturnType<FeriasBadgeStore['getSnapshot']>> = [];
  const unsubscribeFirst = store.subscribe((badge) => firstSeen.push(badge));
  const unsubscribeSecond = store.subscribe((badge) => secondSeen.push(badge));

  assert.equal(authSubscriptions, 1);
  currentAuthUser = 'user-a';
  authListener?.('SIGNED_IN', 'user-a');
  assert.equal(loads, 1);

  currentAuthUser = 'user-b';
  authListener?.('SIGNED_IN', 'user-b');
  assert.equal(firstSeen.at(-1), undefined);
  assert.equal(secondSeen.at(-1), undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(firstSeen.at(-1), {
    count: 2,
    variant: 'danger',
    pulse: true,
    accessibleLabel: '2 colaboradores com férias vencidas',
  });
  assert.deepEqual(secondSeen.at(-1), {
    count: 2,
    variant: 'danger',
    pulse: true,
    accessibleLabel: '2 colaboradores com férias vencidas',
  });
  assert.equal(loads, 2);

  oldSession.resolve(counts(8));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(firstSeen.at(-1), {
    count: 2,
    variant: 'danger',
    pulse: true,
    accessibleLabel: '2 colaboradores com férias vencidas',
  });

  bootstrap.resolve(null);
  unsubscribeFirst();
  unsubscribeSecond();
  assert.equal(authUnsubscriptions, 1);
});

test('store ignora callback de auth pertencente a assinatura desmontada', async () => {
  const authListeners: Array<(event: string, userId: string | null) => void> = [];
  let loads = 0;
  const store = createFeriasBadgeStore({
    getSessionUserId: () => new Promise<string | null>(() => undefined),
    subscribeAuthState: (listener) => {
      authListeners.push(listener);
      return () => undefined;
    },
    loadCounts: async () => {
      loads += 1;
      return counts(1);
    },
  });

  const unsubscribeFirstMount = store.subscribe(() => undefined);
  unsubscribeFirstMount();
  const unsubscribeSecondMount = store.subscribe(() => undefined);

  authListeners[0]?.('SIGNED_IN', 'stale-user');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(loads, 0);

  authListeners[1]?.('SIGNED_IN', 'current-user');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  unsubscribeSecondMount();
});
