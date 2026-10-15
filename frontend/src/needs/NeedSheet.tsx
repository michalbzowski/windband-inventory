import { useState } from 'react';
import Sheet from '../ui/Sheet';

/** Bottom sheet for the unfrozen BRAK action (makieta 14: „→ Potrzeba”).
 * Shared between the active count card (Counting) and the report (StocktakeReport). */
export default function NeedSheet({ itemName, busy, onClose, onSubmit }: {
  itemName: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (quantity: number, note: string | null) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Potrzeba: ${itemName}`} onClose={onClose}>
      <p className="hint">Zgłoszenie trafia do „Potrzeby zespołu” — dalej zamówienie i dostawa (v1.x #3).</p>
      <label className="field">Ilość
        <input type="number" min={1} max={999} value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </label>
      <label className="field">Notatka (opcjonalna)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="np. brak na spisie, szukać przed koncertem" />
      </label>
      <button type="button" className="btn primary block" disabled={busy} onClick={() => onSubmit(quantity, note.trim() || null)}>
        {busy ? 'Zapisywanie…' : 'Zgłoś potrzebę ✓'}
      </button>
    </Sheet>
  );
}
