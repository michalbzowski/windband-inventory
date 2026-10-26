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
  /** snapshot nazwy; null gdy pozycja jej nie ma (V16/V18) — czytnikiem serialNumber */
  name: string | null;
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
  /** B16: wartości aktywnych definicji oznaczonych „na liście", w kolejności displayOrder.
   *  Serwer wysyła zawsze (może być []); starsze fixture e2e mogą pola nie mieć. */
  listAttributes?: AttributeValueView[];
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
    /** F4 "do serwisu": AVAILABLE with due nextServiceDate (server-side rule). */
    serviceDue?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<ItemSummaryView[]> => {
  const { serviceDue, ...rest } = filters;
  return invGet(
    `/items${qs({ bandId, ...rest, serviceDue: serviceDue ? 'true' : undefined })}`,
    signal,
  );
};

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
  /** F4: plan pisany wyłącznie przez workflow serwisu (null = brak terminu). */
  nextServiceDate: string | null;
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
  /** v2.0 reguły warunkowe: rodzic (SELECT, ten sam typ) albo null = bez warunku. */
  dependsOnDefId: number | null;
  /** Wartości rodzica, po których atrybut jest widoczny. */
  dependsOnValues: string[];
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

/** B17: podgląd kodu, który nada następny zapis (odczyt licznika, bez konsumpcji; ADMIN). */
export const nextItemCode = (bandId: number, type: ItemType): Promise<string> =>
  invGet<{ code: string }>(`/items/next-code${qs({ bandId, type })}`).then((r) => r.code);

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

/** F4 sendToService: AVAILABLE → IN_SERVICE (ADMIN). */
export const sendItemToService = (
  id: number,
  req: { note?: string | null } = {},
): Promise<ItemView> => invSend('POST', `/items/${id}/service`, req);

/** F4 completeService: IN_SERVICE → AVAILABLE + optional next-service plan (ADMIN). */
export const completeItemService = (
  id: number,
  req: { note?: string | null; nextServiceDate?: string | null },
): Promise<ItemView> => invSend('POST', `/items/${id}/service/complete`, req);

/** ServiceEventView — one service-workflow record (completedAt null = still in service). */
export interface ServiceEventView {
  id: number;
  sentAt: string;
  sentNote: string | null;
  completedAt: string | null;
  completedNote: string | null;
  nextServiceDate: string | null;
}

export const listItemServices = (id: number): Promise<ServiceEventView[]> =>
  invGet(`/items/${id}/services`);

// --- Potrzeby/Zamówienia (backlog v1.x #3, odblokowanie akcji BRAK z raportu, B9) ---

export type NeedStatus = 'OPEN' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface NeedView {
  id: number;
  bandId: number;
  itemId: number;
  /** snapshot nazwy; null gdy pozycja jej nie ma (V16/V18) — czytnikiem serialNumber */
  name: string | null;
  serialNumber: string | null;
  quantity: number;
  status: NeedStatus;
  note: string | null;
  resolutionNote: string | null;
  createdMemberId: number | null;
  createdMemberName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export const listNeeds = (bandId: number, status?: NeedStatus, signal?: AbortSignal): Promise<NeedView[]> =>
  invGet(`/needs${qs({ bandId, status })}`, signal);

/** zgłasza AKTYWNY członek listy WM (B10 — serwer re-waliduje createdMemberId). */
export const createNeed = (bandId: number, req: {
  itemId: number;
  quantity: number;
  note?: string | null;
  createdMemberId: number;
}): Promise<NeedView> => invSend('POST', `/needs?bandId=${bandId}`, req);

export const setNeedStatus = (id: number, status: Exclude<NeedStatus, 'OPEN'>, note?: string | null): Promise<NeedView> =>
  invSend('POST', `/needs/${id}/status`, { status, note: note ?? null });

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
  includeInactive = false,
  signal?: AbortSignal,
): Promise<AttributeDefView[]> =>
  invGet(`/attribute-defs${qs({ bandId, type, all: includeInactive ? 'true' : undefined })}`, signal);

/** Write body for defs: POST requires itemType+dataType, PUT must not send them
 * (immutable in v1); DELETE is deactivation, `active:true` via PUT reactivates. */
export interface AttributeDefWritePayload {
  name?: string;
  itemType?: ItemType;
  dataType?: AttributeDataType;
  displayOrder?: number;
  required?: boolean;
  displayInList?: boolean;
  options?: string[];
  active?: boolean;
  /** >0 ustawia rodzica; 0 = usuń zależność; nieobecne = bez zmian. */
  dependsOnDefId?: number;
  dependsOnValues?: string[];
}

export const createAttributeDef = (
  bandId: number,
  payload: AttributeDefWritePayload,
): Promise<AttributeDefView> => invSend('POST', `/attribute-defs${qs({ bandId })}`, payload);

export const updateAttributeDef = (
  id: number,
  payload: AttributeDefWritePayload,
): Promise<AttributeDefView> => invSend('PUT', `/attribute-defs/${id}`, payload);

export const deactivateAttributeDef = (id: number): Promise<void> => invSend('DELETE', `/attribute-defs/${id}`);

// --- Deklaracje posiadania (backlog v1.x item 4, decyzja B14) ---

export type DeclarationType = 'PRIVATE' | 'EXTERNAL';
export type DeclarationStatus = 'ACTIVE' | 'REVOKED';

/** 1:1 z DeclarationQueryService.DeclarationView — snapshot nazwy/serii zamrożony w wierszu. */
export interface DeclarationView {
  id: number;
  bandId: number;
  itemId: number;
  /** snapshot nazwy; null gdy pozycja jej nie ma (V16/V18) — czytnikiem serialNumber */
  name: string | null;
  serialNumber: string | null;
  type: DeclarationType;
  status: DeclarationStatus;
  holderMemberId: number | null;
  holderName: string | null;
  locationText: string | null;
  note: string | null;
  declaredByMemberId: number | null;
  declaredByName: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedNote: string | null;
}

export const listDeclarations = (
  bandId: number,
  filters?: { type?: DeclarationType; status?: DeclarationStatus; holderMemberId?: number },
  signal?: AbortSignal,
): Promise<DeclarationView[]> => invGet(`/declarations${qs({ bandId, ...filters })}`, signal);

/** Składa dowolny członek (B14); serwer re-waliduje roster (B10). */
export const createDeclaration = (
  bandId: number,
  req: {
    itemId: number;
    type: DeclarationType;
    holderMemberId?: number | null;
    locationText?: string | null;
    note?: string | null;
    declaredByMemberId: number;
  },
): Promise<DeclarationView> => invSend('POST', `/declarations${qs({ bandId })}`, req);

/** Tylko ADMIN: ACTIVE → REVOKED (finalne). */
export const revokeDeclaration = (id: number, note?: string | null): Promise<DeclarationView> =>
  invSend('POST', `/declarations/${id}/revoke`, { note: note ?? null });
