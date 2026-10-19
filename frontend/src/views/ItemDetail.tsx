import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { listBandMembers, type BandMember, type BandView } from '../api/bands';
import { ApiError } from '../api/client';
import {
  assignItem,
  completeItemService,
  createDeclaration,
  deleteItem,
  getItem,
  listDeclarations,
  listItems,
  listItemAssignments,
  listItemServices,
  listItemTransfers,
  revokeDeclaration,
  sendItemToService,
  transferItem,
  unassignItem,
  type AssignmentView,
  type DeclarationType,
  type DeclarationView,
  type ItemView,
  type ServiceEventView,
  type WarehouseTransferView,
  type WarehouseType,
} from '../api/inventory';
import { STATUS_BADGE, STATUS_LABEL, TYPE_ICON, TYPE_LABEL, WAREHOUSE_LABEL } from '../ekwipunek/filters';
import { itemCode } from '../scan/model';
import {
  DECLARATION_STATUS_LABEL,
  DECLARATION_TYPE_LABEL,
  activeDeclarationFor,
  canRevokeDeclaration,
  isDeclarableItem,
  validateDeclarationForm,
} from '../declarations/model';
import { fmtAttrValue, fmtDate, fmtDateTime } from '../ekwipunek/format';
import AppFrame from '../ui/AppFrame';
import Sheet from '../ui/Sheet';
import { Tabs } from './LiczenieTab';
import ItemForm from './ItemForm';

interface Props {
  band: BandView;
  itemId: number;
  focusForm?: boolean;
  onBack: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
}

type SheetKind = 'assign' | 'unassign' | 'transfer' | 'service' | 'serviceComplete' | 'declare' | 'label' | null;

/**
 * Item detail (makieta screen 04): attributes rendered from the generator,
 * storage + assignee block, the two histories, and — ADMIN only — the pinned
 * action zone with assign (05), unassign (17) and transfer sheets. MEMBER
 * sees the same data with no write affordances (B8, server-enforced too).
 */
