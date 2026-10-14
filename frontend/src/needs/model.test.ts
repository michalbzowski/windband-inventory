import { describe, expect, it } from 'vitest';
import {
  canCancel,
  canOrder,
  canReceive,
  NEED_STATUS_LABEL,
  openNeedCount,
  openNeedFor,
  type NeedView,
} from './model';
import type { NeedStatus } from '../api/inventory';

const need = (id: number, itemId: number, status: NeedStatus): NeedView => ({
  id,
  bandId: 1,
  itemId,
  name: `Pozycja ${id}`,
  serialNumber: null,
  quantity: 1,
  status,
  note: null,
  resolutionNote: null,
  createdMemberId: 11,
  createdMemberName: 'Anna Nowak',
  createdAt: '2026-10-14T10:00:00',
  resolvedAt: null,
});

describe('potrzeby — czysta logika flow (lustrzana do domenowej)', () => {
  it('etykieta PL dla każdego statusu', () => {
    expect(NEED_STATUS_LABEL.OPEN).toBe('Zgłoszona');
    expect(NEED_STATUS_LABEL.ORDERED).toBe('Zamówiona');
    expect(NEED_STATUS_LABEL.RECEIVED).toBe('Dostarczona');
    expect(NEED_STATUS_LABEL.CANCELLED).toBe('Anulowana');
  });

  it('akcje dostępne wg ścieżki OPEN → ORDERED → RECEIVED/CANCELLED', () => {
    const open = need(1, 7, 'OPEN');
    const ordered = need(2, 7, 'ORDERED');
    const received = need(3, 7, 'RECEIVED');
    const cancelled = need(4, 7, 'CANCELLED');
    expect(canOrder(open)).toBe(true);
    expect(canReceive(open)).toBe(false);
    expect(canCancel(open)).toBe(true);
    expect(canOrder(ordered)).toBe(false);
    expect(canReceive(ordered)).toBe(true);
    expect(canCancel(ordered)).toBe(true);
    for (const done of [received, cancelled]) {
      expect(canOrder(done)).toBe(false);
      expect(canReceive(done)).toBe(false);
      expect(canCancel(done)).toBe(false);
    }
  });

  it('openNeedFor znajduje niezamkniętą potrzebę danej pozycji', () => {
    const rows = [need(1, 7, 'RECEIVED'), need(2, 9, 'ORDERED'), need(3, 7, 'OPEN')];
    expect(openNeedFor(rows, 7)?.id).toBe(3);
    expect(openNeedFor(rows, 9)?.id).toBe(2);
    expect(openNeedFor(rows, 5)).toBeUndefined();
  });

  it('openNeedCount liczy tylko OPEN/ORDERED', () => {
    const rows = [need(1, 7, 'OPEN'), need(2, 8, 'CANCELLED'), need(3, 9, 'ORDERED'), need(4, 10, 'RECEIVED')];
    expect(openNeedCount(rows)).toBe(2);
  });
});
