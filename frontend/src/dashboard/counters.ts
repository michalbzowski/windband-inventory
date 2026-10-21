import type { ItemFilterState } from '../ekwipunek/filters';

/** Stan liczników Pulpitu: undefined = w toku, null = błąd (nie blokujemy pulpitu). */
export type CounterValue = number | null | undefined;

export const counterText = (v: CounterValue): string =>
  v === undefined ? '…' : v === null ? '—' : String(v);

/** Które zapytanie listujące zasila dany licznik — mapa do deep-linku w Ekwipuneku. */
export type CounterKey = 'items' | 'assigned' | 'needs' | 'serviceDue';

export const COUNTER_META: Record<CounterKey, { label: string; aria: string }> = {
  items: { label: 'Pozycje', aria: 'Pokaż wszystkie pozycje' },
  assigned: { label: 'Przydziały i deklaracje', aria: 'Pokaż pozycje przydzielone lub zdeklarowane u osób' },
  needs: { label: 'Otwarte potrzeby', aria: 'Otwórz planszę zamówień i serwisu' },
  serviceDue: { label: 'Do serwisu', aria: 'Pokaż pozycje z terminem serwisu' },
};

/** Deep-link do Ekwipunku z Pulpitu: zwykłe wejście, create, planża potrzeb albo lista z narzuconym filtrem. */
export type EkwNav =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'needs' }
  | { kind: 'filter'; filters: Partial<ItemFilterState> };

export const COUNTER_NAV: Record<CounterKey, EkwNav> = {
  items: { kind: 'none' },
  assigned: { kind: 'filter', filters: { status: 'ASSIGNED' } },
  needs: { kind: 'needs' },
  serviceDue: { kind: 'filter', filters: { serviceDue: true } },
};
