import type { FieldSpec } from './form';
import { joinMulti, splitMulti } from './form';

/**
 * Shared generated-attribute control (screens 06/07 AND the order form "Zamów
 * nowy przedmiot"): TEXT/NUMBER → input, SELECT/BOOLEAN/MULTI → chips.
 * Extracted from ItemForm so both forms render byte-identical fields — the
 * order modal must look and validate exactly like the new-item form (v2.x).
 */
export default function AttributeField({
  field,
  value,
  error,
  onChange,
  inputRef,
}: {
  field: FieldSpec;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  inputRef?: (el: HTMLElement | null) => void;
}) {
  const label = `${field.name}${field.required ? ' *' : ''}`;

  if (field.dataType === 'SELECT' || field.dataType === 'BOOLEAN') {
    const options = field.dataType === 'BOOLEAN'
      ? [['true', '✓ TAK'], ['false', '✗ NIE']]
      : field.options.map((o) => [o, o]);
    return (
      <div className="field" ref={inputRef}>
        <label>{label}</label>
        <div className="chips">
          {options.map(([v, text]) => (
            <button type="button" key={v} className={`chip oth${value === v ? ' sel' : ''}`} onClick={() => onChange(value === v ? '' : v)} aria-pressed={value === v}>
              {text}
            </button>
          ))}
        </div>
        {error && <span className="field-err">{error}</span>}
      </div>
    );
  }

  if (field.dataType === 'MULTI') {
    const selected = splitMulti(value);
    const toggle = (o: string) => {
      const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
      onChange(joinMulti(next));
    };
    return (
      <div className="field" ref={inputRef}>
        <label>{label}</label>
        <div className="chips">
          {field.options.map((o) => (
            <button type="button" key={o} className={`chip oth${selected.includes(o) ? ' sel' : ''}`} onClick={() => toggle(o)} aria-pressed={selected.includes(o)}>
              {o}
            </button>
          ))}
        </div>
        {error && <span className="field-err">{error}</span>}
      </div>
    );
  }

  const inputType = field.dataType === 'DATE' ? 'date' : 'text';
  return (
    <label className="field">
      {label}
      <input
        ref={inputRef as (el: HTMLInputElement | null) => void}
        type={inputType}
        inputMode={field.dataType === 'NUMBER' ? 'decimal' : undefined}
        placeholder={field.dataType === 'NUMBER' ? 'np. 12 lub 3500.50' : field.dataType === 'DATE' ? '' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
      />
      {error && <span className="field-err">{error}</span>}
    </label>
  );
}
