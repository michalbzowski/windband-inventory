import { useEffect, useState } from 'react';
import { listStocktakes, type StocktakeView } from '../api/inventory';
import type { BandView } from '../api/bands';
import { loadIdentity } from '../stocktake/identity';
import { CountQueue } from '../stocktake/queue';
import AppFrame from '../ui/AppFrame';
import { Tabs } from './LiczenieTab';
import LiczenieTab from './LiczenieTab';
import EkwipunekTab from './EkwipunekTab';
import MojeTab from './MojeTab';

type TabKey = 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje';

interface Props {
  band: BandView;
  onBack: () => void;
  onLogout: () => void;
}

/** Cztery zakładki ze zmrożonej makiety (§.tabs). PULPIT, LICZENIE i
 * EKWIPEUNEK (wycinek rejestru) działają; Moje pokazuje kolejkę/tożsamość/sesję. */
const TAB_KEYS: readonly TabKey[] = ['pulpit', 'ekwipunek', 'liczenie', 'moje'];
const tabStoreKey = (bandId: number) => `wi.tab.${bandId}`;

export default function BandWorkspace({ band, onBack, onLogout }: Props) {
  // Zakładka zapamiętywana per zespół — F5 nie cofa do Pulpitu po restoracji zespołu.
  const [tab, setTabState] = useState<TabKey>(() => {
    const stored = sessionStorage.getItem(tabStoreKey(band.bandId)) as TabKey | null;
    return stored && TAB_KEYS.includes(stored) ? stored : 'pulpit';
  });
  const setTab = (t: TabKey) => {
    sessionStorage.setItem(tabStoreKey(band.bandId), t);
    setTabState(t);
  };
  const [startCreate, setStartCreate] = useState(false);

  if (tab === 'liczenie') return <LiczenieTab band={band} onBackToPulpit={() => setTab('pulpit')} onTab={setTab} />;
  if (tab === 'ekwipunek') {
    return (
      <EkwipunekTab
        band={band}
        onBackToPulpit={() => setTab('pulpit')}
        onTab={setTab}
        startCreate={startCreate}
        onCreateConsumed={() => setStartCreate(false)}
      />
    );
  }
  if (tab === 'moje') return <MojeTab band={band} onTab={setTab} onBack={onBack} onLogout={onLogout} />;
  return <HomeTabs band={band} tab={tab} setTab={setTab} onCreate={() => { setStartCreate(true); setTab('ekwipunek'); }} />;
}

function HomeTabs({ band, tab, setTab, onCreate }: { band: BandView; tab: TabKey; setTab: (t: TabKey) => void; onCreate: () => void }) {
  const [stocktakes, setStocktakes] = useState<StocktakeView[] | null>(null);
  useEffect(() => {
    listStocktakes(band.bandId).then(setStocktakes).catch(() => setStocktakes([]));
  }, [band.bandId]);
  const active = stocktakes?.find((s) => s.status !== 'CLOSED') ?? null;
  const identity = loadIdentity(band.bandId);
  const queue = new CountQueue();

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={() => setTab(tab)} aria-label="—"> </button>
        <h3>{band.name}</h3>
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
              <button type="button" className={`tile${band.role === 'ADMIN' ? '' : ' disabled'}`} title={band.role === 'ADMIN' ? undefined : 'Rejestr pozycji prowadzi ADMIN (B8)'} onClick={band.role === 'ADMIN' ? onCreate : undefined}><span>＋</span>Nowa pozycja</button>
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
      </section>

      <Tabs
        active={tab}
        onPulpit={() => setTab('pulpit')}
        onEkwipunek={() => setTab('ekwipunek')}
        onLiczenie={() => setTab('liczenie')}
        onMoje={() => setTab('moje')}
      />
    </AppFrame>
  );
}
