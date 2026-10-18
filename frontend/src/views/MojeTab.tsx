import { useState } from 'react';
import type { BandView } from '../api/bands';
import { CountQueue } from '../stocktake/queue';
import { loadIdentity } from '../stocktake/identity';
import AppFrame from '../ui/AppFrame';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  onTab: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
  onBack: () => void;
  onLogout: () => void;
}

/** Screen 16 — the pieces the counting slice actually owns: device identity
 * for the stocktake (B10), the offline queue state, session, band switch. */
export default function MojeTab({ band, onTab, onBack, onLogout }: Props) {
  const [, force] = useState(0);
  const queue = new CountQueue();
  const all = queue.all();
  const identity = loadIdentity(band.bandId);

  return (
    <AppFrame>
      <header className="appbar">
        <h3>Moje</h3>
        <span className={`badge ${band.role === 'ADMIN' ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>
      <section className="content">
        <div className="panel">
          <h4>Tożsamość liczącego</h4>
          <div className="kv">
            <div><dt>Zespół</dt><dd>{band.name} · {band.role}</dd></div>
            <div><dt>Liczę jako</dt><dd>{identity ? `${identity.name} · #${identity.memberId}` : 'nie wybrano — pojawi się przy dołączeniu do spisu'}</dd></div>
            {identity && (
              <button type="button" className="btn sm ghost" onClick={() => { localStorage.removeItem(`wi.identity.${band.bandId}`); force((v) => v + 1); }}>
                Zmień osobę
              </button>
            )}
          </div>
          <p className="hint">WM nie mapuje kont na członków (B10) — wybór trafia do kolejki i do `countedMemberId`; serwer sprawdza roster przy każdym zapisie.</p>
        </div>

        <div className="panel">
          <h4>Kolejka offline</h4>
          {all.length === 0 ? (
            <p className="hint">Pusta — wszystko wysłane ✓</p>
          ) : (
            all.map((d) => (
              <div className="srow" key={d.key}>
                <b>{d.name}<span className="muted"> · spis #{d.stocktakeId}</span></b>
                <span className="muted">{d.foundState} · {new Date(d.queuedAt).toLocaleTimeString('pl-PL')}</span>
              </div>
            ))
          )}
          <p className="hint">Decyzje wysyłają się automatycznie przy połączeniu; przy wstrzymanym/zamkniętym spisie czekają widać tu dokładnie ile.</p>
          <div className="btnrow">
            <button type="button" className="btn sm" disabled={all.length === 0} onClick={() => { onTab('liczenie'); }}>Przejdź do liczenia</button>
          </div>
        </div>

        <div className="panel">
          <h4>Sesja i synchronizacja</h4>
          <div className="kv">
            <div><dt>Login</dt><dd>Keycloak SSO · żywa sesja ✓</dd></div>
            <div><dt>Auto-sync</dt><dd className="ok">◇ włączony</dd></div>
          </div>
        </div>

        <div className="btnrow">
          <button type="button" className="btn" onClick={onBack}>Zmień zespół</button>
          <button type="button" className="btn ghost" onClick={onLogout}>Wyloguj</button>
        </div>
      </section>
      <Tabs active="moje" onPulpit={() => onTab('pulpit')} onEkwipunek={() => onTab('ekwipunek')} onLiczenie={() => onTab('liczenie')} onMoje={() => undefined} />
    </AppFrame>
  );
}
