import { useEffect, useState } from 'react';
import { listStocktakes, type StocktakeView } from '../api/inventory';
import type { BandView } from '../api/bands';
import { loadIdentity } from '../stocktake/identity';
import { CountQueue } from '../stocktake/queue';
import Phone from '../ui/Phone';
import { Tabs } from './LiczenieTab';
import LiczenieTab from './LiczenieTab';
import MojeTab from './MojeTab';

type TabKey = 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje';

interface Props {
  band: BandView;
  onBack: () => void;
  onLogout: () => void;
}

/** Four-tab shell from the frozen mockup (§.tabs). Only LICZENIE is live in
 * this slice; Pulpit links into it, Ekwipunek is the next slice, Moje shows
 * the queue/identity that counting actually uses. */
export default function BandWorkspace({ band, onBack, onLogout }: Props) {
  const [tab, setTab] = useState<TabKey>('pulpit');

  if (tab === 'liczenie') return <LiczenieTab band={band} onBackToPulpit={() => setTab('pulpit')} />;
  if (tab === 'moje') return <MojeTab band={band} onTab={setTab} onBack={onBack} onLogout={onLogout} />;
  return <HomeTabs band={band} tab={tab} setTab={setTab} />;
}

function HomeTabs({ band, tab, setTab }: { band: BandView; tab: TabKey; setTab: (t: TabKey) => void }) {
  const [stocktakes, setStocktakes] = useState<StocktakeView[] | null>(null);
  useEffect(() => {
    listStocktakes(band.bandId).then(setStocktakes).catch(() => setStocktakes([]));
  }, [band.bandId]);
  const active = stocktakes?.find((s) => s.status !== 'CLOSED') ?? null;
  const identity = loadIdentity(band.bandId);
  const queue = new CountQueue();

  return (
    <Phone>
      <header className="appbar">
        <button type="button" className="back" onClick={() => setTab(tab)} aria-label="—"> </button>
        <h3>{tab === 'pulpit' ? band.name : 'Ekwipunek'}</h3>
        <span className={`badge ${band.role === 'ADMIN' ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        {tab === 'pulpit' && (
          <>
            {active ? (
              <div className="panel">
                <h4>Trwa spis #{active.id} {active.status === 'DRAFT' ? <span className="badge b-warn">wstrzymany</span> : <span className="badge b-ok">w toku</span>}</h4>
                <div className="kv">
                  <div><dt>Policzone</dt><dd>{active.countedLines} / {active.totalLines}</dd></div>
                  <div><dt>Kolejka na tym urządzeniu</dt><dd>{queue.count(active.id) > 0 ? `${queue.count(active.id)} do wysłania` : '◇ wysłane'}</dd></div>
                </div>
                <button type="button" className="btn primary block" style={{ marginTop: 8 }} onClick={() => setTab('liczenie')}>
                  ✓ {active.status === 'DRAFT' ? 'Pokaż spis' : identity ? 'Dołącz i licz' : 'Rozpocznij liczenie'}
                </button>
              </div>
            ) : (
              <div className="panel">
                <h4>Brak aktywnego spisu</h4>
                <p className="hint">{band.role === 'ADMIN' ? 'Uruchom spis, zanim ruszy liczenie (snapshot na starcie).' : 'Spis uruchamia administrator.'}</p>
                <button type="button" className={`btn ${band.role === 'ADMIN' ? 'primary' : 'ghost'} block`} style={{ marginTop: 8 }} onClick={() => setTab('liczenie')}>
                  ▶ Przejdź do liczenia
                </button>
              </div>
            )}

            <h4>szybkie akcje</h4>
            <div className="grid-tiles">
              <button type="button" className="tile" onClick={() => setTab('liczenie')}><span>▶</span>Rozpocznij spis{band.role !== 'ADMIN' ? ' (ADMIN)' : ''}</button>
              <button type="button" className="tile disabled" title="Moduł ekwipunku — następny slice"><span>＋</span>Nowa pozycja</button>
              <button type="button" className="tile" onClick={() => setTab('moje')}><span>🗲</span>Kolejka offline{queue.all().length ? ` (${queue.all().length})` : ' · pusta'}</button>
              <button type="button" className="tile" onClick={() => setTab('ekwipunek')}><span>♧</span>Ekwipunek</button>
            </div>

            <h4>liczniki</h4>
            <div className="panel">
              <div className="kv">
                <div><dt>Pozycje</dt><dd className="warn">w budowie</dd></div>
                <div><dt>Aktywne przydziały</dt><dd className="warn">w budowie</dd></div>
                <div><dt>Ostatni zamknięty</dt><dd>{stocktakes?.find((s) => s.status === 'CLOSED') ? `#${stocktakes.find((s) => s.status === 'CLOSED')!.id} ✓` : '—'}</dd></div>
              </div>
            </div>
          </>
        )}

        {tab === 'ekwipunek' && (
          <div className="state">
            <span className="state-ico" aria-hidden>🚧</span>
            <b>Ekwipunek — w budowie</b>
            <span>Następny slice roadmapy (rejestr pozycji + listy oczekiwane).</span>
          </div>
        )}
      </section>

      <Tabs
        active={tab}
        onPulpit={() => setTab('pulpit')}
        onEkwipunek={() => setTab('ekwipunek')}
        onLiczenie={() => setTab('liczenie')}
        onMoje={() => setTab('moje')}
      />
    </Phone>
  );
}
