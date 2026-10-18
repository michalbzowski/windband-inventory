import type {
  AttributeDataType,
  AttributeDefView,
  AttributeDefWritePayload,
  ItemType,
} from '../api/inventory';

/**
 * Model czysty (bez Reacta) formularza definicji atrybutu — walidacja i
 * konwersje draft↔encja, odwzorowujące reguły serwera (AttributeDef*Request):
 * nazwa wymagana ≤255, typ danych i typ pozycji niezmienne przy edycji,
 * SELECT/MULTI wymagają co najmniej jednej opcji.
 */

export interface DefDraft {
  name: string;
  dataType: AttributeDataType;
  /** textarea: po jednej opcji w linii */
  optionsText: string;
  /** string, bo pole number bywa puste; '' → serwer użyje 0 */
  displayOrder: string;
  required: boolean;
  displayInList: boolean;
}

export const DATA_TYPE_LABEL: Record<AttributeDataType, string> = {
  TEXT: 'Tekst',
  NUMBER: 'Liczba',
  SELECT: 'Lista — jeden wybór',
  MULTI: 'Lista — wiele wartości',
  BOOLEAN: 'Tak / nie',
  DATE: 'Data',
};

export const DATA_TYPES: AttributeDataType[] = ['TEXT', 'NUMBER', 'SELECT', 'MULTI', 'BOOLEAN', 'DATE'];

export const needsOptions = (dataType: AttributeDataType): boolean =>
  dataType === 'SELECT' || dataType === 'MULTI';

/** Linie → lista opcji: trim, odrzucenie pustych, deduplikacja (kolejność zachowana). */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const option = raw.trim();
    if (!option || seen.has(option)) continue;
    seen.add(option);
    out.push(option);
  }
  return out;
}

export function validateDefDraft(draft: DefDraft): Partial<Record<keyof DefDraft, string>> {
  const errors: Partial<Record<keyof DefDraft, string>> = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Nazwa jest wymagana';
  else if (name.length > 255) errors.name = 'Maksymalnie 255 znaków';
  if (needsOptions(draft.dataType) && parseOptions(draft.optionsText).length === 0) {
    errors.optionsText = 'Podaj co najmniej jedną opcję — po jednej w linii';
  }
  if (draft.displayOrder.trim() !== '' && !Number.isInteger(Number(draft.displayOrder))) {
    errors.displayOrder = 'Kolejność musi być liczbą całkowitą';
  }
  return errors;
}

export const emptyDefDraft = (): DefDraft => ({
  name: '',
  dataType: 'TEXT',
  optionsText: '',
  displayOrder: '',
  required: false,
  displayInList: false,
});

export function draftFromDef(def: AttributeDefView): DefDraft {
  return {
    name: def.name,
    dataType: def.dataType,
    optionsText: def.options.join('\n'),
    displayOrder: String(def.displayOrder),
    required: def.required,
    displayInList: def.displayInList,
  };
}

/** Draft → payload API. Tryb edycji NIE wysyła itemType/dataType (niezmienne). */
export function draftToPayload(
  draft: DefDraft,
  mode: { create: true; itemType: ItemType } | { create: false },
): AttributeDefWritePayload {
  const base: AttributeDefWritePayload = {
    name: draft.name.trim(),
    required: draft.required,
    displayInList: draft.displayInList,
  };
  if (draft.displayOrder.trim() !== '') base.displayOrder = Number(draft.displayOrder);
  if (needsOptions(draft.dataType)) base.options = parseOptions(draft.optionsText);
  if (mode.create) {
    base.itemType = mode.itemType;
    base.dataType = draft.dataType;
  }
  return base;
}
