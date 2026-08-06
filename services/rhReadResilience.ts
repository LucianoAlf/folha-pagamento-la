export type RhReadOptions = {
  attempts?: number;
  fetchImpl?: typeof fetch;
  label?: string;
  retryDelayMs?: number;
  timeoutMs?: number;
};

export type SupabaseReadTimeoutOptions = Pick<RhReadOptions, 'label' | 'timeoutMs'>;

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, milliseconds);
});

export async function withSupabaseReadTimeout<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  options: SupabaseReadTimeoutOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const label = options.label ?? 'A leitura';
  const timeoutMs = Math.max(1, options.timeoutMs ?? 10_000);
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw new Error(`${label} demorou alem do esperado. Tente novamente.`);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function fetchRhRead(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RhReadOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const fetchImpl = options.fetchImpl ?? fetch;
  const label = options.label ?? 'A leitura do RH';
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 10_000);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      if (!TRANSIENT_STATUS.has(response.status) || attempt === attempts) return response;
      lastError = new Error(`${label} respondeu com status ${response.status}.`);
    } catch (error) {
      lastError = timedOut
        ? new Error(`${label} demorou alem do esperado. Tente novamente.`)
        : new Error(`${label} falhou ao acessar o Supabase. Tente novamente.`, { cause: error });
      if (attempt === attempts) throw lastError;
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (retryDelayMs > 0) await wait(retryDelayMs);
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} nao pode ser concluida.`);
}
