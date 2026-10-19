import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  addExtraLine,
  closeStocktake,
  countLine,
  getLines,
  getStocktake,
  listItems,
  pauseStocktake,
  resumeStocktake,
  type ItemSummaryView,
  type StocktakeLineView,
  type StocktakeView,
} from '../api/inventory';
import type { BandView } from '../api/bands';
import AppFrame from '../ui/AppFrame';
import { CountQueue, countKey, extraKey, type PendingDecision } from '../stocktake/queue';
import { createNeed, listNeeds, sendItemToService, type NeedView } from '../api/inventory';
import NeedSheet from '../needs/NeedSheet';
import { NEED_STATUS_LABEL, openNeedFor } from '../needs/model';
import { deriveProgress } from '../stocktake/progress';
import type { CounterIdentity } from '../stocktake/identity';

const queue = new CountQueue();

type Note = { msg: string; tone: 'info' | 'warn' | 'danger'; undoKey?: string };

interface Props {
  band: BandView;
  identity: CounterIdentity;
  stocktakeId: number;
  onExit: () => void;
}

/**
 * Screen 09–12 of the frozen mockup: one card per physical unit, three big
 * buttons (OK/BRAK/USZKODZONE), inline chips, optional notes, auto-next and a
 * localStorage queue that never loses a tap when the signal dies (B7/F5.3).
 * Decisions are written locally FIRST; the flush loop mirrors them to the
 * server in queue order — the last word before close wins on both sides.
 */
