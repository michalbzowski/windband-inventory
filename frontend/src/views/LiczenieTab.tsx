import { useCallback, useEffect, useState } from 'react';
import { listBandMembers, type BandMember, type BandView } from '../api/bands';
import { getSummary, listStocktakes, type StocktakeSummaryView, type StocktakeView } from '../api/inventory';
import { loadIdentity, saveIdentity, type CounterIdentity } from '../stocktake/identity';
import { CountQueue } from '../stocktake/queue';
import Phone from '../ui/Phone';
import Counting from './Counting';
import StocktakeReport from './StocktakeReport';
import StocktakeStart from './StocktakeStart';

const queue = new CountQueue();

type Screen =
  | { view: 'hub' }
  | { view: 'count'; stocktakeId: number }
  | { view: 'start' }
  | { view: 'report'; stocktakeId: number };

interface Props {
  band: BandView;
  onBackToPulpit: () => void;
}

/**
 * Tab "LICZENIE" — screens 06/07/13 of the mockup: the hub resolves WHO IS
 * COUNTING once per band (B10), finds THE one active stocktake (single-open
 * guard on the backend), and routes to counting, the frozen report or the
 * admin-only start screen.
 */
export default function LiczenieTab({ band, onBackToPulpit }: Props) {
  const [identity, setIdentity] = useState<CounterIdentity | null>(() => loadIdentity(band.bandId));
  const [screen, setScreen] = useState<Screen>({ view: 'hub' });
  const [stocktakes, setStocktakes] = useState<StocktakeView[] | null>(null);
  const [activeSummary, setActiveSummary] = useState<StocktakeSummaryView | null>(null);
  const [members, setMembers] = useState<BandMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueRev, setQueueRev] = useState(0);

  const refresh = useCallback(() => {
    listStocktakes(band.bandId)
      .then((ls) => { setStocktakes(ls); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [band.bandId]);

  useEffect(() => { refresh(); }, [refresh, queueRev]);

  const active = stocktakes?.find((s) => s.status !== 'CLOSED') ?? null;
  const closed: StocktakeView[] = stocktakes?.filter((s) => s.status === 'CLOSED').slice(0, 4) ?? [];
  const pending = queue.count(active?.id ?? -1);

  useEffect(() => {
    if (active && active.status === 'IN_PROGRESS') {
      getSummary(active.id).then(setActiveSummary).catch(() => setActiveSummary(null));
    } else {
      setActiveSummary(null);
    }
  }, [active?.id, active?.status]);

  useEffect(() => {
    if (identity === null && members === null) {
      listBandMembers(band.bandId).then(setMembers).catch(() => setMembers([]));
    }
  }, [identity, members, band.bandId]);

  /* ---------- identity gate (B10): who is counting? ---------- */
  if (identity === null) {
    return (
      <Phone>
        <header className="appbar">
          <button type="button" className="back" onClick={onBackToPulpit} aria-label="Pulpit">←</button>
          <h3>Kim jesteś na czas spisu?</h3>
        </header>
        <section className="content">
          <p className="hint">WM nie mapuje członków na konta (B10) — wybierasz się z rosteru raz na tym urządzeniu. Serwer i tak sprawdza przy każdym zapisie, czy jesteś aktywnym członkiem zespołu.</p>
          {members === null && <p className="hint">Ładowanie rosteru…</p>}
          {members !== null && members.filter((m) => m.active).length === 0 && (
            <div className="state" role="status"><span className="state-ico" aria-hidden>∅</span><b>Brak aktywnych członków</b><span>Uzupełnij członków w windband-manager.</span></div>
          )}
          {members?.filter((m) => m.active).map((m) => (
            <button
              type="button"
              key={m.memberId}
              className="srow"
              onClick={() => {
                const id = { memberId: m.memberId, name: `${m.firstName} ${m.lastName}` };
                saveIdentity(band.bandId, id);
                setIdentity(id);
              }}
            >
              <b>{m.firstName} {m.lastName}</b>
              <span className="muted">{m.expectedSet[0]?.instrument ?? '—'}</span>
            </button>
          ))}
        </section>
        <Tabs active="liczenie" onLiczenie={() => undefined} />
      </Phone>
    );
  }

  /* ---------- sub-screens ---------- */
  if (screen.view === 'count') {
    return (
      <Counting
        band={band}
        identity={identity}
        stocktakeId={screen.stocktakeId}
        onExit={() => { setScreen({ view: 'hub' }); refresh(); setQueueRev((r) => r + 1); }}
      />
    );
  }
  if (screen.view === 'start') {
    return (
      <StocktakeStart
        band={band}
        onBack={() => setScreen({ view: 'hub' })}
        onStarted={(s) => { refresh(); setScreen({ view: 'count', stocktakeId: s.id }); }}
      />
    );
  }
  if (screen.view === 'report') {
    return (
      <StocktakeReport
        band={band}
        identity={identity}
        stocktakeId={screen.stocktakeId}
        onExit={() => { setScreen({ view: 'hub' }); refresh(); }}
      />
    );
  }

  /* ---------- hub (screen 13) ---------- */
  return (
    <Phone>
      <header className="appbar">
        <h3>Liczenie</h3>
        <span className={`badge ${active ? 'b-primary' : 'b-gray'}`}>spis #{active?.id ?? '—'}</span>
      </header>

      <section className="content">
        {error && <div className="banner warni" role="alert">⚠<div>{error}</div></div>}
        {!onlineBanner()}

        <div className="panel">
          <h4>Aktywny spis {active ? <span className="badge b-ok">{active.status === 'DRAFT' ? 'wstrzymany' : 'w toku'}</span> : <span className="badge b-gray">brak</span>}</h4>
          {active ? (
            <>
              <p className="hint">start: {new Date(active.startedAt).toLocaleString('pl-PL')} · notatki: {active.notes ?? '—'}</p>
              <div className="kv">
                <div><dt>Policzone</dt><dd>{activeSummary?.counted ?? active.countedLines} / {activeSummary?.total ?? active.totalLines}</dd></div>
                <div><dt>Rozbieżności na żywo</dt><dd className={pending ? 'warn' : ''}>{activeSummary?.divergences ?? '—'}</dd></div>
                <div><dt>Twoja kolejka offline</dt><dd className={pending > 0 ? 'warn' : 'ok'}>{pending > 0 ? `${pending} do wysłania` : '◇ wysłane'}</dd></div>
              </div>
              {active.status === 'IN_PROGRESS' && (
                <button type="button" className="btn primary block" style={{ minHeight: 52, fontSize: 16, marginTop: 8 }} onClick={() => setScreen({ view: 'count', stocktakeId: active.id })}>
                  ✓ Dołącz i licz
                </button>
              )}
              {active.status === 'DRAFT' && (
                <div className="role-note">Spis wstrzymany — wznowić może tylko administrator. Twoje decyzje w kolejce poczekają.</div>
              )}
              <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setScreen({ view: 'report', stocktakeId: active.id })}>
                Pokaż raport
              </button>
            </>
          ) : (
            <>
              {band.role === 'ADMIN' ? (
                <button type="button" className="btn ok block" style={{ minHeight: 52, fontSize: 16 }} onClick={() => setScreen({ view: 'start' })}>
                  ▶ Rozpocznij spis (snapshot na start)
                </button>
              ) : (
                <div className="role-note" style={{ textAlign: 'left' }}>Spis uruchamia tylko administrator (B8). Dostaniesz „Dołącz i licz”, gdy ruszy.</div>
              )}
            </>
          )}
          <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => undefined}>
            Pokaż policzone przeze mnie{active ? ` (${active.countedLines})` : ''}
          </button>
        </div>

        <h4>ostatnie zamknięte</h4>
        {closed.length === 0 && <p className="hint">jeszcze nic</p>}
        {closed.map((s) => (
          <button type="button" className="srow" key={s.id} onClick={() => setScreen({ view: 'report', stocktakeId: s.id })}>
            <b>#{s.id} — {s.notes ?? 'spis'}{s.id === active?.id ? ' · ⬤ w toku' : ''}</b>
            <span className="muted">{new Date(s.finishedAt ?? s.startedAt).toLocaleDateString('pl-PL')}</span>
          </button>
        ))}

        <div className="role-note">Kto może: start / pauza / wznowienie / zamknięcie — ADMIN; liczenie i raport — każdy członek (B8).</div>
        <p className="hint">liczysz jako: {identity.name} · Zmień — Moje</p>
      </section>

      <Tabs active="liczenie" onLiczenie={() => undefined} />
    </Phone>
  );

  function onlineBanner() {
    return navigator.onLine ? null : (
      <div className="banner off">📡<div>Brak połączenia<small>liczenie działa dalej, decyzje czekają w kolejce i wyślą się same.</small></div></div>
    );
  }
}

/** Shared bottom tab bar (kept here until the other modules grow). */
export function Tabs({ active, onLiczenie, onPulpit, onEkwipunek, onMoje }: {
  active: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje';
  onLiczenie?: () => void;
  onPulpit?: () => void;
  onEkwipunek?: () => void;
  onMoje?: () => void;
}) {
  return (
    <nav className="tabs" aria-label="Nawigacja główna">
      <button type="button" className={`t${active === 'pulpit' ? ' on' : ''}`} onClick={onPulpit}>▦<br />Pulpit</button>
      <button type="button" className={`t${active === 'ekwipunek' ? ' on' : ''}`} onClick={onEkwipunek}>♧<br />Ekwipunek</button>
      <button type="button" className={`t${active === 'liczenie' ? ' on' : ''}`} onClick={onLiczenie}>✓<br />Liczenie</button>
      <button type="button" className={`t${active === 'moje' ? ' on' : ''}`} onClick={onMoje}>☺<br />Moje</button>
    </nav>
  );
}
