import { useEffect, useState } from 'react';
import type { BandView } from '../api/bands';
import {
  listItems,
  startStocktake,
  type ItemLifecycleStatus,
  type ItemType,
  type StocktakeView,
  type WarehouseType,
} from '../api/inventory';
import { ApiError } from '../api/client';
import AppFrame from '../ui/AppFrame';

interface Props {
  band: BandView;
  onBack: () => void;
  onStarted: (s: StocktakeView) => void;
}

/**
 * Screen 08 — ADMIN only. The filters below freeze the snapshot that
 * StocktakeCommandService takes synchronously at POST time; whatever the
 * band does afterwards does not change this stocktake.
 */
export default function StocktakeStart({ band, onBack, onStarted }: Props) {
  const [type, setType] = useState<ItemType | null>(null);
  const [status, setStatus] = useState<ItemLifecycleStatus | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseType | null>(null);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    // Preview = AVAILABLE + ASSIGNED with the chosen filters (the two statuses
    // the snapshot is allowed to include — B7/F5).
    Promise.all([
      listItems(band.bandId, { type: type ?? undefined, status: 'AVAILABLE', warehouse: warehouse ?? undefined }),
      listItems(band.bandId, { type: type ?? undefined, status: 'ASSIGNED', warehouse: warehouse ?? undefined }),
    ])
      .then(([a, b]) => { if (!cancelled) setPreview(a.length + b.length); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [band.bandId, type, status, warehouse]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // `status` selects one of the two snapshot statuses; null → both.
      const s = await startStocktake(band.bandId, {
        type,
        status,
        warehouse,
        notes: notes.trim() || null,
      });
      onStarted(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  };

  const toggle = <T,>(current: T | null, value: T, set: (v: T | null) => void) =>
    set(current === value ? null : value);

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć">‹</button>
        <h3>Nowy spis — snapshot</h3>
        <span className="badge b-primary">ADMIN</span>
      </header>

      <section className="content">
        <div className="panel">
          <h4>Zakres snapshotu</h4>
          <label className="lbl">Typ</label>
          <div className="chips">
            {(['INSTRUMENT', 'UNIFORM', 'EQUIPMENT', 'SHEET_MUSIC', 'OTHER'] as const).map((t) => (
              <button type="button" key={t} className={`chip${type === t ? ' sel' : ''}`} onClick={() => toggle(type, t, setType)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="lbl">Status — oczekiwane na magazynie</label>
          <div className="chips">
            <button type="button" className={`chip${status === 'AVAILABLE' ? ' sel' : ''}`} onClick={() => toggle(status, 'AVAILABLE', setStatus)}>Dostępny</button>
            <button type="button" className={`chip${status === 'ASSIGNED' ? ' sel' : ''}`} onClick={() => toggle(status, 'ASSIGNED', setStatus)}>Przypisany</button>
          </div>
          <label className="lbl">Magazyn</label>
          <div className="chips">
            {(['MAIN', 'SERVICE', 'ARCHIVE'] as const).map((w) => (
              <button type="button" key={w} className={`chip${warehouse === w ? ' sel' : ''}`} onClick={() => toggle(warehouse, w, setWarehouse)}>
                {w === 'MAIN' ? 'Główny' : w === 'SERVICE' ? 'Serwis' : 'Archiwum'}
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            {preview === null ? 'liczę pozycje…' : `Podgląd zakresu: ${preview} pozycji trafi do snapshotu.`}
          </div>
          <div className="field">
            <label htmlFor="st-notes">Notatka spisu (trafa do raportu)</label>
            <textarea id="st-notes" value={notes} maxLength={2000} placeholder="np. przed koncertem w Filharmonii" onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="panel">
          <h4>Jak to zadziała</h4>
          <p className="hint">POST zamraża linie ze snapshotem nazwy/SN/przypisania, spis startuje od razu w toku; liczenie offline i poprawki działają do zamknięcia. Pauza = wznawialny stan roboczy; raport zamrożony po zamknięciu.</p>
        </div>

        {error && <div className="banner warni" role="alert">⚠<div>{error}</div></div>}

        <button type="button" className="btn ok block" style={{ minHeight: 52, fontSize: 16 }} disabled={busy || preview === null} onClick={() => void start()}>
          {busy ? 'Zamrażam snapshot…' : '▶ Uruchom spis'}
        </button>
        <div className="role-note">Uruchomienie spisu: tylko ADMIN (B8).</div>
      </section>
    </AppFrame>
  );
}

const TYPE_LABEL: Record<string, string> = {
  INSTRUMENT: '🎺 Instrumenty',
  UNIFORM: '👕 Uniformy',
  EQUIPMENT: '🔊 Sprzęt',
  SHEET_MUSIC: '🎼 Nuty',
  OTHER: '📦 Inne',
};
