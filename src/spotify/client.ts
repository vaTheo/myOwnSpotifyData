import { ApiError, QuotaError } from './errors';
import type { ApiPage } from './types';

export const API_BASE = 'https://api.spotify.com/v1';
export const PAGE_LIMIT = 50;

const QUOTA_LOCK_THRESHOLD_S = 300;
const QUOTA_DEFAULT_WAIT_MS = 24 * 60 * 60 * 1000;
const MAX_429_RETRIES = 6;
const MAX_5XX_RETRIES = 3;

export type Query = Record<string, string | number | undefined>;

export interface ClientDeps {
  fetchFn: typeof fetch;
  getAccessToken: (forceRefresh?: boolean) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface SpotifyClient {
  get<T>(path: string, query?: Query): Promise<T>;
  pages<T>(
    path: string,
    query?: Query,
    limit?: number
  ): AsyncGenerator<ApiPage<T>, void, undefined>;
}

export function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function backoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 60_000);
}

function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorField(body: unknown, field: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[field];
}

export async function* paginate<T>(
  get: SpotifyClient['get'],
  path: string,
  query: Query = {},
  limit = PAGE_LIMIT
): AsyncGenerator<ApiPage<T>, void, undefined> {
  for (let offset = 0; ; offset += limit) {
    const page = await get<ApiPage<T>>(path, { ...query, limit, offset });
    const items = Array.isArray(page.items) ? page.items : [];
    yield { ...page, items };
    if (items.length < limit) return;
    if (typeof page.total === 'number' && offset + limit >= page.total) return;
  }
}

export function createClient(deps: ClientDeps): SpotifyClient {
  let chain: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function request<T>(url: string): Promise<T> {
    let token = await deps.getAccessToken();
    let retried401 = false;
    let attempts429 = 0;
    let attempts5xx = 0;
    for (;;) {
      let res: Response;
      try {
        res = await deps.fetchFn(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new ApiError(0, `Network error: ${reason}`);
      }
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !retried401) {
        retried401 = true;
        token = await deps.getAccessToken(true);
        continue;
      }
      if (res.status === 429) {
        const body = await safeJson(res);
        const retryAfterS = parseRetryAfter(res.headers.get('Retry-After'));
        const quota = errorField(body, 'reason') === 'QUOTA_EXCEEDED';
        if (
          quota ||
          (retryAfterS !== null && retryAfterS > QUOTA_LOCK_THRESHOLD_S)
        ) {
          const waitMs =
            retryAfterS !== null ? retryAfterS * 1000 : QUOTA_DEFAULT_WAIT_MS;
          throw new QuotaError(deps.now() + waitMs);
        }
        attempts429 += 1;
        if (attempts429 > MAX_429_RETRIES) {
          throw new ApiError(429, 'Rate limited too many times in a row', body);
        }
        await deps.sleep(
          retryAfterS !== null ? retryAfterS * 1000 : backoffMs(attempts429)
        );
        continue;
      }
      if (res.status >= 500) {
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        throw new ApiError(
          res.status,
          `Spotify server error ${res.status}`,
          await safeJson(res)
        );
      }
      const body = await safeJson(res);
      const message = errorField(body, 'message');
      throw new ApiError(
        res.status,
        typeof message === 'string' ? message : `Spotify error ${res.status}`,
        body
      );
    }
  }

  function get<T>(path: string, query?: Query): Promise<T> {
    return enqueue(() => request<T>(buildUrl(path, query)));
  }

  function pages<T>(
    path: string,
    query?: Query,
    limit?: number
  ): AsyncGenerator<ApiPage<T>, void, undefined> {
    return paginate<T>(get, path, query, limit);
  }

  return { get, pages };
}
