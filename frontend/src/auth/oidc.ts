/**
 * Minimal OIDC client for Keycloak (Authorization Code + PKCE, public SPA).
 *
 * Security model: the app never knows or transmits a client secret; the
 * PKCE verifier is kept only as long as the login round-trip lasts and then
 * dropped. The session lives in sessionStorage (cleared on tab close) so a
 * stale token cannot outlive the user's browser session.
 */

import { getAuthIssuer, getClientId } from '../config/env';

export interface AuthUser {
  sub: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface Session {
  accessToken: string;
  idToken: string;
  /** epoch ms after which the access token must be considered expired */
  expiresAt: number;
  user: AuthUser;
}

/** Where Keycloak sends the browser back after login. The exact origin comes
 * from wherever the SPA is served — that URL must be on the client's Valid
 * redirect URIs in Keycloak (local dev: http://localhost:5173/*; production:
 * the application origin, e.g. https://inventory.bandmanager.pl/callback). */
export const REDIRECT_URI = `${window.location.origin}/callback`;

const PKCE_KEY = 'wi.pkce.flow';

/** ISSUER / CLIENT_ID are runtime env (see src/config/env.ts), loaded before
 * first render — identical code in dev, local docker and production. */
const SESSION_KEY = 'wi.session';

interface PkceFlow {
  verifier: string;
  state: string;
  nonce: string;
}

function randomB64U(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256B64U(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed JWT (missing payload)');
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** True when the current page is the POST-login redirect (has ?code). */
export function isCallbackPage(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('code') !== null;
}

async function exchangeCode(code: string, flow: PkceFlow): Promise<Session> {
  const ISSUER = getAuthIssuer();
  const CLIENT_ID = getClientId();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: flow.verifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const tok = (await res.json()) as { access_token: string; id_token: string; expires_in: number };

  const claims = decodeJwtPayload(tok.id_token);
  if (claims.iss !== ISSUER) throw new Error('id_token issuer mismatch');
  const aud = Array.isArray(claims.aud) ? (claims.aud as unknown[]) : [claims.aud];
  if (!aud.includes(CLIENT_ID)) throw new Error('id_token audience mismatch');

  // Refresh margin: treat as expired 30s early to avoid borderline calls.
  const nowSec = Math.floor(Date.now() / 1000);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    accessToken: tok.access_token,
    idToken: tok.id_token,
    expiresAt: Date.now() + (tok.expires_in ?? Math.max(0, (claims.exp as number) - nowSec) - 30) * 1000,
    user: {
      sub: str(claims.sub) ?? '',
      username: str(claims.preferred_username),
      email: str(claims.email),
      firstName: str(claims.given_name),
      lastName: str(claims.family_name),
    },
  } satisfies Session) as string);
  return getSession()!;
}

/** Starts the browser redirect to Keycloak login. */
export async function beginLogin(prompt: 'login' | 'none' = 'login'): Promise<void> {
  const ISSUER = getAuthIssuer();
  const CLIENT_ID = getClientId();
  const flow: PkceFlow = {
    verifier: randomB64U(48),
    state: randomB64U(16),
    nonce: randomB64U(16),
  };
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(flow));
  const qp = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: await sha256B64U(flow.verifier),
    code_challenge_method: 'S256',
    state: flow.state,
    nonce: flow.nonce,
    prompt,
  });
  window.location.assign(`${ISSUER}/protocol/openid-connect/auth?${qp.toString()}`);
}

/** Completes the login using the ?code on this page. */
export async function finishLogin(search: string = window.location.search): Promise<Session> {
  const sp = new URLSearchParams(search);
  const code = sp.get('code');
  if (!code) throw new Error('Missing authorization code');
  const err = sp.get('error');
  if (err) throw new Error(`Keycloak error: ${sp.get('error_description') ?? err}`);

  const raw = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (!raw) throw new Error('PKCE flow state missing — starting fresh login');
  const flow = JSON.parse(raw) as PkceFlow;
  if (flow.state !== sp.get('state')) throw new Error('CSRF: state mismatch');

  window.history.replaceState({}, '', '/');
  return exchangeCode(code, flow);
}

export function getSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (Date.now() >= s.expiresAt) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PKCE_KEY);
}

/** Display name for banners: "Ivan Kowalski" > username > email. */
export function displayName(user: AuthUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (name) return name;
  return user.username ?? user.email ?? 'nieznany użytkownik';
}

/** Logs out locally and returns to a fresh full login (Keycloak stays
 * sessionless for this app in v1 — no RP-Initiated Logout). */
export async function logout(): Promise<void> {
  clearSession();
  await beginLogin('login');
}
