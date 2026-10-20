import { invGet, invSend } from './client';
import type { ItemType } from './inventory';

/** Purchase flow statuses — 1:1 with backend PurchaseStatus (roadmap 2026-10-19). */
export type PurchaseStatus =
  | 'REQUESTED'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'READY_FOR_PICKUP'
  | 'RECEIVED'
  | 'CANCELLED';

/** Snapshotted attribute value on a purchase (what we agreed to buy; names are frozen evidence). */
export interface PurchaseAttributeView {
  attributeDefId: number;
  name: string;
  value: string;
}

export interface PurchaseView {
  id: number;
  bandId: number;
  name: string;
  itemType: ItemType;
  status: PurchaseStatus;
  requestedForMemberId: number;
  requestedForName: string;
  note: string | null;
  resolutionNote: string | null;
  createdMemberId: number | null;
  createdMemberName: string | null;
  /** Always an array (empty for legacy orders without attributes). */
  attributes: PurchaseAttributeView[];
  itemId: number | null;
  itemSerialNumber: string | null;
  createdAt: string;
  deliveredAt: string | null;
  receivedAt: string | null;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

export const listPurchases = (bandId: number, status?: PurchaseStatus, signal?: AbortSignal): Promise<PurchaseView[]> =>
  invGet(`/purchases${qs({ bandId, status })}`, signal);

/** ADMIN zamawia nowy przedmiot dla wskazanego aktywnego członka. */
export const createPurchase = (bandId: number, req: {
  name?: string | null;
  itemType: ItemType;
  requestedForMemberId: number;
  note?: string | null;
  createdMemberId: number;
  /** Same shape as the new-item form: [{attributeDefId, value}] (blanks omitted). */
  attributes?: { attributeDefId: number; value: string }[];
}): Promise<PurchaseView> => invSend('POST', `/purchases?bandId=${bandId}`, req);

export const setPurchaseStatus = (
  id: number,
  status: Exclude<PurchaseStatus, 'REQUESTED'>,
  note?: string | null,
): Promise<PurchaseView> => invSend('POST', `/purchases/${id}/status`, { status, note: note ?? null });
