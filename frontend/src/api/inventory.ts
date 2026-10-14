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
  assignedMemberId: number | null;
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
  filters: {
    type?: ItemType;
    status?: ItemLifecycleStatus;
    warehouse?: WarehouseType;
    search?: string;
    assignedMemberId?: number;
    attributeDefId?: number;
    attributeValue?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ItemSummaryView[]> => invGet(`/items${qs({ bandId, ...filters })}`, signal);

/* ---------- item registry (Ekwipunek, P0 §3.1) ---------- */

export type AttributeDataType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTI' | 'BOOLEAN' | 'DATE';

/** ItemAttributeValueView — value already normalized by the server. */
export interface AttributeValueView {
  attributeDefId: number;
  name: string;
  dataType: AttributeDataType;
  value: string | null;
}

/** ItemView — full detail incl. description/notes and attribute values. */
export interface ItemView {
  id: number;
  bandId: number;
  name: string;
  type: ItemType;
  lifecycleStatus: ItemLifecycleStatus;
  warehouse: WarehouseType;
  serialNumber: string | null;
  description: string | null;
  notes: string | null;
  attributes: AttributeValueView[];
  assignedMemberId: number | null;
  assignedMemberName: string | null;
}

/** AssignmentView — one history event (returnedAt null = still held). */
export interface AssignmentView {
  id: number;
  memberId: number;
  memberName: string;
  assignedAt: string;
  returnedAt: string | null;
  returnedState: ItemLifecycleStatus | null;
  assignNote: string | null;
  returnNote: string | null;
}

/** WarehouseTransferView — one movement row. */
export interface WarehouseTransferView {
  id: number;
  fromWarehouse: WarehouseType;
  toWarehouse: WarehouseType;
  note: string | null;
  transferredAt: string;
}

/** AttributeDefView — the form generator (B6: defs per band + type). */
export interface AttributeDefView {
  id: number;
  bandId: number;
  itemType: ItemType;
  name: string;
  dataType: AttributeDataType;
  displayOrder: number;
  required: boolean;
  displayInList: boolean;
  options: string[];
  active: boolean;
}

export interface ItemWritePayload {
  name: string;
  type?: ItemType; // required on POST, absent on PUT (type is immutable)
  warehouse?: WarehouseType;
  serialNumber?: string | null;
  description?: string | null;
  notes?: string | null;
  attributes: { attributeDefId: number; value: string | null }[];
}

export const getItem = (id: number): Promise<ItemView> => invGet(`/items/${id}`);

export const createItem = (bandId: number, payload: ItemWritePayload): Promise<ItemView> =>
  invSend('POST', `/items${qs({ bandId })}`, { ...payload });

export const updateItem = (id: number, payload: ItemWritePayload): Promise<ItemView> =>
  invSend('PUT', `/items/${id}`, { ...payload });

export const deleteItem = (id: number): Promise<void> => invSend('DELETE', `/items/${id}`);

export const assignItem = (
  id: number,
  req: { memberId: number; note?: string | null },
): Promise<ItemView> => invSend('POST', `/items/${id}/assign`, req);

export const unassignItem = (
  id: number,
  req: { state?: ItemLifecycleStatus | null; note?: string | null },
): Promise<ItemView> => invSend('POST', `/items/${id}/unassign`, req);

export const listItemAssignments = (id: number): Promise<AssignmentView[]> =>
  invGet(`/items/${id}/assignments`);

export const transferItem = (
  id: number,
  req: { to: WarehouseType; note?: string | null },
): Promise<ItemView> => invSend('POST', `/items/${id}/transfers`, req);

export const listItemTransfers = (id: number): Promise<WarehouseTransferView[]> =>
  invGet(`/items/${id}/transfers`);

/** F3 member picture — 1:1 with backend MemberPictureViews records. */
export interface ExpectedItemView {
  instrument: string;
  primary: boolean;
  satisfied: boolean;
  matchedItemIds: number[];
}

export interface AssignmentHistoryView {
  id: number;
  itemId: number;
  itemName: string;
  assignedAt: string;
  returnedAt: string | null;
  returnedState: ItemLifecycleStatus | null;
  assignNote: string | null;
  returnNote: string | null;
}

export interface MemberPictureView {
  memberId: number;
  memberName: string;
  active: boolean;
  expected: ExpectedItemView[];
  actual: ItemSummaryView[];
  gapCount: number;
  history: AssignmentHistoryView[];
}

export const getMemberPicture = (
  bandId: number,
  memberId: number,
  signal?: AbortSignal,
): Promise<MemberPictureView> => invGet(`/members/${memberId}/picture${qs({ bandId })}`, signal);

export const listAttributeDefs = (
  bandId: number,
  type?: ItemType,
  signal?: AbortSignal,
): Promise<AttributeDefView[]> => invGet(`/attribute-defs${qs({ bandId, type })}`, signal);
