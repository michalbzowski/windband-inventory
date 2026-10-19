import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { BandView } from '../api/bands';
import { listBandMembers, type BandMember } from '../api/bands';
import {
  createPurchase,
  listPurchases,
  setPurchaseStatus,
  type PurchaseStatus,
  type PurchaseView,
} from '../api/purchases';
import type { ItemType, AttributeDefView } from '../api/inventory';
import { listAttributeDefs } from '../api/inventory';
import Sheet from '../ui/Sheet';
import { TYPE_LABEL } from '../ekwipunek/filters';
import { visibleFields, validateFields } from '../ekwipunek/form';
import AttributeField from '../ekwipunek/AttributeField';
import {
  NOTE_REQUIRED_ACTIONS,
  PURCHASE_BADGE_CLASS,
  PURCHASE_FILTER_LABEL,
  PURCHASE_FILTERS,
  PURCHASE_NEXT,
  PURCHASE_STATUS_LABEL,
  canCancel,
  filterPurchases,
  purchaseCounts,
  type PurchaseFilter,
} from '../purchases/model';

interface Props {
  band: BandView;
  /** Otwórz dostarczoną pozycję w Ekwipunku (deep-link do szczegółów). */
  onOpenItem: (itemId: number) => void;
}

type SheetState =
  | { mode: 'create' }
  | { mode: 'walk'; purchase: PurchaseView; target: Exclude<PurchaseStatus, 'REQUESTED'> }
  | null;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Segment „Zamówienia” deski Zamówienia i serwis (roadmapa 2026-10-19):
 * zakup NOWEGO przedmiotu dla konkretnej osoby, sześciostanowy flow.
 * Dostawa materializuje pozycję w magazynie, odbiór ją przypisuje — UI
 * pokazuje ten związek linkiem do karty pozycji. Odczyt: każdy członek;
 * akcje: ADMIN (B8), 1:1 z guardem PurchaseController.
 */
