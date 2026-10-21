/**
 * Czysty rdzeń mechanizmu odświeżania sesji OIDC (public client, grant_type
 * =refresh_token). Extractowany z oidc.ts na wzór restore.ts: pełna iniekcja
 * zależności (store, fetch, zegar, dekodowanie usera) pozwala testować
 * rotację i reguły wygasania w vitest bez jsdom.
 *
 * Kontrakt naprawy „wylogowuję się po ~5 minutach”:
 *  - access token Keycloak żyje krótko (domyślnie 5 min) — KAŻDY zapis sesji
 *    trzyma teraz refresh token i jest ROTOWANY (standard policy: jednorazowy),
 *  - sesja jest aktywnie odnawiana, zanim wygasa (needsRefresh + keep-alive),
 *    więc klikanie i samo trzymanie karty utrzymuje zalogowanie,
 *  - odrzucony refresh = kasujemy wi.session (pełny re-login przez
 *    beginLogin('none') → ewentualnie strona logowania Keycloak).
 */

export interface AuthUserLite {
  sub: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface StoredSession {
  accessToken: string;
  idToken: string;
  /** epoch ms — kiedy accessToken należy traktować jako wygasły (z zapasem) */
  expiresAt: number;
  user: AuthUserLite;
  /** jednorazowy refresh token z ostatniej odpowiedzi token endpointu */
  refreshToken?: string | null;
}

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = 'wi.session';

/** Odstęp przed expiresAt, od którego trzeba ODNOWIĆ token, nim go użyć. */
export const REFRESH_MARGIN_MS = 90_000;
/** Bezpieczny zapas wbudowany w samo expiresAt (zegary/latency). */
export const EXPIRY_SAFETY_MS = 30_000;

export interface TokenResponseLite {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export function expiresAtFrom(expiresInSec: number | undefined, now: number): number {
  const life = expiresInSec && expiresInSec > 0 ? expiresInSec : 300;
  return now + Math.max(0, life * 1000 - EXPIRY_SAFETY_MS);
}

/** Prawda, gdy sesji brak albo jej przybliżony koniec jest w zapasie marginesu. */
export function needsRefresh(s: StoredSession | null, now: number, marginMs = REFRESH_MARGIN_MS): boolean {
  if (!s) return true;
  return now >= s.expiresAt - marginMs;
}

/** Czytelia surowy magazyn BEZ bramek czasu — wygasły access token nadal
 *  niesie refresh token, którym można go wymienić. */
export function readRawSession(store: KeyStore): StoredSession | null {
  let raw: string | null;
  try {
    raw = store.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export interface RefreshDeps {
  store: KeyStore;
  fetchFn: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
    ok: boolean; status: number; json: () => Promise<Record<string, unknown>>;
  }>;
  issuer: string;
  clientId: string;
  now: () => number;
  /** Dekoduje user-a z id_token (świeżego lub starego). */
  decodeUser: (idToken: string) => AuthUserLite;
}

/**
 * Jedna wymiana refresh_token → nowa sesja. ZAWSZE rotuje: zapisuje nowy
 * refresh token z odpowiedzi (Keycloak unieważnia poprzedni przy każdym
 * użyciu). Błąd sieci/400/401 = odrzucenie sesji (czyszczony klucz) i null —
 * wołający idzie wtedy przez beginLogin('none').
 */
export async function performRefresh(deps: RefreshDeps): Promise<StoredSession | null> {
  const prev = readRawSession(deps.store);
  if (!prev?.refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: prev.refreshToken,
    client_id: deps.clientId,
  });
  let res: Awaited<ReturnType<RefreshDeps['fetchFn']>>;
  try {
    res = await deps.fetchFn(`${deps.issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    // Sieć padła: NIE kasujemy sesji — może uda się przy następnym podejściu.
    return null;
  }
  if (!res.ok) {
    deps.store.removeItem(SESSION_KEY);
    return null;
  }

  const tok = (await res.json()) as unknown as TokenResponseLite;
  if (!tok.access_token) {
    deps.store.removeItem(SESSION_KEY);
    return null;
  }
  const idToken = tok.id_token ?? prev.idToken;
  const next: StoredSession = {
    accessToken: tok.access_token,
    idToken,
    expiresAt: expiresAtFrom(tok.expires_in, deps.now()),
    user: tok.id_token ? deps.decodeUser(tok.id_token) : prev.user,
    // Rotacja: KC zazwyczaj odsyła nowy refresh token; gdy go nie ma
    // (np. wariant bez rotacji), zostawiamy dotychczasowy.
    refreshToken: tok.refresh_token ?? prev.refreshToken,
  };
  deps.store.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}
