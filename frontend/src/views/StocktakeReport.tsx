import { useCallback, useEffect, useState } from 'react';
import type { BandView } from '../api/bands';
import {
  closeStocktake,
  getLines,
  getStocktake,
  getSummary,
  type StocktakeLineView,
  type StocktakeSummaryView,
  type StocktakeView,
} from '../api/inventory';
import { CountQueue } from '../stocktake/queue';
import type { CounterIdentity } from '../stocktake/identity';
import { ApiError } from '../api/client';
import Phone from '../ui/Phone';

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

  const row = (l: StocktakeLineView) => (
    <div className="srow" key={l.id}>
      <b>
        {l.name}
        <span className="muted">{l.serialNumber ? ` · SN ${l.serialNumber}` : ''}{l.assignedMemberName ? ` · ${l.assignedMemberName}` : ''}</span>
        {l.note && <span className="note-q"> „{l.note}”</span>}
      </b>
      <span className="muted">{l.countedByMemberName ?? ''}</span>
    </div>
  );

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
            {mine.map(row)}
          </div>
        ) : (
          <>
            {uncounted.length > 0 && (
              <div className="panel">
                <h4>Niepoliczone przy zamknięciu <span className="badge b-warn">{uncounted.length}</span></h4>
                <p className="hint">Serwer oznaczy je MISSING dopiero przy zamknięciu — dopóki spis otwarty, liczymy dalej.</p>
              </div>
            )}
            <div className="panel"><h4>Brakuje <span className="badge b-danger">{missing.length}</span></h4>{missing.map(row)}{missing.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel"><h4>Uszkodzone <span className="badge b-warn">{broken.length}</span></h4>{broken.map(row)}{broken.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel"><h4>Nadwyżki <span className="badge b-primary">{extras.length}</span></h4>{extras.map(row)}{extras.length === 0 && <p className="hint">—</p>}</div>
            <div className="panel">
              <h4>
                <button type="button" className="linkbtn" onClick={() => setShowOk((v) => !v)}>{showOk ? '▾' : '▸'} Sprawne {okLines.length} / {snapshotLines.length}</button>
              </h4>
              {showOk && okLines.map(row)}
            </div>
          </>
        )}

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
    </Phone>
  );
}