export default function PurchasesPanel({ band, onOpenItem }: Props) {
  const isAdmin = band.role === 'ADMIN';
  const [purchases, setPurchases] = useState<PurchaseView[] | null>(null);
  const [filter, setFilter] = useState<PurchaseFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(() => {
    listPurchases(band.bandId)
      .then(setPurchases)
      .catch((e: unknown) => {
        setPurchases([]);
        setError(e instanceof ApiError ? e.message : 'Nie udało się pobrać zamówień');
      });
  }, [band.bandId]);

  useEffect(() => reload(), [reload]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const upsert = (p: PurchaseView) => setPurchases((cur) => [p, ...(cur ?? []).filter((x) => x.id !== p.id)]);

  const walk = async (purchase: PurchaseView, target: Exclude<PurchaseStatus, 'REQUESTED'>, note?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      upsert(await setPurchaseStatus(purchase.id, target, note));
      flash(`Zamówienie „${purchase.name}”: ${PURCHASE_STATUS_LABEL[target].toLowerCase()} ✓`);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Zmiana statusu nie powiodła się.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rows = filterPurchases(purchases ?? [], filter);
  const counts = purchaseCounts(purchases ?? []);

  return (
    <>
      <div className="chips" role="group" aria-label="Filtry statusów zamówień">
        {PURCHASE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${filter === f ? ' sel' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {PURCHASE_FILTER_LABEL[f]}{' '}
            <b aria-hidden>{f === 'ALL' || f === 'OPEN' ? counts[f] : (counts[f] ?? 0)}</b>
          </button>
        ))}
      </div>

      {error && <p className="field-err" role="alert">{error}</p>}

      <p className="hint" aria-live="polite">
        {purchases === null
          ? 'Wczytywanie…'
          : `${rows.length} ${rows.length === 1 ? 'zamówienie' : 'zamówień'} · ${PURCHASE_FILTER_LABEL[filter]}`}
      </p>

      <ul className="list">
        {rows.map((p) => {
          const next = PURCHASE_NEXT[p.status];
          return (
            <li key={p.id}>
              <div className="srow">
                <span className="sr">
                  {p.name}{' '}
                  <span className="badge b-gray">{TYPE_LABEL[p.itemType] ?? p.itemType}</span>{' '}
                  <span className={`badge ${PURCHASE_BADGE_CLASS[p.status]}`}>{PURCHASE_STATUS_LABEL[p.status]}</span>
                  <span className="sm">
                    dla {p.requestedForName} · zgłosił(a) {p.createdMemberName ?? '—'} · {fmtDate(p.createdAt)}
                    {p.attributes.length > 0 && <> · {p.attributes.map((a) => `${a.name} ${a.value}`).join(' · ')}</>}
                    {p.note && <> · „{p.note}”</>}
                    {p.resolutionNote && <> · {p.resolutionNote}</>}
                    {p.itemId !== null && (
                      <> ·{' '}
                        <button type="button" className="linkbtn" onClick={() => onOpenItem(p.itemId as number)}
                          aria-label={`Otwórz dostarczoną pozycję ${p.name}`}>
                          pozycja w magazynie{p.itemSerialNumber ? ` (${p.itemSerialNumber})` : ''}
                        </button>
                      </>
                    )}
                  </span>
                </span>
                {isAdmin && (next !== null || canCancel(p.status)) && (
                  <span className="sa">
                    {next && (
                      NOTE_REQUIRED_ACTIONS.has(next.to) ? (
                        <button type="button" className="btn sm primary" disabled={busy}
                          onClick={() => setSheet({ mode: 'walk', purchase: p, target: next.to })}
                          aria-label={`${next.label} — ${p.name}`}>{next.label}</button>
                      ) : (
                        <button type="button" className="btn sm primary" disabled={busy}
                          onClick={() => void walk(p, next.to)}
                          aria-label={`${next.label} — ${p.name}`}>{next.label}</button>
                      )
                    )}{' '}
                    {canCancel(p.status) && (
                      <button type="button" className="btn sm ghost" disabled={busy}
                        onClick={() => setSheet({ mode: 'walk', purchase: p, target: 'CANCELLED' })}
                        aria-label={`Anuluj zamówienie ${p.name}`}>Anuluj</button>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {purchases !== null && rows.length === 0 && (
          <li>
            <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              {filter === 'ALL'
                ? 'Brak zamówień — „＋” zamawia nowy przedmiot dla konkretnej osoby.'
                : `Brak zamówień w statusie „${PURCHASE_FILTER_LABEL[filter]}”.`}
            </p>
          </li>
        )}
      </ul>

      {isAdmin && (
        <button type="button" className="fab" onClick={() => setSheet({ mode: 'create' })} aria-label="Zamów nowy przedmiot">＋</button>
      )}
      {toast && <div className="toast">{toast}</div>}

      {sheet?.mode === 'walk' && (
        <WalkSheet
          purchase={sheet.purchase}
          target={sheet.target}
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={async (note) => {
            if (await walk(sheet.purchase, sheet.target, note)) setSheet(null);
          }}
        />
      )}
      {sheet?.mode === 'create' && (
        <CreatePurchaseSheet
          band={band}
          onClose={() => setSheet(null)}
          onCreated={(p) => {
            setSheet(null);
            upsert(p);
            flash(`Zamówienie „${p.name}” zgłoszone ✓`);
          }}
        />
      )}
    </>
  );
}

const WALK_TITLE: Record<string, string> = {
  DELIVERED: 'Dostawa',
  READY_FOR_PICKUP: 'Przygotowanie do odbioru',
  RECEIVED: 'Odbiór osobisty',
  CANCELLED: 'Anulowanie',
};

/** Notatkowe przejścia: dostawa/odbiór/anulowanie zostawiają ślad w resolutionNote. */
function WalkSheet({ purchase, target, busy, onClose, onSubmit }: {
  purchase: PurchaseView;
  target: Exclude<PurchaseStatus, 'REQUESTED'>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string | null) => void;
}) {
  const [note, setNote] = useState('');
  const next = PURCHASE_NEXT[purchase.status];
  const label = target === 'CANCELLED' ? 'Anuluj' : (next?.label ?? PURCHASE_STATUS_LABEL[target]);
  return (
    <Sheet title={`${WALK_TITLE[target] ?? PURCHASE_STATUS_LABEL[target]}: ${purchase.name}`} onClose={onClose}>
      {target === 'RECEIVED' && (
        <p className="hint">Odebranie przypisze pozycję osobie <b>{purchase.requestedForName}</b> — trafi do niej
          w Ekwipunku jako przydzielona.</p>
      )}
      {target === 'DELIVERED' && (
        <p className="hint">Dostawa stworzy pozycję „{purchase.name}” w magazynie głównym (dostępna, bez przydziału).</p>
      )}
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder={
            target === 'DELIVERED' ? 'np. kurier DHL, faktura 12/2026'
              : target === 'RECEIVED' ? 'np. wydano osobiście na próbie'
                : target === 'CANCELLED' ? 'np. wycofane u sprzedawcy'
                  : 'np. gotowe do wydania'
          } />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Wróć</button>
        <button type="button" className="btn primary block" disabled={busy} onClick={() => onSubmit(note.trim() || null)}>
          {busy ? 'Zapisywanie…' : `${label} ✓`}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Ręczne zamówienie nowego przedmiotu przez ADMIN-a dla aktywnego członka.
 * Atrybuty = ten sam model danych co formularz „Nowa pozycja” (v2.x): pola
 * generowane z definicji zespołu+typu, warunki rozkładają się na żywo
 * (np. UMundurowanie → Typ: Mundur|Koszula; szerokość ramion tylko u munduru),
 * ta sama walidacja i te same komunikaty — backend potwierdza tymi regułami.
 */
function CreatePurchaseSheet({ band, onClose, onCreated }: {
  band: BandView;
  onClose: () => void;
  onCreated: (p: PurchaseView) => void;
}) {
  const PURCHASEABLE_TYPES: ItemType[] = ['INSTRUMENT', 'UNIFORM', 'EQUIPMENT', 'SHEET_MUSIC', 'AWARD', 'CONSUMABLE', 'DOCUMENT'];
  const [members, setMembers] = useState<BandMember[]>([]);
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<ItemType>('INSTRUMENT');
  const [forWhom, setForWhom] = useState('');
  const [byWhom, setByWhom] = useState('');
  const [note, setNote] = useState('');
  const [defs, setDefs] = useState<AttributeDefView[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<{ name?: string; forWhom?: string; byWhom?: string; attr?: Record<number, string>; api?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    listBandMembers(band.bandId, ac.signal).then(setMembers).catch(() => setMembers([]));
    return () => ac.abort();
  }, [band.bandId]);

  // Definicje atrybutów zależą od typu — zmiana typu resetuje pola (jak w „Nowej pozycji”).
  useEffect(() => {
    const ac = new AbortController();
    listAttributeDefs(band.bandId, itemType, false, ac.signal)
      .then(setDefs)
      .catch(() => setDefs([]));
    return () => ac.abort();
  }, [band.bandId, itemType]);

  useEffect(() => {
    setValues({});
  }, [itemType]);

  const fields = visibleFields(defs, values);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Podaj nazwę przedmiotu';
    if (!forWhom) next.forWhom = 'Wskaż, dla kogo kupujemy';
    if (!byWhom) next.byWhom = 'Wskaż, kto zgłasza';
    const attrErrs = validateFields(fields, values);
    if (Object.keys(attrErrs).length > 0) next.attr = attrErrs;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const attributes = fields
        .map((f) => ({ attributeDefId: f.defId, value: (values[f.defId] ?? '').trim() }))
        .filter((a) => a.value !== '');
      onCreated(await createPurchase(band.bandId, {
        name: name.trim(),
        itemType,
        requestedForMemberId: Number(forWhom),
        note: note.trim() || null,
        createdMemberId: Number(byWhom),
        attributes,
      }));
    } catch (e) {
      setErrors({ api: e instanceof ApiError ? e.message : 'Zamówienie nie powiodło się.' });
      setBusy(false);
    }
  };

  return (
    <Sheet title="Zamów nowy przedmiot" onClose={onClose}>
      <p className="hint">Kupujesz coś, czego nie ma w rejestrze. Po oznaczeniu dostawy pozycja pojawi się
        w magazynie, a po odbiorze osobistym — jako przydział dla wskazanej osoby.</p>

      <label className="field">Nazwa przedmiotu
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200}
          placeholder="np. Trąbka Yamaha X-series" />
      </label>
      {errors.name && <p className="field-err">{errors.name}</p>}

      <label className="field">Typ
        <select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
          {PURCHASEABLE_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
      </label>

      {fields.length > 0 && (
        <fieldset className="attrset" style={{ border: 'none', padding: 0, margin: '0 0 4px' }}>
          <legend className="hint" style={{ padding: 0 }}>Atrybuty przedmiotu (taka sama forma jak przy dodawaniu pozycji)</legend>
          {fields.map((f) => (
            <AttributeField
              key={f.defId}
              field={f}
              value={values[f.defId] ?? ''}
              error={errors.attr?.[f.defId]}
              onChange={(v) => setValues((cur) => ({ ...cur, [f.defId]: v }))}
            />
          ))}
        </fieldset>
      )}

      <label className="field">Dla kogo (aktywny członek)
        <select value={forWhom} onChange={(e) => setForWhom(e.target.value)}>
          <option value="">— wybierz —</option>
          {members.map((m) => (
            <option key={m.memberId} value={String(m.memberId)}>{m.firstName} {m.lastName}</option>
          ))}
        </select>
      </label>
      {errors.forWhom && <p className="field-err">{errors.forWhom}</p>}

      <label className="field">Zgłasza (aktywny członek)
        <select value={byWhom} onChange={(e) => setByWhom(e.target.value)}>
          <option value="">— wybierz —</option>
          {members.map((m) => (
            <option key={m.memberId} value={String(m.memberId)}>{m.firstName} {m.lastName}</option>
          ))}
        </select>
      </label>
      {errors.byWhom && <p className="field-err">{errors.byWhom}</p>}

      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="np. oferta Musik-Direkt, cena 1 890 zł, termin 2 tyg." />
      </label>

      {errors.api && <p className="field-err" role="alert">{errors.api}</p>}
      <button type="button" className="btn primary block" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Zapisywanie…' : 'Zamów ✓'}
      </button>
    </Sheet>
  );
}
