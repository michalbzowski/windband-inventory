import type { FoundState } from '../api/inventory';

/**
 * Offline decision queue (F5/B7, screen 11 of the frozen mockup).
 *
 * Pure module: everything touches an injected key-value storage, so the
 * counting flow is unit-testable without a browser. Entries are keyed per
 * stocktake and, for snapshot lines, deduped by line id — the LAST word of
 * the counter wins (backend recount semantics), an unflushed decision never
 * forks. Extra (nadwyżka) entries get a caller-supplied unique key.
 */

export type PendingKind = 'count' | 'extra';

export interface PendingDecision {
  readonly key: string;
  readonly stocktakeId: number;
  readonly kind: PendingKind;
  /** count → snapshot line; extra → null */
  readonly lineId: number | null;
  readonly itemId: number;
  /** display-only fields captured at tap time (card may flush later) */
  readonly name: string | null;
  readonly foundState: FoundState;
  readonly note: string;
  readonly countedMemberId: number;
  readonly countedMemberName: string;
  readonly queuedAt: string;
}

export interface KvStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'wi.coun…ue.v1';

/** Minimal in-memory storage — used by tests and as SSR-safe fallback. */
export function memoryStorage(): KvStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function defaultStorage(): KvStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode / non-browser context */
  }
  return memoryStorage();
}

export class CountQueue {
  constructor(private readonly storage: KvStorage = defaultStorage()) {}

  private read(): PendingDecision[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PendingDecision[]) : [];
    } catch {
      return [];
    }
  }

  private write(entries: PendingDecision[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  all(): PendingDecision[] {
    return this.read();
  }

  forStocktake(stocktakeId: number): PendingDecision[] {
    return this.read().filter((d) => d.stocktakeId === stocktakeId);
  }

  pendingForLine(stocktakeId: number, lineId: number): PendingDecision | undefined {
    return this.read().find((d) => d.stocktakeId === stocktakeId && d.lineId === lineId);
  }

  /** Insert or replace by key — last decision for a line wins. */
  put(decision: PendingDecision): void {
    const entries = this.read().filter((d) => d.key !== decision.key);
    entries.push(decision);
    this.write(entries);
  }

  remove(key: string): void {
    this.write(this.read().filter((d) => d.key !== key));
  }

  count(stocktakeId: number): number {
    return this.forStocktake(stocktakeId).length;
  }

  /** Extra uniqueness mirror (server rejects duplicates; queue must not even try). */
  hasPendingExtraForItem(stocktakeId: number, itemId: number): boolean {
    return this.read().some(
      (d) => d.stocktakeId === stocktakeId && d.kind === 'extra' && d.itemId === itemId,
    );
  }
}

export const countKey = (lineId: number): string => `L${lineId}`;
export const extraKey = (uuid: string): string => `X${uuid}`;
