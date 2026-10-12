import { getSession, beginLogin } from '../auth/oidc';

/** Same-origin base: in dev the Vite proxy forwards /api → windband-manager,
 * in production a reverse proxy does the same. */
const BASE = '/api/v1';

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

async function request<T>(path: string, init: RequestInit, opts: RequestOptions = {}): Promise<T> {
  const session = getSession();
  if (!session) {
    window.location.assign('/'); // App will redirect to login on boot.
    throw new Error('Not authenticated');
  }
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  // Expired/invalid token → one silent re-auth, then retry the call.
  if (res.status === 401 && !opts.reauth) {
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
  return (await res.json()) as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET' }, { signal });
}