export default function Counting({ band, identity, stocktakeId, onExit }: Props) {
  const [stocktake, setStocktake] = useState<StocktakeView | null>(null);
  const [lines, setLines] = useState<StocktakeLineView[] | null>(null);
  const [pending, setPending] = useState<PendingDecision[]>([]);
  const [forcedLineId, setForcedLineId] = useState<number | null>(null);
  const [awaitingNote, setAwaitingNote] = useState<PendingDecision | null>(null);
  const [noteText, setNoteText] = useState('');
  const [toast, setToast] = useState<Note | null>(null);
  // v1.x #5: akcje na karcie w TRAKCIE spisu (B9 odblokowane — moduły #3/#4 żyją)
  const [needs, setNeeds] = useState<NeedView[]>([]);
  const [needSheet, setNeedSheet] = useState<{ itemId: number; name: string } | null>(null);
  const [needBusy, setNeedBusy] = useState(false);
  const [served, setServed] = useState<Set<number>>(new Set());
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [flushProblem, setFlushProblem] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [extraSearch, setExtraSearch] = useState('');
  const [items, setItems] = useState<ItemSummaryView[] | null>(null);
  const flushingRef = useRef(false);
  const toastTimer = useRef<number>();

  const refreshQueue = useCallback(() => setPending(queue.forStocktake(stocktakeId)), [stocktakeId]);

  const showToast = useCallback((note: Note) => {
    window.clearTimeout(toastTimer.current);
    setToast(note);
    toastTimer.current = window.setTimeout(() => setToast(null), note.undoKey ? 6000 : 3500);
  }, []);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [view, serverLines] = await Promise.all([getStocktake(stocktakeId), getLines(stocktakeId)]);
        if (!cancelled) {
          setStocktake(view);
          setLines(serverLines);
          refreshQueue();
        }
      } catch (e) {
        if (!cancelled) setFlushProblem(`Nie udało się pobrać spisu: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [stocktakeId, refreshQueue]);

  /* ---------- connectivity ---------- */
  useEffect(() => {
    const up = () => { setOnline(true); setFlushProblem(null); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const progress = useMemo(
    () => deriveProgress(lines ?? [], pending),
    [lines, pending],
  );

  /* ---------- flush ---------- */
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    const todo = queue.forStocktake(stocktakeId);
    if (todo.length === 0) return;
    flushingRef.current = true;
    try {
      for (const d of todo) {
        try {
          const view = d.kind === 'count'
            ? await countLine(stocktakeId, d.lineId as number, {
                foundState: d.foundState,
                note: d.note || null,
                countedMemberId: d.countedMemberId,
              })
            : await addExtraLine(stocktakeId, {
                itemId: d.itemId,
                note: d.note || null,
                countedMemberId: d.countedMemberId,
              });
          queue.remove(d.key);
          setPending(queue.forStocktake(stocktakeId));
          setLines((prev) => mergeLine(prev, view, d));
          setLastSyncedAt(Date.now());
          setFlushProblem(null);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            setFlushProblem('Spis został wstrzymany albo zamknięty — decyzje czekają w kolejce i nie wyślą się do wznowienia.');
            refreshQueue();
            return;
          }
          if (e instanceof ApiError && e.status === 404) {
            // Line/item vanished server-side — drop this one decision, keep the rest.
            queue.remove(d.key);
            setPending(queue.forStocktake(stocktakeId));
            showToast({ msg: `Pominięto „${d.name}” — nie ma jej już w spisie.`, tone: 'danger' });
            continue;
          }
          if (e instanceof ApiError) {
            setFlushProblem(`Serwer odrzucił wysyłkę: ${e.message}`);
            return;
          }
          setOnline(false); // network failure — offline mode, queue intact
          return;
        }
      }
    } finally {
      flushingRef.current = false;
      // A tap may have landed during the loop — try again if anything is left.
      if (queue.forStocktake(stocktakeId).length > 0 && navigator.onLine) void flush();
    }
  }, [stocktakeId, refreshQueue, showToast]);

  useEffect(() => {
    if (online && stocktake?.status === 'IN_PROGRESS') void flush();
  }, [online, pending.length, stocktake?.status, flush]);

  useEffect(() => {
    if (stocktake?.status !== 'IN_PROGRESS') return;
    listNeeds(band.bandId).then(setNeeds).catch(() => {});
  }, [band.bandId, stocktake?.status]);

  /* ---------- recording (local first) ---------- */
  const record = useCallback((line: StocktakeLineView, foundState: 'OK' | 'MISSING' | 'BROKEN', note = '') => {
    const d: PendingDecision = {
      key: countKey(line.id),
      stocktakeId,
      kind: 'count',
      lineId: line.id,
      itemId: line.itemId,
      name: line.name,
      foundState,
      note,
      countedMemberId: identity.memberId,
      countedMemberName: identity.name,
      queuedAt: new Date().toISOString(),
    };
    queue.put(d);
    setPending(queue.forStocktake(stocktakeId));
    setForcedLineId(null);
    if (foundState === 'OK') {
      window.setTimeout(() => {
        showToast({ msg: '✓ OK zapisane', tone: 'info', undoKey: d.key });
      }, 220); // slide-out finishes first
    } else {
      setAwaitingNote(d);
      setNoteText(note);
    }
  }, [stocktakeId, identity, showToast]);

  const finishNote = (save: boolean) => {
    if (!awaitingNote) return;
    if (save && noteText.trim()) {
      queue.put({ ...awaitingNote, note: noteText.trim() });
      setPending(queue.forStocktake(stocktakeId));
    }
    setAwaitingNote(null);
    showToast({
      msg: `${awaitingNote.foundState === 'MISSING' ? '✕ BRAK' : '⚠ USZKODZONE'} zapisane`,
      tone: 'warn',
      undoKey: awaitingNote.key,
    });
  };

  const undo = (key: string) => {
    const stillPending = queue.all().find((d) => d.key === key);
    if (stillPending) {
      queue.remove(key);
      setPending(queue.forStocktake(stocktakeId));
      showToast({ msg: 'Cofnięto decyzję — licz dalej', tone: 'info' });
      return;
    }
    // Already flushed: the honest undo is a recount (PUT overwrites — F5.3).
    const lineId = Number(key.slice(1));
    setForcedLineId(lineId);
    showToast({ msg: 'Wysłane na serwer — policz ponownie, nadpiszemy', tone: 'warn' });
  };

  const addExtra = (item: ItemSummaryView) => {
    if (queue.hasPendingExtraForItem(stocktakeId, item.id)) {
      showToast({ msg: 'Nadwyżka już czeka w kolejce', tone: 'warn' });
      return;
    }
    const d: PendingDecision = {
      key: extraKey(crypto.randomUUID()),
      stocktakeId,
      kind: 'extra',
      lineId: null,
      itemId: item.id,
      name: item.name,
      foundState: 'EXTRA',
      note: '',
      countedMemberId: identity.memberId,
      countedMemberName: identity.name,
      queuedAt: new Date().toISOString(),
    };
    queue.put(d);
    setPending(queue.forStocktake(stocktakeId));
    setShowExtras(false);
    showToast({ msg: `＋ Nadwyżka: ${item.name}`, tone: 'info', undoKey: d.key });
  };

  /* ---------- stocktake controls ---------- */
  const pause = async () => {
    try {
      setStocktake(await pauseStocktake(stocktakeId));
      showToast({ msg: 'Spis wstrzymany — liczycie dalej inni? Nie, zapisy czekają do wznowienia.', tone: 'warn' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        showToast({ msg: 'Spis może pauzować tylko administrator (B8)', tone: 'danger' });
      } else {
        showToast({ msg: `Pauza nie powiodła się: ${(e as Error).message}`, tone: 'danger' });
      }
    }
  };

  const resume = async () => {
    try {
      setStocktake(await resumeStocktake(stocktakeId));
      void flush();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) showToast({ msg: 'Wznowienie tylko dla administratora', tone: 'danger' });
      else showToast({ msg: (e as Error).message, tone: 'danger' });
    }
  };

  const tryClose = async () => {
    if (queue.count(stocktakeId) > 0) {
      showToast({ msg: 'Masz decyzje w kolejce — najpierw zsynchronizuj', tone: 'danger' });
      return;
    }
    try {
      setStocktake(await closeStocktake(stocktakeId));
    } catch (e) {
      showToast({ msg: `Zamknięcie nie powiodło się: ${(e as Error).message}`, tone: 'danger' });
    }
  };

  /* ---------- extras sheet data ---------- */
  useEffect(() => {
    if (!showExtras || items !== null) return;
    listItems(band.bandId)
      .then(setItems)
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExtras]);

  /* ---------- current card ---------- */
  if (!stocktake || lines === null) {
    return (
      <AppFrame>
        <header className="appbar"><h3>Spis #{stocktakeId}</h3></header>
        <section className="content" aria-busy="true"><p className="hint">{flushProblem ?? 'Ładowanie…'}</p></section>
      </AppFrame>
    );
  }

  if (stocktake.status === 'CLOSED') {
    return (
      <AppFrame>
        <header className="appbar"><h3>Spis #{stocktakeId}</h3><span className="badge b-gray">Zamknięty</span></header>
        <section className="content tinted">
          <div className="banner warni" role="alert">🔒<div>Spis zamknięty — dalsze liczenie zablokowane<small>{queue.count(stocktakeId) > 0 ? `${queue.count(stocktakeId)} decyzji NIE wyszło na serwer — sprawdź w „Konto”.` : 'Raport jest zamrożony.'}</small></div></div>
          <button type="button" className="btn primary block" onClick={onExit}>Wróć</button>
        </section>
      </AppFrame>
    );
  }

  const paused = stocktake.status === 'DRAFT';

  if (paused) {
    return (
      <AppFrame>
        <header className="appbar"><h3>Spis #{stocktakeId} · liczenie</h3><span className="badge b-warn">Wstrzymany</span></header>
        <section className="content tinted" style={{ alignItems: 'center', textAlign: 'center', gap: 14, justifyContent: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--warn-soft)', border: '1.5px solid var(--warn-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'var(--warn)' }}>⏸</div>
          <div>
            <b style={{ fontSize: 17 }}>Liczenie wstrzymane</b>
            <div className="hint" style={{ maxWidth: 260 }}>Postęp jest zapisany. Ten sam spis wznawia administrator — liczący widzi komunikat.</div>
          </div>
          <div className="panel" style={{ width: '100%' }}>
            <div className="kv">
              <div><dt>Policzone</dt><dd>{progress.counted} / {progress.total}</dd></div>
              <div><dt>Rozbieżności na żywo</dt><dd>{progress.divergences}</dd></div>
              <div><dt>Kolejka offline</dt><dd>{pending.length === 0 ? '◇ wysłane' : `⚠ ${pending.length} do wysłania`}</dd></div>
            </div>
          </div>
          {band.role === 'ADMIN' && (
            <button type="button" className="btn primary block" style={{ minHeight: 52, fontSize: 16 }} onClick={() => void resume()}>▶ Wznów liczenie</button>
          )}
          {band.role !== 'ADMIN' && <div className="role-note">Wznowienie spisu: tylko ADMIN (B8)</div>}
          <button type="button" className="btn ghost" onClick={onExit}>Wróć</button>
        </section>
      </AppFrame>
    );
  }

  const snapshot = lines.filter((l) => !l.extra);
  const pendingByLine = new Map(pending.filter((p) => p.kind === 'count').map((p) => [p.lineId as number, p]));
  const effectiveId = forcedLineId ?? progress.nextUncountedLineId;
  const toService = async (line: StocktakeLineView) => {
    try {
      await sendItemToService(line.itemId, { note: line.note ?? 'uszkodzone na spisie' });
      setServed((prev) => new Set(prev).add(line.itemId));
      showToast({ msg: 'Wysłano do serwisu 🔧✓', tone: 'info' });
    } catch (e) {
      showToast({ msg: e instanceof ApiError ? e.message : 'Nie udało się wysłać do serwisu.', tone: 'danger' });
    }
  };

  const submitNeed = async (quantity: number, note: string | null) => {
    if (!needSheet) return;
    setNeedBusy(true);
    try {
      const n = await createNeed(band.bandId, {
        itemId: needSheet.itemId,
        quantity,
        note,
        createdMemberId: identity.memberId,
      });
      setNeeds((prev) => [...prev, n]);
      setNeedSheet(null);
      showToast({ msg: 'Potrzeba zgłoszona ✓', tone: 'info' });
    } catch (e) {
      showToast({ msg: e instanceof ApiError ? e.message : 'Nie udało się zgłosić potrzeby.', tone: 'danger' });
    } finally {
      setNeedBusy(false);
    }
  };

  const divergent = snapshot.filter((l) => l.foundState === 'MISSING' || l.foundState === 'BROKEN');

  const current = effectiveId != null ? snapshot.find((l) => l.id === effectiveId) ?? null : null;

  // v1.x #5: notatka przy OSTATNIEJ pozycji nie może być połknięta przez widok „wszystkie policzone”
  const cardLine = current ?? (awaitingNote ? snapshot.find((l) => l.id === awaitingNote.lineId) ?? null : null);

  const countedIndex = cardLine ? snapshot.findIndex((l) => l.id === cardLine.id) + 1 : snapshot.length + 1;
  const cardPending = cardLine ? pendingByLine.get(cardLine.id) : undefined;
  const cardState = cardPending?.foundState ?? cardLine?.foundState ?? null;

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onExit} aria-label="Zakończ liczenie">‹</button>
        <h3>Spis #{stocktakeId} · liczenie</h3>
        {!online && <span className="badge b-gray">Offline</span>}
        <button type="button" className="ic" title="Pauza (ADMIN)" onClick={() => void pause()}>⏸</button>
      </header>

      <section className="content" style={{ position: 'relative', gap: 12 }}>
        {!online && (
          <div className="banner off">📡<div>Brak połączenia — liczenie trwa dalej<small>{pending.length} decyzja(czek) w kolejce (localStorage) i wyślą się same po powrocie sieci. Spis #{stocktakeId}, ten sam ID.</small></div></div>
        )}
        {flushProblem && <div className="banner warni" role="alert">⚠<div>{flushProblem}</div></div>}

        {cardLine ? (
          <>
            <div className="stepper" style={{ justifyContent: 'space-between' }}>
              <span>Pozycja <b>{countedIndex}</b> z <b>{snapshot.length}</b></span>
              <span className={`badge ${progress.divergences > 0 ? 'b-danger' : 'b-ok'}`}>⚠ rozbieżności: {progress.divergences}</span>
            </div>

            <div className={`count-card${cardState && cardState !== 'OK' ? ' flagged' : ''}${cardState ? ` st-${cardState.toLowerCase()}` : ''}`}>
              <span className="cc-ico" aria-hidden>{cardLine.assignedMemberName ? '🎺' : '📦'}</span>
              <b>{cardLine.name}</b>
              <div className="sn">{cardLine.serialNumber ?? 'SN nieuzupełniony'}</div>
              {cardLine.assignedMemberName && (
                <div className="who">👤 {cardLine.assignedMemberName} · przydział</div>
              )}
              {cardState && (
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800 }}>
                  Oznaczono: {STATE_LABEL[cardState]} <span className="badge b-gray">{cardLine.extra ? 'nadwyżka' : 'spis'}</span>
                </div>
              )}
            </div>

            {awaitingNote ? (
              <div className={`note-panel${awaitingNote.foundState === 'BROKEN' ? ' uszk' : ''}`}>
                <label>Notatka (opcjonalna) — {STATE_LABEL[awaitingNote.foundState]}</label>
                <textarea
                  autoFocus
                  value={noteText}
                  placeholder={awaitingNote.foundState === 'BROKEN' ? 'np. pęknięta czara, suwak zacieka…' : 'np. waga w progu sali…'}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="row">
                  <button type="button" className="btn ghost" onClick={() => finishNote(false)}>Pomiń</button>
                  <button type="button" className="btn primary" onClick={() => finishNote(true)}>Zapisz i dalej →</button>
                </div>
              </div>
            ) : (
              <div className="bigbtns">
                <button type="button" className="bb-ok" onClick={() => record(cardLine, 'OK')}>✓&nbsp; OK — jest i sprawny</button>
                <button type="button" className="bb-miss" onClick={() => record(cardLine, 'MISSING')}>✕&nbsp; BRAK</button>
                <button type="button" className="bb-broken" onClick={() => record(cardLine, 'BROKEN')}>⚠&nbsp; USZKODZONE</button>
              </div>
            )}

            <div className="chips otherchips">
              <button type="button" className="chip oth" onClick={() => setShowExtras(true)}>＋ Nadwyżka</button>
              <button type="button" className="chip oth" onClick={() => record(cardLine, 'BROKEN', 'zastany stan: W SERWISIE')}>🔧 W serwisie</button>
              <button type="button" className="chip oth" onClick={() => record(cardLine, 'BROKEN', 'zastany stan: WYCOFANY')}>📦 Wycofany</button>
            </div>

            {cardState && !awaitingNote && (
              <div className="hint">Policzone ponownie? Ostatnie słowo wygrywa (korekta do zamknięcia spisu).</div>
            )}

          </>
        ) : (
          <div className="state" role="status">
            <span className="state-ico" aria-hidden>✅</span>
            <b>Wszystkie pozycje policzone</b>
            <span>{progress.counted} z {progress.total} · rozbieżności: {progress.divergences}. {band.role === 'ADMIN' ? 'Możesz zamknąć spis i sporządzić raport.' : 'Raport zamyka administrator.'}</span>
          </div>
        )}
        {/* v1.x #5 / makieta 14: lista decyzji z odblokowanymi akcjami (B9) */}
        {stocktake?.status === 'IN_PROGRESS' && divergent.length > 0 && (
          <div className="panel">
            <h4>Rozbieżności — akcje <span className="badge b-warn">{divergent.length}</span></h4>
            {divergent.map((l) => (
              <div className="srow" key={l.id}>
                <span>{l.name}{l.serialNumber ? ` · ${l.serialNumber}` : ''}</span>
                <span className={`badge ${l.foundState === 'MISSING' ? 'b-danger' : 'b-warn'}`}>{STATE_LABEL[l.foundState ?? '']}</span>
                <span className="row-actions">
                  {l.foundState === 'MISSING' && (openNeedFor(needs, l.itemId) ? (
                    <span className="badge b-primary">📦 {NEED_STATUS_LABEL[openNeedFor(needs, l.itemId)!.status]}</span>
                  ) : (
                    <button type="button" className="btn sm ghost" disabled={!online} onClick={() => setNeedSheet({ itemId: l.itemId, name: l.name })}>
                      → Potrzeba
                    </button>
                  ))}
                  {l.foundState === 'BROKEN' && band.role === 'ADMIN' && (served.has(l.itemId) ? (
                    <span className="badge b-warn">🔧 wysłano</span>
                  ) : (
                    <button type="button" className="btn sm ghost" disabled={!online} onClick={() => void toService(l)}>
                      → Serwis 🔧
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {!online && <p className="hint">Akcje wymagają połączenia — decyzje i tak czekają w kolejce offline i trafią do raportu.</p>}
          </div>
        )}
      </section>

      <footer className="abar">
        <div className="prog">
          <div className="pp">
            {progress.counted}/{progress.total}{' '}
            <small>· {pending.length > 0
              ? <span style={{ color: 'var(--warn)', fontWeight: 800 }}>kolejka: {pending.length} do wysłania</span>
              : lastSyncedAt && Date.now() - lastSyncedAt < 60_000 ? 'zapisano przed chwilą' : 'wszystko zsynchronizowane'}</small>
          </div>
          <div className="meter">
            <i style={{ width: `${progress.total ? Math.round((progress.counted / progress.total) * 100) : 0}%`, background: pending.length ? 'var(--warn)' : undefined }} />
          </div>
        </div>
        <button type="button" className="btn sm" style={{ minWidth: 52 }} onClick={() => setShowQueue(true)} title="Kolejka offline">🗲 {pending.length}</button>
      </footer>

      {needSheet && (
        <NeedSheet itemName={needSheet.name} busy={needBusy} onClose={() => setNeedSheet(null)} onSubmit={submitNeed} />
      )}
      {toast && (
        <div className="toast" style={{ display: 'flex' }} role="status">
          <span>{toast.msg}</span>
          {toast.undoKey && <button type="button" onClick={() => undo(toast.undoKey as string)}>Cofnij ↩</button>}
        </div>
      )}

      {showExtras && (
        <div className="dim" onClick={() => setShowExtras(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <span className="grab" />
            <h4>Dopisz nadwyżkę — fizyczna sztuka spoza snapshotu</h4>
            <input className="search" placeholder="szukaj po nazwie…" value={extraSearch} onChange={(e) => setExtraSearch(e.target.value)} />
            <div className="sheetlist">
              {items === null && <p className="hint">Ładowanie ekwipunku…</p>}
              {items !== null && filteredExtras(items, lines, pending, extraSearch).slice(0, 30).map((it) => (
                <button type="button" className="srow" key={it.id} onClick={() => addExtra(it)}>
                  <b>{it.name}</b><span className="muted">{it.serialNumber ?? ''}</span>
                </button>
              ))}
              {items !== null && filteredExtras(items, lines, pending, extraSearch).length === 0 && (
                <p className="hint">Każda pozycja bandu jest już w spisie.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showQueue && (
        <div className="dim" onClick={() => setShowQueue(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <span className="grab" />
            <h4>Kolejka offline ({pending.length})</h4>
            {pending.length === 0 && <p className="hint">Pusta — wszystko wysłane ✓</p>}
            {pending.map((d) => (
              <div className="srow" key={d.key}>
                <span>{STATE_LABEL[d.foundState]} · {d.name}{d.note ? ` — „${d.note}”` : ''}</span>
                <span className="muted">{new Date(d.queuedAt).toLocaleTimeString('pl-PL')}</span>
              </div>
            ))}
            <button type="button" className="btn block" onClick={() => setShowQueue(false)}>Zamknij</button>
          </div>
        </div>
      )}

      {band.role === 'ADMIN' && !current && (
        <button type="button" className="btn ok block" style={{ margin: '0 14px 12px', minHeight: 52 }} onClick={() => void tryClose()}>
          Zamknij spis ✓{pending.length > 0 ? ` (kolejka: ${pending.length})` : ''}
        </button>
      )}
    </AppFrame>
  );
}

/* ---------- helpers ---------- */

const STATE_LABEL: Record<string, string> = {
  OK: '✓ OK',
  MISSING: '✕ BRAK',
  BROKEN: '⚠ USZKODZONE',
  EXTRA: '＋ NADWYSZKA',
};

function mergeLine(
  prev: StocktakeLineView[] | null,
  view: StocktakeLineView,
  d: PendingDecision,
): StocktakeLineView[] | null {
  if (!prev) return prev;
  const idx = prev.findIndex((l) => l.id === view.id);
  if (idx >= 0) {
    const copy = [...prev];
    copy[idx] = view;
    return copy;
  }
  return d.kind === 'extra' ? [...prev, view] : prev;
}

function filteredExtras(
  items: ItemSummaryView[],
  lines: StocktakeLineView[],
  pending: PendingDecision[],
  search: string,
): ItemSummaryView[] {
  const inStocktake = new Set<number>([
    ...lines.map((l) => l.itemId),
    ...pending.filter((p) => p.kind === 'extra').map((p) => p.itemId),
    ...pending.filter((p) => p.kind === 'count').map((p) => p.itemId),
  ]);
  const s = search.trim().toLowerCase();
  return items
    .filter((it) => !inStocktake.has(it.id))
    .filter((it) => !s || it.name.toLowerCase().includes(s) || (it.serialNumber ?? '').toLowerCase().includes(s));
}
