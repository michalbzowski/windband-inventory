import { invGet, invSend } from './client';

/**
 * Typed client for the windband-inventory REST API (canonical paths frozen in
 * docs/w1-analiza-biznesowa-2026-10-12.md §3.2 "Doprecyzowanie F5").
 * DTO names mirror the backend Java records 1:1 (Jackson camelCase).
 */

export type StocktakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'CLOSED';
export type FoundState = 'OK' | 'BROKEN' | 'MISSING' | 'EXTRA';
export type ItemLifecycleStatus =
  | 'AVAILABLE' | 'ASSIGNED' | 'IN_SERVICE' | 'LOST' | 'RETIRED' | 'DISPOSED';
export type ItemType =
  | 'INSTRUMENT' | 'UNIFORM' | 'AWARD' | 'SHEET_MUSIC' | 'EQUIPMENT' | 'CONSUMABLE' | 'DOCUMENT' | 'OTHER';
export type WarehouseType = 'MAIN' | 'SERVICE' | 'ARCHIVE';

export interface StocktakeView {
  id: number;
  bandId: number;
  status: StocktakeStatus;
  startedBySubject: string | null;
  notes: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalLines: number;
  countedLines: number;
}

export interface StocktakeSummaryView {
  id: number;
  status: StocktakeStatus;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  counted: number;
  uncounted: number;
  divergences: number;
  ok: number;
  missing: number;
  broken: number;
  extra: number;
}

export interface StocktakeLineView {
  id: number;
  itemId: number;
  name: string;
  serialNumber: string | null;
  assignedMemberName: string | null;
  expectedStatus: ItemLifecycleStatus | null;
  foundState: FoundState | null;
  note: string | null;
  countedByMemberId: number | null;
  countedByMemberName: string | null;
  countedAt: string | null;
  extra: boolean;
}

export interface ItemSummaryView {
  id: number;
  name: string;
  type: ItemType;
  lifecycleStatus: ItemLifecycleStatus;
  warehouse: WarehouseType;
  serialNumber: string | null;
  assignedMemberName: string | null;
}

export interface StartRequest {
  type?: ItemType | null;
  status?: ItemLifecycleStatus | null;
  warehouse?: WarehouseType | null;
  notes?: string | null;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const listStocktakes = (bandId: number, signal?: AbortSignal): Promise<StocktakeView[]> =>
  invGet(`/stocktakes${qs({ bandId })}`, signal);

export const startStocktake = (bandId: number, req: StartRequest): Promise<StocktakeView> =>
  invSend('POST', `/stocktakes${qs({ bandId })}`, req);

export const getStocktake = (id: number): Promise<StocktakeView> => invGet(`/stocktakes/${id}`);

export const getSummary = (id: number): Promise<StocktakeSummaryView> => invGet(`/stocktakes/${id}/summary`);

export const getLines = (id: number, state?: FoundState): Promise<StocktakeLineView[]> =>
  invGet(`/stocktakes/${id}/lines${qs({ state })}`);

export const countLine = (
  stocktakeId: number,
  lineId: number,
  req: { foundState: FoundState; note?: string | null; countedMemberId: number },
): Promise<StocktakeLineView> => invSend('PUT', `/stocktakes/${stocktakeId}/lines/${lineId}`, req);

export const addExtraLine = (
  stocktakeId: number,
  req: { itemId: number; note?: string | null; countedMemberId: number },
): Promise<StocktakeLineView> => invSend('POST', `/stocktakes/${stocktakeId}/lines`, req);

export const pauseStocktake = (id: number): Promise<StocktakeView> => invSend('PATCH', `/stocktakes/${id}/pause`);
export const resumeStocktake = (id: number): Promise<StocktakeView> => invSend('PATCH', `/stocktakes/${id}/resume`);
export const closeStocktake = (id: number): Promise<StocktakeView> => invSend('PATCH', `/stocktakes/${id}/close`);

export const listItems = (
  bandId: number,
  filters: { type?: ItemType; status?: ItemLifecycleStatus; warehouse?: WarehouseType; search?: string } = {},
  signal?: AbortSignal,
): Promise<ItemSummaryView[]> => invGet(`/items${qs({ bandId, ...filters })}`, signal);
