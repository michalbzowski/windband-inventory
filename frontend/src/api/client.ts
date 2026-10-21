import { beginLogin, ensureSession, refreshSession } from '../auth/oidc';

/**
 * Two same-origin API bases (the proxy contract, see vite.config.ts and
 * deploy/nginx/default.conf.template):
 *  - /api/v1        → windband-manager (bands, roster, roles — B11/B10)
 *  - /api/inventory → this app's own backend (items, stocktakes — canonical REST)
 */
export type ApiBase = '/api/v1' | '/api/inventory';
const WM: ApiBase = '/api/v1';
const INV: ApiBase = '/api/inventory';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  reauth?: boolean;
}

async function request<T>(
  base: ApiBase,
  path: string,
  init: RequestInit,
  opts: RequestOptions = {},
): Promise<T> {
  // ensureSession: świeży token od ręki, w marginesie/po wygaśnięciu — cicha
  // wymiana refresh_tokenem. Dopiero bez nadziei odsyłamy do silent re-auth.
  const session = await ensureSession();
  if (!session) {
    await beginLogin('none');
    throw new ApiError(401, 'Sesja wygasła — trwamy ponowne logowanie');
  }
  const res = await fetch(base + path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  // Serwer odrzucił token mimo świeżości (np. wygasł w trakcie): jedna
  // wymuszona rotacja + retry; dalej dopiero silent re-auth.
  if (res.status === 401 && !opts.reauth) {
    const rotated = await refreshSession();
    if (rotated) return request<T>(base, path, init, { ...opts, reauth: true });
    await beginLogin('none');
    throw new ApiError(401, 'Sesja wygasła — trwamy ponowne logowanie');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? '';
    } catch {
      /* non-JSON error body — keep the standard phrase */
    }
    throw new ApiError(res.status, detail || `Zapytanie zakończone błędem (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** WM read (kept for bands.ts — identical behaviour to before). */
export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(WM, path, { method: 'GET' }, { signal });
}

export function invGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(INV, path, { method: 'GET' }, { signal });
}

export function invSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(
    INV,
    path,
    {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { signal },
  );
}
