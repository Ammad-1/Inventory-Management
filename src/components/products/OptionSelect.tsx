import React, { useState } from 'react';
import { Plus, Loader2, Check, X } from 'lucide-react';
import { ProductOption, ProductOptionKind } from '../../types';

interface Props {
  kind: ProductOptionKind;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: ProductOption[];
  /** Restricts the list, and scopes anything added, to one category. */
  categoryId?: string | null;
  /** Kinds like size and type are meaningless until a category is chosen. */
  requiresCategory?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onAdded: () => void;
}

const F = 'w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400';
const L = 'block text-[12px] font-bold text-slate-700 mb-1';

/**
 * A pick-list with a green "+" to add a value, as the layout draws it.
 *
 * These were free-text boxes, so "Navy", "navy" and "Nvy" all became
 * different colours and nothing could be filtered. Anything added here is
 * saved to the list, so the next person picks it instead of retyping it.
 */
export const OptionSelect: React.FC<Props> = ({
  kind, label, value, onChange, options, categoryId,
  requiresCategory = false, placeholder, disabled, onAdded
}) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = requiresCategory && !categoryId;

  // Values for this category, plus those shared by every category
  const list = options
    .filter(o => o.kind === kind && (o.categoryId === null || o.categoryId === categoryId))
    .map(o => o.value);

  // A value saved before it was on the list must still show as selected
  const choices = value && !list.includes(value) ? [value, ...list] : list;

  const submit = async () => {
    const v = draft.trim();
    if (!v) return setAdding(false);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/products/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, value: v,
          // Sizes and types belong to a category; colours and suppliers do not
          categoryId: requiresCategory ? categoryId : null
        })
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not add that.');
        return;
      }
      onChange(d.value);
      onAdded();
      setDraft('');
      setAdding(false);
    } catch (e: any) {
      setError(e.message || 'Could not add that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className={L}>{label}</label>
      {adding ? (
        <div className="flex gap-1">
          <input autoFocus className={F} value={draft} placeholder={`New ${kind}…`}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { setAdding(false); setDraft(''); setError(null); }
            }} />
          <button onClick={submit} disabled={busy} title="Save to the list"
            className="shrink-0 px-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setAdding(false); setDraft(''); setError(null); }} title="Cancel"
            className="shrink-0 px-2 rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1">
          <select className={F} value={value} disabled={disabled || blocked}
            onChange={e => onChange(e.target.value)}>
            <option value="">{blocked ? 'Choose a category first' : (placeholder || 'Select…')}</option>
            {choices.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <button onClick={() => setAdding(true)} disabled={disabled || blocked}
            title={blocked ? 'Choose a category first' : `Add a ${kind}`}
            className="shrink-0 px-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600 mt-1">{error}</p>}
    </div>
  );
};
