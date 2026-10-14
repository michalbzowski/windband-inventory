/**
 * Progress math for the counting screen (screen 09 bottom bar) — pure so it
 * can be unit-tested without a DOM. Effective state of a snapshot line is the
 * unflushed local decision when present (optimistic UI), otherwise the server
 * value. Divergences follow the frozen definition: counted MISSING/BROKEN plus
 * every nadwyżka (EXTRA); uncounted lines are NOT divergences until close.
 */
import type { FoundState, StocktakeLineView } from '../api/inventory';
import type { PendingDecision } from './queue';

export interface LiveProgress {
  total: number;
  counted: number;
  uncounted: number;
  divergences: number;
  ok: number;
  missing: number;
  broken: number;
  extra: number;
  /** id of the first snapshot line without any decision (resume target, F5.4) */
  nextUncountedLineId: number | null;
}

export function effectiveState(
  line: StocktakeLineView,
  pendingByLine: Map<number, PendingDecision>,
): FoundState | null {
  return pendingByLine.get(line.id)?.foundState ?? line.foundState;
}

export function deriveProgress(
  lines: StocktakeLineView[],
  pending: PendingDecision[],
): LiveProgress {
  const pendingByLine = new Map(pending.filter((p) => p.kind === 'count').map((p) => [p.lineId as number, p]));
  const pendingExtras = pending.filter((p) => p.kind === 'extra');
  const snapshot = lines.filter((l) => !l.extra);

  let ok = 0;
  let missing = 0;
  let broken = 0;
  let extra = lines.length - snapshot.length; // server-recorded nadwyżki
  let nextUncountedLineId: number | null = null;

  for (const line of snapshot) {
    const state = effectiveState(line, pendingByLine);
    if (state === null && nextUncountedLineId === null) {
      nextUncountedLineId = line.id;
    }
    switch (state) {
      case 'OK':
        ok += 1;
        break;
      case 'MISSING':
        missing += 1;
        break;
      case 'BROKEN':
        broken += 1;
        break;
      case 'EXTRA':
        extra += 1; // unreachable via count (server rejects), defensive
        break;
      default:
        break;
    }
  }
  extra += pendingExtras.length;

  const counted = ok + missing + broken + extra;
  // Pending (unflushed) extras are not server lines yet — they still belong
  // to the live totals, otherwise "counted" could exceed "total".
  const total = lines.length + pendingExtras.length;
  return {
    total,
    counted,
    uncounted: total - counted,
    divergences: missing + broken + extra,
    ok,
    missing,
    broken,
    extra,
    nextUncountedLineId,
  };
}
