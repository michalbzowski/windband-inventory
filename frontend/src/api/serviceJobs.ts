import { invGet, invSend } from './client';

/** Service workflow statuses — 1:1 with backend ServiceJobStatus (B15, roadmapa 2026-10-19). */
export type ServiceStatus =
  | 'REQUESTED'
  | 'SHIPPED'
  | 'REPAIRED'
  | 'READY_FOR_PICKUP'
  | 'IN_STOCK'
  | 'HANDLED_OVER'
  | 'CANCELLED';

/** REST projection 1:1 z ServiceJobQueryService.ServiceJobView. */
export interface ServiceJobView {
  id: number;
  bandId: number | null;
  itemId: number | null;
  itemName: string;
  itemSerialNumber: string | null;
  reporterMemberId: number | null;
  reporterName: string | null;
  status: ServiceStatus;
  note: string | null;
  resolutionNote: string | null;
  createdByMemberId: number | null;
  createdByName: string | null;
  createdAt: string;
  shippedAt: string | null;
  returnedAt: string | null;
  handedOverAt: string | null;
  cancelledAt: string | null;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

export const listServiceJobs = (bandId: number, status?: ServiceStatus, signal?: AbortSignal): Promise<ServiceJobView[]> =>
  invGet(`/service-jobs${qs({ bandId, status })}`, signal);

/** ADMIN zgłasza pozycję do serwisu; zgłaszający podany jawnie lub z przydziału (B2, guard w serwisie). */
export const createServiceJob = (bandId: number, req: { itemId: number; reporterMemberId?: number | null; note?: string | null }): Promise<ServiceJobView> =>
  invSend('POST', `/service-jobs?bandId=${bandId}`, req);

/** Przejście statusu (maszyna stanów po stronie serwera; POST analogicznie do needs/purchases). */
export const setServiceJobStatus = (id: number, status: Exclude<ServiceStatus, 'REQUESTED'>, note?: string | null): Promise<ServiceJobView> =>
  invSend('POST', `/service-jobs/${id}/status`, { status, note });
