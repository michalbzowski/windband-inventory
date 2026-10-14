import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { BandView } from '../api/bands';
import {
  closeStocktake,
  createNeed,
  getLines,
  getStocktake,
  getSummary,
  listNeeds,
  setNeedStatus,
  type NeedView,
  type StocktakeLineView,
  type StocktakeSummaryView,
  type StocktakeView,
} from '../api/inventory';
import { CountQueue } from '../stocktake/queue';
import type { CounterIdentity } from '../stocktake/identity';
import { ApiError } from '../api/client';
import Phone from '../ui/Phone';
import Sheet from '../ui/Sheet';
import {
  canCancel,
  canOrder,
  canReceive,
  NEED_BADGE_CLASS,
  NEED_STATUS_LABEL,
  openNeedCount,
  openNeedFor,
} from '../needs/model';

const queue = new CountQueue();

interface Props {
  band: BandView;
  identity: CounterIdentity;
  stocktakeId: number;
  onExit: () => void;
}

/**
 * Screens 14/15 — the stocktake report. Readable by every band member;
 * divergence rows carry snapshot-frozen names/serials/assignees (D1), notes
 * stay with the decision, and the close stamp freezes the whole view (F5.4).
 */
export default function StocktakeReport({ band, identity, stocktakeId, onExit }: Props) {
  const [stocktake, setStocktake] = useState<StocktakeView | null>(null);
  const [summary, setSummary] = useState<StocktakeSummaryView | null>(null);
  const [lines, setLines] = useState<StocktakeLineView[] | null>(null);
  const [showOk, setShowOk] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // F5 Potrzeby (backlog v1.x #3): BRAK → „→ Potrzeba” unfrozen (B9).
  const [needs, setNeeds] = useState<NeedView[]>([]);
  const [needSheet, setNeedSheet] = useState<StocktakeLineView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [needBusy, setNeedBusy] = useState(false);
  const isAdmin = band.role === 'ADMIN';
  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };
  const reloadNeeds = useCallback(() => {
    listNeeds(band.bandId).then(setNeeds).catch(() => setNeeds([]));
  }, [band.bandId]);
  const pending = queue.count(stocktakeId);

  const load = useCallback(() => {
    (async () => {
      try {
        const [s, sum, ls] = await Promise.all([getStocktake(stocktakeId), getSummary(stocktakeId), getLines(stocktakeId)]);
        setStocktake(s);
        setSummary(sum);
        setLines(ls);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [stocktakeId]);

  useEffect(load, [load]);
  useEffect(reloadNeeds, [reloadNeeds]);

  const close = async () => {
    setBusy(true);
    try {
      setStocktake(await closeStocktake(stocktakeId));
      setConfirmClose(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setConfirmClose(false);
    }
    setBusy(false);
  };

  if (!stocktake || !summary || lines === null) {
    return (
      <Phone>
        <header className="appbar"><h3>Raport spisu #{stocktakeId}</h3></header>
        <section className="content" aria-busy="true"><p className="hint">{error ?? 'Ładowanie…'}</p></section>
      </Phone>
    );
  }

  const snapshotLines = lines.filter((l) => !l.extra);
  const uncounted = snapshotLines.filter((l) => l.foundState === null);
  const missing = lines.filter((l) => l.foundState === 'MISSING');
  const broken = lines.filter((l) => l.foundState === 'BROKEN');
  const extras = lines.filter((l) => l.extra || l.foundState === 'EXTRA');
  const okLines = snapshotLines.filter((l) => l.foundState === 'OK');
  const mine = lines.filter((l) => l.countedByMemberId === identity.memberId);
  const closed = stocktake.status === 'CLOSED';

  const row = (l: StocktakeLineView, action?: ReactNode) => (
    <div className="srow" key={l.id}>
      <b>
        {l.name}
        <span className="muted">{l.serialNumber ? ` · SN ${l.serialNumber}` : ''}{l.assignedMemberName ? ` · ${l.assignedMemberName}` : ''}</span>
        {l.note && <span className="note-q"> „{l.note}”</span>}
      </b>
      <span className="muted">{l.countedByMemberName ?? ''}</span>
      {action}
    </div>
  );

  // B9 unfreeze: every MISSING row can raise a need; once unresolved-need
  // exists the CTA turns into a status chip (no duplicate OPEN server-side).
  const needAction = (l: StocktakeLineView) => {
    if (!isAdmin) return null;
    const existing = openNeedFor(needs, l.itemId);
    if (existing) {
      return <span className={`badge ${NEED_BADGE_CLASS[existing.status]}`}>{NEED_STATUS_LABEL[existing.status]}</span>;
    }
    return (
      <button type="button" className="btn sm ghost" onClick={() => setNeedSheet(l)}>
        → Potrzeba
      </button>
    );
  };

  const walkNeed = async (n: NeedView, status: 'ORDERED' | 'RECEIVED' | 'CANCELLED') => {
    try {
      await setNeedStatus(n.id, status);
      flash(status === 'ORDERED' ? 'Zamówiono ✓' : status === 'RECEIVED' ? 'Dostarczono ✓' : 'Anulowano ✓');
      reloadNeeds();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'Nie udało się zmienić statusu.');
    }
  };

  const submitNeed = async (quantity: number, note: string | null) => {
    if (!needSheet) return;
    setNeedBusy(true);
    try {
      await createNeed(band.bandId, {
        itemId: needSheet.itemId,
        quantity,
        note,
        createdMemberId: identity.memberId,
      });
      setNeedSheet(null);
      flash('Potrzeba zgłoszona ✓');
      reloadNeeds();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'Nie udało się zgłosić potrzeby.');
    } finally {
      setNeedBusy(false);
    }
  };

  return (
    <Phone>
      <header className="appbar">
        <button type="button" className="back" onClick={onExit} aria-label="Wróć">‹</button>
        <h3>Raport spisu #{stocktakeId}</h3>
        {closed && <span className="stamp-inline">ZAMKNIĘTO {new Date(stocktake.finishedAt ?? stocktake.startedAt).toLocaleString('pl-PL')}</span>}
      </header>

      <section className="content">
        {error && <div className="banner warni" role="alert">⚠<div>{error}</div></div>}

        <div className="panel">
          <div className="stat-grid">
            <div className="stat"><b>{summary.total}</b><span>pozycji</span></div>
            <div className="stat"><b className={summary.uncounted > 0 ? 'warn' : undefined}>{summary.uncounted}</b><span>niepoliczone</span></div>
            <div className="stat ok-c"><b>{summary.ok}</b><span>✓ OK</span></div>
            <div className="stat danger-c"><b>{missing.length + broken.length + extras.length}</b><span>⚠ rozbieżności</span></div>
          </div>
        </div>

        <div className="panel">
          <h4>Notatki końcowe {closed ? <span className="badge b-gray">spis zamknięty — raport zamrożony</span> : null}</h4>
          <p style={{ fontSize: 13.5 }}>{stocktake.notes ?? '— brak notatki spisu —'}</p>
        </div>

        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setMineOnly((v) => !v)}>
          {mineOnly ? 'Pokaż wszystkie sekcje' : `Pokaż policzone przeze mnie (${mine.length})`}
        </button>

        {mineOnly ? (
          <div className="panel">
            <h4>Moje decyzje — {identity.name}</h4>
            {mine.length === 0 && <p className="hint">Nic tu nie zapisałeś(-aś) w tym spisie.</p>}
            {mine.map((l) => row(l))}
          </div>
        ) : (
          <>
            {uncounted.length > 0 && (
              <div className="panel">
                <h4>Niepoliczone przy zamknięciu <span className="badge b-warn">{uncounted.length}</span></h4>
                <p className="hint">Serwer oznaczy je MISSING dopiero przy zamknięciu — dopóki spis otwarty, liczymy dalej.</p>
              </div>
            )}
            <div className="panel"><h4>Brakuje <span className="badge b-danger">{missing.length}</span></h4>{missing.map((l) => row(l, needAction(l)))}{missing.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel"><h4>Uszkodzone <span className="badge b-warn">{broken.length}</span></h4>{broken.map((l) => row(l))}{broken.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel"><h4>Nadwyżki <span className="badge b-primary">{extras.length}</span></h4>{extras.map((l) => row(l))}{extras.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel">
              <h4>
                <button type="button" className="linkbtn" onClick={() => setShowOk((v) => !v)}>{showOk ? '▾' : '▸'} Sprawne {okLines.length} / {snapshotLines.length}</button>
              </h4>
              {showOk && okLines.map((l) => row(l))}
            </div>
          </>
        )}

        <div className="panel">
          <h4>Potrzeby zespołu <span className="badge b-primary">{openNeedCount(needs)}</span></h4>
          <p className="hint">Zgłoszone z raportu spisu (akcja BRAK, B9) — ścieżka: Zgłoszona → Zamówiona → Dostarczona.</p>
          {needs.length === 0 && <p className="hint">Brak potrzeb — na razie cisza.</p>}
          {needs.map((n) => (
            <div className="srow" key={n.id}>
              <b>
                {n.name} ×{n.quantity}
                <span className="muted">{n.serialNumber ? ` · SN ${n.serialNumber}` : ''}{n.createdMemberName ? ` · 👤 ${n.createdMemberName}` : ''}</span>
                {n.note && <span className="note-q"> „{n.note}”</span>}
              </b>
              <span className={`badge ${NEED_BADGE_CLASS[n.status]}`}>{NEED_STATUS_LABEL[n.status]}</span>
              {isAdmin && (
                <span className="row-actions">
                  {canOrder(n) && <button type="button" className="btn sm ghost" onClick={() => void walkNeed(n, 'ORDERED')}>Zamów 📦</button>}
                  {canReceive(n) && <button type="button" className="btn sm ok" onClick={() => void walkNeed(n, 'RECEIVED')}>Dostarczono ✅</button>}
                  {canCancel(n) && <button type="button" className="btn sm ghost" onClick={() => void walkNeed(n, 'CANCELLED')}>Anuluj ✕</button>}
                </span>
              )}
            </div>
          ))}
        </div>

        {closed ? (
          <div className="stamp">
            ZAMKNIĘTO<br />
            <small>{new Date(stocktake.finishedAt ?? '').toLocaleString('pl-PL')} · raport zamrożony — nie do redagowania</small>
          </div>
        ) : band.role === 'ADMIN' ? (
          <>
            <button type="button" className="btn ok block" style={{ minHeight: 52 }} onClick={() => setConfirmClose(true)}>
              Zamknij spis ✓
            </button>
            {pending > 0 && (
              <div className="banner warni" role="alert">⚠<div>Masz {pending} decyzji w kolejce offline — zamknięcie będzie zablokowane do synchronizacji<small>Zamknięty raport nie przyjmuje już zapisów (F5.3: ostatnie słowo PRZED close).</small></div></div>
            )}
          </>
        ) : (
          <div className="role-note">Raport gotowy do zamknięcia. Zamknięcia dokonuje ADMIN (B8) — Ty możesz dalej liczyć i poprawiać.</div>
        )}
      </section>

      {confirmClose && (
        <div className="dim" role="dialog" aria-modal="true">
          <div className="modal">
            <b>Zamknąć raport?</b>
            <span>Po zamknięciu: status CLOSED, brak zapisów i korekt — do wydruku PDF i eksportu CSV.</span>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setConfirmClose(false)}>Anuluj</button>
              <button type="button" className="btn ok" disabled={busy} onClick={() => void close()}>{busy ? 'Zamykanie…' : 'Zamknij ✓'}</button>
            </div>
          </div>
        </div>
      )}
      {needSheet && (
        <NeedSheet line={needSheet} busy={needBusy} onClose={() => setNeedSheet(null)} onSubmit={submitNeed} />
      )}
      {toast && (
        <div className="toast" role="status">{toast}<button type="button" onClick={() => setToast(null)}>✕</button></div>
      )}
    </Phone>
  );
}

/** Bottom sheet for the unfrozen BRAK action (makieta 14: „→ Potrzeba”). */
function NeedSheet({ line, busy, onClose, onSubmit }: {
  line: StocktakeLineView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (quantity: number, note: string | null) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Potrzeba: ${line.name}`} onClose={onClose}>
      <p className="hint">Zgłoszenie trafia do „Potrzeby zespołu” — dalej zamówienie i dostawa (v1.x #3).</p>
      <label className="field">Ilość
        <input type="number" min={1} max={999} value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </label>
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="np. brak na spisie, szukać przed koncertem" />
      </label>
      <button type="button" className="btn primary block" disabled={busy} onClick={() => onSubmit(quantity, note.trim() || null)}>
        {busy ? 'Zapisywanie…' : 'Zgłoś potrzebę ✓'}
      </button>
    </Sheet>
  );
}
