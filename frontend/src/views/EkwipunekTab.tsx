import { useEffect, useMemo, useState } from 'react';
import { listBandMembers, type BandMember, type BandView } from '../api/bands';
import {
  listAttributeDefs,
  listItems,
  type AttributeDefView,
  type ItemSummaryView,
} from '../api/inventory';
import {
  STATUS_LABEL,
  TYPE_LABEL,
  TYPE_ICON,
  WAREHOUSE_LABEL,
  activeChipCount,
  emptyFilters,
  filterSummary,
  toQuery,
  type ItemFilterState,
} from '../ekwipunek/filters';
import Phone from '../ui/Phone';
import Sheet from '../ui/Sheet';
import { Tabs } from './LiczenieTab';
import ItemDetail from './ItemDetail';
import ItemForm from './ItemForm';
import MemberPicture from './MemberPicture';

interface Props {
  band: BandView;
  onBackToPulpit: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
  /** deep-link from the Pulpit tile: open the create form immediately */
  startCreate?: boolean;
  onCreateConsumed?: () => void;
}

type Screen =
  | { kind: 'list' }
  | { kind: 'detail'; itemId: number; focusForm?: boolean }
  | { kind: 'create' }
  | { kind: 'picture'; memberId: number };

/**
 * Ekwipunek tab — screens 03–07 of the frozen mockup: item list with
 * bottom-sheet filters (typ/status/magazyn/osoba/atrybut, P0 §3.1), FAB
 * visible only to ADMIN (B8), full CRUD drill-down. MEMBER gets a read-only
 * list and a read-only detail (no sheets, no FAB).
 */
