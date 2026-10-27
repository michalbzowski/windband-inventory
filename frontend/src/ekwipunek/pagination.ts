/**
 * Stronicowanie listy Ekwipunku (B18). Czysty model bez DOM — logika okna
 * stron, zakresów i przycinania wierszy jest testowana jednostkowo (vitest);
 * widok wnosi tylko stan Reacta (`page`) i przesunięcie scrolla.
 *
 * Decyzja B18: listę filtruje i zwraca w całości serwer (`GET /items`),
 * a klient dzieli ją na strony po PAGE_SIZE — przy skali bandu (setki
 * pozycji) jedno pobranie wystarcza, a zmiana strony jest natychmiastowa.
 */

export const PAGE_SIZE = 25;

/** Liczba stron: zawsze >= 1 (pusta lista ma jedną, „pustą” stronę). */
export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
}

/** Strona domyślna przy wejściu i po każdej zmianie filtrów. */
export const FIRST_PAGE = 1;

/** Twarda granica: 1 <= strona <= pageCount. Chroni przed stale state. */
export function clampPage(page: number, total: number, size: number = PAGE_SIZE): number {
  if (!Number.isFinite(page)) return FIRST_PAGE;
  return Math.min(Math.max(FIRST_PAGE, Math.trunc(page)), pageCount(total, size));
}

export interface PageRange {
  /** Pierwszy numer pozycji na stronie, 1-based (0 dla pustej listy). */
  from: number;
  /** Ostatni numer pozycji na stronie, 1-based włącznie. */
  to: number;
  /** Indeks tablicy od którego slicować (0-based). */
  start: number;
}

/** Zakres „Pozycje from–to z total” dla strony; nieprzekroczony total. */
export function rangeOf(page: number, total: number, size: number = PAGE_SIZE): PageRange {
  const p = clampPage(page, total, size);
  const start = (p - 1) * size;
  const safeTotal = Math.max(0, total);
  return {
    from: safeTotal === 0 ? 0 : start + 1,
    to: Math.min(start + size, safeTotal),
    start,
  };
}

/** Wiersze bieżącej strony (clamped — kurczący się zbiór nie wyrzuca w pustkę). */
export function slicePage<T>(rows: T[], page: number, size: number = PAGE_SIZE): T[] {
  const r = rangeOf(page, rows.length, size);
  return rows.slice(r.start, r.start + Math.max(1, size));
}

/** Slot nawigatora: numer strony lub rozwinięta wielokropek. */
export type PagerSlot = number | 'gap';

/**
 * Okno numerów stron w stylu klasycznym: pierwsza i ostatnia zawsze,
 * bieżąca z sąsiadami, luki jako 'gap'. <= 7 stron: pełna lista.
 */
export function pageWindow(page: number, pages: number): PagerSlot[] {
  const p = Math.min(Math.max(FIRST_PAGE, page), Math.max(FIRST_PAGE, pages));
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const slots: PagerSlot[] = [1];
  if (p > 3) slots.push('gap');
  for (let n = Math.max(2, p - 1); n <= Math.min(pages - 1, p + 1); n += 1) slots.push(n);
  if (p < pages - 2) slots.push('gap');
  slots.push(pages);
  return slots;
}
