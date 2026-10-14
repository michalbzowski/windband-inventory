import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getMemberPicture, type MemberPictureView } from '../api/inventory';
import { STATUS_BADGE, STATUS_LABEL, TYPE_ICON, WAREHOUSE_LABEL } from '../ekwipunek/filters';
import { fmtDateTime } from '../ekwipunek/format';
import Phone from '../ui/Phone';

interface Props {
  bandId: number;
  memberId: number;
  onBack: () => void;
  onOpenItem: (itemId: number) => void;
}

/**
 * F3 — pełny obraz na członka (backlog v1.x item 1): oczekiwane instrumenty
 * z WM (expectedSet) vs pozycje faktycznie przypisane, luki oraz historia
 * przydziałów tylko do odczytu (wiersze to dowody — B8 nie pozwala ich edytować).
 */
export default function MemberPicture({ bandId, memberId, onBack, onOpenItem }: Props) {
  const [pic, setPic] = useState<MemberPictureView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getMemberPicture(bandId, memberId, ctrl.signal)
      .then((v) => {
        setPic(v);
        setError(null);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e.message : 'Nie udało się wczytać obrazu członka.');
      });
    return () => ctrl.abort();
  }, [bandId, memberId]);

  return (
    <Phone>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć do listy">‹</button>
        <h3>👤 {pic?.memberName ?? 'Obraz członka'}</h3>
        <span />
      </header>

      <section className="content">
        {error && <p className="field-err" aria-live="polite">{error}</p>}
        {!pic && !error && <p className="hint">Wczytywanie…</p>}

        {pic && (
          <>
            <p>
              <span className={`badge ${pic.active ? 'b-ok' : 'b-danger'}`}>
                {pic.active ? 'Aktywny' : 'Nieaktywny'}
              </span>{' '}
              {pic.gapCount === 0 ? (
                <span className="badge b-ok">Wszystko na miejscu</span>
              ) : (
                <span className="badge b-warn" aria-label={`Luki: ${pic.gapCount}`}>Luki: {pic.gapCount}</span>
              )}
            </p>

            <div className="panel">
              <h4>Oczekiwane (WM)</h4>
              {pic.expected.length === 0 && <p className="hint">WM nie spodziewa się żadnych instrumentów.</p>}
              {pic.expected.map((e) => {
                const held = pic.actual.find((i) => e.matchedItemIds.includes(i.id));
                return (
                  <div className="srow" key={`${e.instrument}-${e.primary}`} style={{ cursor: 'default' }}>
                    <span>
                      <b>{e.satisfied ? '✓' : '✗'} {e.instrument}</b>
                      <span className="muted">
                        {' '}{e.primary ? 'główny' : 'drugorzędny'}
                        {held ? ` · ${TYPE_ICON[held.type]} ${held.name}` : ''}
                      </span>
                    </span>
                    <span className={`badge ${e.satisfied ? 'b-ok' : 'b-danger'}`}>
                      {e.satisfied ? 'na miejscu' : 'brak'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="panel">
              <h4>Faktycznie przechowywane ({pic.actual.length})</h4>
              {pic.actual.length === 0 && <p className="hint">Nic nie jest obecnie przypisane do tej osoby.</p>}
              {pic.actual.map((i) => (
                <button type="button" className="srow" key={i.id} onClick={() => onOpenItem(i.id)} aria-label={`Pozycja ${i.name}`}>
                  <span>
                    <b>{TYPE_ICON[i.type]} {i.name}</b>
                    <span className="muted">
                      {' '}{i.serialNumber ? `SN ${i.serialNumber} · ` : ''}{WAREHOUSE_LABEL[i.warehouse]}
                    </span>
                  </span>
                  <span className={`badge ${STATUS_BADGE[i.lifecycleStatus]}`}>{STATUS_LABEL[i.lifecycleStatus]}</span>
                </button>
              ))}
            </div>

            <div className="panel">
              <h4>Historia przydziałów</h4>
              <p className="hint">Tylko do odczytu — zapisy są dowodami.</p>
              {pic.history.length === 0 && <p className="hint">Brak historii — nic nigdy nie było przypisane.</p>}
              {pic.history.map((h) => (
                <div className="srow" key={h.id} style={{ cursor: 'default' }}>
                  <span>
                    <b>{h.itemName}</b>
                    <span className="muted">
                      {' '}{fmtDateTime(h.assignedAt)} → {h.returnedAt ? fmtDateTime(h.returnedAt) : 'nadal u członka'}
                      {h.returnedState ? ` · zwrot: ${STATUS_LABEL[h.returnedState]}` : ''}
                      {h.assignNote || h.returnNote ? ` · ${h.assignNote ?? ''}${h.returnNote ? ` / zwrot: ${h.returnNote}` : ''}` : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </Phone>
  );
}
