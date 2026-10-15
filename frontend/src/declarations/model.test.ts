import { describe, expect, it } from 'vitest';
import {
  activeDeclarationFor,
  canRevokeDeclaration,
  DECLARATION_STATUS_LABEL,
  DECLARATION_TYPE_LABEL,
  emptyDeclarationForm,
  isDeclarableItem,
  validateDeclarationForm,
} from './model';
import type { DeclarationView } from '../api/inventory';

const view = (over: Partial<DeclarationView>): DeclarationView => ({
  id: 1,
  bandId: 7,
  itemId: 3,
  name: 'Tuba',
  serialNumber: null,
  type: 'PRIVATE',
  status: 'ACTIVE',
  holderMemberId: 12,
  holderName: 'Anna Nowak',
  locationText: null,
  note: null,
  declaredByMemberId: 11,
  declaredByName: 'Jan Kowalski',
  createdAt: '2026-10-14T20:00:00',
  revokedAt: null,
  revokedBy: null,
  revokedNote: null,
  ...over,
});

describe('deklaracje posiadania — czysty model (B14)', () => {
  it('napisy PL dla statusów i typów', () => {
    expect(DECLARATION_STATUS_LABEL.ACTIVE).toBe('aktywna');
    expect(DECLARATION_STATUS_LABEL.REVOKED).toBe('odwołana');
    expect(DECLARATION_TYPE_LABEL.PRIVATE).toBe('prywatnie');
    expect(DECLARATION_TYPE_LABEL.EXTERNAL).toBe('zewnętrzne');
  });

  it('odwołać może tylko ADMIN i tylko aktywne', () => {
    const active = view({});
    const revoked = view({ id: 2, status: 'REVOKED' });
    expect(canRevokeDeclaration('ADMIN', active)).toBe(true);
    expect(canRevokeDeclaration('MEMBER', active)).toBe(false);
    expect(canRevokeDeclaration('ADMIN', revoked)).toBe(false);
  });

  it('pozdycja ASSIGNED odpada z deklarowania', () => {
    expect(isDeclarableItem('AVAILABLE')).toBe(true);
    expect(isDeclarableItem('IN_SERVICE')).toBe(true);
    expect(isDeclarableItem('LOST')).toBe(true);
    expect(isDeclarableItem('ASSIGNED')).toBe(false);
  });

  it('walidacja lustrzana z backendem', () => {
    const base = { ...emptyDeclarationForm(), declaredByMemberId: 11 };
    expect(validateDeclarationForm({ ...base, holderMemberId: 12 })).toBeNull();
    expect(validateDeclarationForm(base)).toMatch(/osob|osobę/);
    expect(validateDeclarationForm({ ...base, declaredByMemberId: null })).toMatch(/kto składa/);
    expect(validateDeclarationForm({ ...base, type: 'EXTERNAL', holderMemberId: null })).toMatch(/miejsca/);
    expect(
      validateDeclarationForm({
        ...base,
        type: 'EXTERNAL',
        holderMemberId: null,
        locationText: 'x'.repeat(201),
      }),
    ).toMatch(/za długi/);
  });

  it('aktywna deklaracja pozycji — pierwsza ACTIVE dla itemId', () => {
    const rows = [
      view({ id: 1, itemId: 3, status: 'REVOKED' }),
      view({ id: 2, itemId: 3, status: 'ACTIVE' }),
      view({ id: 3, itemId: 4, status: 'ACTIVE' }),
    ];
    expect(activeDeclarationFor(rows, 3)?.id).toBe(2);
    expect(activeDeclarationFor(rows, 9)).toBeUndefined();
  });
});