export default function ItemDetail({ band, itemId, focusForm = false, onBack, onTab }: Props) {
  const [item, setItem] = useState<ItemView | null>(null);
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [transfers, setTransfers] = useState<WarehouseTransferView[]>([]);
  const [services, setServices] = useState<ServiceEventView[]>([]);
  const [declarations, setDeclarations] = useState<DeclarationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editing, setEditing] = useState(focusForm);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const isAdmin = band.role === 'ADMIN';

  const reload = useCallback(() => {
    getItem(itemId)
      .then((v) => {
        setItem(v);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
    listItemAssignments(itemId).then(setAssignments).catch(() => setAssignments([]));
    listItemTransfers(itemId).then(setTransfers).catch(() => setTransfers([]));
    listItemServices(itemId).then(setServices).catch(() => setServices([]));
    listDeclarations(band.bandId)
      .then((rows) => setDeclarations(rows.filter((d) => d.itemId === itemId)))
      .catch(() => setDeclarations([]));
  }, [itemId, band.bandId]);

  useEffect(reload, [reload]);

  if (editing) {
    return (
      <ItemForm
        band={band}
        editId={itemId}
        onDone={() => {
          setEditing(false);
          reload();
        }}
        onCancel={() => setEditing(false)}
        onTab={onTab}
      />
    );
  }

  if (error && !item) {
    return (
      <AppFrame>
        <header className="appbar">
          <button type="button" className="back" onClick={onBack} aria-label="Wróć">‹</button>
          <h3>Pozycja</h3>
        </header>
        <section className="content">
          <div className="state"><span className="state-ico">⚠</span><b>Nie udało się wczytać</b><span>{error}</span></div>
        </section>
        <Tabs active="ekwipunek" onPulpit={() => (onTab ? onTab('pulpit') : onBack())} onEkwipunek={onBack} onLiczenie={() => onTab?.('liczenie')} onMoje={() => onTab?.('moje')} />
      </AppFrame>
    );
  }
  if (!item) {
    return (
      <AppFrame>
        <section className="content"><p className="hint">Wczytywanie…</p></section>
      </AppFrame>
    );
  }

  const openAssignment = assignments.find((a) => a.returnedAt === null) ?? null;
  const canAssign = isAdmin && item.lifecycleStatus === 'AVAILABLE';
  const canUnassign = isAdmin && item.lifecycleStatus === 'ASSIGNED';
  const canTransfer =
    isAdmin && (item.lifecycleStatus === 'AVAILABLE' || item.lifecycleStatus === 'IN_SERVICE' || item.lifecycleStatus === 'RETIRED');
  // F4: tylko AVAILABLE jedzie do serwisu; tylko IN_SERVICE można zamknąć (lustrzane 409 serwera).
  const canSendToService = isAdmin && item.lifecycleStatus === 'AVAILABLE';
  const canCompleteService = isAdmin && item.lifecycleStatus === 'IN_SERVICE';
  // B14: deklarację składa DOWOLNY członek (nie tylko ADMIN); ASSIGNED odpada,
  // aktywna blokuje ponowne zgłoszenie — serwer pilnuje tego samym 409.
  const activeDecl = activeDeclarationFor(declarations, item.id) ?? null;
  const canDeclare = isDeclarableItem(item.lifecycleStatus) && activeDecl === null;
  const hasHistory =
    assignments.length > 0 || transfers.length > 0 || services.length > 0 || declarations.length > 0;

  const afterWrite = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
    reload();
  };

  const revokeDecl = async (id: number) => {
    try {
      await revokeDeclaration(id, null);
      afterWrite('Deklaracja odwołana ✓');
    } catch (e) {
      afterWrite(e instanceof ApiError ? e.message : 'Nie udało się odwołać deklaracji.');
    }
  };

  const runDelete = async () => {
    try {
      await deleteItem(item.id);
      setConfirmDelete(false);
      onBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się usunąć.');
      setConfirmDelete(false);
    }
  };

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć do listy">‹</button>
        <h3>{TYPE_ICON[item.type]} {item.name}</h3>
        {isAdmin ? (
          <>
            <button type="button" className="ic" onClick={() => setEditing(true)} aria-label="Edytuj pozycję">✎</button>
            <button type="button" className="ic" onClick={() => setSheet('label')} aria-label="Etykieta pozycji — wydrukuj kod QR">🏷</button>
          </>
        ) : (
          <span />
        )}
      </header>

      <section className="content">
        <p>
          <span className={`badge ${STATUS_BADGE[item.lifecycleStatus]}`}>{STATUS_LABEL[item.lifecycleStatus]}</span>{' '}
          <span className="badge b-gray">{TYPE_LABEL[item.type]}</span>
        </p>

        {error && <p className="field-err">{error}</p>}

        <div className="panel">
          <h4>Atrybuty</h4>
          <div className="kv">
            {item.serialNumber && <div><dt>Nr seryjny</dt><dd>{item.serialNumber}</dd></div>}
            {item.description && <div><dt>Opis</dt><dd>{item.description}</dd></div>}
            {item.attributes.map((a) => (
              <div key={a.attributeDefId}>
                <dt>{a.name}</dt>
                <dd>{fmtAttrValue(a.dataType, a.value)}</dd>
              </div>
            ))}
            {item.notes && <div><dt>Notatki</dt><dd>{item.notes}</dd></div>}
          </div>
        </div>

        <div className="panel">
          <h4>Przechowywanie</h4>
          <div className="kv">
            <div><dt>Magazyn</dt><dd>🏬 {WAREHOUSE_LABEL[item.warehouse]}</dd></div>
            <div><dt>Osoba</dt><dd>{item.assignedMemberName ? `👤 ${item.assignedMemberName}` : '—'}</dd></div>
            {item.nextServiceDate && <div><dt>Następny serwis</dt><dd>🔧 {fmtDate(item.nextServiceDate)}</dd></div>}
            {openAssignment && <div><dt>Od</dt><dd>{fmtDate(openAssignment.assignedAt)}</dd></div>}
          </div>
        </div>

        <div className="panel">
          <h4>Posiadanie poza magazynem</h4>
          <p className="hint">Deklaracja to fakt terenowy — nie zmienia magazynu ani statusu (B14).</p>
          {declarations.length === 0 && <p className="hint">Brak deklaracji — pozycja figuruje w rejestrze magazynowym.</p>}
          {declarations.map((d) => (
            <div className="srow" key={d.id} style={{ cursor: 'default' }}>
              <span>
                <b>{d.type === 'PRIVATE' ? '🏠' : '🧳'} {d.holderName ?? d.locationText}</b>
                <span className="muted">
                  {' '}{DECLARATION_TYPE_LABEL[d.type]} · od {fmtDate(d.createdAt)}
                  {d.declaredByName ? ` · zgłosił(a): ${d.declaredByName}` : ''}
                </span>
                {d.note && <span className="muted"> · {d.note}</span>}
                {d.status === 'REVOKED' && (
                  <span className="muted">
                    <br />
                    odwołana {d.revokedAt ? fmtDate(d.revokedAt) : ''}{d.revokedNote ? ` — ${d.revokedNote}` : ''}
                  </span>
                )}
              </span>
              {canRevokeDeclaration(band.role, d) ? (
                <button type="button" className="btn sm danger" onClick={() => void revokeDecl(d.id)}>Odwołaj ✕</button>
              ) : (
                <span className={`badge ${d.status === 'ACTIVE' ? 'b-ok' : 'b-gray'}`}>{DECLARATION_STATUS_LABEL[d.status]}</span>
              )}
            </div>
          ))}
          {canDeclare && (
            <button type="button" className="btn block" onClick={() => setSheet('declare')}>
              Deklaruj posiadanie 🏠
            </button>
          )}
          {!canDeclare && activeDecl === null && item.lifecycleStatus === 'ASSIGNED' && (
            <p className="hint">Pozycja przypisana formalnie — najpierw zwrot, potem deklaracja (B14).</p>
          )}
        </div>

        <div className="panel">
          <h4>Historia przydziałów</h4>
          {assignments.length === 0 && <p className="hint">Brak — pozycja nigdy nie była przypisana.</p>}
          {assignments.map((a) => (
            <div className="srow" key={a.id} style={{ cursor: 'default' }}>
              <span>
                <b>👤 {a.memberName}</b>
                <span className="muted">
                  {' '}{fmtDate(a.assignedAt)} → {a.returnedAt ? fmtDate(a.returnedAt) : 'teraz'}
                  {a.returnedState ? ` · zwrot: ${STATUS_LABEL[a.returnedState]}` : ''}
                </span>
                {(a.assignNote || a.returnNote) && (
                  <span className="muted"> · {a.assignNote ?? ''}{a.returnNote ? ` / zwrot: ${a.returnNote}` : ''}</span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h4>Historia przeniesień</h4>
          {transfers.length === 0 && <p className="hint">Brak przeniesień magazynowych.</p>}
          {transfers.map((t) => (
            <div className="srow" key={t.id} style={{ cursor: 'default' }}>
              <span>
                <b>🏬 {WAREHOUSE_LABEL[t.fromWarehouse]} → {WAREHOUSE_LABEL[t.toWarehouse]}</b>
                <span className="muted"> {fmtDateTime(t.transferredAt)}{t.note ? ` · ${t.note}` : ''}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h4>Historia serwisów</h4>
          {services.length === 0 && <p className="hint">Brak — pozycja nigdy nie była w serwisie.</p>}
          {services.map((s) => (
            <div className="srow" key={s.id} style={{ cursor: 'default' }}>
              <span>
                <b>🔧 {s.completedAt ? fmtDate(s.sentAt) : 'w serwisie'}</b>
                <span className="muted">
                  {s.sentNote ? ` · ${s.sentNote}` : ''}
                  {s.completedAt ? ` → zakończono ${fmtDate(s.completedAt)}` : ''}
                  {s.completedNote ? ` · ${s.completedNote}` : ''}
                  {s.nextServiceDate ? ` · następny: ${fmtDate(s.nextServiceDate)}` : ''}
                </span>
                {s.completedAt === null && <span className="badge b-warn"> otwarty</span>}
              </span>
            </div>
          ))}
        </div>

        {isAdmin ? (
          <div className="btnrow" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={hasHistory}
              title={hasHistory ? 'Pozycja z historią jest nieusuwalna (baza dowodów)' : undefined}
            >
              🗑 Usuń{hasHistory ? ' (ma historię)' : ''}
            </button>
          </div>
        ) : (
          <p className="hint">MEMBER: podgląd bez zapisów (B8) — przydziałem i magazynem zarządza administrator.</p>
        )}
      </section>

      {/* pinned save-action zone (makieta §04) */}
      {isAdmin && (canAssign || canUnassign || canTransfer) && (
        <div className="actionbar" role="toolbar" aria-label="Akcje pozycji">
          {canAssign && <button type="button" className="btn primary" onClick={() => setSheet('assign')}>Przypisz… ↦</button>}
          {canUnassign && <button type="button" className="btn" onClick={() => setSheet('unassign')}>Zwróć ✋</button>}
          {canTransfer && <button type="button" className="btn ghost" onClick={() => setSheet('transfer')}>Transfer 🏬</button>}
          {canSendToService && <button type="button" className="btn ghost" onClick={() => setSheet('service')}>Do serwisu 🔧</button>}
          {canCompleteService && <button type="button" className="btn ghost" onClick={() => setSheet('serviceComplete')}>Zakończ serwis ✅</button>}
        </div>
      )}

      {sheet === 'assign' && (
        <AssignSheet band={band} item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Przypisano ✓'); }} />
      )}
      {sheet === 'unassign' && (
        <UnassignSheet item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Zwrócono ✓'); }} />
      )}
      {sheet === 'transfer' && (
        <TransferSheet item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Przeniesiono ✓'); }} />
      )}
      {sheet === 'service' && (
        <ServiceSheet item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Wysłano do serwisu ✓'); }} />
      )}
      {sheet === 'serviceComplete' && (
        <ServiceCompleteSheet item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Serwis zamknięty ✓'); }} />
      )}
      {sheet === 'label' && (
        <LabelSheet band={band} item={item} onClose={() => setSheet(null)} />
      )}
      {sheet === 'declare' && (
        <DeclarationSheet band={band} item={item} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterWrite('Zadeklarowano ✓'); }} />
      )}

      {confirmDelete && (
        <div className="dim center" role="dialog" aria-label="Potwierdź usunięcie">
          <div className="modal">
            <b>Usunąć „{item.name}"?</b>
            <span>Pozycja bez historii jest usuwana trwale. Pozycje z historią są nieusuwalne (dowody F3).</span>
            <div className="row">
              <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(false)}>Anuluj</button>
              <button type="button" className="btn sm danger" onClick={runDelete}>Usuń</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">{toast}<button type="button" onClick={() => setToast(null)}>✕</button></div>
      )}

      <Tabs active="ekwipunek" onPulpit={() => (onTab ? onTab('pulpit') : onBack())} onEkwipunek={onBack} onLiczenie={() => onTab?.('liczenie')} onMoje={() => onTab?.('moje')} />
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ sheets */

/**
 * Etykieta pozycji (v1.x #6): kod `WI-{band}-{id}` jako QR + tekst — naklejka
 * na instrumentie. Druk = izolowany arkusz (.print-label w styles.css), format
 * pasuje do standardowych etykiet ~50×25 mm z marginesem. ADMIN-only (strefa
 * akcyjna; MEMBER widzi dane bez strefy działań).
 */
function LabelSheet({ band, item, onClose }: {
  band: BandView;
  item: ItemView;
  onClose: () => void;
}) {
  const code = itemCode(band.bandId, item.id);
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(code, { width: 560, margin: 1 })
      .then((u) => { if (alive) setQr(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [code]);

  const printLabel = () => {
    document.body.classList.add('print-label');
    const cleanup = () => {
      document.body.classList.remove('print-label');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => window.print(), 120);
    // zabezpieczenie: some engines don't fire afterprint — class must not linger,
    // a to by blokowało ekran (wszystko poza etyketą ukryte w @media print)
    window.setTimeout(cleanup, 60_000);
  };

  return (
    <Sheet title="Etykieta pozycji" onClose={onClose}>
      <div className="label-card">
        <div className="label-head">
          <b>{TYPE_ICON[item.type]} {item.name}</b>
          <span>{TYPE_LABEL[item.type]}{item.serialNumber ? ` · s/n ${item.serialNumber}` : ''}</span>
          <span className="muted">Zespół: {band.name}</span>
        </div>
        {qr && <img className="label-qr" src={qr} alt={`Kod QR etykiety ${code}`} width={172} height={172} />}
        {failed && <p className="hint err">Nie udało się wygenerować QR — użyj wartości kodu poniżej.</p>}
        <code className="label-code">{code}</code>
        <p className="hint label-note">
          Naklej na instrument. Odczyt w apce: Ekwipunek → 📷 (aparat albo wpis ręczny).
        </p>
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={onClose}>Zamknij</button>
          <button type="button" className="btn primary sm" onClick={printLabel}>🖨 Drukuj etykietę</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Screen 05: full-screen member picker from the WM roster + held counters. */
function AssignSheet({ band, item, onClose, onDone }: {
  band: BandView;
  item: ItemView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<BandMember[]>([]);
  const [held, setHeld] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<BandMember | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBandMembers(band.bandId).then((m) => setMembers(m.filter((x) => x.active))).catch(() => setMembers([]));
    // Held counters: one ASSIGNED-list call, counted client-side per member.
    listItems(band.bandId, { status: 'ASSIGNED' })
      .then((rows) => {
        const out: Record<number, number> = {};
        for (const r of rows) if (r.assignedMemberId !== null) out[r.assignedMemberId] = (out[r.assignedMemberId] ?? 0) + 1;
        setHeld(out);
      })
      .catch(() => setHeld({}));
  }, [band.bandId]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await assignItem(item.id, { memberId: picked.memberId, note: note.trim() || null });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się przypisać.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Przypisz do osoby" onClose={onClose}>
      <p className="hint">Członkowie bandu — dane z windband-manager (B10).</p>
      {error && <p className="field-err">{error}</p>}
      <div className="sheetlist">
        {members.map((m) => (
          <button
            type="button"
            key={m.memberId}
            className="srow"
            style={picked?.memberId === m.memberId ? { color: 'var(--primary)' } : undefined}
            onClick={() => setPicked(m)}
          >
            <span>
              <b>👤 {m.firstName} {m.lastName}</b>
              <span className="muted"> {(m.expectedSet?.[0]?.instrument ?? '—')} · trzyma {held[m.memberId] ?? 0} poz.</span>
            </span>
            {picked?.memberId === m.memberId && <span aria-hidden>✓</span>}
          </button>
        ))}
        {members.length === 0 && <p className="hint">Roster WM właśnie się wczytuje…</p>}
      </div>
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <button type="button" className="btn primary block" disabled={!picked || busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : `Przypisz${picked ? ` — ${picked.firstName} ${picked.lastName}` : ''} · stan: Przypisany`}
      </button>
    </Sheet>
  );
}

/** Screen 17: return with the forced end-state chips (server: AVAILABLE / IN_SERVICE / LOST). */
function UnassignSheet({ item, onClose, onDone }: { item: ItemView; onClose: () => void; onDone: () => void }) {
  const [state, setState] = useState<'AVAILABLE' | 'IN_SERVICE' | 'LOST'>('AVAILABLE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await unassignItem(item.id, { state, note: note.trim() || null });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się przyjąć zwrotu.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Zwrot: ${item.name}`} onClose={onClose}>
      <p className="hint">{item.serialNumber ? `SN ${item.serialNumber} · ` : ''}przydział zakończy się natychmiast po zapisie.</p>
      {error && <p className="field-err">{error}</p>}
      <div className="chips">
        <button type="button" className={`chip oth${state === 'AVAILABLE' ? ' sel' : ''}`} onClick={() => setState('AVAILABLE')}>✓ sprawny</button>
        <button type="button" className={`chip oth${state === 'IN_SERVICE' ? ' sel' : ''}`} onClick={() => setState('IN_SERVICE')}>⚠ uszkodzony → serwis</button>
        <button type="button" className={`chip oth${state === 'LOST' ? ' sel' : ''}`} onClick={() => setState('LOST')}>✗ zgubiony</button>
      </div>
      <label className="field">
        Notatka (opcjonalna)
        {state !== 'AVAILABLE' && <span className="hint warn">rekomendowana — dane do F4 serwisów w v1.x</span>}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <button type="button" className="btn primary block" disabled={busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : 'Zatwierdź zwrot'}
      </button>
    </Sheet>
  );
}

/** B6: warehouse move — history = fact, one movement per call. */
function TransferSheet({ item, onClose, onDone }: { item: ItemView; onClose: () => void; onDone: () => void }) {
  const options = (['MAIN', 'SERVICE', 'ARCHIVE'] as const).filter((w) => w !== item.warehouse);
  const [to, setTo] = useState<WarehouseType | null>(options[0] ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      await transferItem(item.id, { to, note: note.trim() || null });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się przenieść.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Transfer: ${item.name}`} onClose={onClose}>
      <p className="hint">Obecnie 🏬 {WAREHOUSE_LABEL[item.warehouse]} — wybierz magazyn docelowy.</p>
      {error && <p className="field-err">{error}</p>}
      <div className="chips">
        {options.map((w) => (
          <button type="button" key={w} className={`chip oth${to === w ? ' sel' : ''}`} onClick={() => setTo(w)}>
            🏬 {WAREHOUSE_LABEL[w]}
          </button>
        ))}
      </div>
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <button type="button" className="btn primary block" disabled={!to || busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : to ? `Przenieś do: ${WAREHOUSE_LABEL[to]}` : 'Przenieś'}
      </button>
    </Sheet>
  );
}

/** F4 sendToService: AVAILABLE → IN_SERVICE; notatka trafia do wiersza-dowodu. */
function ServiceSheet({ item, onClose, onDone }: { item: ItemView; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendItemToService(item.id, { note: note.trim() || null });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się wysłać do serwisu.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Do serwisu: ${item.name}`} onClose={onClose}>
      <p className="hint">Pozycja trafi do statusu „W serwisie” — powrót przez „Zakończ serwis”.</p>
      {error && <p className="field-err">{error}</p>}
      <label className="field">Usterka / zlecenie (opcjonalne)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <button type="button" className="btn primary block" disabled={busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : 'Wyślij do serwisu 🔧'}
      </button>
    </Sheet>
  );
}

/**
 * F4 completeService: IN_SERVICE → AVAILABLE. nextServiceDate writes the plan
 * shown in „Następny serwis” and drives the „Do serwisu” quick list; leaving it
 * empty CLEARS the previous plan (server semantics, IT-covered).
 */
function ServiceCompleteSheet({ item, onClose, onDone }: { item: ItemView; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeItemService(item.id, {
        note: note.trim() || null,
        nextServiceDate: nextDate || null,
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się zamknąć serwisu.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Zakończ serwis: ${item.name}`} onClose={onClose}>
      <p className="hint">Powrót do statusu „W magazynie”. Opcjonalnie wyznacz kolejny termin serwisu.</p>
      {error && <p className="field-err">{error}</p>}
      <label className="field">Co zrobiono (opcjonalne)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <label className="field">Następny serwis (opcjonalnie)
        <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
      </label>
      <button type="button" className="btn primary block" disabled={busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : 'Zamknij serwis ✅'}
      </button>
    </Sheet>
  );
}

/** B14: bottom sheet for a possession declaration — any member may report.
 * Mirrors DeclarationCommandService validation (declarant + holder from the
 * live roster, location required for EXTERNAL). */
function DeclarationSheet({ band, item, onClose, onDone }: {
  band: BandView;
  item: ItemView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<BandMember[]>([]);
  const [type, setType] = useState<DeclarationType>('PRIVATE');
  const [declarant, setDeclarant] = useState<BandMember | null>(null);
  const [holder, setHolder] = useState<BandMember | null>(null);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBandMembers(band.bandId).then((m) => setMembers(m.filter((x) => x.active))).catch(() => setMembers([]));
  }, [band.bandId]);

  const submit = async () => {
    const formErr = validateDeclarationForm({
      type,
      holderMemberId: holder?.memberId ?? null,
      locationText: location,
      note,
      declaredByMemberId: declarant?.memberId ?? null,
    });
    if (formErr) {
      setError(formErr);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createDeclaration(band.bandId, {
        itemId: item.id,
        type,
        holderMemberId: holder?.memberId ?? null,
        locationText: type === 'EXTERNAL' ? location.trim() : null,
        note: note.trim() || null,
        declaredByMemberId: declarant?.memberId ?? 0,
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się złożyć deklaracji.');
      setBusy(false);
    }
  };

  const invalid = validateDeclarationForm({
    type,
    holderMemberId: holder?.memberId ?? null,
    locationText: location,
    note,
    declaredByMemberId: declarant?.memberId ?? null,
  }) !== null;

  return (
    <Sheet title="Deklaracja posiadania" onClose={onClose}>
      <p className="hint">
        {item.name} — fakt terenowy, bez zmiany magazynu ani statusu (B14). Deklarację może złożyć każdy członek.
      </p>
      {error && <p className="field-err">{error}</p>}
      <div className="chips" aria-label="Rodzaj deklaracji">
        {(['PRIVATE', 'EXTERNAL'] as const).map((t) => (
          <button
            type="button"
            key={t}
            className={`chip${type === t ? ' on' : ''}`}
            onClick={() => setType(t)}
          >
            {t === 'PRIVATE' ? '🏠 prywatnie' : '🧳 zewnętrzne'}
          </button>
        ))}
      </div>
      <label className="field">Kto składa deklarację *
        <select value={declarant?.memberId ?? ''} onChange={(e) => setDeclarant(members.find((m) => m.memberId === Number(e.target.value)) ?? null)}>
          <option value="">— wybierz —</option>
          {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.firstName} {m.lastName}</option>)}
        </select>
      </label>
      {type === 'PRIVATE' ? (
        <label className="field">U kogo jest pozycja *
          <select value={holder?.memberId ?? ''} onChange={(e) => setHolder(members.find((m) => m.memberId === Number(e.target.value)) ?? null)}>
            <option value="">— wybierz —</option>
            {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.firstName} {m.lastName}</option>)}
          </select>
        </label>
      ) : (
        <>
          <label className="field">Opis miejsca *
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200}
              placeholder="np. sala GOK, szafa 3" />
          </label>
          <label className="field">Opiekun (opcjonalny)
            <select value={holder?.memberId ?? ''} onChange={(e) => setHolder(members.find((m) => m.memberId === Number(e.target.value)) ?? null)}>
              <option value="">— brak —</option>
              {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.firstName} {m.lastName}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <button type="button" className="btn primary block" disabled={invalid || busy} onClick={submit}>
        {busy ? 'Zapisywanie…' : 'Zadeklaruj ✓'}
      </button>
    </Sheet>
  );
}
