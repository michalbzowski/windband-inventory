import { getJson } from '../api/client';

/** Frozen v1 contract (WM BandInventoryApiQueryService.BandView). */
export type BandRole = 'ADMIN' | 'MEMBER';

export interface BandView {
  bandId: number;
  name: string;
  role: BandRole;
}

/** GET /api/v1/me/bands — only the bands of the requesting user, each with
 * their WM role (resolved from the database, never from OIDC claims). */
export function listMyBands(signal?: AbortSignal): Promise<BandView[]> {
  return getJson<BandView[]>('/me/bands', signal);
}

/** Member row as returned by GET /api/v1/bands/{bandId}/members
 * (WM MemberView record — names are 1:1 with the Java records). */
export interface ExpectedEntry {
  instrument: string;
  primary: boolean;
}

export interface BandMember {
  memberId: number;
  firstName: string;
  lastName: string;
  active: boolean;
  /** expected set (assigned instruments), primary first, then band order/name */
  expectedSet: ExpectedEntry[];
}

/** The band roster — 403 (NotBandMemberException) for foreign users. */
export function listBandMembers(bandId: number, signal?: AbortSignal): Promise<BandMember[]> {
  return getJson<BandMember[]>(`/bands/${bandId}/members`, signal);
}
