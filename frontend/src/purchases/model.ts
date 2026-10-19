import type { PurchaseStatus, PurchaseView } from '../api/purchases';

/**
 * Pure presentation rules for the purchases board. The NEXT-step map mirrors
 * backend PurchaseCommandService exactly — buttons only appear where the
 * server would accept them (no 409 lotteries in the UI).
 * Colors read as queue pressure: red = waiting for hand-off, amber = in the
 * market, info = goods physical but not handed over, ok/grey = done.
 */
export const PURCHASE_BADGE_CLASS: Record<PurchaseStatus, string> = {
  REQUESTED: 'b-danger',
  SENT: 'b-warn',
  IN_PROGRESS: 'b-warn',
  DELIVERED: 'b-info',
  READY_FOR_PICKUP: 'b-info',
  RECEIVED: 'b-ok',
  CANCELLED: 'b-gray',
};

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  REQUESTED: 'Zgłoszone',
  SENT: 'Przekazane do realizacji',
  IN_PROGRESS: 'W realizacji',
  DELIVERED: 'Dostarczone',
  READY_FOR_PICKUP: 'Do odbioru',
  RECEIVED: 'Odebrane',
  CANCELLED: 'Anulowane',
};

/** Forward-only actions offered per status (ADMIN); 'CANCELLED' shown as secondary. */
export const PURCHASE_NEXT: Record<PurchaseStatus, { to: Exclude<PurchaseStatus, 'REQUESTED'>; label: string } | null> = {
  REQUESTED: { to: 'SENT', label: 'Przekaż do realizacji' },
  SENT: { to: 'IN_PROGRESS', label: 'Rozpocznij realizację' },
  IN_PROGRESS: { to: 'DELIVERED', label: 'Oznacz dostawę' },
  DELIVERED: { to: 'READY_FOR_PICKUP', label: 'Przygotuj do odbioru' },
  READY_FOR_PICKUP: { to: 'RECEIVED', label: 'Potwierdź odbiór' },
  RECEIVED: null,
  CANCELLED: null,
};

/** Cancel is allowed server-side only before delivery (evidence rule). */
export const canCancel = (status: PurchaseStatus): boolean =>
  status === 'REQUESTED' || status === 'SENT' || status === 'IN_PROGRESS';

/** True while the purchase still expects action — drives chip counts. */
export const isOpenPurchase = (p: PurchaseView): boolean => p.status !== 'RECEIVED' && p.status !== 'CANCELLED';

/** Actions that require a free-text note sheet (mirrors resolve sheets in needs). */
export const NOTE_REQUIRED_ACTIONS: ReadonlySet<PurchaseStatus> = new Set<PurchaseStatus>([
  'DELIVERED',
  'RECEIVED',
  'CANCELLED',
]);

export type PurchaseFilter = 'ALL' | 'OPEN' | PurchaseStatus;

export const PURCHASE_FILTERS: readonly PurchaseFilter[] = [
  'ALL',
  'OPEN',
  'REQUESTED',
  'SENT',
  'IN_PROGRESS',
  'DELIVERED',
  'READY_FOR_PICKUP',
  'RECEIVED',
  'CANCELLED',
];

export const PURCHASE_FILTER_LABEL: Record<PurchaseFilter, string> = {
  ALL: 'Wszystkie',
  OPEN: 'Otwarte',
  REQUESTED: 'Zgłoszone',
  SENT: 'Przekazane',
  IN_PROGRESS: 'W realizacji',
  DELIVERED: 'Dostarczone',
  READY_FOR_PICKUP: 'Do odbioru',
  RECEIVED: 'Odebrane',
  CANCELLED: 'Anulowane',
};

/** ALL = otwarte (przód kolejki) + ostatnie zamknięte; domyślny widok deski. */
export function filterPurchases(all: PurchaseView[], filter: PurchaseFilter): PurchaseView[] {
  const base =
    filter === 'ALL' ? all : filter === 'OPEN' ? all.filter(isOpenPurchase) : all.filter((p) => p.status === filter);
  return [...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function purchaseCounts(all: PurchaseView[]): Partial<Record<PurchaseFilter, number>> {
  const out: Partial<Record<PurchaseFilter, number>> = {
    ALL: all.length,
    OPEN: all.filter(isOpenPurchase).length,
  };
  for (const p of all) {
    out[p.status] = (out[p.status] ?? 0) + 1;
  }
  return out;
}
