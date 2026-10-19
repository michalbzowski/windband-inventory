import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import type { BandView } from '../api/bands';
import { listBandMembers, type BandMember } from '../api/bands';
import { listItems, type ItemSummaryView } from '../api/inventory';
import {
  createServiceJob,
  listServiceJobs,
  setServiceJobStatus,
  type ServiceJobView,
  type ServiceStatus,
} from '../api/serviceJobs';
import Sheet from '../ui/Sheet';
import {
  NOTE_REQUIRED_ACTIONS,
  SERVICE_BADGE_CLASS,
  SERVICE_FILTER_LABEL,
  SERVICE_FILTERS,
  SERVICE_NEXT,
  SERVICE_STATUS_LABEL,
  canCancelService,
  filterServiceJobs,
  isOpenServiceJob,
  serviceCounts,
  type ServiceFilter,
} from '../servicejobs/model';

interface Props {
  band: BandView;
}

type SheetState =
  | { mode: 'create' }
  | { mode: 'walk'; job: ServiceJobView; target: Exclude<ServiceStatus, 'REQUESTED'> }
  | null;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Segment „Serwis” deski Zamówienia i serwis (B15 stage 3, roadmapa 2026-10-19):
 * naprawa ISTNIEJĄCEGO przedmiotu, siedmiostanowy flow z notkami dowodowymi.
 * Stany tożsamości (przydział, magazyny) prowadzi backend po każdym ruchu — UI
 * tylko pokazuje karty, liczniki i jedno przejście do przodu na kartę.
 * Odczyt: każdy członek; akcje — ADMIN (B8), 1:1 z guardem ServiceJobController.
 */
