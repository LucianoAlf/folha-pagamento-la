import { useEffect, useState } from 'react';
import type { NavigationBadge } from './navigation';

const FERIAS_BADGE_TTL_MS = 60_000;
const FERIAS_BADGE_REFRESH_MS = 5 * 60 * 1000;

export interface FeriasBadgeCounts {
  vencidos: number;
  proximos: number;
}

interface SessionCacheEntry {
  generation: number;
  cached?: { at: number; counts: FeriasBadgeCounts };
  inFlight?: { generation: number; promise: Promise<FeriasBadgeCounts> };
}

export interface SessionAwareFeriasBadgeCache {
  get: (
    sessionUserId: string,
    loader: () => Promise<FeriasBadgeCounts>,
  ) => Promise<FeriasBadgeCounts>;
  invalidate: (sessionUserId: string) => void;
}

export function createSessionAwareFeriasBadgeCache(
  options: { ttlMs?: number; now?: () => number } = {},
): SessionAwareFeriasBadgeCache {
  const ttlMs = options.ttlMs ?? FERIAS_BADGE_TTL_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, SessionCacheEntry>();

  const getEntry = (sessionUserId: string) => {
    const existing = entries.get(sessionUserId);
    if (existing) return existing;
    const created: SessionCacheEntry = { generation: 0 };
    entries.set(sessionUserId, created);
    return created;
  };

  return {
    get(sessionUserId, loader) {
      const entry = getEntry(sessionUserId);
      if (entry.cached && now() - entry.cached.at < ttlMs) {
        return Promise.resolve(entry.cached.counts);
      }
      if (entry.inFlight?.generation === entry.generation) {
        return entry.inFlight.promise;
      }

      const generation = entry.generation;
      let loaded: Promise<FeriasBadgeCounts>;
      try {
        loaded = Promise.resolve(loader());
      } catch (error) {
        loaded = Promise.reject(error);
      }

      let request!: Promise<FeriasBadgeCounts>;
      request = loaded
        .then((counts) => {
          const current = entries.get(sessionUserId);
          if (current === entry && current.generation === generation) {
            current.cached = { at: now(), counts };
          }
          return counts;
        })
        .finally(() => {
          const current = entries.get(sessionUserId);
          if (current?.inFlight?.promise === request) {
            current.inFlight = undefined;
          }
        });
      entry.inFlight = { generation, promise: request };
      return request;
    },
    invalidate(sessionUserId) {
      const entry = getEntry(sessionUserId);
      entry.generation += 1;
      entry.cached = undefined;
      entry.inFlight = undefined;
    },
  };
}

type FeriasBadgeListener = (badge: NavigationBadge | undefined) => void;
type AuthStateListener = (event: string, sessionUserId: string | null) => void;

interface FeriasBadgeStoreOptions {
  getSessionUserId: () => Promise<string | null>;
  subscribeAuthState: (listener: AuthStateListener) => () => void;
  loadCounts: () => Promise<FeriasBadgeCounts>;
  cache?: SessionAwareFeriasBadgeCache;
  scheduleRefresh?: (refresh: () => void) => () => void;
  onError?: (error: unknown) => void;
}

export interface FeriasBadgeStore {
  subscribe: (listener: FeriasBadgeListener) => () => void;
  getSnapshot: () => NavigationBadge | undefined;
  refresh: () => Promise<void>;
}

function toNavigationBadge({ vencidos, proximos }: FeriasBadgeCounts) {
  return vencidos > 0
    ? ({ count: vencidos, variant: 'danger', pulse: true } satisfies NavigationBadge)
    : proximos > 0
      ? ({ count: proximos, variant: 'warning' } satisfies NavigationBadge)
      : undefined;
}

