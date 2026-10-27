import { describe, expect, it } from 'vitest';
import {
  FIRST_PAGE,
  PAGE_SIZE,
  clampPage,
  pageCount,
  pageWindow,
  rangeOf,
  slicePage,
} from './pagination';

describe('pageCount — liczba stron', () => {
  it('pusta lista ma jedną (pustą) stronę', () => {
    expect(pageCount(0)).toBe(1);
  });

  it('pełna strona zamyka się w jednej, +1 pozycja otwiera drugą', () => {
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });

  it('realny rozmiar listy: 134 pozycje to 6 stron po 25', () => {
    expect(pageCount(134)).toBe(6);
    expect(pageCount(144)).toBe(6);
  });
});

describe('clampPage — twarda granica strony', () => {
  it('trzymuje stronę w przedziale [1, pageCount]', () => {
    expect(clampPage(0, 134)).toBe(FIRST_PAGE);
    expect(clampPage(-5, 134)).toBe(FIRST_PAGE);
    expect(clampPage(99, 134)).toBe(6);
    expect(clampPage(3, 134)).toBe(3);
  });

  it('gasi wartości niefinitne i ułamkowe', () => {
    expect(clampPage(NaN, 134)).toBe(FIRST_PAGE);
    expect(clampPage(2.7, 134)).toBe(2);
  });

  it('kurczący się zbiór (np. po usunięciu) nie wyrzuca poza ostatnią stronę', () => {
    expect(clampPage(6, 10)).toBe(1);
  });
});

describe('rangeOf — zakres „Pozycje from–to z total”', () => {
  it('pierwsza strona: 1–25', () => {
    expect(rangeOf(1, 134)).toEqual({ from: 1, to: 25, start: 0 });
  });

  it('środkowa strona 3: 51–75', () => {
    expect(rangeOf(3, 134)).toEqual({ from: 51, to: 75, start: 50 });
  });

  it('ostatnia strona nie przekracza total: 126–134', () => {
    expect(rangeOf(6, 134)).toEqual({ from: 126, to: 134, start: 125 });
  });

  it('pusta lista pokazuje 0–0', () => {
    expect(rangeOf(1, 0)).toEqual({ from: 0, to: 0, start: 0 });
  });
});

describe('slicePage — wiersze bieżącej strony', () => {
  const rows = Array.from({ length: 134 }, (_, i) => i + 1);

  it('strona 1 to pierwsze 25, strona 6 to ostatnie 9', () => {
    expect(slicePage(rows, 1)).toEqual(rows.slice(0, 25));
    expect(slicePage(rows, 6)).toEqual(rows.slice(125));
  });

  it('clamps ponad liczbę stron (zbiór mógł się skurczyć)', () => {
    expect(slicePage(rows, 42)).toEqual(rows.slice(125));
  });
});

describe('pageWindow — okno numerów nawigatora', () => {
  it('do 7 stron pokazuje wszystkie numery bez wielokropków', () => {
    expect(pageWindow(1, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('przy 12 stronach: pierwsza i ostatnia zawsze widoczne, bieżąca z sąsiadem', () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 'gap', 12]);
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 11, 12]);
  });

  it('okno nigdy nie duplikuje numerów ani nie zostaje pustego gapa', () => {
    for (let p = 1; p <= 12; p += 1) {
      const w = pageWindow(p, 12);
      const nums = w.filter((s): s is number => s !== 'gap');
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums).toContain(p);
      expect(w[0]).toBe(1);
      expect(w[w.length - 1]).toBe(12);
    }
  });

  it('strona poza zakresem nie psuje okna', () => {
    expect(pageWindow(99, 12)).toEqual([1, 'gap', 11, 12]);
    expect(pageWindow(0, 12)).toEqual([1, 2, 'gap', 12]);
  });
});
