import { describe, expect, it } from 'vitest';
import {
  SESSION_KEY,
  expiresAtFrom,
  needsRefresh,
  performRefresh,
  readRawSession,
  type KeyStore,
  type RefreshDeps,
  type StoredSession,
} from './sessionRefresh';

/** Magazyn w stylu restore.test.ts: Map bez jsdomu. */
function fakeStore(seed?: StoredSession): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (seed) data.set(SESSION_KEY, JSON.stringify(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const PREV: StoredSession = {
  accessToken: 'at-stary',
  idToken: 'idt-stary',
  expiresAt: 1_000,
  user: { sub: 'u1', firstName: 'Michał', lastName: 'Bzowski' },
  refreshToken: 'rt-1',
};

function deps(overrides: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    store: fakeStore(PREV),
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'at-nowy',
        refresh_token: 'rt-2',
        expires_in: 300,
      }),
    }),
    issuer: 'http://kc.test/realms/windband',
    clientId: 'windband-inventory',
    now: () => 10_000,
    decodeUser: () => ({ sub: 'u1' }),
    ...overrides,
  };
}

describe('utrzymanie sesji (rotacja refresh tokenem)', () => {
  it('udany refresh: nowe tokeny zapisane, refresh zrotowany, user zachowany', async () => {
    const d = deps();
    const next = await performRefresh(d);
    expect(next).not.toBeNull();
    expect(next!.accessToken).toBe('at-nowy');
    expect(next!.refreshToken).toBe('rt-2'); // stary 'rt-1' jednorazowy — musi być wymieniony
    expect(next!.expiresAt).toBe(10_000 + 300 * 1000 - 30_000);
    expect(next!.user.firstName).toBe('Michał'); // brak nowego id_token → profil bez zmian
    expect(d.store.getItem(SESSION_KEY)).toContain('at-nowy');
  });

  it('nowy id_token z refreshu → profil dekodowany ponownie', async () => {
    const d = deps({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'a', id_token: 'IDT', refresh_token: 'r', expires_in: 60 }),
      }),
      decodeUser: (id) => ({ sub: 'u9', username: id === 'IDT' ? 'odekoder' : undefined }),
    });
    const next = await performRefresh(d);
    expect(next!.user.username).toBe('odekoder');
    expect(next!.idToken).toBe('IDT');
  });

  it('Keycloak odrzuca refresh (400) → sesja skasowana i null (pełny re-login)', async () => {
    const d = deps({
      fetchFn: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }),
    });
    expect(await performRefresh(d)).toBeNull();
    expect(d.store.getItem(SESSION_KEY)).toBeNull();
  });

  it('awaria sieci → NIE kasujemy sesji (może uda się przy następnym podejściu)', async () => {
    const d = deps({ fetchFn: async () => { throw new TypeError('offline'); } });
    expect(await performRefresh(d)).toBeNull();
    expect(d.store.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('sesja bez refresh tokenu → null bez żadnego requestu', async () => {
    let called = false;
    const store = fakeStore({ ...PREV, refreshToken: undefined });
    const d = deps({ store, fetchFn: async () => { called = true; throw new Error(); } });
    expect(await performRefresh(d)).toBeNull();
    expect(called).toBe(false);
  });

  it('odpowiedź bez refresh_tokenu → zachowujemy dotychczasowy', async () => {
    const d = deps({
      fetchFn: async () => ({
        ok: true, status: 200, json: async () => ({ access_token: 'a', expires_in: 60 }),
      }),
    });
    const next = await performRefresh(d);
    expect(next!.refreshToken).toBe('rt-1');
  });
});

describe('reguły wygasania', () => {
  it('needsRefresh: w marginesie/po expiresAt/brak → true; świeży token → false', () => {
    const s: StoredSession = { ...PREV, expiresAt: 100_000 };
    expect(needsRefresh(null, 0)).toBe(true);
    expect(needsRefresh(s, 100_000 - 90_001)).toBe(false); // jeszcze chwilę ważny
    expect(needsRefresh(s, 100_000 - 89_999)).toBe(true); // w marginesie 90s
    expect(needsRefresh(s, 200_000)).toBe(true); // po wygaśnięciu
  });

  it('expiresAtFrom: pełne życie minus 30s zapasu; brak expires_in → 5 min', () => {
    expect(expiresAtFrom(300, 0)).toBe(270_000);
    expect(expiresAtFrom(undefined, 0)).toBe(270_000);
    expect(expiresAtFrom(20, 0)).toBe(0); // życie krótsze niż zapas → natychmiast do odświeżenia
  });

  it('readRawSession: czyta nawet wygasłą (potrzebna do wymiany) i toleruje śmieci', () => {
    const store = fakeStore({ ...PREV, expiresAt: 1 });
    expect(readRawSession(store)?.accessToken).toBe('at-stary'); // bez bramki czasu
    store.setItem(SESSION_KEY, '{zepsuty');
    expect(readRawSession(store)).toBeNull();
  });
});
