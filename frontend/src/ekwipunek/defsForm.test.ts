import { describe, expect, it } from 'vitest';
import type { AttributeDefView } from '../api/inventory';
import {
  DATA_TYPES,
  draftFromDef,
  draftToPayload,
  emptyDefDraft,
  needsOptions,
  parentCandidates,
  parseOptions,
  validateDefDraft,
} from './defsForm';

const DEF: AttributeDefView = {
  id: 7, bandId: 1, itemType: 'UNIFORM', name: 'Rozmiar', dataType: 'SELECT',
  displayOrder: 3, required: true, displayInList: false, options: ['S', 'M', 'L'], active: true,
  dependsOnDefId: null, dependsOnValues: [],
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

  it('warunek wymaga co najmniej jednej wartości rodzica', () => {
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'Wzrost', dependsOnDefId: '3', dependsValues: [] }))
      .toHaveProperty('dependsValues');
    expect(validateDefDraft({ ...emptyDefDraft(), name: 'Wzrost', dependsOnDefId: '3', dependsValues: ['Mundur'] }))
      .toEqual({});
  });

  it('payload z zależnością wysyła parenta i wartości', () => {
    const p = draftToPayload(
      { ...emptyDefDraft(), name: 'Wzrost', dependsOnDefId: '3', dependsValues: ['M', 'L'] },
      { create: true, itemType: 'UNIFORM' },
    );
    expect(p.dependsOnDefId).toBe(3);
    expect(p.dependsOnValues).toEqual(['M', 'L']);
  });

  it('usunięcie istniejącej zależności przy edycji = sentinel 0', () => {
    const original = { ...DEF, dependsOnDefId: 3, dependsOnValues: ['S'] };
    const p = draftToPayload({ ...draftFromDef(original), dependsOnDefId: '', dependsValues: [] },
      { create: false, original });
    expect(p.dependsOnDefId).toBe(0);
    // bez uprzedniej zależności — pola nie wysyłamy wcale
    const p2 = draftToPayload(draftFromDef(DEF), { create: false, original: DEF });
    expect(p2.dependsOnDefId).toBeUndefined();
  });

  it('kandydaci na rodzica: aktywny SELECT bez własnego warunku, ten sam typ', () => {
    const parent: AttributeDefView = { ...DEF, id: 3, name: 'Rodzaj' };
    const conditional: AttributeDefView = { ...DEF, id: 4, name: 'Dziecko', dependsOnDefId: 3 };
    const cands = parentCandidates(
      [parent, conditional, { ...DEF, id: 5, dataType: 'TEXT' }, { ...DEF, id: 6, active: false },
        { ...DEF, id: 7, itemType: 'INSTRUMENT' }],
      'UNIFORM', DEF.id,
    );
    expect(cands.map((c) => c.id)).toEqual([3]);
  });
});
