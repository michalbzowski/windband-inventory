import type { BandView } from '../api/bands';

interface Props {
  band: BandView;
  onBack: () => void;
  onLogout: () => void;
}

export default function DashboardStub({ band, onBack, onLogout }: Props) {
  return (
    <>
      <section className="content tinted" aria-label={`Pulpit — ${band.name}`}>
        <div className="state state-wip" role="status">
          <span className="state-ico" aria-hidden>🚜</span>
          <b>Pulpit zespołu {band.name}</b>
          <span>
            Kolejne widoki (ekwipunek, liczenie) powstaną tu w następnych krokach prac.
            Wybór zespołu i sesja SSO są już aktywne — to fundament tego ekranu.
          </span>
        </div>

        <div className="panel">
          <h4>Sesja</h4>
          <dl className="kv">
            <div><dt>Zespół</dt><dd>{band.name}</dd></div>
            <div><dt>Rola (WM)</dt><dd>{band.role === 'ADMIN' ? 'Administrator' : 'Członek'}</dd></div>
            <div><dt>Źródło danych</dt><dd>windband-manager · /api/v1/me/bands</dd></div>
          </dl>
        </div>

        <div className="row">
          <button type="button" className="btn block" onClick={onBack}>Zmiana zespołu</button>
          <button type="button" className="btn ghost" onClick={onLogout}>Wyloguj</button>
        </div>
      </section>

      <nav className="tabs" aria-label="Nawigacja główna">
        <span className="t on" title="Pulpit"><span className="ti" aria-hidden>📋</span> Pulpit</span>
        <span className="t disabled" title="Planowane"><span className="ti" aria-hidden>🎒</span> Ekwipunek</span>
        <span className="t disabled" title="Planowane"><span className="ti" aria-hidden>🧮</span> Liczenie</span>
        <span className="t disabled" title="Planowane"><span className="ti" aria-hidden>👤</span> Moje</span>
      </nav>
    </>
  );
}