export default function ServicePanel({ band }: Props) {
  const isAdmin = band.role === 'ADMIN';
  const [jobs, setJobs] = useState<ServiceJobView[] | null>(null);
  const [filter, setFilter] = useState<ServiceFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(() => {
    listServiceJobs(band.bandId)
      .then(setJobs)
      .catch((e: unknown) => {
        setJobs([]);
        setError(e instanceof ApiError ? e.message : 'Nie udało się pobrać zgłoszeń serwisowych');
      });
  }, [band.bandId]);

  useEffect(() => reload(), [reload]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const upsert = (j: ServiceJobView) => setJobs((cur) => [j, ...(cur ?? []).filter((x) => x.id !== j.id)]);

  const walk = async (job: ServiceJobView, target: Exclude<ServiceStatus, 'REQUESTED'>, note?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      upsert(await setServiceJobStatus(job.id, target, note));
      flash(`Serwis „${job.itemName}”: ${SERVICE_STATUS_LABEL[target].toLowerCase()} ✓`);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Zmiana statusu nie powiodła się.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rows = filterServiceJobs(jobs ?? [], filter);
  const counts = serviceCounts(jobs ?? []);

  return (
    <div>
      <div className="chips" role="group" aria-label="Filtry statusów zgłoszeń serwisowych">
        {SERVICE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${filter === f ? ' sel' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {SERVICE_FILTER_LABEL[f]}{' '}
            <b aria-hidden>{f === 'ALL' ? counts.ALL : counts[f]}</b>
          </button>
        ))}
      </div>

      <div className="toolbar" role="group" aria-label="Akcje serwisu">
        {isAdmin && (
          <button type="button" className="btn sm" onClick={() => setSheet({ mode: 'create' })}>
            Zgłoś do serwisu
          </button>
        )}
      </div>

      {error && <p className="field-err" role="alert">{error}</p>}

      <p className="hint" aria-live="polite">
        {jobs === null ? 'Wczytywanie…' : `${rows.length} ${rows.length === 1 ? 'zgłoszenie' : 'zgłoszeń'} · ${SERVICE_FILTER_LABEL[filter]}`}
      </p>

      <ul className="list">
        {rows.map((j) => {
          const next = SERVICE_NEXT[j.status];
          return (
            <li key={j.id}>
              <div className="srow">
                <span className="sr">
                  {j.itemName}
                  {j.itemSerialNumber && <> · {j.itemSerialNumber}</>}{' '}
                  <span className={`badge ${SERVICE_BADGE_CLASS[j.status]}`}>{SERVICE_STATUS_LABEL[j.status]}</span>
                  <span className="sm">
                    zgłaszając(a) {j.reporterName ?? '—'} · {fmtDate(j.createdAt)}
                    {j.note && <> · „{j.note}”</>}
                    {j.resolutionNote && <> · notka: {j.resolutionNote}</>}
                  </span>
                </span>
                {isAdmin && (next || canCancelService(j.status)) && (
                  <span className="sa">
                    {next &&
                      (NOTE_REQUIRED_ACTIONS.has(next.to) ? (
                        <button type="button" className="btn sm ghost" onClick={() => setSheet({ mode: 'walk', job: j, target: next.to })}
                          disabled={busy}
                          aria-label={`${next.label}: ${j.itemName}`}>
                          {next.label}
                        </button>
                      ) : (
                        <button type="button" className="btn sm" onClick={() => void walk(j, next.to)} disabled={busy}
                          aria-label={`${next.label}: ${j.itemName}`}>
                          {next.label}
                        </button>
                      ))}{' '}
                    {canCancelService(j.status) && (
                      <button type="button" className="btn sm ghost" onClick={() => setSheet({ mode: 'walk', job: j, target: 'CANCELLED' })}
                        disabled={busy}
                        aria-label={`Anuluj serwis ${j.itemName}`}>
                        Anuluj
                      </button>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {toast && <p className="toast" role="status">{toast}</p>}

      {sheet?.mode === 'create' && (
        <CreateSheet band={band} openJobs={jobs ?? []} onClose={() => setSheet(null)}
          onCreated={(j) => { setSheet(null); upsert(j); flash(`Zgłoszono „${j.itemName}” do serwisu ✓`); }} />
      )}
      {sheet?.mode === 'walk' && (
        <WalkSheet job={sheet.job} target={sheet.target} busy={busy} onClose={() => setSheet(null)}
          onSubmit={async (note) => { if (await walk(sheet.job, sheet.target, note)) setSheet(null); }} />
      )}
    </div>
  );
}

/** Zgłoszenie: wybór pozycji, zgłaszającego (domyślnie z przydziału) i notki. */
function CreateSheet({ band, openJobs, onClose, onCreated }: {
  band: BandView;
  openJobs: ServiceJobView[];
  onClose: () => void;
  onCreated: (j: ServiceJobView) => void;
}) {
  const [items, setItems] = useState<ItemSummaryView[] | null>(null);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [reporterId, setReporterId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listItems(band.bandId).then(setItems).catch(() => setItems([]));
    listBandMembers(band.bandId)
      .then((ms) => setMembers(ms.filter((m) => m.active)))
      .catch(() => setMembers([]));
  }, [band.bandId]);

  const selected = useMemo(() => items?.find((i) => i.id === itemId) ?? null, [items, itemId]) ?? null;
  const busyItemIds = new Set(openJobs.filter(isOpenServiceJob).map((j) => j.itemId));

  const pickItem = (nextId: number | null) => {
    setItemId(nextId);
    const item = items?.find((i) => i.id === nextId);
    if (item?.assignedMemberId) setReporterId(item.assignedMemberId);
    else if (members.length === 1) setReporterId(members[0].memberId);
    else setReporterId('');
  };

  const submit = async () => {
    if (!itemId) return setError('Wybierz pozycję do serwisu.');
    setBusy(true);
    setError(null);
    try {
      onCreated(await createServiceJob(band.bandId, {
        itemId,
        reporterMemberId: reporterId === '' ? undefined : (reporterId as number),
        note: note.trim() || null,
      }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Zgłoszenie nie powiodło się.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Zgłoszenie do serwisu" onClose={onClose}>
      <label className="field">Pozycja
        <select value={itemId ?? ''} onChange={(e) => pickItem(e.target.value ? Number(e.target.value) : null)} disabled={items === null}>
          <option value="" disabled>{items === null ? 'Wczytywanie…' : '— wybierz pozycję —'}</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id} disabled={busyItemIds.has(i.id)}>
              {i.name}{i.serialNumber ? ` · ${i.serialNumber}` : ''}{busyItemIds.has(i.id) ? ' — otwarty serwis' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field">Zgłaszający (osoba, do której wróci instrument)
        <select value={String(reporterId)} onChange={(e) => setReporterId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— wybierz osobę —</option>
          {members.map((m) => (
            <option key={m.memberId} value={m.memberId}>{m.firstName} {m.lastName}</option>
          ))}
        </select>
      </label>

      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="np. pęknięta nuty / wyciek pasty, opis usterki" />
      </label>

      {selected && !selected.assignedMemberId && reporterId === '' && (
        <p className="hint">Pozycja nie ma przydziału — wybierz zgłaszającego.</p>
      )}
      {error && <p className="field-err" role="alert">{error}</p>}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>Anuluj</button>
        <button type="button" className="btn" disabled={busy || !itemId} onClick={() => void submit()}>
          {busy ? 'Zgłaszanie…' : 'Zgłoś ✓'}
        </button>
      </div>
    </Sheet>
  );
}

/** Przejście wymagające notki dowodowej (Przekazano / Anulowano). */
function WalkSheet({ job, target, busy, onClose, onSubmit }: {
  job: ServiceJobView;
  target: Exclude<ServiceStatus, 'REQUESTED'>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string | null) => void | Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  return (
    <Sheet title={`${SERVICE_STATUS_LABEL[target]}: ${job.itemName}`} onClose={onClose}>
      <label className="field">Notatka do dowodu (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder={target === 'CANCELLED' ? 'np. anulowano — sprzęt zastępczy' : `np. przekazano ${job.reporterName ?? 'osobie zgłaszającej'}, data`} />
      </label>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>Wstecz</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void onSubmit(note.trim() || null)}>
          {busy ? 'Zapisywanie…' : 'Potwierdź ✓'}
        </button>
      </div>
    </Sheet>
  );
}
