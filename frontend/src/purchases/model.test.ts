import { describe, expect, it } from 'vitest';
import type { PurchaseView } from '../api/purchases';
import {
  PURCHASE_NEXT,
  canCancel,
  filterPurchases,
  isOpenPurchase,
  purchaseCounts,
} from './model';

const p = (over: Partial<PurchaseView> & Pick<PurchaseView, 'id' | 'status'>): PurchaseView => ({
  bandId: 7,
  name: 'Trąbka',
  itemType: 'INSTRUMENT',
  requestedForMemberId: 12,
  requestedForName: 'Anna Nowak',
  note: null,
  resolutionNote: null,
  createdMemberId: 11,
  createdMemberName: 'Jan Kowalski',
  attributes: [],
  itemId: null,
  itemSerialNumber: null,
  createdAt: '2026-10-19T10:00:00',
  deliveredAt: null,
  receivedAt: null,
  ...over,
});

describe('zamówienia — reguły planszy', () => {
  it('każdy stan ma dokładnie jedno następne kroczne działanie, terminale brak', () => {
    expect(PURCHASE_NEXT.REQUESTED?.to).toBe('SENT');
    expect(PURCHASE_NEXT.SENT?.to).toBe('IN_PROGRESS');
    expect(PURCHASE_NEXT.IN_PROGRESS?.to).toBe('DELIVERED');
    expect(PURCHASE_NEXT.DELIVERED?.to).toBe('READY_FOR_PICKUP');
    expect(PURCHASE_NEXT.READY_FOR_PICKUP?.to).toBe('RECEIVED');
    expect(PURCHASE_NEXT.RECEIVED).toBeNull();
    expect(PURCHASE_NEXT.CANCELLED).toBeNull();
  });

  it('anulować można tylko przed dostawą', () => {
    expect(canCancel('REQUESTED')).toBe(true);
    expect(canCancel('SENT')).toBe(true);
    expect(canCancel('IN_PROGRESS')).toBe(true);
    expect(canCancel('DELIVERED')).toBe(false);
    expect(canCancel('READY_FOR_PICKUP')).toBe(false);
    expect(canCancel('RECEIVED')).toBe(false);
    expect(canCancel('CANCELLED')).toBe(false);
    expect(isOpenPurchase(p({ id: 1, status: 'DELIVERED' }))).toBe(true);
    expect(isOpenPurchase(p({ id: 1, status: 'RECEIVED' }))).toBe(false);
  });

  it('filtry: OPEN to wszystko przed Odebrane/Anulowane, sort newest-first z tie-breakiem id', () => {
    const all = [
      p({ id: 1, status: 'RECEIVED', createdAt: '2026-10-19T12:00:00' }),
      p({ id: 2, status: 'REQUESTED', createdAt: '2026-10-19T10:00:00' }),
      p({ id: 3, status: 'IN_PROGRESS', createdAt: '2026-10-19T10:00:00' }),
      p({ id: 4, status: 'CANCELLED', createdAt: '2026-10-19T09:00:00' }),
    ];
    expect(filterPurchases(all, 'OPEN').map((x) => x.id)).toEqual([3, 2]);
    expect(filterPurchases(all, 'DELIVERED')).toEqual([]);
    expect(filterPurchases(all, 'ALL').map((x) => x.id)).toEqual([1, 3, 2, 4]);
    const counts = purchaseCounts(all);
    expect(counts.ALL).toBe(4);
    expect(counts.OPEN).toBe(2);
    expect(counts.REQUESTED).toBe(1);
    expect(counts.CANCELLED).toBe(1);
  });
});
