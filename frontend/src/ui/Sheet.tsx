import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet (makieta: "filtry/akcje jako bottom sheety, tap-target > 44 px").
 * Na tablecie/desktopie styles.css zmienia go w wyśrodkowany dialog. */
export default function Sheet({ title, onClose, children }: Props) {
  return (
    <div className="dim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="grab" aria-hidden />
        <h4>{title}</h4>
        {children}
      </div>
    </div>
  );
}
