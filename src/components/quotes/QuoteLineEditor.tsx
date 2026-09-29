import React, { useEffect, useMemo, useState } from 'react';
import { X, ImageIcon, AlertTriangle, Package } from 'lucide-react';
import { Product, QuoteLine, QuoteLineDecoration } from '../../types';
import { costLine } from '../../../shared/quotePricing';

interface Props {
  products: Product[];
  /** Null when adding a new line. */
  line: QuoteLine | null;
  /** Preselects a product when the line was started from the product page. */
  initialProductId?: string;
  onClose: () => void;
  onSave: (line: QuoteLine) => void;
}

/**
 * Picks a product and the decorations it carries, then snapshots the costs
 * onto the quote line. Once saved, the line holds its own copy of every
 * cost: a later change to the blank's landed cost must not move a quote
 * that has already gone to a customer.
 */
export const QuoteLineEditor: React.FC<Props> = ({ products, line, initialProductId, onClose, onSave }) => {
  const [productId, setProductId] = useState(line?.productId || initialProductId || '');
  const [quantity, setQuantity] = useState(line?.quantity || 100);
  const [description, setDescription] = useState(line?.description || '');
  /** Keyed `${decorationTypeId}|${printAreaId}` so a pick is unambiguous. */
  const [picked, setPicked] = useState<Set<string>>(
    new Set((line?.decorations || []).map(d => `${d.decorationTypeId}|${d.printAreaId}`))
  );
  const [error, setError] = useState<string | null>(null);
  /** Screen-printed colours, keyed the same way as the picks. */
  const [colourCounts, setColourCounts] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const d of line?.decorations || []) {
      seed[`${d.decorationTypeId}|${d.printAreaId}`] = d.colours || 1;
    }
    return seed;
  });

  const product = products.find(p => p.id === productId) || null;

  // Changing product invalidates decorations chosen against the old one
  useEffect(() => {
    if (product && line?.productId !== productId) {
      setPicked(prev => {
        const valid = new Set(product.pricing.map(p => `${p.decorationTypeId}|${p.printAreaId}`));
        return new Set([...prev].filter(k => valid.has(k)));
      });
    }
  }, [productId, product, line?.productId]);

  /** A decoration whose price moves with the number of colours. */
  const pricesByColour = (p: { perColourSetup?: number; perColourUnit?: number }) =>
    (p.perColourSetup || 0) > 0 || (p.perColourUnit || 0) > 0;

  const decorations: QuoteLineDecoration[] = useMemo(() => {
    if (!product) return [];
    return product.pricing
      .filter(p => picked.has(`${p.decorationTypeId}|${p.printAreaId}`))
      .map(p => {
        const key = `${p.decorationTypeId}|${p.printAreaId}`;
        const colours = pricesByColour(p) ? Math.max(1, colourCounts[key] || 1) : 1;
        const extra = colours - 1;
        return {
          decorationTypeId: p.decorationTypeId,
          decorationName: p.decorationType || 'Decoration',
          printAreaId: p.printAreaId,
          printAreaName: p.printArea || 'Print area',
          // The uplift is folded in here, so the quote stores what it charges
          setupCost: p.setupCost + extra * (p.perColourSetup || 0),
          unitCost: p.unitCost + extra * (p.perColourUnit || 0),
          colours
        };
      });
  }, [product, picked, colourCounts]);

  /** The strictest minimum among the chosen decorations governs the line. */
  const minCharge = useMemo(() => {
    if (!product) return 0;
    const mins = product.pricing
      .filter(p => picked.has(`${p.decorationTypeId}|${p.printAreaId}`))
      .map(p => p.minCharge || 0);
    return mins.length ? Math.max(...mins) : 0;
  }, [product, picked]);

  const preview = costLine({
    quantity,
    blankCost: product?.stockCost || 0,
    packagingCost: 0, // already inside the product's stockCost
    decorationUnitCost: decorations.reduce((s, d) => s + d.unitCost, 0),
    setupCost: decorations.reduce((s, d) => s + d.setupCost, 0),
    minCharge
  });

  const save = () => {
    if (!product) return setError('Choose a product.');
    if (!Number.isFinite(quantity) || quantity < 1) return setError('Quantity must be at least 1.');

    onSave({
      id: line?.id,
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      imageUrl: product.imageUrl,
      description: description || null,
      quantity,
      // Snapshot: the quote keeps these even if the product changes later
      blankCost: product.stockCost,
      packagingCost: 0,
      minCharge,
      decorations
    });
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';
  const label = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';
  const money = (n: number) => `£${n.toFixed(2)}`;

  // The pricing matrix, grouped so the operator picks area by area
  const byArea = useMemo(() => {
    if (!product) return [];
    const areas = new Map<string, { id: string; name: string; rows: typeof product.pricing }>();
    for (const p of product.pricing) {
      const key = p.printAreaId;
      if (!areas.has(key)) areas.set(key, { id: key, name: p.printArea || 'Print area', rows: [] });
      areas.get(key)!.rows.push(p);
    }
    return [...areas.values()];
  }, [product]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">{line ? 'Edit item' : 'Add item'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Costs are copied onto the quote now, so a later price change cannot move it.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {products.length === 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No products in the catalogue yet. Add one on the Products page first.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className={label}>Product *</label>
              <select className={field} value={productId} onChange={e => { setProductId(e.target.value); setError(null); }}>
                <option value="">Select a product…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Quantity *</label>
              <input type="number" min="1" className={`${field} text-right tabular-nums`} value={quantity || ''}
                onChange={e => setQuantity(Number(e.target.value) || 0)} />
            </div>
          </div>

          {product && (
            <>
              <section className="rounded-xl border border-slate-200 p-4 flex gap-4">
                <div className="w-24 h-24 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                    : <ImageIcon className="w-6 h-6 text-slate-300" />}
                </div>
                <div className="min-w-0 text-sm">
                  <div className="font-bold text-slate-900">{product.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">{product.sku}</div>
                  <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                    {product.colour && <div>Colour: {product.colour}</div>}
                    {product.size && <div>Size: {product.size}</div>}
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3 h-3" />
                      {product.blankSku
                        ? <span>{product.blankSku} · {(product.blankStock ?? 0).toLocaleString()} in stock</span>
                        : <span className="text-amber-600 font-semibold">No blank linked — stock cost is £0.00</span>}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Decoration</h3>
                {byArea.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    This product has no decoration pricing yet. It will quote as a blank.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {byArea.map(area => (
                      <div key={area.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs font-bold text-slate-700 mb-2">{area.name}</div>
                        <div className="flex flex-wrap gap-2">
                          {area.rows.map(p => {
                            const key = `${p.decorationTypeId}|${p.printAreaId}`;
                            const on = picked.has(key);
                            return (
                              <button key={key}
                                onClick={() => setPicked(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key); else next.add(key);
                                  return next;
                                })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left transition-colors ${
                                  on ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                     : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}>
                                {p.decorationType}
                                <span className="block text-[10px] font-medium opacity-70 tabular-nums">
                                  {money(p.unitCost)}/unit{p.setupCost > 0 ? ` + ${money(p.setupCost)} setup` : ''}
                                  {pricesByColour(p) ? ' · per colour' : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {area.rows
                          .filter(p => picked.has(`${p.decorationTypeId}|${p.printAreaId}`) && pricesByColour(p))
                          .map(p => {
                            const key = `${p.decorationTypeId}|${p.printAreaId}`;
                            const colours = Math.max(1, colourCounts[key] || 1);
                            return (
                              <div key={key} className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                                <span className="text-[11px] font-semibold text-slate-600">
                                  {p.decorationType} colours
                                </span>
                                <input type="number" min="1" max="12"
                                  className="w-16 px-2 py-1 rounded border border-slate-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                                  value={colours}
                                  onChange={e => setColourCounts(c => ({
                                    ...c, [key]: Math.max(1, Math.min(12, Number(e.target.value) || 1))
                                  }))} />
                                <span className="text-[10.5px] text-slate-500">
                                  each extra colour adds{' '}
                                  {(p.perColourSetup || 0) > 0 && `${money(p.perColourSetup || 0)} setup`}
                                  {(p.perColourSetup || 0) > 0 && (p.perColourUnit || 0) > 0 && ' and '}
                                  {(p.perColourUnit || 0) > 0 && `${money(p.perColourUnit || 0)}/unit`}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div>
                <label className={label}>Line description (optional)</label>
                <input className={field} value={description} placeholder="How this should read on the quote"
                  onChange={e => setDescription(e.target.value)} />
              </div>

              <section className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">This line costs</h3>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-slate-600">Blank + packaging, per unit</dt><dd className="tabular-nums">{money(product.stockCost)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Decoration, per unit</dt><dd className="tabular-nums">{money(decorations.reduce((s, d) => s + d.unitCost, 0))}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Setup, once</dt><dd className="tabular-nums">{money(preview.setupCost)}</dd></div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
                    <dt>{quantity.toLocaleString()} × {money(preview.unitCost)} + setup</dt>
                    <dd className="tabular-nums">{money(preview.lineCost)}</dd>
                  </div>
                </dl>
                {preview.minChargeApplied && (
                  <p className="text-[11px] text-amber-700 font-semibold mt-2">
                    Raised to the {money(minCharge)} minimum charge — the run is too short to cover setup otherwise.
                  </p>
                )}
                {product.blankStock !== null && product.blankStock !== undefined && quantity > product.blankStock && (
                  <p className="text-[11px] text-amber-700 font-semibold mt-2">
                    Only {product.blankStock.toLocaleString()} {product.blankSku} in stock for a run of {quantity.toLocaleString()}.
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={save} disabled={!product}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {line ? 'Update item' : 'Add to quote'}
          </button>
        </div>
      </div>
    </div>
  );
};
