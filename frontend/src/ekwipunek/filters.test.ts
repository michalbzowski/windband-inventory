import { describe, expect, it } from 'vitest';
import { activeChipCount, emptyFilters, filterSummary, toQuery } from './filters';

describe('toQuery — GET /items params (server contract)', () => {
  it('drops all empty filters', () => {
    expect(toQuery(emptyFilters())).toEqual({
      type: undefined,
      status: undefined,
      warehouse: undefined,
      assignedMemberId: undefined,
      attributeDefId: undefined,
      attributeValue: undefined,
      search: undefined,
    });
  });

  it('passes the classic + attribute filters through', () => {
    const q = toQuery({
      ...emptyFilters(),
      type: 'UNIFORM',
      status: 'ASSIGNED',
      assignedMemberId: 4,
      attributeDefId: 12,
      attributeValue: 'M',
      search: ' tuba ',
    });
    expect(q).toMatchObject({ type: 'UNIFORM', status: 'ASSIGNED', assignedMemberId: 4, attributeDefId: 12, attributeValue: 'M', search: 'tuba' });
  });

  it('sends attributeValue only together with its definition (server 400s without)', () => {
    const q = toQuery({ ...emptyFilters(), attributeValue: 'M' });
    expect(q.attributeValue).toBeUndefined();
  });

  it('keeps a def-only filter = "has any value" (no attributeValue)', () => {
    const q = toQuery({ ...emptyFilters(), attributeDefId: 12 });
    expect(q.attributeDefId).toBe(12);
    expect(q.attributeValue).toBeUndefined();
  });

  it('F4: serviceDue serializes to "true" only when set', () => {
    expect(toQuery(emptyFilters()).serviceDue).toBeUndefined();
    expect(toQuery({ ...emptyFilters(), serviceDue: true }).serviceDue).toBe('true');
    expect(activeChipCount({ ...emptyFilters(), serviceDue: true })).toBe(1);
  });
});

describe('chip counters + header summary', () => {
  it('counts each active filter group once', () => {
    expect(activeChipCount(emptyFilters())).toBe(0);
    expect(
      activeChipCount({ ...emptyFilters(), type: 'INSTRUMENT', assignedMemberId: 3, attributeDefId: 9, search: 'x' }),
    ).toBe(3); // search is not a chip
  });

  it('renders Polish labels incl. the „Przypisane" chip form', () => {
    expect(filterSummary({ ...emptyFilters(), status: 'ASSIGNED' })).toBe('filtr: Status = Przypisane');
    expect(filterSummary(emptyFilters())).toBe('bez filtrów');
  });

  it('names person/attribute when resolvable, falls back to ids', () => {
    const s = filterSummary({ ...emptyFilters(), assignedMemberId: 4, attributeDefId: 12, attributeValue: 'Zielony' }, 'Jan Mazur', 'Kolor');
    expect(s).toBe('filtr: Osoba = Jan Mazur · Atrybut = Kolor → Zielony');
  });

  it('marks a value-less attribute filter as (ustawiony)', () => {
    expect(filterSummary({ ...emptyFilters(), attributeDefId: 12 }, undefined, 'Kolor')).toBe('filtr: Atrybut = Kolor (ustawiony)');
  });
});
