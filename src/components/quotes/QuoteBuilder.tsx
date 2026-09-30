import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Plus, Trash2, AlertTriangle, ImageIcon, Info, FileDown
} from 'lucide-react';
import { Product, Quote, QuoteCharge, QuoteLine, QuoteReference } from '../../types';
import { calculateQuote } from '../../../shared/quotePricing';
import { QuoteLineEditor } from './QuoteLineEditor';
import { useCanSeeFinancials } from '../../context/AuthContext';

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
  // What we charge for freight; null means cost plus markup
  shippingPrice: null as number | null, expressPrice: null as number | null,
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
  const showMoney = useCanSeeFinancials();
  const [draft, setDraft] = useState(emptyDraft());
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [charges, setCharges] = useState<QuoteCharge[]>([]);
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
      shippingPrice: quote.shippingPrice ?? null,
      expressPrice: quote.expressPrice ?? null,
      shippingNotes: quote.shippingNotes || '',
      markupPct: quote.markupPct,
      vatRate: quote.vatRate,
      discount: quote.discount,
      notes: quote.notes || ''
    });
    setLines(quote.lines.map(l => ({ ...l, decorations: l.decorations.map(d => ({ ...d })) })));
    setCharges((quote.charges || []).map(c => ({ ...c })));
  }, [quote]);

  /* Priced with the module the server uses, so the preview cannot drift. */
  const totals = useMemo(() => calculateQuote({
    lines: lines.map(l => ({
      quantity: l.quantity,
      blankCost: l.blankCost,
      packagingCost: l.packagingCost,
      decorationUnitCost: l.decorations.reduce((s, d) => s + (Number(d.unitCost) || 0), 0),
      setupCost: l.decorations.reduce((s, d) => s + (Number(d.setupCost) || 0), 0),
      minCharge: l.minCharge,
      unitPrice: l.unitPrice ?? null,
      setupPrice: l.setupPrice ?? null
    })),
    shippingCost: draft.shippingCost,
    expressFee: draft.expressFee,
    shippingPrice: draft.shippingPrice,
    expressPrice: draft.expressPrice,
    charges,
    markupPct: draft.markupPct,
    vatRate: draft.vatRate,
    discount: draft.discount
  }), [lines, charges, draft.shippingCost, draft.expressFee, draft.shippingPrice,
       draft.expressPrice, draft.markupPct, draft.vatRate, draft.discount]);

  /**
   * Fill every blank price from cost plus the markup, so the presets stay
   * useful as a starting point without ever overriding a typed figure.
   */
  const priceFromMarkup = () => {
    const factor = 1 + draft.markupPct / 100;
    setLines(prev => prev.map((l, i) => {
      if (l.unitPrice !== null && l.unitPrice !== undefined) return l;
      const c = totals.lines[i];
      const suggested = c && c.quantity
        ? Math.round((c.lineCost * factor / c.quantity) * 100) / 100
        : 0;
      return { ...l, unitPrice: suggested };
    }));
    setDraft(d => ({
      ...d,
      shippingPrice: d.shippingPrice ?? Math.round(d.shippingCost * factor * 100) / 100,
      expressPrice: d.expressPrice ?? Math.round(d.expressFee * factor * 100) / 100
    }));
  };

  /** Clear the typed prices and go back to deriving them. */
  const clearPrices = () => {
    setLines(prev => prev.map(l => ({ ...l, unitPrice: null, setupPrice: null })));
    setDraft(d => ({ ...d, shippingPrice: null, expressPrice: null }));
  };

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
        body: JSON.stringify({ id: quote?.id, ...draft, lines, charges })
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
                          {showMoney && <th className="text-right font-semibold px-1 pb-1.5 w-20">Cost/unit</th>}
                          <th className="text-right font-semibold px-1 pb-1.5 w-24">Price/unit</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-24">Setup charge</th>
                          <th className="text-right font-semibold px-1 pb-1.5 w-24">Line total</th>
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

                              {showMoney && (
                                <td className="px-1 py-2 text-right tabular-nums text-[12px] text-slate-500">
                                  {money(c?.unitCost ?? 0)}
                                  {(c?.setupCost ?? 0) > 0 && (
                                    <span className="block text-[9.5px]">+{money(c!.setupCost)} setup</span>
                                  )}
                                  {c?.minChargeApplied && (
                                    <span className="block text-[9px] font-bold text-amber-600 uppercase">Min charge</span>
                                  )}
                                </td>
                              )}

                              {/* The price is typed, not derived. Blank falls back to markup. */}
                              <td className="px-1 py-2">
                                <input type="number" min="0" step="0.01" disabled={locked}
                                  className={`${F} text-right tabular-nums py-1`}
                                  placeholder={money(c?.effectiveUnitPrice ?? 0).replace('£', '')}
                                  value={l.unitPrice ?? ''}
                                  onChange={e => setLines(lines.map((x, xi) => xi === i
                                    ? { ...x, unitPrice: e.target.value === '' ? null : Number(e.target.value) }
                                    : x))} />
                              </td>
                              <td className="px-1 py-2">
                                <input type="number" min="0" step="0.01" disabled={locked}
                                  className={`${F} text-right tabular-nums py-1`}
                                  placeholder="0.00"
                                  value={l.setupPrice ?? ''}
                                  onChange={e => setLines(lines.map((x, xi) => xi === i
                                    ? { ...x, setupPrice: e.target.value === '' ? null : Number(e.target.value) }
                                    : x))} />
                              </td>

                              <td className="px-1 py-2 text-right tabular-nums text-[13px] font-semibold">
                                {money(c?.lineprice ?? 0)}
                                {showMoney && (c?.lineprice ?? 0) > 0 && (
                                  <span className={`block text-[9.5px] font-bold ${
                                    (c?.lineMarginPct ?? 0) >= 20 ? 'text-emerald-600'
                                      : (c?.lineMarginPct ?? 0) >= 0 ? 'text-amber-600' : 'text-rose-600'
                                  }`}>
                                    {c?.lineMarginPct}% margin
                                  </span>
                                )}
                                {!c?.pricedManually && (
                                  <span className="block text-[9px] text-slate-400 uppercase">from markup</span>
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
                    <label className={L}>Shipping charge £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`}
                      placeholder={totals.shippingPrice.toFixed(2)}
                      value={draft.shippingPrice ?? ''}
                      onChange={e => setDraft({ ...draft, shippingPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      disabled={locked} />
                  </div>
                  <div>
                    <label className={L}>Express charge £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`}
                      placeholder={totals.expressPrice.toFixed(2)}
                      value={draft.expressPrice ?? ''}
                      onChange={e => setDraft({ ...draft, expressPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      disabled={locked} />
                  </div>
                </div>

                {/* What freight costs us sits beside what we charge for it */}
                {showMoney && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-2.5">
                    <div className="md:col-start-3">
                      <label className={L}>Shipping cost £</label>
                      <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.shippingCost || ''}
                        onChange={e => setDraft({ ...draft, shippingCost: Number(e.target.value) || 0 })} disabled={locked} />
                    </div>
                    <div>
                      <label className={L}>Express cost £</label>
                      <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.expressFee || ''}
                        onChange={e => setDraft({ ...draft, expressFee: Number(e.target.value) || 0 })} disabled={locked} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-slate-100">
                  <div className="w-[140px]">
                    <label className={L}>VAT</label>
                    <select className={F} value={draft.vatRate} disabled={locked}
                      onChange={e => setDraft({ ...draft, vatRate: Number(e.target.value) })}>
                      {reference?.vatRates.map(v => <option key={v.rate} value={v.rate}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="w-[110px]">
                    <label className={L}>Discount £</label>
                    <input type="number" min="0" step="0.01" className={`${F} text-right`} value={draft.discount || ''}
                      onChange={e => setDraft({ ...draft, discount: Number(e.target.value) || 0 })} disabled={locked} />
                  </div>
                </div>

                {/* Markup is a way to fill prices in, not the price itself */}
                {showMoney && !locked && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex items-end gap-1.5">
                        {reference?.markupPresets.map(p => (
                          <button key={p.markupPct}
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
                      <div className="w-[80px]">
                        <label className={L}>Markup %</label>
                        <input type="number" min="0" step="0.1" className={`${F} text-right`}
                          value={draft.markupPct}
                          onChange={e => setDraft({ ...draft, markupPct: Number(e.target.value) || 0 })} />
                      </div>
                      <button onClick={priceFromMarkup}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-semibold hover:bg-slate-900">
                        Fill blank prices
                      </button>
                      <button onClick={clearPrices}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                        Clear prices
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      A price you type is the price. This only fills the ones left blank, and never
                      overwrites what you entered.
                    </p>
                  </div>
                )}
              </section>

              {/* --------------------------------------------- other charges */}
              <section className={CARD}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Other charges</h3>
                    <p className="text-[10px] text-slate-500">
                      Artwork, origination, samples — anything charged that is not an item.
                    </p>
                  </div>
                  {!locked && (
                    <button onClick={() => setCharges([...charges, { description: '', amount: 0, cost: 0 }])}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add charge
                    </button>
                  )}
                </div>

                {charges.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2 text-center">None.</p>
                ) : (
                  <div className="space-y-2">
                    {charges.map((c, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <div className="flex-1 min-w-0">
                          {i === 0 && <label className={L}>Description</label>}
                          <input className={F} value={c.description} disabled={locked}
                            placeholder="e.g. Artwork origination"
                            onChange={e => setCharges(charges.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))} />
                        </div>
                        <div className="w-[110px]">
                          {i === 0 && <label className={L}>Charge £</label>}
                          <input type="number" min="0" step="0.01" className={`${F} text-right`} disabled={locked}
                            value={c.amount || ''}
                            onChange={e => setCharges(charges.map((x, xi) => xi === i ? { ...x, amount: Number(e.target.value) || 0 } : x))} />
                        </div>
                        {showMoney && (
                          <div className="w-[100px]">
                            {i === 0 && <label className={L}>Cost £</label>}
                            <input type="number" min="0" step="0.01" className={`${F} text-right`} disabled={locked}
                              value={c.cost || ''} placeholder="0.00"
                              onChange={e => setCharges(charges.map((x, xi) => xi === i ? { ...x, cost: Number(e.target.value) || 0 } : x))} />
                          </div>
                        )}
                        {!locked && (
                          <button onClick={() => setCharges(charges.filter((_, xi) => xi !== i))}
                            className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                    <dt className="text-slate-600">Items</dt>
                    <dd className="tabular-nums">{money(totals.goodsPrice)}</dd>
                  </div>
                  {totals.shippingPrice > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Shipping</dt>
                      <dd className="tabular-nums">{money(totals.shippingPrice)}</dd>
                    </div>
                  )}
                  {totals.expressPrice > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Express</dt>
                      <dd className="tabular-nums">{money(totals.expressPrice)}</dd>
                    </div>
                  )}
                  {totals.chargesPrice > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Other charges</dt>
                      <dd className="tabular-nums">{money(totals.chargesPrice)}</dd>
                    </div>
                  )}
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <dt>Discount</dt><dd className="tabular-nums">−{money(totals.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-indigo-200/60">
                    <dt className="text-slate-600">Subtotal ex VAT</dt>
                    <dd className="tabular-nums font-semibold">{money(totals.netTotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">VAT {totals.vatRate}%</dt>
                    <dd className="tabular-nums">{money(totals.vatTotal)}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 mt-1 border-t border-indigo-200 text-base font-bold text-indigo-900">
                    <dt>Total</dt><dd className="tabular-nums">{money(totals.grossTotal)}</dd>
                  </div>
                </dl>
              </section>

              {showMoney && <section className={CARD}>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Our side</h3>
                <dl className="space-y-1 text-[13px]">
                  <div className="flex justify-between"><dt className="text-slate-600">Goods</dt><dd className="tabular-nums">{money(totals.goodsCost)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Freight</dt><dd className="tabular-nums">{money(totals.shippingCost + totals.expressFee)}</dd></div>
                  {totals.chargesCost > 0 && (
                    <div className="flex justify-between"><dt className="text-slate-600">Other</dt><dd className="tabular-nums">{money(totals.chargesCost)}</dd></div>
                  )}
                  <div className="flex justify-between font-semibold text-slate-900 pt-1 border-t border-slate-100">
                    <dt>Total cost</dt><dd className="tabular-nums">{money(totals.totalCost)}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 mt-1 border-t border-slate-100">
                    <dt className="text-slate-600">Profit</dt>
                    <dd className={`tabular-nums font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {money(totals.profit)}
                    </dd>
                  </div>
                  {/* Margin follows from the prices chosen; it is not set */}
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <dt>{totals.effectiveMarkupPct}% markup</dt>
                    <dd className="font-semibold">{totals.marginPct}% margin</dd>
                  </div>
                </dl>
                <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                  {totals.allPricesDerived
                    ? `Prices derived from ${totals.markupPct}% markup. Type over any of them to set your own.`
                    : 'Margin follows from the prices you entered. Cost is net of VAT — supplier VAT is reclaimable.'}
                </p>
              </section>}
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
