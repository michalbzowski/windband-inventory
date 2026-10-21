import { useState } from 'react';
import type { BandView } from '../api/bands';
import AppFrame from '../ui/AppFrame';
import PurchasesPanel from './PurchasesPanel';
import ServicePanel from './ServicePanel';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  onBack: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
  /** Dostarczone zamówienie → karta pozycji w Ekwipunku. */
  onOpenItem?: (itemId: number) => void;
}

/**
 * Plansza „Zamówienia i serwis” (B15). Dwa segmenty: „Zamówienia” (zakup
 * nowego przedmiotu) i „Serwis” (naprawa istniejącego, B15 stage 3).
 * Segment „Potrzeby” ukryty 2026-10-21 na prośbę użytkownika — zapotrzebowanie
 * ilościowe zgłaszane ze spisu obsługuje panel „Potrzeby zespołu” w raporcie
 * listy (StocktakeReport); tutaj został jako redundentny.
 * Read: każdy członek zespołu; akcje — tylko ADMIN (B8), 1:1 z guardem.
 */
export default function NeedsBoard({ band, onBack, onTab, onOpenItem }: Props) {
  const isAdmin = band.role === 'ADMIN';
  const [seg, setSeg] = useState<'purchases' | 'serwis'>('purchases');

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć">‹</button>
        <h3>Zamówienia i serwis</h3>
        <span className={`badge ${isAdmin ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        <div className="chips" role="tablist" aria-label="Część deski">
          <button type="button" role="tab" aria-selected={seg === 'purchases'} className={`chip${seg === 'purchases' ? ' sel' : ''}`}
            onClick={() => setSeg('purchases')}>Zamówienia</button>
          <button type="button" role="tab" aria-selected={seg === 'serwis'} className={`chip${seg === 'serwis' ? ' sel' : ''}`}
            onClick={() => setSeg('serwis')}>Serwis</button>
        </div>

        {seg === 'purchases'
          ? <PurchasesPanel band={band} onOpenItem={(id) => onOpenItem?.(id)} />
          : <ServicePanel band={band} />}
      </section>

      <Tabs
        active="ekwipunek"
        onPulpit={() => onTab?.('pulpit')}
        onEkwipunek={onBack}
        onLiczenie={() => onTab?.('liczenie')}
        onMoje={() => onTab?.('moje')}
      />
    </AppFrame>
  );
}
