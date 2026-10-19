import { useEffect, useState } from 'react';
import { listItems, listNeeds, listStocktakes, type StocktakeView } from '../api/inventory';
import type { BandView } from '../api/bands';
import { loadIdentity } from '../stocktake/identity';
import { CountQueue } from '../stocktake/queue';
import { openNeedCount } from '../needs/model';
import { COUNTER_META, COUNTER_NAV, counterText, type CounterKey, type CounterValue, type EkwNav } from '../dashboard/counters';
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
  const [ekwNav, setEkwNav] = useState<EkwNav>({ kind: 'none' });
  const goEkw = (nav: EkwNav) => {
    setEkwNav(nav);
    setTab('ekwipunek');
  };
  // Deep-link zużyty przy zamontowaniu Ekwipuneku — powrót na tę samą zakładkę nie wkleja go drugi raz.
  const consumeEkwNav = () => setEkwNav({ kind: 'none' });

  if (tab === 'liczenie') return <LiczenieTab band={band} onBackToPulpit={() => setTab('pulpit')} onTab={setTab} />;
  if (tab === 'ekwipunek') {
    return (
      <EkwipunekTab
        band={band}
        onBackToPulpit={() => setTab('pulpit')}
        onTab={setTab}
        startCreate={ekwNav.kind === 'create'}
        onCreateConsumed={consumeEkwNav}
        startNeeds={ekwNav.kind === 'needs'}
        onNeedsConsumed={consumeEkwNav}
        initialFilters={ekwNav.kind === 'filter' ? ekwNav.filters : undefined}
        onFiltersConsumed={consumeEkwNav}
      />
    );
  }
  if (tab === 'moje') return <MojeTab band={band} onTab={setTab} onBack={onBack} onLogout={onLogout} />;
  return <HomeTabs band={band} tab={tab} setTab={setTab} goEkw={goEkw} />;
}

function HomeTabs({ band, tab, setTab, goEkw }: { band: BandView; tab: TabKey; setTab: (t: TabKey) => void; goEkw: (nav: EkwNav) => void }) {
  const [stocktakes, setStocktakes] = useState<StocktakeView[] | null>(null);
  const [counters, setCounters] = useState<Record<CounterKey, CounterValue>>({
    items: undefined, assigned: undefined, needs: undefined, serviceDue: undefined,
  });
  useEffect(() => {
    listStocktakes(band.bandId).then(setStocktakes).catch(() => setStocktakes([]));
    const bump = (k: CounterKey) => (v: number | null) => setCounters((c) => ({ ...c, [k]: v }));
    listItems(band.bandId).then((l) => bump('items')(l.length)).catch(() => bump('items')(null));
    listItems(band.bandId, { status: 'ASSIGNED' }).then((l) => bump('assigned')(l.length)).catch(() => bump('assigned')(null));
    listItems(band.bandId, { serviceDue: true }).then((l) => bump('serviceDue')(l.length)).catch(() => bump('serviceDue')(null));
    listNeeds(band.bandId).then((l) => bump('needs')(openNeedCount(l))).catch(() => bump('needs')(null));
  }, [band.bandId]);
  const active = stocktakes?.find((s) => s.status !== 'CLOSED') ?? null;
  // Najpóźniejszy zamknięty spis (id malejąco = najnowszy); wartość „Ostatni zamknięty”.
  const lastClosedRow = (stocktakes ?? [])
    .filter((s) => s.status === 'CLOSED')
    .sort((a, b) => b.id - a.id)[0];
  const lastClosedTs = lastClosedRow?.finishedAt ?? lastClosedRow?.startedAt ?? null;
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
              <button type="button" className={`tile${band.role === 'ADMIN' ? '' : ' disabled'}`} title={band.role === 'ADMIN' ? undefined : 'Rejestr pozycji prowadzi ADMIN (B8)'} onClick={band.role === 'ADMIN' ? () => goEkw({ kind: 'create' }) : undefined}><span>＋</span>Nowa pozycja</button>
              <button type="button" className="tile" onClick={() => setTab('moje')}><span>🗲</span>Kolejka offline{queue.all().length ? ` (${queue.all().length})` : ' · pusta'}</button>
              <button type="button" className="tile" onClick={() => setTab('ekwipunek')}><span>♧</span>Ekwipunek</button>
            </div>

            <h4>liczniki</h4>
            <div className="grid-tiles">
              {(Object.keys(COUNTER_META) as CounterKey[]).map((k) => (
                <button key={k} type="button" className="tile" aria-label={COUNTER_META[k].aria} onClick={() => goEkw(COUNTER_NAV[k])}>
                  <span>{counterText(counters[k])}</span>
                  {COUNTER_META[k].label}
                </button>
              ))}
              <div className="tile info" title={lastClosedTs ? new Date(lastClosedTs).toLocaleString('pl-PL') : undefined}>
                <span className="cval">
                  {stocktakes === null ? '…' : lastClosedTs
                    ? new Date(lastClosedTs).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </span>
                Ostatni zamknięty
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
