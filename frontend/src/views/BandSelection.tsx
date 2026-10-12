import type { BandView } from '../api/bands';

interface Props {
  bands: BandView[];
  /** member counts resolved lazily from /bands/{id}/members (may be partial) */
  memberCounts: ReadonlyMap<number, number>;
  onSelect: (band: BandView) => void;
}

const T_ICONS = ['🎺', '🥁', '🎻', '🎹', '🎼', '🪗'];

function iconFor(bandId: number): string {
  return T_ICONS[((bandId % T_ICONS.length) + T_ICONS.length) % T_ICONS.length];
}

/** Wyraźnia informacja o nie-JSON / nieoczekiwanej treści — celowo ostrożna. */
function roleLabel(role: string): string {
  return role.toUpperCase();
}

export default function BandSelection({ bands, memberCounts, onSelect }: Props) {
  return (
    <>
      <section className="content tinted" aria-label="Wybór zespołu">
        <p className="lede-01">
          Wybierz zespół, którego inwentaryzację chcesz prowadzić. Lista pochodzi z
          windband-manager — zobaczysz wyłącznie zespoły, do których należysz.
        </p>

        {bands.length === 0 ? (
          <div className="state state-empty" role="status">
            <span className="state-ico" aria-hidden>🎼</span>
            <b>Nie należysz obecnie do żadnego zespołu</b>
            <span>
              Dodaj się do zespołu w windband-manager (zaproszenie akceptowane przez
              organizatora) — ten ekran odświeży listę automatycznie.
            </span>
          </div>
        ) : (
          <ul className="bandlist" role="listbox" aria-label="Twoje zespoły">
            {bands.map((b) => {
              const count = memberCounts.get(b.bandId);
              return (
                <li key={b.bandId}>
                  <button
                    type="button"
                    className="card bandcard"
                    role="option"
                    aria-selected="false"
                    onClick={() => onSelect(b)}
                  >
                    <span className="ticon" aria-hidden>{iconFor(b.bandId)}</span>
                    <span className="cb">
                      <b>{b.name}</b>
                      <span className="meta">
                        {count !== undefined ? `${count} ${plural(count, 'członek', 'członków')}` : ''}
                      </span>
                    </span>
                    <span
                      className={`badge ${b.role === 'ADMIN' ? 'b-primary' : 'b-gray'}`}
                      title="Rola w windband-manager"
                    >
                      {roleLabel(b.role)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="banner b-warn hint-return" role="note">
          <span aria-hidden>🔗</span>
          <span>
            Po wybraniu zespołu otworzy się jego ekran startowy. Wrócić do listy możesz
            przyciskiem „Wstecz” w pasku tytułu. Logowanie jest jednostronne: konto nadaje
            windband-manager (SSO), a dostęp do zespołów wymusza windband-manager po stronie serwera.
          </span>
        </div>
      </section>

      <nav className="tabs" aria-label="Nawigacja główna">
        <a className="t on" href="#pulpit">
          <span className="ti" aria-hidden>📋</span> Pulpit
        </a>
        <span className="t disabled" title="Dostępne po wyborze zespołu">
          <span className="ti" aria-hidden>🎒</span> Ekwipunek
        </span>
        <span className="t disabled" title="Dostępne po wyborze zespołu">
          <span className="ti" aria-hidden>🧮</span> Liczenie
        </span>
        <span className="t disabled" title="Dostępne po wyborze zespołu">
          <span className="ti" aria-hidden>👤</span> Moje
        </span>
      </nav>
      <div className="homebar" aria-hidden>&lt;i/&gt;</div>
    </>
  );
}

/** Polish plural (simple, for 1/2-4/5+ counts). */
function plural(n: number, one: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return one; // close enough for display meta
  return many;
}
