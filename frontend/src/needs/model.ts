import type { NeedStatus, NeedView } from '../api/inventory';

export type { NeedStatus, NeedView };

/**
 * Pure need-flow helpers (backlog v1.x #3). The transition rules mirror the
 * domain (OPEN → ORDERED → RECEIVED; OPEN/ORDERED → CANCELLED) so the UI
 * never offers an action the server would reject with 409.
 */
export const NEED_STATUS_LABEL: Record<NeedStatus, string> = {
  OPEN: 'Zgłoszona',
  ORDERED: 'Zamówiona',
  RECEIVED: 'Dostarczona',
  CANCELLED: 'Anulowana',
};

export const NEED_BADGE_CLASS: Record<NeedStatus, string> = {
  OPEN: 'b-danger',
  ORDERED: 'b-warn',
  RECEIVED: 'b-ok',
  CANCELLED: 'b-gray',
};

export const canOrder = (n: NeedView): boolean => n.status === 'OPEN';
export const canReceive = (n: NeedView): boolean => n.status === 'ORDERED';
export const canCancel = (n: NeedView): boolean => n.status === 'OPEN' || n.status === 'ORDERED';

/** True while some need for this item is still unresolved (drives the report CTA state). */
export const openNeedFor = (needs: NeedView[], itemId: number): NeedView | undefined =>
  needs.find((n) => n.itemId === itemId && (n.status === 'OPEN' || n.status === 'ORDERED'));

/** Unresolved count for section headers/badges. */
export const openNeedCount = (needs: NeedView[]): number =>
  needs.filter((n) => n.status === 'OPEN' || n.status === 'ORDERED').length;
