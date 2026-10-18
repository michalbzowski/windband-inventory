import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { BandView } from '../api/bands';
import {
  createAttributeDef,
  deactivateAttributeDef,
  listAttributeDefs,
  updateAttributeDef,
  type AttributeDefView,
  type ItemType,
} from '../api/inventory';
import { TYPE_ICON, TYPE_LABEL } from '../ekwipunek/filters';
import {
  DATA_TYPES,
  DATA_TYPE_LABEL,
  draftFromDef,
  draftToPayload,
  emptyDefDraft,
  needsOptions,
  optionsOfParent,
  parentCandidates,
  validateDefDraft,
  type DefDraft,
} from '../ekwipunek/defsForm';
import AppFrame from '../ui/AppFrame';
import Sheet from '../ui/Sheet';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  onBack: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
}

/**
 * Ekran ADMIN „Definicje atrybutów” (B6) — brakujące UI dla istniejącego API
 * CRUD /api/inventory/attribute-defs. Definicje per zespół i per typ pozycji
 * generują formularz „Nowa pozycja” i filtr „Atrybut”. DELETE = wyłączenie
 * (history-safe): wyłączona definicja znika z formularzy/filtrów, a wartości
 * przy pozycjach zostają. Przywracanie: PUT {active:true}.
 */
