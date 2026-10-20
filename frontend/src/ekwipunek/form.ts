import type { AttributeDefView, ItemWritePayload, ItemType } from '../api/inventory';

/**
 * The two-step item form engine (makieta screens 06/07): fields are GENERATED
 * from ItemAttributeDef per band+type (B6), validation mirrors the server
 * rules (AttributeValueFormat.java) so the user sees inline errors instead of
 * a 400 round-trip.
 */

export interface FieldSpec {
  defId: number;
  name: string;
  dataType: AttributeDefView['dataType'];
  required: boolean;
  options: string[];
}

/**
 * v2.0 reguły warunkowe — lustrzane odbicie ItemCommandService.isVisible:
 * atrybut widoczny, gdy bez rodzica ALBO wartość rodzica (SELECT) należy do
 * dependsOnValues. Rodzic nieaktywny/spoza zakresu = dziecko ukryte.
 */
export function isDefVisible(
  def: AttributeDefView,
  byId: Map<number, AttributeDefView>,
  values: Record<number, string>,
): boolean {
  if (def.dependsOnDefId == null) return true;
  const parent = byId.get(def.dependsOnDefId);
  if (!parent || !parent.active) return false;
  const value = (values[parent.id] ?? '').trim();
  if (!value) return false;
  return (def.dependsOnValues ?? []).some((o) => o.toLowerCase() === value.toLowerCase());
}

/**
 * Active defs sorted into form fields.
 * Order = grupy zależności blokami: MASTER (def bez rodzica) ZAWSZE PO NAD
 * swoimi CHILDREN — niezależnie od displayOrder (reguła UX od 2026-10-20:
 * „wszystko, co zależy od mastera, pojawia się pod spodem”). Kolejność
 * bloków = najmniejsze displayOrder w bloku; w bloku: master → dzieci po
 * displayOrder; tiebreak id dla pełnego determinizmu. (Poprzednio czyste
 * displayOrder pozwalało dziecku stać NAD rodzicem, gdy miało mniejszy
 * displayOrder — dokładnie zgłoszony bug.)
 */
export function toFields(defs: AttributeDefView[]): FieldSpec[] {
  const active = defs.filter((d) => d.active);
  const byId = new Map(active.map((d) => [d.id, d] as const));
  /** Root grupy: def sam lub bez aktywnego rodzica (guard przeciwdziałający cyklom). */
  const rootOf = (d: AttributeDefView): number => {
    let cur = d;
    const seen = new Set<number>();
    while (cur.dependsOnDefId != null && byId.has(cur.dependsOnDefId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.dependsOnDefId)!;
    }
    return cur.id;
  };
  const master = (d: AttributeDefView): boolean => d.dependsOnDefId == null || !byId.has(d.dependsOnDefId);

  // Anchor bloku = min displayOrder jego członków → bloki trzymają wcześniejszą
  // względną pozycję, a dzieci nigdy nie wychodzą przed mastera.
  const anchor = new Map<number, number>();
  for (const d of active) {
    const r = rootOf(d);
    anchor.set(r, Math.min(anchor.get(r) ?? d.displayOrder, d.displayOrder));
  }

  return active
    .map((d) => ({ d, root: rootOf(d), top: master(d) }))
    .sort(
      (a, b) =>
        (anchor.get(a.root) ?? 0) - (anchor.get(b.root) ?? 0) ||
        a.root - b.root ||
        Number(b.top) - Number(a.top) ||
        a.d.displayOrder - b.d.displayOrder ||
        a.d.id - b.d.id,
    )
    .map(({ d }) => ({
      defId: d.id,
      name: d.name,
      dataType: d.dataType,
      required: d.required,
      options: d.options,
    }));
}

/** Pola widoczne przy bieżących wartościach — ukryte nie są renderowane ani wysyłane. */
export function visibleFields(defs: AttributeDefView[], values: Record<number, string>): FieldSpec[] {
  const byId = new Map(defs.map((d) => [d.id, d] as const));
  return toFields(defs.filter((d) => isDefVisible(d, byId, values)));
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** null = OK; string = Polish error message (mirrors server wording). */
export function validateField(field: FieldSpec, raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) {
    return field.required ? `„${field.name}" jest wymagany` : null;
  }
  switch (field.dataType) {
    case 'NUMBER':
      return NUMBER_RE.test(value) ? null : `Atrybut "${field.name}": wartość "${value}" nie jest liczbą`;
    case 'DATE':
      return DATE_RE.test(value) ? null : `Atrybut "${field.name}": wartość "${value}" nie jest datą w formacie RRRR-MM-DD`;
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'Wybierz TAK lub NIE';
    case 'SELECT':
      return field.options.some((o) => o.toLowerCase() === value.toLowerCase())
        ? null
        : `Atrybut "${field.name}": wartość "${value}" nie jest na liście dozwolonych opcji`;
    case 'MULTI': {
      const parts = value.split(';').map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return field.required ? `„${field.name}" jest wymagany` : null;
      return parts.every((p) => field.options.some((o) => o.toLowerCase() === p.toLowerCase()))
        ? null
        : `Atrybut "${field.name}": wartość "${value}" zawiera opcję spoza listy`;
    }
    default:
      return null;
  }
}

/** All field errors keyed by defId (name checked separately by the view). */
export function validateFields(fields: FieldSpec[], values: Record<number, string>): Record<number, string> {
  const errors: Record<number, string> = {};
  for (const f of fields) {
    const err = validateField(f, values[f.defId]);
    if (err) errors[f.defId] = err;
  }
  return errors;
}

/** Normalized multi-select storage form: known options, ';' joined, insertion order. */
export function joinMulti(selected: string[]): string {
  return selected.join(';');
}

export function splitMulti(value: string | null | undefined): string[] {
  return (value ?? '').split(';').map((v) => v.trim()).filter(Boolean);
}

export interface FormBasics {
  name: string;
  type?: ItemType;
  warehouse?: ItemWritePayload['warehouse'];
  serialNumber?: string;
  description?: string;
  notes?: string;
}

/**
 * Atrybuty w porządku wire: po defId rosnąco, puste pomijane. JEDNO KANONICZNE
 * miejsce (buildPayload i modal zakupów) — kolejność WYŚWIETLANIA pól (reguła UX
 * 2026-10-20: master → dzieci) NIE wpływa na payload, porządek API jest stabilny.
 */
export function orderedAttributes(fields: FieldSpec[], values: Record<number, string>): { attributeDefId: number; value: string }[] {
  return fields
    .map((f) => ({ defId: f.defId, value: (values[f.defId] ?? '').trim() }))
    .filter((a) => a.value !== '')
    .sort((a, b) => a.defId - b.defId)
    .map((a) => ({ attributeDefId: a.defId, value: a.value }));
}

/**
 * POST/PUT payload: blanks are dropped (server maps blank → null → "value
 * removed"); required errors are prevented upstream by validateFields.
 */
export function buildPayload(basics: FormBasics, fields: FieldSpec[], values: Record<number, string>): ItemWritePayload {
  return {
    name: basics.name.trim(),
    ...(basics.type ? { type: basics.type } : {}),
    warehouse: basics.warehouse,
    serialNumber: basics.serialNumber?.trim() || null,
    description: basics.description?.trim() || null,
    notes: basics.notes?.trim() || null,
    attributes: orderedAttributes(fields, values),
  };
}

/** Prefill for edit mode: current values keyed by defId (BOOLEAN normalized). */
export function initialValues(
  attributes: { attributeDefId: number; value: string | null }[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const a of attributes) out[a.attributeDefId] = a.value ?? '';
  return out;
}
