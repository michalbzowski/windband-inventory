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

/** Active defs sorted by displayOrder → form fields. */
export function toFields(defs: AttributeDefView[]): FieldSpec[] {
  return defs
    .filter((d) => d.active)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((d) => ({ defId: d.id, name: d.name, dataType: d.dataType, required: d.required, options: d.options }));
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
 * POST/PUT payload: blanks are dropped (server maps blank → null → "value
 * removed"); required errors are prevented upstream by validateFields.
 */
export function buildPayload(basics: FormBasics, fields: FieldSpec[], values: Record<number, string>): ItemWritePayload {
  const attributes = fields
    .map((f) => ({ attributeDefId: f.defId, value: (values[f.defId] ?? '').trim() }))
    .filter((a) => a.value !== '')
    .map((a) => ({ attributeDefId: a.attributeDefId, value: a.value }));
  return {
    name: basics.name.trim(),
    ...(basics.type ? { type: basics.type } : {}),
    warehouse: basics.warehouse,
    serialNumber: basics.serialNumber?.trim() || null,
    description: basics.description?.trim() || null,
    notes: basics.notes?.trim() || null,
    attributes,
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
