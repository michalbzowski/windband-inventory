import type { ServiceJobView, ServiceStatus } from '../api/serviceJobs';

export type { ServiceJobView, ServiceStatus };

/**
 * Pure presentation rules for the service board (B15 stage 3). The NEXT-step
 * map mirrors backend ServiceJobCommandService exactly — buttons only appear
 * where the server would accept them (no 409 lotteries in the UI).
 * Colors read as queue pressure: red = waiting for action, amber/warn = in
 * transit to the shop, info = repaired/ready, ok/handled = cycle closed.
 */
export const SERVICE_BADGE_CLASS: Record<ServiceStatus, string> = {
  REQUESTED: 'b-danger',
  SHIPPED: 'b-warn',
  REPAIRED: 'b-info',
  READY_FOR_PICKUP: 'b-info',
  IN_STOCK: 'b-warn',
  HANDLED_OVER: 'b-ok',
  CANCELLED: 'b-gray',
};

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  REQUESTED: 'Zgłoszone',
  SHIPPED: 'Wysłane do serwisu',
  REPAIRED: 'Naprawione',
  READY_FOR_PICKUP: 'Do odbioru z serwisu',
  IN_STOCK: 'W magazynie',
  HANDLED_OVER: 'Przekazano osobie zgłaszającej',
  CANCELLED: 'Anulowane',
};

/** Forward-only actions offered per status (ADMIN); 'CANCELLED' shown as secondary. */
export const SERVICE_NEXT: Record<ServiceStatus, { to: Exclude<ServiceStatus, 'REQUESTED'>; label: string } | null> = {
  REQUESTED: { to: 'SHIPPED', label: 'Wyślij do serwisu' },
  SHIPPED: { to: 'REPAIRED', label: 'Oznacz naprawę' },
  REPAIRED: { to: 'READY_FOR_PICKUP', label: 'Gotowe do odbioru' },
  READY_FOR_PICKUP: { to: 'IN_STOCK', label: 'Przyjęcie do magazynu' },
  IN_STOCK: { to: 'HANDLED_OVER', label: 'Przekaż zgłaszającemu' },
  HANDLED_OVER: null,
  CANCELLED: null,
};

/** Anulowanie jest możliwe tylko ze stanu zgłoszonego (przed wysyłką) — lustrzane do guardu. */
export const canCancelService = (status: ServiceStatus): boolean => status === 'REQUESTED';

/** True while the job still expects action — drives chip counts. */
export const isOpenServiceJob = (j: ServiceJobView): boolean => j.status !== 'HANDLED_OVER' && j.status !== 'CANCELLED';

/** Przesył do serwisu i przekazanie zgłaszającemu wymagają notki dowodowej (sheet). */
export const NOTE_REQUIRED_ACTIONS: ReadonlySet<ServiceStatus> = new Set<ServiceStatus>([
  'HANDLED_OVER',
  'CANCELLED',
]);

export type ServiceFilter = 'ALL' | ServiceStatus;

/** Filtry planszy serwisu: 'Wszystkie' + każdy status (B15 stage 3). */
export const SERVICE_FILTERS: readonly ServiceFilter[] = [
  'ALL',
  'REQUESTED',
  'SHIPPED',
  'REPAIRED',
  'READY_FOR_PICKUP',
  'IN_STOCK',
  'HANDLED_OVER',
  'CANCELLED',
];

export const SERVICE_FILTER_LABEL: Record<ServiceFilter, string> = {
  ALL: 'Wszystkie',
  ...SERVICE_STATUS_LABEL,
};

/** Nowe na górze — kolejność do sekcji 'Wszystkie' i liczników chipów. */
export const sortNewest = (jobs: ServiceJobView[]): ServiceJobView[] =>
  [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

export function filterServiceJobs(jobs: ServiceJobView[], filter: ServiceFilter): ServiceJobView[] {
  return sortNewest(filter === 'ALL' ? jobs : jobs.filter((j) => j.status === filter));
}

/** Licznik per chip: 'ALL' = otwarte (informacja czołowa planszy). */
export function serviceCounts(jobs: ServiceJobView[]): Record<ServiceFilter, number> {
  const by = (s: ServiceStatus) => jobs.filter((j) => j.status === s).length;
  return {
    ALL: jobs.filter(isOpenServiceJob).length,
    REQUESTED: by('REQUESTED'),
    SHIPPED: by('SHIPPED'),
    REPAIRED: by('REPAIRED'),
    READY_FOR_PICKUP: by('READY_FOR_PICKUP'),
    IN_STOCK: by('IN_STOCK'),
    HANDLED_OVER: by('HANDLED_OVER'),
    CANCELLED: by('CANCELLED'),
  };
}
