import { describe, expect, test } from 'vitest';
import { itemCode, parseScan } from './model';

describe('itemCode', () => {
  test('deterministyczny kod WI-band-item', () => {
    expect(itemCode(1, 7)).toBe('WI-1-7');
    expect(itemCode(23, 412)).toBe('WI-23-412');
  });
});

describe('parseScan — kody etykiet', () => {
  test('kod standardowy', () => {
    expect(parseScan('WI-1-7')).toEqual({ bandId: 1, itemId: 7 });
  });
  test('ignoruje wielkość liter i znaki przy kodzie ze skanera', () => {
    expect(parseScan('wi- 1 - 7')).toEqual({ bandId: 1, itemId: 7 });
    expect(parseScan('wi-23-412 ')).toEqual({ bandId: 23, itemId: 412 });
  });
  test('odrzucamy zero/ujemne i ułamki', () => {
    expect(parseScan('WI-0-7')).toBeNull();
    expect(parseScan('WI-1-0')).toBeNull();
  });
  test('odrzucamy nie-kody', () => {
    expect(parseScan('W-1-7')).toBeNull();
    expect(parseScan('WI-1')).toBeNull();
    expect(parseScan('wi-1-a')).toBeNull();
    expect(parseScan('')).toBeNull();
    expect(parseScan(null)).toBeNull();
    expect(parseScan(undefined)).toBeNull();
  });
});

describe('parseScan — linki do pozycji', () => {
  test('URL z parametrem band (dowolny reszta)', () => {
    expect(
      parseScan('https://inventory.bandmanager.pl/items/7?band=1&next=x')
    ).toEqual({ bandId: 1, itemId: 7 });
  });
  test('wariant bandId + ścieżka wewnątrz', () => {
    expect(parseScan('https://x.example/#/items/42?bandId=3')).toEqual({
      bandId: 3,
      itemId: 42,
    });
    expect(parseScan('https://x.example/items/15/detail?band=9')).toEqual({
      bandId: 9,
      itemId: 15,
    });
  });
  test('URL bez parametru band zostawia bandId puste (decyzja UI)', () => {
    expect(parseScan('https://x.example/items/55')).toEqual({ itemId: 55 });
  });
  test('odrzucamy linki bez ID pozycji i z złym ID', () => {
    expect(parseScan('https://x.example/items/abc')).toBeNull();
    expect(parseScan('https://x.example/orders/7?band=1')).toBeNull();
    expect(parseScan('https://x.example/items/7?band=xyz')).toBeNull();
  });
});
