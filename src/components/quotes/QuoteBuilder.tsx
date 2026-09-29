import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Plus, Trash2, AlertTriangle, ImageIcon, Info, FileDown
} from 'lucide-react';
import { Product, Quote, QuoteLine, QuoteReference } from '../../types';
import { calculateQuote } from '../../../shared/quotePricing';
import { QuoteLineEditor } from './QuoteLineEditor';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  quote: Quote | null;
  reference: QuoteReference | null;
  products: Product[];
  /** Set when the builder was opened by "Create quote" on a product. */
  startProductId?: string | null;
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

// Compact shared styles: a quote has a lot of fields, and generous padding
// on every one of them turns a single-item quote into two screens of scroll.
const F = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-500';
const L = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';
const CARD = 'rounded-xl border border-slate-200 bg-white p-3.5';

export const QuoteBuilder: React.FC<Props> = ({
  onClose, onSaved, quote, reference, products, startProductId
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

  // Arriving from a product means the first thing to do is price that
  // product, so open the line editor on it rather than an empty quote.
  useEffect(() => {
    if (startProductId) setEditingLine(-1);
  }, [startProductId]);

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

  /* Priced with the module the server uses, so the preview cannot drift. */
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
      ...d, contactId,
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

  const money = (n: number) => `£${n.toFixed(2)}`;
  const locked = !!quote?.xeroInvoiceId;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-6">

        {/* -------------------------------------------------------- header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-20">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {quote ? `Edit ${quote.quoteNumber}` : 'Create quote'}
            </h2>
            <p className="text-[11px] text-slate-500">
              Markup applies to cost only — VAT is never marked up.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {quote && (
              <a href={`/api/quotes/${quote.id}/pdf`}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                <FileDown className="w-3.5 h-3.5" /> PDF
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div ref={errorRef} className="flex items-start gap-2 p-2.5 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          {locked && (
            <div className="flex items-start gap-2 p-2.5 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Invoiced as {quote?.xeroInvoiceNumber}. This quote is a record now and cannot be changed.</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_270px] gap-4 items-start">

            {/* ------------------------------------------------ left column */}
            <div className="space-y-4 min-w-0">

              <section className={CARD}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div className="col-span-2">
                    <label className={L}>Customer *</label>
                    <select className={F} value={draft.contactId} onChange={e => pickCustomer(e.target.value)} disabled={locked}>
                      <option value="">Select customer…</option>
                      {reference?.customers.map(c => (
                        <option key={c.contactId} value={c.contactId}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={L}>Sales person</label>
                    <input className={F} list="sales-reps" value={draft.salesRep} placeholder="Who is quoting"
                      onChange={e => setDraft({ ...draft, salesRep: e.target.value })} disabled={locked} />
                    <datalist id="sales-reps">
                      {reference?.salesReps.map(r => <option key={r.id} value={r.name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className={L}>Their PO / ref</label>
                    <input className={F} value={draft.customerReference} placeholder="PO number"
                      onChange={e => setDraft({ ...draft, customerReference: e.target.value })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Quote date</label>
                    <input type="date" className={F} value={draft.quoteDate}
                      onChange={e => setDraft({ ...draft, quoteDate: e.target.value })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Valid until</label>
                    <input type="date" className={F} value={draft.validUntil}
                      onChange={e => setDraft({ ...draft, validUntil: e.target.value })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Lead time</label>
                    <input className={F} value={draft.leadTime} placeholder="10 working days"
                      onChange={e => setDraft({ ...draft, leadTime: e.target.value })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Quote number</label>
                    <input className={`${F} bg-slate-50 text-slate-500`} readOnly
                      value={quote?.quoteNumber || 'On save'} />
                  </div>
                  <div className="col-span-2">
                    <label className={L}>Billing address</label>
                    <textarea className={`${F} h-[58px] resize-none`} value={draft.billingAddress}
                      onChange={e => setDraft({ ...draft, billingAddress: e.target.value })} disabled={locked} />
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Delivery address</span>
                      <label className="flex items-center gap-1 text-[10px] text-slate-600 font-medium">
                        <input type="checkbox" checked={draft.deliverySameAsBilling} disabled={locked}
                          onChange={e => setDraft({ ...draft, deliverySameAsBilling: e.target.checked })} />
                        Same as billing
                      </label>
                    </div>
                    <textarea className={`${F} h-[58px] resize-none`}
                      value={draft.deliverySameAsBilling ? draft.billingAddress : draft.deliveryAddress}
                      disabled={draft.deliverySameAsBilling || locked}
                      onChange={e => setDraft({ ...draft, deliveryAddress: e.target.value })} />
                  </div>
                </div>
              </section>

              {/* ---------------------------------------------------- items */}
              <section className={CARD}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Items</h3>
                  {!locked && (
                    <button onClick={() => setEditingLine(-1)}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add item
                    </button>
                  )}
                </div>

                {lines.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No items yet.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                        <tr>
                          <th className="text-left font-semibold px-1 pb-1.5">Item</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-14">Qty</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-20">Unit</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-20">Setup</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-24">Cost</th>
                          <th className="w-14"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((l, i) => {
                          const c = totals.lines[i];
                          return (
                            <tr key={i} className="group">
                              <td className="px-1 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                    {l.imageUrl
                                      ? <img src={l.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                                      : <ImageIcon className="w-3 h-3 text-slate-300" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-800 text-[13px] truncate">{l.productName}</div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {l.decorations.length === 0
                                        ? 'No decoration'
                                        : l.decorations.map(d => `${d.decorationName} (${d.printAreaName})`).join(', ')}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-1 py-2 text-right tabular-nums text-[13px]">{l.quantity.toLocaleString()}</td>
                              <td className="px-1 py-2 text-right tabular-nums text-[13px]">{money(c?.unitCost ?? 0)}</td>
                              <td className="px-1 py-2 text-right tabular-nums text-[13px] text-slate-500">{money(c?.setupCost ?? 0)}</td>
                              <td className="px-1 py-2 text-right tabular-nums text-[13px] font-semibold">
                                {money(c?.lineCost ?? 0)}
                                {c?.minChargeApplied && (
                                  <span className="block text-[9px] font-bold text-amber-600 uppercase">Min charge</span>
                                )}
                              </td>
                              <td className="px-1 py-2 text-right">
                                {!locked && (
                                  <div className="flex items-center justify-end gap-0.5">
                                    <button onClick={() => setEditingLine(i)}
                                      className="px-1.5 py-1 rounded text-[10px] font-semibold text-slate-500 hover:bg-slate-100">
                                      Edit
                                    </button>
                                    <button onClick={() => setLines(lines.filter((_, x) => x !== i))}
                                      className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50">
                                      <Trash2 className="w-3 h-3" />
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

              {/* ------------------------------------- delivery and pricing */}
              <section className={CARD}>
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-2">Delivery &amp; pricing</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div>
                    <label className={L}>Method</label>
                    <select className={F} value={draft.shippingMethod}
                      onChange={e => setDraft({ ...draft, shippingMethod: e.target.value })} disabled={locked}>
                      {reference?.shippingMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={L}>Cartons</label>
                    <input type="number" min="0" className={`${F} text-right`} value={draft.cartonCount || ''}
                      onChange={e => setDraft({ ...draft, cartonCount: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Shipping £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.shippingCost || ''}
                      onChange={e => setDraft({ ...draft, shippingCost: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Express £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.expressFee || ''}
                      onChange={e => setDraft({ ...draft, expressFee: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-end gap-1.5">
                    {reference?.markupPresets.map(p => (
                      <button key={p.markupPct} disabled={locked}
                        onClick={() => setDraft({ ...draft, markupPct: p.markupPct })}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                          draft.markupPct === p.markupPct
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        {p.markupPct}%
                        <span className="block text-[9px] font-medium opacity-70">{p.marginPct}% mgn</span>
                      </button>
                    ))}
                  </div>
                  <div className="w-[88px]">
                    <label className={L}>Markup %</label>
                    <input type="number" min="0" step="0.1" disabled={locked} className={`${F} text-right`}
                      value={draft.markupPct} onChange={e => setDraft({ ...draft, markupPct: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="w-[140px]">
                    <label className={L}>VAT</label>
                    <select className={F} value={draft.vatRate} disabled={locked}
                      onChange={e => setDraft({ ...draft, vatRate: Number(e.target.value) })}>
                      {reference?.vatRates.map(v => <option key={v.rate} value={v.rate}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="w-[100px]">
                    <label className={L}>Discount £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.discount || ''}
                      onChange={e => setDraft({ ...draft, discount: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Shipping and express are costs of the job, so markup applies to them too.
                </p>
              </section>

              <section className={CARD}>
                <label className={L}>Notes shown to the customer</label>
                <textarea className={`${F} h-[56px] resize-none`} value={draft.notes} disabled={locked}
                  placeholder="Anything the customer should see on the quote."
                  onChange={e => setDraft({ ...draft, notes: e.target.value })} />
              </section>
            </div>

            {/* -------------------------------------------- summary column */}
            <div className="lg:sticky lg:top-[68px] space-y-3">
              <section className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-3.5">
                <h3 className="text-[10px] font-bold text-indigo-900 uppercase tracking-wide mb-2">Customer pays</h3>
                <dl className="space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Subtotal</dt>
                    <dd className="tabular-nums font-semibold">{money(totals.netTotal)}</dd>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <dt>Discount</dt><dd className="tabular-nums">−{money(totals.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-600">VAT {totals.vatRate}%</dt>
                    <dd className="tabular-nums">{money(totals.vatTotal)}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 mt-1 border-t border-indigo-200 text-base font-bold text-indigo-900">
                    <dt>Total</dt><dd className="tabular-nums">{money(totals.grossTotal)}</dd>
                  </div>
                </dl>
              </section>

              <section className={CARD}>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Our side</h3>
                <dl className="space-y-1 text-[13px]">
                  <div className="flex justify-between"><dt className="text-slate-600">Goods</dt><dd className="tabular-nums">{money(totals.goodsCost)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Shipping</dt><dd className="tabular-nums">{money(totals.shippingCost + totals.expressFee)}</dd></div>
                  <div className="flex justify-between font-semibold text-slate-900 pt-1 border-t border-slate-100">
                    <dt>Total cost</dt><dd className="tabular-nums">{money(totals.totalCost)}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 mt-1 border-t border-slate-100">
                    <dt className="text-slate-600">Profit</dt>
                    <dd className={`tabular-nums font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {money(totals.profit)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <dt>Markup {totals.markupPct}%</dt>
                    <dd className="font-semibold">{totals.marginPct}% margin</dd>
                  </div>
                </dl>
                <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                  Cost is net of VAT — supplier VAT is reclaimable.
                </p>
              </section>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <div className="text-[13px]">
            <span className="text-slate-500">Total </span>
            <span className="font-bold text-slate-900 tabular-nums">{money(totals.grossTotal)}</span>
            <span className="text-slate-400 hidden sm:inline"> · {money(totals.netTotal)} + {money(totals.vatTotal)} VAT</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            {!locked && (
              <button onClick={save} disabled={saving}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
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
          initialProductId={editingLine === -1 && lines.length === 0 ? startProductId || undefined : undefined}
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
