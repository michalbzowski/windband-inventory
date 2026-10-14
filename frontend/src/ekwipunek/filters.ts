import type {
  ItemLifecycleStatus,
  ItemType,
  WarehouseType,
} from '../api/inventory';

/**
 * Filter state for the Ekwipunek list (P0 §3.1: typ, status, magazyn,
 * przypisana osoba + atrybut wg definicji). Pure so the params/labels/summary
 * logic is unit-tested without a DOM; the view owns only React state.
 */

/** Empty-string keys mean "no filter" — kept in state so chips toggle 1-tap. */
export interface ItemFilterState {
  type: ItemType | '';
  status: ItemLifecycleStatus | '';
  warehouse: WarehouseType | '';
  assignedMemberId: number | null;
  attributeDefId: number | null;
  /** empty = "has any value for this def" (server semantics, IT-covered) */
  attributeValue: string;
  search: string;
}

export const emptyFilters = (): ItemFilterState => ({
  type: '',
  status: '',
  warehouse: '',
  assignedMemberId: null,
  attributeDefId: null,
  attributeValue: '',
  search: '',
});

/** Query params for GET /items — undefined/blank values are dropped by qs(). */
export function toQuery(state: ItemFilterState): Record<string, string | number | undefined> {
  return {
    type: state.type || undefined,
    status: state.status || undefined,
    warehouse: state.warehouse || undefined,
    assignedMemberId: state.assignedMemberId ?? undefined,
    attributeDefId: state.attributeDefId ?? undefined,
    attributeValue: state.attributeDefId && state.attributeValue ? state.attributeValue : undefined,
    search: state.search.trim() || undefined,
  };
}

export function activeChipCount(state: ItemFilterState): number {
  return [state.type, state.status, state.warehouse].filter(Boolean).length
    + (state.assignedMemberId !== null ? 1 : 0)
    + (state.attributeDefId !== null ? 1 : 0);
}

/* ---------- Polish labels + type icons (mirrors makieta screen 03/06) ---------- */

export const TYPE_LABEL: Record<ItemType, string> = {
  INSTRUMENT: 'Instrument',
  UNIFORM: 'Umundrowanie',
  AWARD: 'Wyróżnienie',
  SHEET_MUSIC: 'Nuty',
  EQUIPMENT: 'Sprzęt',
  CONSUMABLE: 'Materiały eksploatacyjne',
  DOCUMENT: 'Dokument',
  OTHER: 'Inne',
};

export const TYPE_ICON: Record<ItemType, string> = {
  INSTRUMENT: '🎺',
  UNIFORM: '👕',
  AWARD: '🏆',
  SHEET_MUSIC: '🎼',
  EQUIPMENT: '🧰',
  CONSUMABLE: '🧴',
  DOCUMENT: '📄',
  OTHER: '🔖',
};

export const STATUS_LABEL: Record<ItemLifecycleStatus, string> = {
  AVAILABLE: 'Dostępny',
  ASSIGNED: 'Przypisany',
  IN_SERVICE: 'W serwisie',
  RETIRED: 'Wycofany',
  DISPOSED: 'Zutylizowany',
  LOST: 'Zagubiony',
};

export const STATUS_BADGE: Record<ItemLifecycleStatus, string> = {
  AVAILABLE: 'b-ok',
  ASSIGNED: 'b-primary',
  IN_SERVICE: 'b-warn',
  RETIRED: 'b-gray',
  DISPOSED: 'b-gray',
  LOST: 'b-danger',
};

export const WAREHOUSE_LABEL: Record<WarehouseType, string> = {
  MAIN: 'Główny',
  SERVICE: 'Serwis',
  ARCHIVE: 'Archiwum',
};

/** 'Przypisane' chip form from the mockup; others reuse STATUS_LABEL. */
const CHIP_STATUS = (s: ItemLifecycleStatus): string => (s === 'ASSIGNED' ? 'Przypisane' : STATUS_LABEL[s]);

/** Header line under the chips: "28 pozycji · filtr: Status = Przypisane". */
export function filterSummary(state: ItemFilterState, personName?: string, attributeName?: string): string {
  const parts: string[] = [];
  if (state.type) parts.push(`Typ = ${TYPE_LABEL[state.type]}`);
  if (state.status) parts.push(`Status = ${CHIP_STATUS(state.status)}`);
  if (state.warehouse) parts.push(`Magazyn = ${WAREHOUSE_LABEL[state.warehouse]}`);
  if (state.assignedMemberId !== null) parts.push(`Osoba = ${personName ?? `#${state.assignedMemberId}`}`);
  if (state.attributeDefId !== null) {
    parts.push(
      `Atrybut = ${attributeName ?? `#${state.attributeDefId}`}${state.attributeValue ? ` → ${state.attributeValue}` : ' (ustawiony)'}`,
    );
  }
  if (state.search.trim()) parts.push(`szukaj = „${state.search.trim()}"`);
  return parts.length ? `filtr: ${parts.join(' · ')}` : 'bez filtrów';
}
