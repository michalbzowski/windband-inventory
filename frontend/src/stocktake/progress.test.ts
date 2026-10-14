import { describe, expect, it } from 'vitest';
import type { StocktakeLineView } from '../api/inventory';
import { deriveProgress, effectiveState } from './progress';
import { countKey, extraKey, type PendingDecision } from './queue';

function line(over: Partial<StocktakeLineView> = {}): StocktakeLineView {
  return {
    id: 1,
    itemId: 11,
    name: 'Flet',
    serialNumber: null,
    assignedMemberName: null,
    expectedStatus: 'AVAILABLE',
    foundState: null,
    note: null,
    countedByMemberId: null,
    countedByMemberName: null,
    countedAt: null,
    extra: false,
    ...over,
  };
}

function pending(over: Partial<PendingDecision> = {}): PendingDecision {
  return {
    key: countKey(1),
    stocktakeId: 7,
    kind: 'count',
    lineId: 1,
    itemId: 11,
    name: 'Flet',
    foundState: 'OK',
    note: '',
    countedMemberId: 12,
    countedMemberName: 'Jan',
    queuedAt: '2026-10-14T10:00:00Z',
    ...over,
  };
}

describe('deriveProgress', () => {
  it('counts uncounted lines as uncounted, NOT as divergences (server marks MISSING only at close)', () => {
    const p = deriveProgress([line(), line({ id: 2 }), line({ id: 3, foundState: 'OK' })], []);
    expect(p).toMatchObject({ total: 3, counted: 1, uncounted: 2, divergences: 0, ok: 1 });
    expect(p.nextUncountedLineId).toBe(1); // first snapshot line without a decision
  });

  it('pending decision overrides the server state (optimistic card + counters)', () => {
    const lines = [line({ id: 1, foundState: 'OK' }), line({ id: 2 })];
    const p = deriveProgress(lines, [pending({ key: countKey(2), lineId: 2, foundState: 'MISSING' })]);

    expect(p.counted).toBe(2);
    expect(p.uncounted).toBe(0);
    expect(p.missing).toBe(1);
    expect(p.divergences).toBe(1);
    expect(p.nextUncountedLineId).toBeNull();
  });

  it('nadwyżka (pending EXTRA) grows total AND divergences but never steals the snapshot slot', () => {
    const p = deriveProgress([line(), line({ id: 2 })], [
      pending({ key: extraKey('u1'), kind: 'extra', lineId: null, itemId: 99, foundState: 'EXTRA' }),
    ]);
    expect(p.total).toBe(3);
    expect(p.counted).toBe(1);
    expect(p.extra).toBe(1);
    expect(p.divergences).toBe(1);
    expect(p.nextUncountedLineId).toBe(1);
  });

  it('a recount overwrites divergence buckets (last word wins, mirrors PUT semantics)', () => {
    const lines = [line({ id: 1, foundState: 'BROKEN' })];
    const p = deriveProgress(lines, [pending({ foundState: 'OK' })]);
    expect(p.broken).toBe(0);
    expect(p.ok).toBe(1);
    expect(p.divergences).toBe(0);
  });

  it('effectiveState ignores pending of a different line', () => {
    const l = line({ id: 5, foundState: null });
    const map = new Map([[9, pending({ key: countKey(9), lineId: 9 })]]);
    expect(effectiveState(l, map)).toBeNull();
  });
});
