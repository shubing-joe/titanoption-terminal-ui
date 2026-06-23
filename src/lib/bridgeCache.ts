export interface BridgeCacheOptions {
  ttlMs?: number;
  staleIfErrorMs?: number;
}

export interface BridgeRequestCoordinatorOptions {
  now?: () => number;
}

interface CacheEntry<T> {
  createdAt: number;
  value: T;
}

type Loader<T> = () => Promise<T>;

export function stableJsonKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJsonKey(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJsonKey(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withStaleMetadata<T>(value: T, reason: string): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...(value as Record<string, unknown>),
      stale: true,
      staleReason: reason,
    } as T;
  }
  return value;
}

export function createBridgeRequestCoordinator(options: BridgeRequestCoordinatorOptions = {}) {
  const now = options.now || (() => Date.now());
  const cache = new Map<string, CacheEntry<unknown>>();
  const inFlight = new Map<string, Promise<unknown>>();

  async function run<T>(key: string, loader: Loader<T>, cacheOptions: BridgeCacheOptions = {}): Promise<T> {
    const ttlMs = Math.max(0, Number(cacheOptions.ttlMs || 0));
    const staleIfErrorMs = Math.max(0, Number(cacheOptions.staleIfErrorMs || 0));
    const current = now();
    const cached = cache.get(key) as CacheEntry<T> | undefined;

    if (cached && ttlMs > 0 && current - cached.createdAt <= ttlMs) {
      return cached.value;
    }

    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const pending = loader()
      .then((value) => {
        cache.set(key, { createdAt: now(), value });
        return value;
      })
      .catch((error) => {
        if (cached && staleIfErrorMs > 0 && current - cached.createdAt <= staleIfErrorMs) {
          return withStaleMetadata(cached.value, error instanceof Error ? error.message : String(error));
        }
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, pending);
    return pending;
  }

  return { run };
}
