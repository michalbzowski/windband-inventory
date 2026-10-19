/**
 * Kody etykiet pozycji (v1.x #6 — skanowanie QR/kodu).
 *
 * Etykieta fizyczna instrumentu niesie KRÓTKI, stabowy kod `WI-{bandId}-{itemId}`
 * (np. `WI-1-7`): czytelny na małej etykience, łatwy do wpisania ręcznie offline,
 * deterministyczny (bez losowego tokena do zapamiętania) — appa rozwiązuje go
 * w kontekście aktywnego zespołu, więc kod z innego bandu jest jednoznacznie
 * odrzuczany, a numer ID nie schodzi „na zewnątrz” dalej niż sam instrument.
 *
 * Dekoder akceptuje też linki do pozycji (np. skopiowany URL z etykiety/
 * wiadomości): `…/items/{id}?band={bandId}` oraz wariant hash-route — to sama
 * decyzja „która pozycja, który zespół” tylko w innym kształcie znaków.
 */

export const CODE_PREFIX = 'WI';

export interface ScanTarget {
  /** Brak (`undefined`) tylko przy URL bez parametru band — UI podpowiada aktywny zespół. */
  bandId?: number;
  itemId: number;
}

const CODE_RE = /^wi-(\d+)-(\d+)$/i;
const URL_PATH_RE = /\/items\/(\d+)(?:[/?#].*)?$/i;

const positive = (n: string): number | null => {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
};

/**
 * Rozpoznaje zawartość zeskanowaną/wywpisaną: kod `WI-B-I` (dowolna wielkość,
 * spacje z OCR tolerowane), URL z `…/items/{id}[?band={b}]` / hash-route.
 * Twarde reguły: brak jednoznacznego ID lub nieprawidłowe wartości → null;
 * band brakuje w URL-u tylko w tym jednym kształcie — UI decyduje wtedy o
 * aktywnym zespole.
 */
export function parseScan(raw: string | null | undefined): ScanTarget | null {
  const s = (raw ?? '').replace(/\s+/g, '');
  if (!s) return null;

  const code = s.match(CODE_RE);
  if (code) {
    const bandId = positive(code[1]);
    const itemId = positive(code[2]);
    if (bandId === null || itemId === null) return null;
    return { bandId, itemId };
  }

  const path = s.match(URL_PATH_RE);
  if (!path) return null;
  const itemId = Number(path[1]);
  if (!Number.isInteger(itemId) || itemId <= 0) return null;
  // band: brak parametru = legalny wariant „bez bandu” (UI decyduje o aktywnym
  // zespole); parametr podany → MUSI być dodatnią liczbą, inaczej odrzucamy.
  const q = s.match(/[?&](?:band|bandId)=([^&]*)/);
  if (q !== null) {
    const bandId = Number(q[1]);
    if (!Number.isInteger(bandId) || bandId <= 0) return null;
    return { bandId, itemId };
  }
  return { itemId };
}

/** Kod etykiety dla par pozycja/zespół — dokładnie to, co trafia do QR. */
export function itemCode(bandId: number, itemId: number): string {
  return `${CODE_PREFIX}-${bandId}-${itemId}`;
}
