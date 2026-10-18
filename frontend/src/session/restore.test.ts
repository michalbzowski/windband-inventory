import { describe, expect, it } from 'vitest';
import type { BandView } from '../api/bands';
import {
  SELECTED_BAND_KEY,
  clearSelectedBand,
  restoreSelectedBand,
  saveSelectedBand,
  type BandStore,
} from './restore';

function fakeStore(initial: Record<string, string> = {}): BandStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const FRESH: BandView[] = [
  { bandId: 1, name: 'Orkiestra', role: 'ADMIN' },
  { bandId: 2, name: 'Chór', role: 'MEMBER' },
] as BandView[];

describe('restoreSelectedBand', () => {
  it('null, gdy nie ma zapisanego wyboru (pierwsze wejście / po Wstecz)', () => {
    expect(restoreSelectedBand(FRESH, fakeStore())).toBeNull();
  });

  it('zwraca świeży obiekt z API, nie kopię z magazynu (rola nie zstnieje)', () => {
    const store = fakeStore();
    saveSelectedBand(store, { bandId: 2, name: 'Stara nazwa', role: 'ADMIN' } as BandView);
    const restored = restoreSelectedBand(FRESH, store);
    expect(restored).toBe(FRESH[1]); // ten sam referent co z listy API
    expect(restored?.role).toBe('MEMBER');
    expect(restored?.name).toBe('Chór');
  });

  it('null dla wyboru spoza listy (zespół usunięty / rola odebrana)', () => {
    const store = fakeStore();
    saveSelectedBand(store, { bandId: 999, name: 'Widmo', role: 'ADMIN' } as BandView);
    expect(restoreSelectedBand(FRESH, store)).toBeNull();
  });

  it('nie wali się na uszkodzonym JSON ani na bandId innego typu', () => {
    expect(restoreSelectedBand(FRESH, fakeStore({ [SELECTED_BAND_KEY]: '{zepsuty' }))).toBeNull();
    expect(restoreSelectedBand(FRESH, fakeStore({ [SELECTED_BAND_KEY]: '{"bandId":"2"}' }))).toBeNull();
    expect(restoreSelectedBand(FRESH, fakeStore({ [SELECTED_BAND_KEY]: 'null' }))).toBeNull();
  });

  it('clearSelectedBand kasuje klucz (ścieżka Wstecz/Wyloguj)', () => {
    const store = fakeStore();
    saveSelectedBand(store, FRESH[0]);
    clearSelectedBand(store);
    expect(restoreSelectedBand(FRESH, store)).toBeNull();
  });
});
