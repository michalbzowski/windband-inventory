import type { BandView } from '../api/bands';

/** Wyciąg z sessionStorage potrzebny do zapisu/odczytu wyboru — dzięki temu
 * logikę da się testować w vitest (bez jsdom) na fake'owym magazynie. */
export interface BandStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SELECTED_BAND_KEY = 'wi.selectedBand';

export function saveSelectedBand(store: BandStore, band: BandView): void {
  store.setItem(SELECTED_BAND_KEY, JSON.stringify(band));
}

export function clearSelectedBand(store: BandStore): void {
  store.removeItem(SELECTED_BAND_KEY);
}

/** Powrót po F5 do uprzednio wybranego zespołu (≥2 zespołów na koncie).
 * Zwraca ŚWIEŻY wpis z listy API — nigdy kopię z magazynu: nieaktualna
 * rola/nazwa zapisana przed odświeżeniem nie może trafić do stanu aplikacji.
 * Brak klucza, uszkodzony JSON lub zespół spoza listy → null (→ picker). */
export function restoreSelectedBand(bands: BandView[], store: BandStore): BandView | null {
  let raw: string | null;
  try {
    raw = store.getItem(SELECTED_BAND_KEY);
  } catch {
    return null; // magazyn niedostępny (tryb prywatny itd.) — picker jest OK
  }
  if (!raw) return null;
  let bandId: unknown;
  try {
    bandId = (JSON.parse(raw) as { bandId?: unknown }).bandId;
  } catch {
    return null;
  }
  if (typeof bandId !== 'number') return null;
  return bands.find((b) => b.bandId === bandId) ?? null;
}
