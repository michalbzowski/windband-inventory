import { describe, expect, it } from 'vitest';
import type { AttributeDefView } from '../api/inventory';
import {
  DATA_TYPES,
  draftFromDef,
  draftToPayload,
  emptyDefDraft,
  needsOptions,
  parseOptions,
  validateDefDraft,
} from './defsForm';

const DEF: AttributeDefView = {
  id: 7, bandId: 1, itemType: 'UNIFORM', name: 'Rozmiar', dataType: 'SELECT',
  displayOrder: 3, required: true, displayInList: false, options: ['S', 'M', 'L'], active: true,
};

describe('parseOptions', () => {
  it('trimuje, odrzuca puste i duplikaty, zachowuje kolejność', () => {
    expect(parseOptions(' granat \n\n czarny\ngranat\n')).toEqual(['granat', 'czarny']);
  });
});

describe('validateDefDraft', () => {
  it('wymaga nazwy', () => {
    expect(validateDefDraft({ ...emptyDefDraft(), name: '  ' })).toHaveProperty('name');
  });

  it('SELECT/MULTI wymaga co najmniej jednej opcji, TEXT nie', () => {
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'X', dataType: 'SELECT' })).toHaveProperty('optionsText');
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'X', dataType: 'TEXT' })).toEqual({});
    expect(needsOptions('MULTI')).toBe(true);
    expect(needsOptions('BOOLEAN')).toBe(false);
  });

  it('kolejność musi być liczbą całkowitą, pusta jest OK', () => {
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'X', displayOrder: '1.5' })).toHaveProperty('displayOrder');
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'X', displayOrder: '' })).toEqual({});
  });

  it('obsługuje wszystkie typy danych ze słownika', () => {
    for (const dt of DATA_TYPES) {
      expect(validateDefDraft({ ...emptyDefDraft(), name: 'X', dataType: dt, optionsText: 'a\nb' })).toEqual({});
    }
  });
});

describe('draftToPayload', () => {
  it('create wysyła itemType i dataType, edit ich NIE wysyła (nietykalne w v1)', () => {
    const draft = draftFromDef(DEF);
    const create = draftToPayload(draft, { create: true, itemType: 'UNIFORM' });
    expect(create.itemType).toBe('UNIFORM');
    expect(create.dataType).toBe('SELECT');
    const edit = draftToPayload(draft, { create: false });
    expect(edit.itemType).toBeUndefined();
    expect(edit.dataType).toBeUndefined();
    expect(edit.options).toEqual(['S', 'M', 'L']);
    expect(edit.displayOrder).toBe(3);
  });

  it('nie-SELECT nie wysyła opcji', () => {
    const p = draftToPayload({ ...emptyDefDraft(), name: 'Uwagi', dataType: 'TEXT', optionsText: 'a' }, { create: true, itemType: 'OTHER' });
    expect(p.options).toBeUndefined();
  });

  it('draftFromDef round-truje encję', () => {
    const draft = draftFromDef(DEF);
    expect(draft.name).toBe('Rozmiar');
    expect(draft.optionsText).toBe('S\nM\nL');
    expect(validateDefDraft(draft)).toEqual({});
  });
});