export default function AttributeDefsAdmin({ band, onBack, onTab }: Props) {
  const [defs, setDefs] = useState<AttributeDefView[] | null>(null);
  const [type, setType] = useState<ItemType>('INSTRUMENT');
  const [sheet, setSheet] = useState<{ mode: 'create' } | { mode: 'edit'; def: AttributeDefView } | null>(null);
  const [draft, setDraft] = useState<DefDraft>(emptyDefDraft());
  const [errors, setErrors] = useState<Partial<Record<keyof DefDraft, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listAttributeDefs(band.bandId, undefined, true)
      .then(setDefs)
      .catch((e: unknown) => {
        setDefs([]);
        setApiError(e instanceof ApiError ? e.message : 'Nie udało się pobrać definicji');
      });
  }, [band.bandId]);

  useEffect(() => reload(), [reload]);

  const visible = (defs ?? [])
    .filter((d) => d.itemType === type)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pl'));

  const openCreate = () => {
    setDraft(emptyDefDraft());
    setErrors({});
    setApiError(null);
    setSheet({ mode: 'create' });
  };

  const openEdit = (def: AttributeDefView) => {
    setDraft(draftFromDef(def));
    setErrors({});
    setApiError(null);
    setSheet({ mode: 'edit', def });
  };

  const upsert = (view: AttributeDefView) =>
    setDefs((prev) => {
      const rest = (prev ?? []).filter((x) => x.id !== view.id);
      return [...rest, view];
    });

  const save = async () => {
    const errs = validateDefDraft(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      if (sheet?.mode === 'create') {
        upsert(await createAttributeDef(band.bandId, draftToPayload(draft, { create: true, itemType: type })));
      } else if (sheet?.mode === 'edit') {
        upsert(await updateAttributeDef(sheet.def.id, draftToPayload(draft, { create: false, original: sheet.def })));
      }
      setSheet(null);
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Nie udało się zapisać definicji');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (def: AttributeDefView) => {
    setApiError(null);
    try {
      if (def.active) {
        await deactivateAttributeDef(def.id);
        upsert({ ...def, active: false });
      } else {
        upsert(await updateAttributeDef(def.id, { active: true }));
      }
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Nie udało się zmienić stanu definicji');
    }
  };

  const isEdit = sheet?.mode === 'edit';

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={onBack} aria-label="Wróć do listy">‹</button>
        <h3>Definicje atrybutów</h3>
        <span className={`badge ${band.role === 'ADMIN' ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        {apiError && <p className="field-err">{apiError}</p>}

        <div className="chips" role="group" aria-label="Typ pozycji">
          {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
            <button key={t} type="button" className={`chip${t === type ? ' sel' : ''}`} onClick={() => setType(t)}>
              {TYPE_ICON[t]} {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {defs === null ? (
          <p className="muted">Ładowanie…</p>
        ) : (
          <div className="panel">
            <h4>{TYPE_ICON[type]} {TYPE_LABEL[type]}</h4>
            <p className="hint">
              Formularz „Nowa pozycja” i filtr „Atrybut” generują się z tych definicji. Wyłączona definicja znika
              z formularzy, ale historyczne wartości zostają przy pozycjach.
            </p>
            <ul className="list">
              {visible.map((d) => (
                <li key={d.id}>
                  <div className="srow">
                    <span className="sr">
                      {d.name}
                      {!d.active && <> <span className="badge b-gray">wyłączony</span></>}
                      <span className="sm">
                        {DATA_TYPE_LABEL[d.dataType]} · kolejność {d.displayOrder}
                        {d.required && ' · wymagany'}
                        {d.displayInList && ' · na liście'}
                        {needsOptions(d.dataType) && ` · ${d.options.length} opcji`}
                        {d.dependsOnDefId != null && (() => {
                          const p = (defs ?? []).find((x) => x.id === d.dependsOnDefId);
                          return ` · zależy od „${p?.name ?? '?'}” = {${d.dependsOnValues.join(', ')}}`;
                        })()}
                      </span>
                    </span>
                    <span className="sa">
                      <button type="button" className="btn sm ghost" onClick={() => openEdit(d)} aria-label={`Edytuj definicję ${d.name}`}>✎</button>{' '}
                      <button
                        type="button"
                        className={`btn sm ${d.active ? 'ghost' : ''}`}
                        onClick={() => toggleActive(d)}
                        aria-label={d.active ? `Wyłącz definicję ${d.name}` : `Przywróć definicję ${d.name}`}
                      >
                        {d.active ? 'Wyłącz' : 'Przywróć'}
                      </button>
                    </span>
                  </div>
                </li>
              ))}
              {visible.length === 0 && (
                <li><p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>Brak definicji dla tego typu.</p></li>
              )}
            </ul>
          </div>
        )}

        <button type="button" className="fab" onClick={openCreate} aria-label="Nowa definicja atrybutu">＋</button>
      </section>

      <Tabs
        active="ekwipunek"
        onPulpit={() => onTab?.('pulpit')}
        onEkwipunek={onBack}
        onLiczenie={() => onTab?.('liczenie')}
        onMoje={() => onTab?.('moje')}
      />

      {sheet && (
        <Sheet
          title={sheet.mode === 'create' ? 'Nowa definicja atrybutu' : `Edycja · ${sheet.def.name}`}
          onClose={() => setSheet(null)}
        >
          <label className="field">
            Nazwa *
            <input
              value={draft.name}
              onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
              placeholder="np. Numer seryjny, Rozmiar, Materiał"
            />
          </label>
          {errors.name && <p className="field-err">{errors.name}</p>}

          <label className="field">
            Typ danych *
            <select
              value={draft.dataType}
              disabled={isEdit}
              onChange={(e) => setDraft((s) => ({ ...s, dataType: e.target.value as DefDraft['dataType'] }))}
            >
              {DATA_TYPES.map((dt) => (
                <option key={dt} value={dt}>{DATA_TYPE_LABEL[dt]}</option>
              ))}
            </select>
          </label>
          {isEdit && (
            <p className="hint">Typu danych i typu pozycji nie da się zmienić — wartości pozycji od nich zależą.</p>
          )}

          {needsOptions(draft.dataType) && (
            <label className="field">
              Opcje (po jednej w linii)
              <textarea
                value={draft.optionsText}
                onChange={(e) => setDraft((s) => ({ ...s, optionsText: e.target.value }))}
                placeholder={'granat\nczarny'}
                rows={4}
              />
            </label>
          )}
          {errors.optionsText && <p className="field-err">{errors.optionsText}</p>}

          {(() => {
            const parents = parentCandidates(defs ?? [], type, sheet.mode === 'edit' ? sheet.def.id : undefined);
            const parentOpts = optionsOfParent(defs ?? [], draft.dependsOnDefId);
            return (
              <>
                <label className="field">
                  Pokazywany tylko gdy…
                  <select
                    value={draft.dependsOnDefId}
                    onChange={(e) => setDraft((s) => ({ ...s, dependsOnDefId: e.target.value, dependsValues: [] }))}
                  >
                    <option value="">— zawsze widoczny —</option>
                    {parents.map((p) => (
                      <option key={p.id} value={String(p.id)}>zależy od „{p.name}”</option>
                    ))}
                  </select>
                </label>
                {draft.dependsOnDefId !== '' && (
                  <>
                    <span className="field">Wartości rodzica, które pokazują ten atrybut</span>
                    <div className="chips" role="group" aria-label="Wartości warunku">
                      {parentOpts.map((o) => (
                        <button
                          key={o}
                          type="button"
                          className={`chip${draft.dependsValues.includes(o) ? ' sel' : ''}`}
                          aria-pressed={draft.dependsValues.includes(o)}
                          onClick={() =>
                            setDraft((s) => ({
                              ...s,
                              dependsValues: s.dependsValues.includes(o)
                                ? s.dependsValues.filter((x) => x !== o)
                                : [...s.dependsValues, o],
                            }))}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                    {errors.dependsValues && <p className="field-err">{errors.dependsValues}</p>}
                  </>
                )}
              </>
            );
          })()}

          <label className="field">
            Kolejność wyświetlania
            <input
              value={draft.displayOrder}
              inputMode="numeric"
              onChange={(e) => setDraft((s) => ({ ...s, displayOrder: e.target.value }))}
              placeholder="pusto = 0"
            />
          </label>
          {errors.displayOrder && <p className="field-err">{errors.displayOrder}</p>}

          <label className="field">
            Wymagany przy pozycji
            <select
              value={draft.required ? '1' : '0'}
              onChange={(e) => setDraft((s) => ({ ...s, required: e.target.value === '1' }))}
            >
              <option value="0">Nie</option>
              <option value="1">Tak</option>
            </select>
          </label>
          <label className="field">
            Widoczny na liście pozycji
            <select
              value={draft.displayInList ? '1' : '0'}
              onChange={(e) => setDraft((s) => ({ ...s, displayInList: e.target.value === '1' }))}
            >
              <option value="0">Nie</option>
              <option value="1">Tak</option>
            </select>
          </label>

          <div className="abar">
            <button type="button" className="btn ghost" onClick={() => setSheet(null)} disabled={busy}>Anuluj</button>
            <button type="button" className="btn primary block" onClick={save} disabled={busy}>
              {busy ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </div>
        </Sheet>
      )}
    </AppFrame>
  );
}
