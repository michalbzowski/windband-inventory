import { describe, expect, it } from 'vitest';
import { CountQueue, countKey, extraKey, memoryStorage, type PendingDecision } from './queue';

function decision(overrides: Partial<PendingDecision> = {}): PendingDecision {
  return {
    key: countKey(101),
    stocktakeId: 7,
    kind: 'count',
    lineId: 101,
    itemId: 500,
    name: 'Tuba',
    foundState: 'OK',
    note: '',
    countedMemberId: 12,
    countedMemberName: 'Jan',
    queuedAt: new Date('2026-10-14T10:00:00Z').toISOString(),
    ...overrides,
  };
}

const q = () => new CountQueue(memoryStorage());

describe('CountQueue', () => {
  it('stores and lists decisions per stocktake', () => {
    const queue = q();
    queue.put(decision());
    queue.put(decision({ key: countKey(102), lineId: 102 }));
    queue.put(decision({ key: countKey(201), lineId: 201, stocktakeId: 8 }));

    expect(queue.forStocktake(7).map((d) => d.lineId)).toEqual([101, 102]);
    expect(queue.count(7)).toBe(2);
    expect(queue.count(8)).toBe(1);
  });

  it('replaces the pending decision for the same line — last word wins', () => {
    const queue = q();
    queue.put(decision({ foundState: 'MISSING' }));
    queue.put(decision({ foundState: 'BROKEN', note: 'pęknięta czara' }));

    const pending = queue.pendingForLine(7, 101);
    expect(pending?.foundState).toBe('BROKEN');
    expect(pending?.note).toBe('pęknięta czara');
    expect(queue.count(7)).toBe(1);
  });

  it('removes by key (Cofnij before flush)', () => {
    const queue = q();
    queue.put(decision());
    queue.remove(countKey(101));

    expect(queue.pendingForLine(7, 101)).toBeUndefined();
    expect(queue.count(7)).toBe(0);
  });

  it('keeps extras separate and mirrors server uniqueness per item', () => {
    const queue = q();
    queue.put(decision({ key: extraKey('u1'), kind: 'extra', lineId: null, itemId: 700, foundState: 'EXTRA' }));

    expect(queue.hasPendingExtraForItem(7, 700)).toBe(true);
    expect(queue.hasPendingExtraForItem(7, 701)).toBe(false);
    expect(queue.hasPendingExtraForItem(8, 700)).toBe(false);
  });

  it('survives corrupted storage instead of crashing the counting screen', () => {
    const broken = memoryStorage();
    broken.setItem('wi.countQueue.v1', '{not json');

    const queue = new CountQueue(broken);
    expect(queue.all()).toEqual([]);
    queue.put(decision());
    expect(queue.count(7)).toBe(1);
  });
});
