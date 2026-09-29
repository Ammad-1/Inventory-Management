import React, { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, Building2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/**
 * The letterhead on customer-facing documents. Kept apart from the quote
 * itself because it is the same on every one.
 */
export const CompanyDetailsModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: '', addressLines: '', email: '', phone: '',
    website: '', vatNumber: '', registrationNumber: '', quoteTerms: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await fetch('/api/quotes/company').then(r => r.json());
        setForm(f => ({ ...f, ...d }));
      } catch {
        setError('Could not load your company details.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Company name is required — it is the letterhead.');
    setSaving(true);
    try {
      const r = await fetch('/api/quotes/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error || 'Could not save.');
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const F = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400';
  const L = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-10">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Company details</h2>
              <p className="text-[11px] text-slate-500">Appears at the top of every quote PDF.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={L}>Trading name *</label>
                <input className={F} value={form.name} placeholder="PrintBerry Ltd"
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className={L}>Address (one line each)</label>
                <textarea className={`${F} h-[70px] resize-none`} value={form.addressLines}
                  placeholder={'Unit 4, Example Way\nManchester M1 2AB'}
                  onChange={e => setForm({ ...form, addressLines: e.target.value })} />
              </div>
              <div>
                <label className={L}>Email</label>
                <input className={F} value={form.email} placeholder="sales@…"
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className={L}>Phone</label>
                <input className={F} value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className={L}>Website</label>
                <input className={F} value={form.website}
                  onChange={e => setForm({ ...form, website: e.target.value })} />
              </div>
              <div>
                <label className={L}>VAT number</label>
                <input className={F} value={form.vatNumber} placeholder="GB…"
                  onChange={e => setForm({ ...form, vatNumber: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className={L}>Quote terms &amp; conditions</label>
                <textarea className={`${F} h-[86px] resize-none`} value={form.quoteTerms}
                  placeholder={'One per line, for example:\nPrices are based on the quantities and specifications provided.\nLead times will be confirmed upon order confirmation.'}
                  onChange={e => setForm({ ...form, quoteTerms: e.target.value })} />
                <p className="text-[11px] text-slate-500 mt-1">
                  Printed at the bottom of every quote. Leave empty to use the standard three.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={save} disabled={saving || loading}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};
