import { describe, expect, it } from 'vitest';
import type { AttributeDefView } from '../api/inventory';
import { buildPayload, initialValues, isDefVisible, joinMulti, splitMulti, toFields, validateFields, validateField, visibleFields } from './form';

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
  dependsOnDefId: null,
  dependsOnValues: [],
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

  it('master zawsze idzie nad zależnymi atrybutami, nawet gdy te mają mniejszy displayOrder (zgłoszony bug UX)', () => {
    // Typ (master) order=2, a „Rozmiar kołnierzyka” (slave, zależy od Typa) order=1
    const fields = toFields([
      def({ id: 703, name: 'Rozmiar kołnierzyka', displayOrder: 1, dependsOnDefId: 700, dependsOnValues: ['Koszula'] }),
      def({ id: 700, name: 'Typ', displayOrder: 2, options: ['Mundur', 'Koszula'], dataType: 'SELECT' }),
    ]);
    expect(fields.map((f) => f.name)).toEqual(['Typ', 'Rozmiar kołnierzyka']);
  });

  it('bloki zależności trzymają względną pozycję; dzieci idą po displayOrder', () => {
    const fields = toFields([
      def({ id: 1, name: 'A-master', displayOrder: 3 }),
      def({ id: 2, name: 'A-child-2', displayOrder: 9, dependsOnDefId: 1 }),
      def({ id: 3, name: 'B-master', displayOrder: 5 }),
      def({ id: 4, name: 'A-child-1', displayOrder: 8, dependsOnDefId: 1 }),
      def({ id: 5, name: 'B-child', displayOrder: 7, dependsOnDefId: 3 }),
    ]);
    // bloki według anchor (min order): A=[3,9,8] → 3, B=[5,7] → 5
    expect(fields.map((f) => f.name)).toEqual(['A-master', 'A-child-1', 'A-child-2', 'B-master', 'B-child']);
  });

  it('rodzic nieaktywny → dziecko staje się masterem własnego bloku (bez zawieszania)', () => {
    const fields = toFields([
      def({ id: 1, name: 'Dziecko', displayOrder: 1, dependsOnDefId: 9 }),
      def({ id: 9, name: 'Rodzic', active: false, displayOrder: 0 }),
    ]);
    expect(fields.map((f) => f.name)).toEqual(['Dziecko']);
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

describe('widoczność warunkowa (v2.0)', () => {
  const parent = def({ id: 1, name: 'Rodzaj', dataType: 'SELECT', options: ['Mundur', 'Czapka', 'Koszula'] });
  const child = def({ id: 2, name: 'Wzrost', dependsOnDefId: 1, dependsOnValues: ['Mundur', 'Koszula'] });
  const plain = def({ id: 3, name: 'Numer' });

  it('bez rodzica = zawsze widoczny; z rodzicem tylko przy wartości z listy', () => {
    const byId = new Map([parent, child, plain].map((d) => [d.id, d] as const));
    expect(isDefVisible(plain, byId, {})).toBe(true);
    expect(isDefVisible(child, byId, {})).toBe(false);
    expect(isDefVisible(child, byId, { 1: 'Koszula' })).toBe(true);
    expect(isDefVisible(child, byId, { 1: 'Czapka' })).toBe(false);
    // porównanie niewrażliwe na wielkość liter i spacje — jak serwer
    expect(isDefVisible(child, byId, { 1: ' koszula ' })).toBe(true);
  });

  it('nieaktywny rodzic chowa dziecko', () => {
    const offParent = { ...parent, active: false };
    const byId = new Map([offParent, child].map((d) => [d.id, d] as const));
    expect(isDefVisible(child, byId, { 1: 'Mundur' })).toBe(false);
  });

  it('visibleFields zwraca tylko widoczne, w kolejności displayOrder', () => {
    expect(visibleFields([parent, child, plain], {}).map((f) => f.name)).toEqual(['Rodzaj', 'Numer']);
    expect(visibleFields([parent, child, plain], { 1: 'Mundur' }).map((f) => f.name))
      .toEqual(['Rodzaj', 'Wzrost', 'Numer']);
  });
});
