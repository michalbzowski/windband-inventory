import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { BandView } from '../api/bands';
import { parseScan } from '../scan/model';
import AppFrame from '../ui/AppFrame';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  onBack: () => void;
  onOpenItem: (itemId: number) => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
}

/**
 * Skaner etykiet pozycji (v1.x #6 — „skanowanie QR/kodu”, po B15 w kolejce W1).
 *
 * Droga główna = WPIS KODU RĘCZNIE: działa offline, bez aparatu i bez uprawnień
 * — etykieta niesie krótki kod `WI-{band}-{id}` (np. WI-1-7), więc 4–6 symboli
 * wpisz szybciej niż się otwiera kamera. Aktywny APARAT to opcja na górze:
 * loop getUserMedia + jsQR dekoduje klatki, wynik idzie do tej samej drogi
 * rozpoznania. Rozpoznany kod z INNEGO zespołu jest twardo odrzucany; URL bez
 * parametru band otwiera pozycję w aktywnym zespole (z podpowiedzią).
 */
export default function ScanScreen({ band, onBack, onOpenItem, onTab }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Aparat: tryb aktywny + jego stery + komunikaty o dostępności.
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedNote, setScannedNote] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const resolve = (raw: string) => {
    const target = parseScan(raw);
    if (!target) {
      setCameraOn(false);
      setError('Nierozpoznany kod. Etykieta niesie np. WI-1-7 albo link z „/items/{nr}” i „band={nr}”.');
      setHint(null);
      return;
    }
    if (target.bandId === undefined) {
      // URL bez identyfikatora zespołu: otwieramy w aktywnym, ale mówi to UI.
      onOpenItem(target.itemId);
      return;
    }
    if (target.bandId !== band.bandId) {
      setCameraOn(false);
      setError(
        `Ten kod należy do innego zespołu (band ${target.bandId}), a nie do „${band.name}” ` +
        `(band ${band.bandId}). Kody etykiet są jednoznaczne przypisane do swojego zespołu.`
      );
      setHint(null);
      return;
    }
    setCameraOn(false);
    setError(null);
    onOpenItem(target.itemId);
  };

  // Aparat: rozrząd strumienia + raf-dekodowanie; sprzątanie przy unmount/stopie.
  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    setError(null);
    setScannedNote(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Ta przeglądarka nie udostępnia aparatu — wpisz kod ręcznie niżej.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // po mountcie <video> (efekt poniżej) stream zasila klatki do dekodera
    } catch {
      setCameraError('Brak dostępu do aparatu (uprawnienia lub brak kamery). Kod można wpisać ręcznie.');
    }
  };

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => undefined);

    let alive = true;
    const canvas = document.createElement('canvas');
    const tick = async () => {
      if (!alive) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const w = 160; // dekoder nie potrzebuje pełnej rozdzielczości — mniej pracy na telefonie
        const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          try {
            const data = ctx.getImageData(0, 0, w, h);
            const found = jsQR(data.data, w, h);
            if (found?.data) {
              alive = false;
              setScannedNote(`Odczytano: ${found.data}`);
              stopCamera();
              // wynik podajemy do tej samej drogi co wpis ręczny
              resolve(found.data);
              return;
            }
          } catch {
            // klatka nieczytelna — następny kadr
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    resolve(input);
  };

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć do listy">‹</button>
        <h3>Skanuj etykietę</h3>
      </header>

      <section className="content">
        {cameraOn && (
          <div className="scanner" role="img" aria-label="Podgląd kamery — skieruj na kod kreskowy etykiety">
            <video ref={videoRef} muted playsInline />
            <span className="frame" aria-hidden />
          </div>
        )}
        {scannedNote && <p className="hint" role="status">{scannedNote}</p>}
        {cameraError && (
          <p className="hint err" role="alert">{cameraError}</p>
        )}
        {!cameraOn && !cameraError && (
          <div className="state center">
            <span className="state-ico">📷</span>
            <b>Aparat jest wyłączony</b>
            <span>Włącz kamerę albo — prościej offline — wpisz kod z etykiety ręcznie.</span>
          </div>
        )}

        {!cameraOn && (
          <button type="button" className="primary" onClick={() => void startCamera()}>
            Włącz aparat
          </button>
        )}

        <form onSubmit={submit} className="label-card manual" aria-label="Wpisz kod ręcznie">
          <h4>Kod z etykiety</h4>
          <p className="hint">
            Format: <code>WI-1-7</code> (WI – numer zespołu – numer pozycji) lub link do pozycji.
            Widać to też na wydrukowanej etykience (szczegóły pozycji → 🏷).
          </p>
          <input
            className="search"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            placeholder="WI-1-7"
            aria-label="Kod etykiety lub link do pozycji"
            spellCheck={false}
          />
          {hint && <p className="hint">{hint}</p>}
          {error && <p className="hint err" role="alert">{error}</p>}
          <button type="submit" className="primary">Otwórz pozycję</button>
        </form>
      </section>

      <Tabs
        active="ekwipunek"
        onPulpit={() => (onTab ? onTab('pulpit') : onBack())}
        onEkwipunek={onBack}
        onLiczenie={() => onTab?.('liczenie')}
        onMoje={() => onTab?.('moje')}
      />
    </AppFrame>
  );
}