export default function EkwipunekTab({ band, onBackToPulpit, onTab, startCreate = false, onCreateConsumed }: Props) {
  const [screen, setScreen] = useState<Screen>(() => (startCreate ? { kind: 'create' } : { kind: 'list' }));

  useEffect(() => {
    if (startCreate) onCreateConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (screen.kind === 'detail') {
    return (
      <ItemDetail
        band={band}
        itemId={screen.itemId}
        focusForm={screen.focusForm === true}
        onBack={() => setScreen({ kind: 'list' })}
        onTab={onTab}
      />
    );
  }
  if (screen.kind === 'create') {
    return (
      <ItemForm
        band={band}
        onDone={() => setScreen({ kind: 'list' })}
        onCancel={() => setScreen({ kind: 'list' })}
        onTab={onTab}
      />
    );
  }
  if (screen.kind === 'picture') {
    return (
      <MemberPicture
        bandId={band.bandId}
        memberId={screen.memberId}
        onBack={() => setScreen({ kind: 'list' })}
        onOpenItem={(id) => setScreen({ kind: 'detail', itemId: id })}
      />
    );
  }
  return <ItemList
    band={band}
    onOpen={(id) => setScreen({ kind: 'detail', itemId: id })}
    onCreate={() => setScreen({ kind: 'create' })}
    onOpenPicture={(memberId) => setScreen({ kind: 'picture', memberId })}
    onBackToPulpit={onBackToPulpit}
    onTab={onTab}
  />;
}

/* ------------------------------------------------------------------ list */

function ItemList({
  band,
  onOpen,
  onCreate,
  onOpenPicture,
  onBackToPulpit,
  onTab,
}: {
  band: BandView;
  onOpen: (id: number) => void;
  onCreate: () => void;
  onOpenPicture: (memberId: number) => void;
  onBackToPulpit: () => void;
  onTab?: Props['onTab'];
}) {
  const isAdmin = band.role === 'ADMIN';
  const [filters, setFilters] = useState<ItemFilterState>(emptyFilters);
  const [sheet, setSheet] = useState<null | 'type' | 'status' | 'warehouse' | 'person' | 'attribute'>(null);
  const [items, setItems] = useState<ItemSummaryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [defs, setDefs] = useState<AttributeDefView[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    listItems(band.bandId, toQuery(filters), ac.signal)
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((e) => setError((e as Error).message || 'Nie udało się pobrać listy.'));
    return () => ac.abort();
  }, [band.bandId, filters]);

  // Roster + defs are needed by filter sheets only; one lazy fetch each.
  useEffect(() => {
    if (sheet === 'person' && members.length === 0) {
      listBandMembers(band.bandId).then((m) => setMembers(m.filter((x) => x.active))).catch(() => setMembers([]));
    }
    if (sheet === 'attribute' && defs.length === 0) {
      listAttributeDefs(band.bandId).then((d) => setDefs(d.filter((x) => x.active))).catch(() => setDefs([]));
    }
  }, [sheet, band.bandId, members.length, defs.length]);

  const personName = useMemo(() => {
    if (filters.assignedMemberId == null) return undefined;
    const m = members.find((x) => x.memberId === filters.assignedMemberId);
    return m ? `${m.firstName} ${m.lastName}` : undefined;
  }, [members, filters.assignedMemberId]);

  const attributeName = useMemo(() => {
    if (filters.attributeDefId == null) return undefined;
    return defs.find((d) => d.id === filters.attributeDefId)?.name;
  }, [defs, filters.attributeDefId]);

  const active = activeChipCount(filters);
  const rows = items ?? [];

  return (
    <Phone>
      <header className="appbar">
        <button type="button" className="back" onClick={onBackToPulpit} aria-label="Wróć">‹</button>
        <h3>Ekwipunek</h3>
        <span className={`badge ${isAdmin ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        <input
          className="search"
          type="search"
          placeholder="Szukaj: nazwa lub nr seryjny…"
          aria-label="Szukaj pozycji"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />

        <div className="chips" role="group" aria-label="Filtry">
          <FilterChip label="Typ" sel={!!filters.type} hint={filters.type ? TYPE_LABEL[filters.type] : undefined} onClick={() => setSheet('type')} />
          <FilterChip label="Status" sel={!!filters.status} hint={filters.status ? STATUS_LABEL[filters.status] : undefined} onClick={() => setSheet('status')} />
          <FilterChip label="Magazyn" sel={!!filters.warehouse} hint={filters.warehouse ? WAREHOUSE_LABEL[filters.warehouse] : undefined} onClick={() => setSheet('warehouse')} />
          <FilterChip label="Osoba" sel={filters.assignedMemberId !== null} onClick={() => setSheet('person')} />
          <FilterChip label="Atrybut" sel={filters.attributeDefId !== null} onClick={() => setSheet('attribute')} />
          {active > 0 && (
            <button type="button" className="chip" onClick={() => setFilters(emptyFilters())} aria-label="Wyczyść filtry">✕ wyczyść</button>
          )}
        </div>

        <p className="hint" aria-live="polite">
          {error ? error : `${items?.length ?? '…'} pozycji · ${filterSummary(filters, personName, attributeName)}`}
        </p>

        {items && rows.length === 0 && (
          <div className="state">
            <span className="state-ico" aria-hidden>📦</span>
            <b>Brak pozycji dla tych filtrów</b>
            <span>Zmień filtry albo dodaj pierwszą pozycję{isAdmin ? ' przyciskiem ＋' : ''}.</span>
          </div>
        )}

        <div className="panel" style={{ padding: '2px 14px' }}>
          {rows.map((it) => (
            <button type="button" className="srow" key={it.id} onClick={() => onOpen(it.id)} aria-label={`Pozycja ${it.name}`}>
              <span>
                <b>{TYPE_ICON[it.type]} {it.name}</b>
                <span className="muted">
                  {' '}
                  {it.serialNumber ? `SN ${it.serialNumber} · ` : ''}
                  {it.assignedMemberName ? `👤 ${it.assignedMemberName} · ` : ''}
                  {WAREHOUSE_LABEL[it.warehouse]}
                </span>
              </span>
              <span className={`badge ${it.lifecycleStatus === 'ASSIGNED' ? 'b-primary' : it.lifecycleStatus === 'AVAILABLE' ? 'b-ok' : 'b-gray'}`}>
                {STATUS_LABEL[it.lifecycleStatus]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {isAdmin && (
        <button type="button" className="fab" onClick={onCreate} aria-label="Nowa pozycja">＋</button>
      )}

      {sheet === 'type' && (
        <Sheet title="Typ pozycji" onClose={() => setSheet(null)}>
          <OptionRow active={filters.type === ''} label='Wszystkie typy' onClick={() => { setFilters((f) => ({ ...f, type: '' })); setSheet(null); }} />
          {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
            <OptionRow key={t} active={filters.type === t} label={`${TYPE_ICON[t]} ${TYPE_LABEL[t]}`} onClick={() => { setFilters((f) => ({ ...f, type: t, attributeDefId: null, attributeValue: '' })); setSheet(null); }} />
          ))}
        </Sheet>
      )}

      {sheet === 'status' && (
        <Sheet title="Status życia" onClose={() => setSheet(null)}>
          <OptionRow active={filters.status === ''} label="Wszystkie statusy" onClick={() => { setFilters((f) => ({ ...f, status: '' })); setSheet(null); }} />
          {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
            <OptionRow key={s} active={filters.status === s} label={STATUS_LABEL[s]} onClick={() => { setFilters((f) => ({ ...f, status: s })); setSheet(null); }} />
          ))}
          {/* F4: quick-list of items with a due service plan (server-side rule) */}
          <OptionRow
            active={filters.serviceDue}
            label="🔧 Do serwisu (minął termin)"
            onClick={() => {
              setFilters((f) => ({ ...f, serviceDue: !f.serviceDue, status: '' }));
              setSheet(null);
            }}
          />
        </Sheet>
      )}

      {sheet === 'warehouse' && (
        <Sheet title="Magazyn" onClose={() => setSheet(null)}>
          <OptionRow active={filters.warehouse === ''} label="Wszystkie magazyny" onClick={() => { setFilters((f) => ({ ...f, warehouse: '' })); setSheet(null); }} />
          {(Object.keys(WAREHOUSE_LABEL) as (keyof typeof WAREHOUSE_LABEL)[]).map((w) => (
            <OptionRow key={w} active={filters.warehouse === w} label={`🏬 ${WAREHOUSE_LABEL[w]}`} onClick={() => { setFilters((f) => ({ ...f, warehouse: w })); setSheet(null); }} />
          ))}
        </Sheet>
      )}

      {sheet === 'person' && (
        <Sheet title="Przypisane do osoby" onClose={() => setSheet(null)}>
          <OptionRow active={filters.assignedMemberId === null} label="Ktokolwiek / nikt" onClick={() => { setFilters((f) => ({ ...f, assignedMemberId: null })); setSheet(null); }} />
          {members.map((m) => (
            <OptionRow
              key={m.memberId}
              active={filters.assignedMemberId === m.memberId}
              label={`👤 ${m.firstName} ${m.lastName}`}
              onClick={() => { setFilters((f) => ({ ...f, assignedMemberId: m.memberId })); setSheet(null); }}
            />
          ))}
          {members.length === 0 && <p className="hint">Roster WM właśnie się wczytuje…</p>}
          {filters.assignedMemberId != null && (
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => {
                const id = filters.assignedMemberId as number;
                setSheet(null);
                onOpenPicture(id);
              }}
            >
              👁 Pełny obraz: {personName}
            </button>
          )}
        </Sheet>
      )}

      {sheet === 'attribute' && (
        <AttributeSheet
          defs={defs}
          current={filters}
          onPick={(defId, value) => {
            setFilters((f) => ({ ...f, attributeDefId: defId, attributeValue: value }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      <Tabs active="ekwipunek" onPulpit={() => (onTab ? onTab('pulpit') : onBackToPulpit())} onEkwipunek={() => undefined} onLiczenie={() => onTab?.('liczenie')} onMoje={() => onTab?.('moje')} />
    </Phone>
  );
}

function FilterChip({ label, sel, hint, onClick }: { label: string; sel: boolean; hint?: string; onClick: () => void }) {
  return (
    <button type="button" className={`chip${sel ? ' sel' : ''}`} onClick={onClick} aria-pressed={sel}>
      {hint ?? label} ▾
    </button>
  );
}

function OptionRow({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`srow${active ? ' sel' : ''}`} onClick={onClick} style={active ? { color: 'var(--primary)' } : undefined}>
      <b>{label}</b>
      {active && <span aria-hidden>✓</span>}
    </button>
  );
}

/** Attribute filter: pick a definition, then optionally narrow to a value.
 * SELECT/MULTI/BOOLEAN defs show their option chips; free types get a text box. */
function AttributeSheet({
  defs,
  current,
  onPick,
  onClose,
}: {
  defs: AttributeDefView[];
  current: ItemFilterState;
  onPick: (defId: number | null, value: string) => void;
  onClose: () => void;
}) {
  const [defId, setDefId] = useState<number | null>(current.attributeDefId);
  const [text, setText] = useState(current.attributeValue);
  const def = defs.find((d) => d.id === defId);

  return (
    <Sheet title="Filtr: atrybut" onClose={onClose}>
      {defs.length === 0 && <p className="hint">Brak definicji atrybutów — dodaj je najpierw jako ADMIN.</p>}
      {defId === null && defs.map((d) => (
        <OptionRow key={d.id} active={false} label={`${d.name} (${d.itemType})`} onClick={() => setDefId(d.id)} />
      ))}
      {def && (
        <>
          <p className="hint">Atrybut: <b>{def.name}</b> — wybierz wartość lub zostaw „dowolna”.</p>
          <OptionRow active={text === ''} label="Dowolna wartość (ustawiony)" onClick={() => onPick(def.id, '')} />
          {(def.dataType === 'SELECT' || def.dataType === 'MULTI') &&
            def.options.map((o) => (
              <OptionRow key={o} active={text === o} label={o} onClick={() => onPick(def.id, o)} />
            ))}
          {def.dataType === 'BOOLEAN' && (
            <>
              <OptionRow active={text === 'true'} label="✓ tak" onClick={() => onPick(def.id, 'true')} />
              <OptionRow active={text === 'false'} label="✗ nie" onClick={() => onPick(def.id, 'false')} />
            </>
          )}
          {(def.dataType === 'TEXT' || def.dataType === 'NUMBER' || def.dataType === 'DATE') && (
            <div className="btnrow">
              <input className="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={def.dataType === 'DATE' ? 'RRRR-MM-DD' : 'wartość'} aria-label={`Wartość atrybutu ${def.name}`} />
              <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => onPick(def.id, text.trim())}>Filtruj</button>
            </div>
          )}
          <button type="button" className="btn sm ghost" onClick={() => setDefId(null)}>‹ Inny atrybut</button>
        </>
      )}
    </Sheet>
  );
}
