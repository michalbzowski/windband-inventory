import { describe, expect, it } from 'vitest';
import { COUNTER_META, COUNTER_NAV, counterText } from './counters';

describe('liczniki Pulpitu', () => {
  it('tekst stanu: … w toku, — błąd, liczba gotowa', () => {
    expect(counterText(undefined)).toBe('…');
    expect(counterText(null)).toBe('—');
    expect(counterText(0)).toBe('0');
    expect(counterText(12)).toBe('12');
  });

  it('każdy licznik ma etykietę, aria i mapę deep-linku', () => {
    const keys = Object.keys(COUNTER_META) as Array<keyof typeof COUNTER_META>;
    expect(keys).toEqual(Object.keys(COUNTER_NAV));
    for (const k of keys) {
      expect(COUNTER_META[k].label).toBeTruthy();
      expect(COUNTER_META[k].aria).toBeTruthy();
    }
  });

  it('deep-linki trafiają w prawidłowe ekrany/filtry', () => {
    expect(COUNTER_NAV.items).toEqual({ kind: 'none' });
    expect(COUNTER_NAV.needs).toEqual({ kind: 'needs' });
    expect(COUNTER_NAV.assigned).toEqual({ kind: 'filter', filters: { status: 'ASSIGNED' } });
    expect(COUNTER_NAV.serviceDue).toEqual({ kind: 'filter', filters: { serviceDue: true } });
  });
});
