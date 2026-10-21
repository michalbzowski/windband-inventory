import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as oidc from './auth/oidc';
import { listBandMembers, listMyBands, type BandView } from './api/bands';
import { ApiError } from './api/client';
import BandSelection from './views/BandSelection';
import BandWorkspace from './views/BandWorkspace';
import { clearSelectedBand, restoreSelectedBand, saveSelectedBand } from './session/restore';

type Phase =
  | { kind: 'boot' }
  | { kind: 'auth-error'; message: string }
  | { kind: 'bands-loading' }
  | { kind: 'picker'; bands: BandView[] }
  | { kind: 'bands-error'; message: string; status?: number }
  | { kind: 'dashboard'; band: BandView };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const memberCounts = useRef(new Map<number, number>());

  /** Pobiera zespoły i kieruje: 1 zespół → od razu jego pulpit (reguła
   * deep-link, w1-analiza §„Wejście”); ≥2 → wcześniej wybrany zespół, jeśli
   * wciąż jest na liście (F5 na jakiejkolwiek zakładce nie może cofać do
   * pickera), w przeciwnym razie ekran wyboru. */
  const loadBands = useCallback(async () => {
    memberCounts.current = new Map();
    setPhase({ kind: 'bands-loading' });
    try {
      const bands = await listMyBands();
      if (bands.length === 1) {
        saveSelectedBand(sessionStorage, bands[0]);
        setPhase({ kind: 'dashboard', band: bands[0] });
        return;
      }
      const restored = restoreSelectedBand(bands, sessionStorage);
      if (restored) {
        setPhase({ kind: 'dashboard', band: restored });
        return;
      }
      clearSelectedBand(sessionStorage); // klucz sprzed usunięcia zespołu/odebrania roli
      setPhase({ kind: 'picker', bands });

      // Lazy member counts (best effort — the picker must render without them).
      for (const b of bands) {
        listBandMembers(b.bandId)
          .then((members) => memberCounts.current.set(b.bandId, members.length))
          .catch(() => {
            /* 403/5xx on the roster is recorded, the count stays hidden */
          });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setPhase({
          kind: 'bands-error',
          status: 403,
          message:
            'Twoje konto nie ma jeszcze powiązania z windband-manager — ' +
            'zaloguj się raz w windband-manager, aby utworzyć profil aplikacji.',
        });
      } else {
        setPhase({ kind: 'bands-error', message: (e as Error).message || 'Nie udało się pobrać listy zespołów.' });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopKeepAlive: (() => void) | null = null;

    const boot = async () => {
      const session = oidc.getSession();
      if (oidc.isCallbackPage()) {
        // POST-login: finalise the PKCE exchange, then load bands.
        try {
          await oidc.finishLogin();
        } catch (e) {
          setPhase({ kind: 'auth-error', message: (e as Error).message });
          return;
        }
      } else if (!session) {
        void oidc.beginLogin('login');
        return; // navigating away — do not render more
      }
      if (cancelled) return;
      // Keep-alive: obrót refresh tokenem w tle, zanim access token wygaśnie —
      // to naprawa „wylogowania po ~5 minutach" przy klikanej/otwartej karcie.
      stopKeepAlive = oidc.startSessionKeepAlive();
      await loadBands();
    };

    void boot();
    return () => {
      cancelled = true;
      stopKeepAlive?.();
    };
  }, [loadBands]);

  const handleSelect = (band: BandView) => {
    saveSelectedBand(sessionStorage, band);
    setPhase({ kind: 'dashboard', band });
  };

  const handleBackToPicker = () => {
    clearSelectedBand(sessionStorage);
    void loadBands();
  };

  const handleLogout = async () => {
    clearSelectedBand(sessionStorage);
    await oidc.logout();
  };

  if (phase.kind === 'boot' || phase.kind === 'bands-loading') {
    return shell(null, loadingBody());
  }

  if (phase.kind === 'auth-error') {
    return shell('Auth error', (
      <section className="content tinted">
        <div className="banner b-danger" role="alert"><span aria-hidden>⚠️</span><span>{phase.message}</span></div>
        <button type="button" className="btn primary block" onClick={() => void oidc.beginLogin('login')}>Zaloguj ponownie</button>
      </section>
    ));
  }

  if (phase.kind === 'bands-error') {
    return shell('Błąd', (
      <section className="content tinted">
        <div className="banner b-danger" role="alert"><span aria-hidden>⚠️</span><span>{phase.message}</span></div>
        <div className="row">
          <button type="button" className="btn block" onClick={() => void loadBands()}>Spróbuj ponownie</button>
          <button type="button" className="btn ghost" onClick={() => void handleLogout()}>Wyloguj</button>
        </div>
      </section>
    ));
  }

  if (phase.kind === 'picker') {
    return shell(
      <>
        <h3>Twój ekwipunek</h3>
        <span className="badge b-primary sso">SSO</span>
        <button type="button" className="btn sm ghost" onClick={() => void handleLogout()}>Wyloguj</button>
      </>,
      <BandSelection bands={phase.bands} memberCounts={memberCounts.current} onSelect={handleSelect} />,
    );
  }

  // four-tab workspace — LICZENIE (F5) is the live module
  return <BandWorkspace band={phase.band} onBack={handleBackToPicker} onLogout={() => void handleLogout()} />;
}

function shell(appbar: ReactNode, body: ReactNode) {
  return (
    <div className="app">
      <header className="appbar">{appbar}</header>
      {body}
    </div>
  );
}

function loadingBody() {
  return (
    <section className="content tinted" aria-busy="true" aria-label="Ładowanie zespołów">
      <p className="lede-01">Łączenie z windband-manager…</p>
      <div className="card bandcard skel"><span className="ticon">&nbsp;</span><span className="cb"><b>&nbsp;</b></span></div>
    </section>
  );
}
