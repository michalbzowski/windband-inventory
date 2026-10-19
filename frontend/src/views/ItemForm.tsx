import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import type { BandView } from '../api/bands';
import {
  createItem,
  getItem,
  listAttributeDefs,
  updateItem,
  type AttributeDefView,
  type ItemView,
  type ItemType,
  type WarehouseType,
} from '../api/inventory';
import { TYPE_ICON, TYPE_LABEL, WAREHOUSE_LABEL } from '../ekwipunek/filters';
import {
  buildPayload,
  initialValues,
  visibleFields,
  validateFields,
  type FieldSpec,
} from '../ekwipunek/form';
import AttributeField from '../ekwipunek/AttributeField';
import AppFrame from '../ui/AppFrame';
import { Tabs } from './LiczenieTab';

interface Props {
  band: BandView;
  /** set → edit mode (PUT, type immutable — server DTO has no type field) */
  editId?: number;
  onDone: (item: ItemView) => void;
  onCancel: () => void;
  onTab?: (t: 'pulpit' | 'ekwipunek' | 'liczenie' | 'moje') => void;
}

/**
 * Two-step item form (makieta 06/07, P0 §3.1 "formularz dwustopniowy:
 * wybór typu → render def-ów"). Step 1 picks ItemType (create only); step 2
 * renders basic fields + the attribute form generated from defs per band+type
 * (B6), with inline validation mirroring server rules.
 */
