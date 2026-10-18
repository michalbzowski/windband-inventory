import type { ReactNode } from 'react';

/** Ramka aplikacji znana ze wszystkich pełnoekranowych widoków.
 * Na telefonie to kolumna 390 px; media queries w styles.css rozszerzają ją
 * do widoku tableta (≥768 px) i desktopowego okna (≥1200 px). Makieta
 * (statusbar 9:41 / 5G / bateria, home bar) została usunięta — to była tylko
 * dekoracja z pliku mockup, nie element produktu. */
export default function AppFrame({ children }: { children: ReactNode }) {
  return <div className="app">{children}</div>;
}
