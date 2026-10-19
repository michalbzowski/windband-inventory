import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { BandView } from '../api/bands';
import { listBandMembers, type BandMember } from '../api/bands';
import {
  createNeed,
  listItems,
  listNeeds,
  setNeedStatus,
  type ItemSummaryView,
  type NeedStatus,
  type NeedView,
} from '../api/inventory';
import AppFrame from '../ui/AppFrame';
import Sheet from '../ui/Sheet';
import PurchasesPanel from './PurchasesPanel';
import ServicePanel from './ServicePanel';
import {
  NEED_BADGE_CLASS,
  NEED_FILTER_LABEL,
  NEED_FILTERS,
  NEED_STATUS_LABEL,
  canCancel,
  canOrder,
  canReceive,
  filterNeeds,
  needsCounts,
  type NeedFilter,
} from '../needs/model';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  onBack: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
  /** Dostarczone zamówienie → karta pozycji w Ekwipunku. */
  onOpenItem?: (itemId: number) => void;
}

type SheetState =
  | { mode: 'create' }
  | { mode: 'resolve'; need: NeedView; target: Exclude<NeedStatus, 'OPEN'> }
  | null;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Plansza „Zamówienia i serwis” (B15; dawniej „Potrzeby i zamówienia”, backlog v1.x #3). Trzy segmenty:
 * „Zamówienia” (zakup nowego przedmiotu), „Serwis” (naprawa istniejącego, B15 stage 3)
 * i „Potrzeby” (zapotrzebowanie ilościowe). Read: każdy członek
 * zespołu; akcje przeprowadzające flow — tylko ADMIN (B8), 1:1 z guardem.
 */
export default function NeedsBoard({ band, onBack, onTab, onOpenItem }: Props) {
  const isAdmin = band.role === 'ADMIN';
  const [seg, setSeg] = useState<'needs' | 'purchases' | 'serwis'>('needs');
  const [needs, setNeeds] = useState<NeedView[] | null>(null);
  const [filter, setFilter] = useState<NeedFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(() => {
    listNeeds(band.bandId)
      .then(setNeeds)
      .catch((e: unknown) => {
        setNeeds([]);
        setError(e instanceof ApiError ? e.message : 'Nie udało się pobrać potrzeb');
      });
  }, [band.bandId]);

  useEffect(() => reload(), [reload]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const upsert = (n: NeedView) => setNeeds((cur) => [n, ...(cur ?? []).filter((x) => x.id !== n.id)]);

  const walk = async (need: NeedView, target: Exclude<NeedStatus, 'OPEN'>, note?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      upsert(await setNeedStatus(need.id, target, note));
      flash(`Potrzeba „${need.name}”: ${NEED_STATUS_LABEL[target].toLowerCase()} ✓`);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Zmiana statusu nie powiodła się.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rows = filterNeeds(needs ?? [], filter);
  const counts = needsCounts(needs ?? []);

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć">‹</button>
        <h3>Zamówienia i serwis</h3>
        <span className={`badge ${isAdmin ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        <div className="chips" role="tablist" aria-label="Część deski">
          <button type="button" role="tab" aria-selected={seg === 'purchases'} className={`chip${seg === 'purchases' ? ' sel' : ''}`}
            onClick={() => setSeg('purchases')}>Zamówienia</button>
          <button type="button" role="tab" aria-selected={seg === 'serwis'} className={`chip${seg === 'serwis' ? ' sel' : ''}`}
            onClick={() => setSeg('serwis')}>Serwis</button>
          <button type="button" role="tab" aria-selected={seg === 'needs'} className={`chip${seg === 'needs' ? ' sel' : ''}`}
            onClick={() => setSeg('needs')}>Potrzeby</button>
        </div>

        {seg === 'purchases' ? (
          <PurchasesPanel band={band} onOpenItem={(id) => onOpenItem?.(id)} />
        ) : seg === 'serwis' ? (
          <ServicePanel band={band} />
        ) : (
          <>
        <div className="chips" role="group" aria-label="Filtry statusów potrzeb">
          {NEED_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${filter === f ? ' sel' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {NEED_FILTER_LABEL[f]}{' '}
              <b aria-hidden>{f === 'ALL' ? counts.ALL : counts[f]}</b>
            </button>
          ))}
        </div>

        {error && <p className="field-err" role="alert">{error}</p>}

        <p className="hint" aria-live="polite">
          {needs === null ? 'Wczytywanie…' : `${rows.length} ${rows.length === 1 ? 'potrzeba' : 'potrzeb'} · ${NEED_FILTER_LABEL[filter]}`}
        </p>

        <ul className="list">
          {rows.map((n) => (
            <li key={n.id}>
              <div className="srow">
                <span className="sr">
                  {n.name}
                  {n.serialNumber && <> · {n.serialNumber}</>}{' '}
                  <span className="badge b-gray">×{n.quantity}</span>{' '}
                  <span className={`badge ${NEED_BADGE_CLASS[n.status]}`}>{NEED_STATUS_LABEL[n.status]}</span>
                  <span className="sm">
                    zgłosił(a) {n.createdMemberName ?? '—'} · {fmtDate(n.createdAt)}
                    {n.note && <> · „{n.note}”</>}
                    {n.resolutionNote && <> · rozwinięcie: {n.resolutionNote}</>}
                  </span>
                </span>
                {isAdmin && (canOrder(n) || canReceive(n) || canCancel(n)) && (
                  <span className="sa">
                    {canOrder(n) && (
                      <button type="button" className="btn sm" onClick={() => void walk(n, 'ORDERED')} disabled={busy}
                        aria-label={`Zamów ${n.name}`}>Zamów</button>
                    )}{' '}
                    {canReceive(n) && (
                      <button type="button" className="btn sm ghost" onClick={() => setSheet({ mode: 'resolve', need: n, target: 'RECEIVED' })}
                        aria-label={`Dostarcz ${n.name}`}>Dostarcz</button>
                    )}{' '}
                    {canCancel(n) && (
                      <button type="button" className="btn sm ghost" onClick={() => setSheet({ mode: 'resolve', need: n, target: 'CANCELLED' })}
                        aria-label={`Anuluj potrzebę ${n.name}`}>Anuluj</button>
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
          {needs !== null && rows.length === 0 && (
            <li>
              <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
                {filter === 'ALL'
                  ? 'Brak otwartych potrzeb — zarezerwowane pozycje zgłasza się przy spisie, a ręcznie przyciskiem „＋”.'
                  : `Brak potrzeb w statusie „${NEED_STATUS_LABEL[filter as NeedStatus]}”.`}
              </p>
            </li>
          )}
        </ul>

        {isAdmin && (
          <button type="button" className="fab" onClick={() => setSheet({ mode: 'create' })} aria-label="Zgłoś potrzebę">＋</button>
        )}
        {toast && <div className="toast">{toast}</div>}
          </>
        )}
      </section>

      {sheet?.mode === 'resolve' && (
        <ResolveSheet
          need={sheet.need}
          target={sheet.target}
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={async (note) => {
            if (await walk(sheet.need, sheet.target, note)) setSheet(null);
          }}
        />
      )}
      {sheet?.mode === 'create' && (
        <CreateSheet band={band} onClose={() => setSheet(null)} onCreated={(n) => { setSheet(null); upsert(n); flash(`Zgłoszono potrzebę „${n.name}” ✓`); }} />
      )}

      <Tabs
        active="ekwipunek"
        onPulpit={() => onTab?.('pulpit')}
        onEkwipunek={onBack}
        onLiczenie={() => onTab?.('liczenie')}
        onMoje={() => onTab?.('moje')}
      />
    </AppFrame>
  );
}

/** Dostarcz/Anuluj z opcjonalną notką do dowodu (resolutionNote). */
function ResolveSheet({ need, target, busy, onClose, onSubmit }: {
  need: NeedView;
  target: Exclude<NeedStatus, 'OPEN'>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string | null) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Sheet title={`${NEED_STATUS_LABEL[target]}: ${need.name}`} onClose={onClose}>
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder={target === 'RECEIVED' ? 'np. dostarczone 12.11, nr faktury' : 'np. znaleziona na próbie'} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Wróć</button>
        <button type="button" className="btn primary block" disabled={busy} onClick={() => onSubmit(note.trim() || null)}>
          {busy ? 'Zapisywanie…' : `Potwierdź ✓`}
        </button>
      </div>
    </Sheet>
  );
}

/** Ręczne zgłoszenie przez ADMIN-a: pick pozycji z rejestru + ilość + kto zgłasza. */
function CreateSheet({ band, onClose, onCreated }: {
  band: BandView;
  onClose: () => void;
  onCreated: (n: NeedView) => void;
}) {
  const [items, setItems] = useState<ItemSummaryView[] | null>(null);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [itemId, setItemId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ item?: string; member?: string; api?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    listItems(band.bandId, {}, ac.signal)
      .then((l) => setItems([...l].sort((a, b) => a.name.localeCompare(b.name, 'pl'))))
      .catch(() => setItems([]));
    listBandMembers(band.bandId, ac.signal).then(setMembers).catch(() => setMembers([]));
    return () => ac.abort();
  }, [band.bandId]);

  const submit = async () => {
    const next: typeof errors = {};
    if (!itemId) next.item = 'Wybierz pozycję';
    if (!memberId) next.member = 'Wskaż, kto zgłasza';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      onCreated(await createNeed(band.bandId, {
        itemId: Number(itemId),
        quantity,
        note: note.trim() || null,
        createdMemberId: Number(memberId),
      }));
    } catch (e) {
      setErrors({ api: e instanceof ApiError ? e.message : 'Zgłoszenie nie powiodło się.' });
      setBusy(false);
    }
  };

  return (
    <Sheet title="Nowa potrzeba" onClose={onClose}>
      <p className="hint">Potrzeba dotyczy już posiadanej pozycji — traktuj ją jak <b>zgłoszenie serwisowe / uzupełnienie</b>.
        Jeśli przedmiot trzeba dopiero kupić dla konkretnej osoby, użyj segmentu „Zamówienia”.</p>
      <label className="field">Pozycja
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">— wybierz —</option>
          {(items ?? []).map((it) => (
            <option key={it.id} value={String(it.id)}>{it.name}{it.serialNumber ? ` (${it.serialNumber})` : ''}</option>
          ))}
        </select>
      </label>
      {errors.item && <p className="field-err">{errors.item}</p>}

      <label className="field">Ilość
        <input type="number" min={1} max={999} value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </label>

      <label className="field">Zgłasza (aktywny członek)
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">— wybierz —</option>
          {members.map((m) => (
            <option key={m.memberId} value={String(m.memberId)}>{m.firstName} {m.lastName}</option>
          ))}
        </select>
      </label>
      {errors.member && <p className="field-err">{errors.member}</p>}

      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="np. potrzebna na koncert 30.11" />
      </label>

      {errors.api && <p className="field-err" role="alert">{errors.api}</p>}
      <button type="button" className="btn primary block" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Zapisywanie…' : 'Zgłoś potrzebę ✓'}
      </button>
    </Sheet>
  );
}
