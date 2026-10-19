import { describe, expect, test } from 'vitest';
import {
  NOTE_REQUIRED_ACTIONS,
  SERVICE_NEXT,
  canCancelService,
  filterServiceJobs,
  isOpenServiceJob,
  serviceCounts,
  type ServiceJobView,
} from './model';

const job = (over: Partial<ServiceJobView>): ServiceJobView => ({
  id: 1,
  bandId: 7,
  itemId: 9,
  itemName: 'Flet Yamaha 467',
  itemSerialNumber: 'FL-467',
  reporterMemberId: 11,
  reporterName: 'Jan Kowalski',
  status: 'REQUESTED',
  note: null,
  resolutionNote: null,
  createdByMemberId: 5,
  createdByName: 'Administrator',
  createdAt: '2026-10-15T10:00:00Z',
  shippedAt: null,
  returnedAt: null,
  handedOverAt: null,
  cancelledAt: null,
  ...over,
});

describe('service board rules (B15) — mirror of ServiceJobCommandService', () => {
  test.each([
    ['REQUESTED', 'SHIPPED'],
    ['SHIPPED', 'REPAIRED'],
    ['REPAIRED', 'READY_FOR_PICKUP'],
    ['READY_FOR_PICKUP', 'IN_STOCK'],
    ['IN_STOCK', 'HANDLED_OVER'],
  ] as const)('next(%s) offers %s', (from, to) => {
    expect(SERVICE_NEXT[from]?.to ?? null).toBe(to);
  });

  test.each([['HANDLED_OVER'], ['CANCELLED']] as const)('next(%s) offers no action', (done) => {
    expect(SERVICE_NEXT[done]).toBe(null);
    expect(canCancelService(done)).toBe(false);
    expect(isOpenServiceJob(job({ status: done }))).toBe(false);
  });

  test('cancel only from REQUESTED (before shipping)', () => {
    expect(canCancelService('REQUESTED')).toBe(true);
    expect(NOTE_REQUIRED_ACTIONS.has('CANCELLED')).toBe(true);
    expect(NOTE_REQUIRED_ACTIONS.has('IN_STOCK')).toBe(false);
  });

  test('open = everything until handed over or cancelled', () => {
    expect(isOpenServiceJob(job({ status: 'SHIPPED' }))).toBe(true);
    expect(isOpenServiceJob(job({ status: 'IN_STOCK' }))).toBe(true);
    expect(isOpenServiceJob(job({ status: 'HANDLED_OVER' }))).toBe(false);
  });

  test('filtering by status and ALL keeps newest-first order', () => {
    const jobs = [
      job({ id: 1, status: 'IN_STOCK', createdAt: '2026-10-14T08:00:00Z' }),
      job({ id: 2, status: 'REQUESTED', createdAt: '2026-10-16T09:00:00Z' }),
      job({ id: 3, status: 'REQUESTED', createdAt: '2026-10-15T09:00:00Z' }),
    ];
    expect(filterServiceJobs(jobs, 'ALL').map((j) => j.id)).toEqual([2, 3, 1]);
    expect(filterServiceJobs(jobs, 'REQUESTED').map((j) => j.id)).toEqual([2, 3]);
    expect(filterServiceJobs(jobs, 'SHIPPED')).toEqual([]);
  });

  test('chip counts: ALL = open only', () => {
    const c = serviceCounts([job({ status: 'HANDLED_OVER' }), job({}), job({ id: 2, status: 'IN_STOCK' })]);
    expect(c.ALL).toBe(2);
    expect(c.REQUESTED).toBe(1);
    expect(c.IN_STOCK).toBe(1);
    expect(c.CANCELLED).toBe(0);
  });
});
