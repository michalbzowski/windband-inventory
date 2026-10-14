import { describe, expect, it } from 'vitest';
import type { AttributeDefView } from '../api/inventory';
import { buildPayload, initialValues, joinMulti, splitMulti, toFields, validateFields, validateField } from './form';

const def = (over: Partial<AttributeDefView>): AttributeDefView => ({
  id: 1,
  bandId: 7,
  itemType: 'UNIFORM',
  name: 'Atrybut',
  dataType: 'TEXT',
  displayOrder: 1,
  required: false,
  displayInList: false,
  options: [],
  active: true,
  ...over,
});

describe('toFields — generator from defs (B6)', () => {
  it('drops inactive defs and orders by displayOrder', () => {
    const fields = toFields([
      def({ id: 3, name: 'Kupiono', displayOrder: 3 }),
      def({ id: 2, name: 'Rozmiar', displayOrder: 1 }),
      def({ id: 1, name: 'Nieaktywny', active: false }),
      def({ id: 4, name: 'Kolor', displayOrder: 2 }),
    ]);
    expect(fields.map((f) => f.name)).toEqual(['Rozmiar', 'Kolor', 'Kupiono']);
  });
});

describe('validateField — mirrors AttributeValueFormat.java', () => {
  it('required fires only when nothing was entered', () => {
    const f = { defId: 1, name: 'Rozmiar', dataType: 'SELECT' as const, required: true, options: ['S', 'M'] };
    expect(validateField(f, '  ')).toContain('wymagany');
    expect(validateField(f, 'M')).toBeNull();
  });

  it('NUMBER accepts ints/decimals/negatives, rejects text', () => {
    const f = { defId: 1, name: 'Ilość', dataType: 'NUMBER' as const, required: false, options: [] };
    expect(validateField(f, '12')).toBeNull();
    expect(validateField(f, '-3.5')).toBeNull();
    expect(validateField(f, '12,5')).toContain('nie jest liczbą');
  });

  it('DATE wants ISO RRRR-MM-DD', () => {
    const f = { defId: 1, name: 'Kupiono', dataType: 'DATE' as const, required: false, options: [] };
    expect(validateField(f, '2024-09-14')).toBeNull();
    expect(validateField(f, '14.09.2024')).toContain('RRRR-MM-DD');
  });

  it('SELECT is case-insensitive against options', () => {
    const f = { defId: 1, name: 'Rozmiar', dataType: 'SELECT' as const, required: false, options: ['S', 'M', 'L'] };
    expect(validateField(f, 'm')).toBeNull();
    expect(validateField(f, 'XL')).toContain('nie jest na liście');
  });

  it('BOOLEAN stores normalized true/false', () => {
    const f = { defId: 1, name: 'Etui', dataType: 'BOOLEAN' as const, required: false, options: [] };
    expect(validateField(f, 'true')).toBeNull();
    expect(validateField(f, 'tak')).toContain('TAK lub NIE');
  });

  it('MULTI validates every semicolon element', () => {
    const f = { defId: 1, name: 'Sekcja', dataType: 'MULTI' as const, required: false, options: ['Dęta', 'Perkusja'] };
    expect(validateField(f, 'Dęta;Perkusja')).toBeNull();
    expect(validateField(f, 'Dęta;Smyczki')).toContain('spoza listy');
  });
});

describe('MULTI join/split (storage = ";" normalized)', () => {
  it('round-trips through the server form', () => {
    expect(joinMulti(['Dęta', 'Perkusja'])).toBe('Dęta;Perkusja');
    expect(splitMulti('Dęta; Perkusja ;;')).toEqual(['Dęta', 'Perkusja']);
    expect(splitMulti(null)).toEqual([]);
  });
});

describe('buildPayload', () => {
  it('trims basics, drops blank values and blank optionals', () => {
    const fields = [
      { defId: 1, name: 'Kolor', dataType: 'TEXT' as const, required: false, options: [] },
      { defId: 2, name: 'Rozmiar', dataType: 'SELECT' as const, required: false, options: ['M'] },
    ];
    const p = buildPayload(
      { name: ' Marynarka ', type: 'UNIFORM', serialNumber: '  ' },
      fields,
      { 1: ' Zielony ', 2: '' },
    );
    expect(p).toEqual({
      name: 'Marynarka',
      type: 'UNIFORM',
      warehouse: undefined,
      serialNumber: null,
      description: null,
      notes: null,
      attributes: [{ attributeDefId: 1, value: 'Zielony' }],
    });
  });

  it('PUT payload carries no type (immutable per server DTO)', () => {
    const p = buildPayload({ name: 'X' }, [], {});
    expect('type' in p).toBe(false);
  });
});

describe('initialValues', () => {
  it('maps item attributes keyed by def for edit prefill', () => {
    expect(initialValues([{ attributeDefId: 5, value: 'true' }, { attributeDefId: 6, value: null }])).toEqual({ 5: 'true', 6: '' });
  });
});

describe('validateFields', () => {
  it('reports only offending fields, keyed by defId', () => {
    const fields = [
      { defId: 1, name: 'A', dataType: 'NUMBER' as const, required: false, options: [] },
      { defId: 2, name: 'B', dataType: 'TEXT' as const, required: true, options: [] },
    ];
    expect(validateFields(fields, { 1: 'x', 2: 'ok' })).toEqual({ 1: expect.stringContaining('nie jest liczbą') });
  });
});
