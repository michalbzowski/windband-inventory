import type { DeclarationStatus, DeclarationType, DeclarationView } from '../api/inventory';

/** Etykiety PL statusów/typów deklaracji (B14) — lustrzane do backendu. */
export const DECLARATION_STATUS_LABEL: Record<DeclarationStatus, string> = {
  ACTIVE: 'aktywna',
  REVOKED: 'odwołana',
};

export const DECLARATION_TYPE_LABEL: Record<DeclarationType, string> = {
  PRIVATE: 'prywatnie',
  EXTERNAL: 'zewnętrzne',
};

export const canRevokeDeclaration = (role: 'ADMIN' | 'MEMBER', d: DeclarationView): boolean =>
  role === 'ADMIN' && d.status === 'ACTIVE';

/** Pozycja przypisana formalnie NIE podlega deklaracji (B14; serwer odda 409). */
export const isDeclarableItem = (lifecycleStatus: string): boolean => lifecycleStatus !== 'ASSIGNED';

export interface DeclarationFormState {
  type: DeclarationType;
  holderMemberId: number | null;
  locationText: string;
  note: string;
  declaredByMemberId: number | null;
}

export const emptyDeclarationForm = (): DeclarationFormState => ({
  type: 'PRIVATE',
  holderMemberId: null,
  locationText: '',
  note: '',
  declaredByMemberId: null,
});

/** Walidacja 1:1 z DeclarationCommandService/OwnershipDeclaration.declare —
 * UI nie oferuje ruchu, który serwer skasuje. */
export function validateDeclarationForm(f: DeclarationFormState): string | null {
  if (f.declaredByMemberId == null) return 'wybierz, kto składa deklarację';
  if (f.type === 'PRIVATE' && f.holderMemberId == null) return 'wybierz osobę, u której jest pozycja';
  if (f.type === 'EXTERNAL' && f.locationText.trim() === '') return 'podaj opis miejsca';
  if (f.locationText.length > 200) return 'opis miejsca za długi (max 200 znaków)';
  if (f.note.length > 2000) return 'notatka za długa (max 2000 znaków)';
  return null;
}

export const activeDeclarationFor = (declarations: DeclarationView[], itemId: number): DeclarationView | undefined =>
  declarations.find((d) => d.itemId === itemId && d.status === 'ACTIVE');
