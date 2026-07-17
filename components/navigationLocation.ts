import {
  getDefaultPage,
  isModuleId,
  type NavigationDestination,
} from './navigation.ts';

interface NavigationLocationInput {
  pathname: string;
  search: string;
  hash?: string;
  state?: unknown;
}

export interface NavigationLocationResolution {
  destination: NavigationDestination;
  canonicalUrl?: string;
}

interface NavigationHistoryState {
  navigation: NavigationDestination;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSearch(search: string): string {
  if (!search) return '';
  return search.startsWith('?') ? search : `?${search}`;
}

function normalizeHash(hash = ''): string {
  if (!hash) return '';
  return hash.startsWith('#') ? hash : `#${hash}`;
}

function buildUrl(pathname: string, params: URLSearchParams, hash = ''): string {
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}${normalizeHash(hash)}`;
}

function getHistoryDestination(state: unknown): NavigationDestination | undefined {
  if (!isRecord(state) || !isRecord(state.navigation)) return undefined;
  const { module } = state.navigation;
  const page = state.navigation.page;
  if (typeof module !== 'string' || !isModuleId(module)) return undefined;
  if (page !== undefined && typeof page !== 'string') return undefined;
  return normalizeNavigationDestination({
    module,
    page: typeof page === 'string' ? page : undefined,
  });
}

export function normalizeNavigationDestination(
  destination: NavigationDestination,
): NavigationDestination {
  return {
    module: destination.module,
    page: destination.page ?? getDefaultPage(destination.module),
  };
}

export function isSameNavigationDestination(
  left: NavigationDestination,
  right: NavigationDestination,
): boolean {
  const normalizedLeft = normalizeNavigationDestination(left);
  const normalizedRight = normalizeNavigationDestination(right);
  return (
    normalizedLeft.module === normalizedRight.module &&
    normalizedLeft.page === normalizedRight.page
  );
}

export function withNavigationHistoryState(
  state: unknown,
  destination: NavigationDestination,
): NavigationHistoryState & Record<string, unknown> {
  const base = isRecord(state) ? state : {};
  return {
    ...base,
    navigation: normalizeNavigationDestination(destination),
  };
}

export function resolveNavigationLocation({
  pathname,
  search,
  hash = '',
  state,
}: NavigationLocationInput): NavigationLocationResolution {
  const params = new URLSearchParams(search);
  const hasLegacyModule = params.has('module');
  const moduleParam = (params.get('module') ?? '').toLowerCase();
  const pageParam = (params.get('page') ?? '').toLowerCase();

  if (pathname === '/faturas' || moduleParam === 'faturas') {
    params.delete('module');
    params.delete('page');
    params.set('tab', 'faturas');
    return {
      destination: { module: 'cartoes' },
      canonicalUrl: buildUrl('/cartoes', params, hash),
    };
  }

  if (hasLegacyModule && isModuleId(moduleParam)) {
    params.delete('module');
    params.delete('page');
    return {
      destination: {
        module: moduleParam,
        page: pageParam || undefined,
      },
      canonicalUrl: buildUrl(moduleParam === 'cartoes' ? '/cartoes' : '/', params, hash),
    };
  }

  const historyDestination = hasLegacyModule ? undefined : getHistoryDestination(state);
  if (pathname === '/cartoes') {
    return {
      destination:
        historyDestination?.module === 'cartoes'
          ? historyDestination
          : { module: 'cartoes' },
    };
  }

  if (historyDestination?.module !== 'cartoes') {
    return { destination: historyDestination ?? { module: 'folha' } };
  }

  return { destination: { module: 'folha' } };
}

export function buildNavigationUrl(
  destination: NavigationDestination,
  search: string,
  hash = '',
): string {
  const params = new URLSearchParams(search);
  const hasLegacyParams = params.has('module') || params.has('page');
  const hasCartoesScopedParams =
    destination.module !== 'cartoes' &&
    (params.get('tab') === 'faturas' || params.has('cartaoId'));
  params.delete('module');
  params.delete('page');
  if (destination.module !== 'cartoes') {
    if (params.get('tab') === 'faturas') params.delete('tab');
    params.delete('cartaoId');
  }
  const targetPath = destination.module === 'cartoes' ? '/cartoes' : '/';
  const targetSearch = hasLegacyParams || hasCartoesScopedParams
    ? params.toString()
      ? `?${params.toString()}`
      : ''
    : normalizeSearch(search);
  return `${targetPath}${targetSearch}${normalizeHash(hash)}`;
}
