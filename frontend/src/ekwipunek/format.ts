/** Polish display formatters for the registry (ISO LocalDateTime from Spring). */

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('pl-PL') : '—';

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Attribute value → display text per data type (server-normalized storage). */
export function fmtAttrValue(dataType: string, value: string | null): string {
  if (value === null || value === '') return '—';
  if (dataType === 'BOOLEAN') return value === 'true' ? '✓ tak' : '✗ nie';
  if (dataType === 'MULTI') return value.split(';').map((v) => v.trim()).filter(Boolean).join(' · ');
  return value;
}