export function createFeriasBadgeStore(options: FeriasBadgeStoreOptions): FeriasBadgeStore {
  const cache = options.cache ?? createSessionAwareFeriasBadgeCache();
  const listeners = new Set<FeriasBadgeListener>();
  let badge: NavigationBadge | undefined;
  let currentSessionUserId: string | null = null;
  let revision = 0;
  let initialized = false;
  let started = false;
  let lifecycle = 0;
  let stopAuthState: (() => void) | undefined;
  let stopRefresh: (() => void) | undefined;

  const publish = (nextBadge: NavigationBadge | undefined) => {
    badge = nextBadge;
    listeners.forEach((listener) => listener(nextBadge));
  };

  const refresh = async () => {
    const sessionUserId = currentSessionUserId;
    const requestRevision = revision;
    if (!started || !sessionUserId) return;

    try {
      const counts = await cache.get(sessionUserId, options.loadCounts);
      if (
        started &&
        requestRevision === revision &&
        sessionUserId === currentSessionUserId
      ) {
        publish(toNavigationBadge(counts));
      }
    } catch (error) {
      if (
        started &&
        requestRevision === revision &&
        sessionUserId === currentSessionUserId
      ) {
        options.onError?.(error);
      }
    }
  };

  const applySession = (sessionUserId: string | null, invalidate: boolean) => {
    const previousSessionUserId = currentSessionUserId;
    revision += 1;
    initialized = true;
    currentSessionUserId = sessionUserId;

    if (invalidate) {
      const affectedSessions = new Set(
        [previousSessionUserId, sessionUserId].filter((id): id is string => Boolean(id)),
      );
      affectedSessions.forEach((id) => cache.invalidate(id));
    }

    publish(undefined);
    void refresh();
  };

  const start = () => {
    started = true;
    const lifecycleId = ++lifecycle;
    const bootstrapRevision = revision;
    stopAuthState = options.subscribeAuthState((event, sessionUserId) => {
      if (!started || lifecycleId !== lifecycle) return;
      if (event === 'INITIAL_SESSION' && initialized && currentSessionUserId === sessionUserId) {
        return;
      }
      applySession(sessionUserId, true);
    });
    void options
      .getSessionUserId()
      .then((sessionUserId) => {
        if (!started || lifecycleId !== lifecycle || revision !== bootstrapRevision) return;
        applySession(sessionUserId, false);
      })
      .catch((error) => {
        if (started && lifecycleId === lifecycle && revision === bootstrapRevision) {
          options.onError?.(error);
        }
      });
    stopRefresh = options.scheduleRefresh?.(() => void refresh());
  };

  const stop = () => {
    started = false;
    lifecycle += 1;
    revision += 1;
    initialized = false;
    currentSessionUserId = null;
    badge = undefined;
    stopAuthState?.();
    stopRefresh?.();
    stopAuthState = undefined;
    stopRefresh = undefined;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(badge);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && started) stop();
      };
    },
    getSnapshot: () => badge,
    refresh,
  };
}

const reportFeriasBadgeError = (error: unknown) => {
  console.error('Erro ao buscar status de ferias:', error);
};

const sharedFeriasBadgeStore = createFeriasBadgeStore({
  async getSessionUserId() {
    const { supabase } = await import('../services/supabase');
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  subscribeAuthState(listener) {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import('../services/supabase')
      .then(({ supabase }) => {
        if (!active) return;
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          listener(event, session?.user.id ?? null);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((error) => {
        if (active) reportFeriasBadgeError(error);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  },
  async loadCounts() {
    const { feriasService } = await import('../services/feriasService');
    const colaboradores = await feriasService.fetchColaboradoresStatus();
    const vencidos = colaboradores.filter((item) => item.tem_ferias_vencidas).length;
    const proximos = colaboradores.filter((item) => {
      if (item.tem_ferias_vencidas || !item.proxima_expiracao) return false;
      const dias = Math.ceil(
        (new Date(item.proxima_expiracao).getTime() - Date.now()) / 86_400_000,
      );
      return dias > 0 && dias <= 30;
    }).length;
    return { vencidos, proximos };
  },
  scheduleRefresh(refresh) {
    const interval = window.setInterval(refresh, FERIAS_BADGE_REFRESH_MS);
    return () => window.clearInterval(interval);
  },
  onError: reportFeriasBadgeError,
});

export function useFeriasNavigationBadge(): NavigationBadge | undefined {
  const [badge, setBadge] = useState<NavigationBadge | undefined>(() =>
    sharedFeriasBadgeStore.getSnapshot(),
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = sharedFeriasBadgeStore.subscribe((nextBadge) => {
      if (active) setBadge(nextBadge);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return badge;
}
