/**
 * Counter identity (B10): WM deliberately exposes no member↔user mapping, so
 * the app asks the person counting WHO THEY ARE once per band and pins it to
 * the device (localStorage). The backend re-validates this id against the
 * live WM roster on every write — the picker only lists ACTIVE members.
 */

export interface CounterIdentity {
  memberId: number;
  name: string;
}

const key = (bandId: number): string => `wi.identity.${bandId}`;

export function loadIdentity(bandId: number): CounterIdentity | null {
  try {
    const raw = localStorage.getItem(key(bandId));
    return raw ? (JSON.parse(raw) as CounterIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(bandId: number, identity: CounterIdentity): void {
  try {
    localStorage.setItem(key(bandId), JSON.stringify(identity));
  } catch {
    /* private mode — identity lives in memory only; set below returns it anyway */
  }
}