export default function ItemForm({ band, editId, onDone, onCancel, onTab }: Props) {
  const isEdit = editId !== undefined;
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [type, setType] = useState<ItemType | null>(isEdit ? null : null);
  const [defs, setDefs] = useState<AttributeDefView[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [basics, setBasics] = useState({ name: '', serialNumber: '', description: '', notes: '', warehouse: 'MAIN' as WarehouseType });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<ItemView | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  const fields: FieldSpec[] = useMemo(() => visibleFields(defs, values), [defs, values]);

  // Edit: load item once → prefill everything, defs fetched for its type.
  useEffect(() => {
    if (!isEdit) return;
    getItem(editId).then((v) => {
      setItem(v);
      setType(v.type);
      setBasics({
        name: v.name,
        serialNumber: v.serialNumber ?? '',
        description: v.description ?? '',
        notes: v.notes ?? '',
        warehouse: v.warehouse,
      });
      setValues(initialValues(v.attributes));
      listAttributeDefs(band.bandId, v.type).then((d) => setDefs(d.filter((x) => x.active))).catch(() => setDefs([]));
    }).catch((e) => setServerError((e as Error).message));
  }, [isEdit, editId, band.bandId]);

  const goAttributes = (t: ItemType) => {
    setType(t);
    setStep(2);
    setServerError(null);
    listAttributeDefs(band.bandId, t)
      .then((d) => setDefs(d.filter((x) => x.active)))
      .catch(() => setDefs([]));
  };

  const submit = async () => {
    if (!type) return;
    const next: Record<string, string> = {};
    if (!basics.name.trim()) next.name = 'Nazwa jest wymagana';
    for (const [defId, msg] of Object.entries(validateFields(fields, values))) next[`a${defId}`] = msg;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // one error = scroll to its field (makieta §07)
      const firstKey = Object.keys(next)[0];
      fieldRefs.current[firstKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const payload = buildPayload(
        { ...basics, type: isEdit ? undefined : type, warehouse: isEdit ? item?.warehouse : basics.warehouse },
        fields,
        values,
      );
      const view = isEdit && item ? await updateItem(item.id, payload) : await createItem(band.bandId, payload);
      onDone(view);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Zapis nie powiódł się.');
      setBusy(false);
    }
  };

  const stepper = (
    <div className="stepper" aria-label="Kroki formularza">
      <span className={step === 1 && !isEdit ? 'st-on' : 'st-done'}>{!isEdit && step === 1 ? '1' : '✓'} Typ</span>
      <span className="line" />
      <span className={step === 2 ? 'st-on' : ''}>{step === 2 ? '2' : '·'} Atrybuty</span>
      <span className="line" />
      <span>3 Gotowe</span>
    </div>
  );

  return (
    <AppFrame>
      <header className="appbar">
        <button type="button" className="back" onClick={step === 2 && !isEdit ? () => setStep(1) : onCancel} aria-label="Wróć">‹</button>
        <h3>{isEdit ? `Edycja · ${TYPE_LABEL[type ?? 'OTHER']}` : 'Nowa pozycja'}</h3>
        <span className={`badge ${band.role === 'ADMIN' ? 'b-primary' : 'b-gray'}`}>{band.role}</span>
      </header>

      <section className="content">
        {stepper}

        {step === 1 && !isEdit && (
          <>
            <h4>Czego dotyczy pozycja? <small className="muted">(wybór typu określa formularz atrybutów)</small></h4>
            <div className="grid-tiles">
              {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
                <button type="button" key={t} className="tile" onClick={() => goAttributes(t)}>
                  <span>{TYPE_ICON[t]}</span>{TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </>
        )}

        {(step === 2 || isEdit) && (
          <>
            <label className="field">
              Nazwa *
              <input
                ref={(el) => { fieldRefs.current.name = el; }}
                value={basics.name}
                maxLength={255}
                onChange={(e) => setBasics((b) => ({ ...b, name: e.target.value }))}
                aria-invalid={!!errors.name}
              />
              {errors.name && <span className="field-err">{errors.name}</span>}
            </label>

            <label className="field">
              Nr seryjny / kod
              <input value={basics.serialNumber} maxLength={255} onChange={(e) => setBasics((b) => ({ ...b, serialNumber: e.target.value }))} />
            </label>

            {!isEdit && (
              <label className="field">
                Magazyn
                <select value={basics.warehouse} onChange={(e) => setBasics((b) => ({ ...b, warehouse: e.target.value as WarehouseType }))}>
                  {(['MAIN', 'SERVICE', 'ARCHIVE'] as WarehouseType[]).map((w) => (
                    <option key={w} value={w}>{WAREHOUSE_LABEL[w]}</option>
                  ))}
                </select>
              </label>
            )}
            {isEdit && <p className="hint">Magazyn zmienia się wyłącznie przez <b>Transfer 🏬</b> w szczegółach (B6: historia = fakt).</p>}

            <label className="field">
              Opis
              <textarea value={basics.description} onChange={(e) => setBasics((b) => ({ ...b, description: e.target.value }))} />
            </label>
            <label className="field">
              Notatki wewnętrzne
              <textarea value={basics.notes} onChange={(e) => setBasics((b) => ({ ...b, notes: e.target.value }))} />
            </label>

            {defs.length === 0 && type && (
              <p className="hint">Brak definicji atrybutów dla typu „{TYPE_LABEL[type]}" — pozycja i tak będzie zapisana.</p>
            )}

            {fields.map((f) => (
              <AttributeField
                key={f.defId}
                field={f}
                value={values[f.defId] ?? ''}
                error={errors[`a${f.defId}`]}
                inputRef={(el) => { fieldRefs.current[`a${f.defId}`] = el; }}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.defId]: v }))}
              />
            ))}

            {serverError && <p className="field-err">{serverError}</p>}
          </>
        )}
      </section>

      {(step === 2 || isEdit) && (
        <div className="actionbar" role="toolbar" aria-label="Akcje formularza">
          {!isEdit && <button type="button" className="btn ghost" onClick={() => setStep(1)} disabled={busy}>Wstecz</button>}
          <button type="button" className="btn primary block" onClick={submit} disabled={busy}>
            {busy ? 'Zapisywanie…' : isEdit ? 'Zapisz zmiany' : 'Zapisz pozycję'}
          </button>
        </div>
      )}

      <Tabs active="ekwipunek" onPulpit={() => (onTab ? onTab('pulpit') : onCancel())} onEkwipunek={onCancel} onLiczenie={() => onTab?.('liczenie')} onMoje={() => onTab?.('moje')} />
    </AppFrame>
  );
}


