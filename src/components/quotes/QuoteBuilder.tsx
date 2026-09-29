import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Plus, Trash2, AlertTriangle, ImageIcon, ChevronLeft, Info
} from 'lucide-react';
import { Product, Quote, QuoteLine, QuoteReference } from '../../types';
import { calculateQuote, markupToMargin } from '../../../shared/quotePricing';
import { QuoteLineEditor } from './QuoteLineEditor';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  quote: Quote | null;
  reference: QuoteReference | null;
  products: Product[];
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const emptyDraft = () => ({
  contactId: '', customerName: '', customerEmail: '', customerReference: '',
  salesRep: '', quoteDate: today(), validUntil: inDays(14), leadTime: '',
  billingAddress: '', deliveryAddress: '', deliverySameAsBilling: false,
  cartonCount: 0, shippingMethod: 'Standard Shipping',
  shippingCost: 0, expressFee: 0, shippingNotes: '',
  markupPct: 30, vatRate: 20, discount: 0, notes: ''
});

export const QuoteBuilder: React.FC<Props> = ({
  onClose, onSaved, quote, reference, products
}) => {
  const [draft, setDraft] = useState(emptyDraft());
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (!quote) return;
    setDraft({
      contactId: quote.contactId || '',
      customerName: quote.customerName || '',
      customerEmail: quote.customerEmail || '',
      customerReference: quote.customerReference || '',
      salesRep: quote.salesRep || '',
      quoteDate: quote.quoteDate || today(),
      validUntil: quote.validUntil || '',
      leadTime: quote.leadTime || '',
      billingAddress: quote.billingAddress || '',
      deliveryAddress: quote.deliveryAddress || '',
      deliverySameAsBilling: quote.deliverySameAsBilling,
      cartonCount: quote.cartonCount,
      shippingMethod: quote.shippingMethod || 'Standard Shipping',
      shippingCost: quote.shippingCost,
      expressFee: quote.expressFee,
      shippingNotes: quote.shippingNotes || '',
      markupPct: quote.markupPct,
      vatRate: quote.vatRate,
      discount: quote.discount,
      notes: quote.notes || ''
    });
    setLines(quote.lines.map(l => ({ ...l, decorations: l.decorations.map(d => ({ ...d })) })));
  }, [quote]);

  /* Priced with the same module the server uses, so the preview cannot
     drift from what gets stored. */
  const totals = useMemo(() => calculateQuote({
    lines: lines.map(l => ({
      quantity: l.quantity,
      blankCost: l.blankCost,
      packagingCost: l.packagingCost,
      decorationUnitCost: l.decorations.reduce((s, d) => s + (Number(d.unitCost) || 0), 0),
      setupCost: l.decorations.reduce((s, d) => s + (Number(d.setupCost) || 0), 0),
      minCharge: l.minCharge
    })),
    shippingCost: draft.shippingCost,
    expressFee: draft.expressFee,
    markupPct: draft.markupPct,
    vatRate: draft.vatRate,
    discount: draft.discount
  }), [lines, draft.shippingCost, draft.expressFee, draft.markupPct, draft.vatRate, draft.discount]);

  const pickCustomer = (contactId: string) => {
    const c = reference?.customers.find(x => x.contactId === contactId);
    setDraft(d => ({
      ...d,
      contactId,
      customerName: c?.name || d.customerName,
      customerEmail: c?.email || ''
    }));
  };

  const save = async () => {
    setError(null);
    if (!draft.customerName.trim()) return setError('Choose a customer.');
    if (lines.length === 0) return setError('Add at least one item to the quote.');

    setSaving(true);
    try {
      const r = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quote?.id, ...draft, lines })
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error || 'Could not save the quote.');
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save the quote.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';
  const label = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';
  const money = (n: number) => `£${n.toFixed(2)}`;

  const locked = !!quote?.xeroInvoiceId;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl my-8">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-20">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {quote ? `Edit ${quote.quoteNumber}` : 'Create quote'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Priced from real stock cost. Markup applies to cost only — VAT is never marked up.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {error && (
            <div ref={errorRef} className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {locked && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Invoiced as {quote?.xeroInvoiceNumber}. This quote is a record now and cannot be changed.</span>
            </div>
          )}

          {/* ------------------------------------------- quote information */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Quote information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>Customer *</label>
                <select className={field} value={draft.contactId} onChange={e => pickCustomer(e.target.value)} disabled={locked}>
                  <option value="">Select customer…</option>
                  {reference?.customers.map(c => (
                    <option key={c.contactId} value={c.contactId}>{c.name}</option>
                  ))}
                </select>
                {draft.customerEmail && (
                  <p className="text-[11px] text-slate-500 mt-1">{draft.customerEmail}</p>
                )}
              </div>
              <div>
                <label className={label}>Sales person</label>
                <input className={field} list="sales-reps" value={draft.salesRep} placeholder="Who is quoting"
                  onChange={e => setDraft({ ...draft, salesRep: e.target.value })} disabled={locked} />
                <datalist id="sales-reps">
                  {reference?.salesReps.map(r => <option key={r.id} value={r.name} />)}
                </datalist>
              </div>
              <div>
                <label className={label}>Customer reference / PO</label>
                <input className={field} value={draft.customerReference} placeholder="Their PO number"
                  onChange={e => setDraft({ ...draft, customerReference: e.target.value })} disabled={locked} />
              </div>
              <div>
                <label className={label}>Quote number</label>
                <input className={`${field} bg-slate-50 text-slate-500`} readOnly
                  value={quote?.quoteNumber || 'Assigned on save'} />
              </div>
              <div>
                <label className={label}>Quote date</label>
                <input type="date" className={field} value={draft.quoteDate}
                  onChange={e => setDraft({ ...draft, quoteDate: e.target.value })} disabled={locked} />
              </div>
              <div>
                <label className={label}>Valid until</label>
                <input type="date" className={field} value={draft.validUntil}
                  onChange={e => setDraft({ ...draft, validUntil: e.target.value })} disabled={locked} />
              </div>
              <div>
                <label className={label}>Lead time</label>
                <input className={field} value={draft.leadTime} placeholder="e.g. 10 working days"
                  onChange={e => setDraft({ ...draft, leadTime: e.target.value })} disabled={locked} />
              </div>
              <div className="md:col-span-1">
                <label className={label}>Billing address</label>
                <textarea className={`${field} min-h-[72px]`} value={draft.billingAddress}
                  onChange={e => setDraft({ ...draft, billingAddress: e.target.value })} disabled={locked} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Delivery address</span>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                    <input type="checkbox" checked={draft.deliverySameAsBilling} disabled={locked}
                      onChange={e => setDraft({ ...draft, deliverySameAsBilling: e.target.checked })} />
                    Same as billing
                  </label>
                </div>
                <textarea className={`${field} min-h-[72px] ${draft.deliverySameAsBilling ? 'bg-slate-50 text-slate-400' : ''}`}
                  value={draft.deliverySameAsBilling ? draft.billingAddress : draft.deliveryAddress}
                  disabled={draft.deliverySameAsBilling || locked}
                  onChange={e => setDraft({ ...draft, deliveryAddress: e.target.value })} />
              </div>
            </div>
          </section>

          {/* -------------------------------------------------- quote items */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Quote items</h3>
              {!locked && (
                <button onClick={() => setEditingLine(-1)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add item
                </button>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No items yet. Add a product to start pricing.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="text-left font-bold px-2 py-2">Item</th>
                      <th className="text-left font-bold px-2 py-2">Decoration</th>
                      <th className="text-right font-bold px-2 py-2 w-20">Qty</th>
                      <th className="text-right font-bold px-2 py-2 w-24">Unit cost</th>
                      <th className="text-right font-bold px-2 py-2 w-24">Setup</th>
                      <th className="text-right font-bold px-2 py-2 w-28">Line cost</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, i) => {
                      const costed = totals.lines[i];
                      return (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                {l.imageUrl
                                  ? <img src={l.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                                  : <ImageIcon className="w-3.5 h-3.5 text-slate-300" />}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 truncate">{l.productName}</div>
                                {l.productSku && <div className="text-[11px] font-mono text-slate-500">{l.productSku}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-slate-600">
                            {l.decorations.length === 0
                              ? <span className="text-slate-400">Blank, no decoration</span>
                              : l.decorations.map((d, di) => (
                                  <div key={di}>{d.decorationName} <span className="text-slate-400">({d.printAreaName})</span></div>
                                ))}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{l.quantity.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{money(costed?.unitCost ?? 0)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{money(costed?.setupCost ?? 0)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-semibold">
                            {money(costed?.lineCost ?? 0)}
                            {costed?.minChargeApplied && (
                              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                                Min charge
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {!locked && (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setEditingLine(i)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                                  Edit
                                </button>
                                <button onClick={() => setLines(lines.filter((_, x) => x !== i))}
                                  className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">

              {/* -------------------------------------- shipping & packaging */}
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Shipping &amp; packaging</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={label}>Cartons</label>
                    <input type="number" min="0" className={field} value={draft.cartonCount || ''}
                      onChange={e => setDraft({ ...draft, cartonCount: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                  <div>
                    <label className={label}>Method</label>
                    <select className={field} value={draft.shippingMethod}
                      onChange={e => setDraft({ ...draft, shippingMethod: e.target.value })} disabled={locked}>
                      {reference?.shippingMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Shipping cost £</label>
                    <input type="number" min="0" step="0.01" className={`${field} text-right`} value={draft.shippingCost || ''}
                      onChange={e => setDraft({ ...draft, shippingCost: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                  <div>
                    <label className={label}>Express fee £</label>
                    <input type="number" min="0" step="0.01" className={`${field} text-right`} value={draft.expressFee || ''}
                      onChange={e => setDraft({ ...draft, expressFee: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <label className={label}>Shipping notes</label>
                    <input className={field} value={draft.shippingNotes} placeholder="Anything the courier or warehouse needs to know"
                      onChange={e => setDraft({ ...draft, shippingNotes: e.target.value })} disabled={locked} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5">
                  Shipping and express are costs of the job, so markup applies to them too. They are listed
                  separately in the breakdown so you can see it.
                </p>
              </section>

              {/* -------------------------------------------------- markup */}
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Markup</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Markup is added to cost. The margin it produces is always lower — a 30% markup
                  is a {markupToMargin(30)}% margin. Both are shown so there is no confusion.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {reference?.markupPresets.map(p => (
                    <button key={p.markupPct} disabled={locked}
                      onClick={() => setDraft({ ...draft, markupPct: p.markupPct })}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        draft.markupPct === p.markupPct
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}>
                      {p.markupPct}% markup
                      <span className="block text-[10px] font-medium opacity-70">{p.marginPct}% margin</span>
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-1">
                    <input type="number" min="0" step="0.1" disabled={locked}
                      className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      value={draft.markupPct} onChange={e => setDraft({ ...draft, markupPct: Number(e.target.value) || 0 })} />
                    <span className="text-xs font-semibold text-slate-500">% custom</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label className={label}>VAT rate</label>
                    <select className={field} value={draft.vatRate} disabled={locked}
                      onChange={e => setDraft({ ...draft, vatRate: Number(e.target.value) })}>
                      {reference?.vatRates.map(v => <option key={v.rate} value={v.rate}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Discount £ (off net)</label>
                    <input type="number" min="0" step="0.01" className={`${field} text-right`} value={draft.discount || ''}
                      onChange={e => setDraft({ ...draft, discount: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <label className={label}>Notes and terms</label>
                <textarea className={`${field} min-h-[80px]`} value={draft.notes} disabled={locked}
                  placeholder="Anything the customer should see on the quote."
                  onChange={e => setDraft({ ...draft, notes: e.target.value })} />
              </section>
            </div>

            {/* ------------------------------------------------- summary */}
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">What it costs us</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-600">Goods</dt><dd className="tabular-nums">{money(totals.goodsCost)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Shipping</dt><dd className="tabular-nums">{money(totals.shippingCost)}</dd></div>
                  {totals.expressFee > 0 && (
                    <div className="flex justify-between"><dt className="text-slate-600">Express</dt><dd className="tabular-nums">{money(totals.expressFee)}</dd></div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
                    <dt>Total cost</dt><dd className="tabular-nums">{money(totals.totalCost)}</dd>
                  </div>
                </dl>
                <p className="text-[11px] text-slate-500 mt-2">
                  Net of VAT. VAT we pay suppliers is reclaimable, so it is not a cost.
                </p>
              </section>

              <section className="rounded-xl border-2 border-indigo-200 p-4 bg-indigo-50/40">
                <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-3">What the customer pays</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Subtotal (ex VAT)</dt>
                    <dd className="tabular-nums font-semibold">{money(totals.netTotal)}</dd>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <dt>Discount applied</dt><dd className="tabular-nums">−{money(totals.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-600">VAT ({totals.vatRate}%)</dt>
                    <dd className="tabular-nums">{money(totals.vatTotal)}</dd>
                  </div>
                  <div className="flex justify-between pt-2 mt-1 border-t border-indigo-200 text-base font-bold text-indigo-900">
                    <dt>Total to pay</dt><dd className="tabular-nums">{money(totals.grossTotal)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">What we make</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Profit</dt>
                    <dd className={`tabular-nums font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {money(totals.profit)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Markup on cost</dt>
                    <dd className="tabular-nums font-semibold">{totals.markupPct}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Margin on revenue</dt>
                    <dd className="tabular-nums font-semibold">{totals.marginPct}%</dd>
                  </div>
                </dl>
                <p className="text-[11px] text-slate-500 mt-2">
                  Margin is profit over what we sell for, which is the figure that matters.
                </p>
              </section>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <div className="text-sm">
            <span className="text-slate-500">Total to pay </span>
            <span className="font-bold text-slate-900 tabular-nums">{money(totals.grossTotal)}</span>
            <span className="text-slate-400"> · {money(totals.netTotal)} + {money(totals.vatTotal)} VAT</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            {!locked && (
              <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {quote ? 'Save changes' : 'Create quote'}
              </button>
            )}
          </div>
        </div>
      </div>

      {editingLine !== null && (
        <QuoteLineEditor
          products={products}
          line={editingLine >= 0 ? lines[editingLine] : null}
          onClose={() => setEditingLine(null)}
          onSave={line => {
            setLines(prev => editingLine >= 0
              ? prev.map((l, i) => (i === editingLine ? line : l))
              : [...prev, line]);
            setEditingLine(null);
          }}
        />
      )}
    </div>
  );
};
