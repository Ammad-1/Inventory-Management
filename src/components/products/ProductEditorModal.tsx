import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, ImageIcon, Link2, AlertTriangle, Plus, Trash2, Package } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { Product, ProductReference, ProductPricing, ProductVariant } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  reference: ProductReference | null;
  /** Null when creating. */
  product: Product | null;
}

const blankDraft = () => ({
  sku: '', name: '', description: '', notes: '',
  categoryId: '', colour: '', size: '',
  supplierName: '', supplierProductLink: '', imageUrl: '',
  blankItemId: '', packagingItemId: ''
});

export const ProductEditorModal: React.FC<Props> = ({ isOpen, onClose, onSaved, reference, product }) => {
  const { inventory } = useInventory();

  const [draft, setDraft] = useState(blankDraft());
  const [printAreaIds, setPrintAreaIds] = useState<string[]>([]);
  const [pricing, setPricing] = useState<ProductPricing[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [saving, setSaving] = useState(false);
  const [fetchingImage, setFetchingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  // The form is long, so a failure at the top is invisible from the footer.
  // Centre it rather than aligning to top, which the sticky header covers.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);
  const fail = (message: string) => setError(message);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setImageNote(null);
    if (product) {
      setDraft({
        sku: product.sku || '',
        name: product.name || '',
        description: product.description || '',
        notes: product.notes || '',
        categoryId: product.categoryId || '',
        colour: product.colour || '',
        size: product.size || '',
        supplierName: product.supplierName || '',
        supplierProductLink: product.supplierProductLink || '',
        imageUrl: product.imageUrl || '',
        blankItemId: product.blankItemId || '',
        packagingItemId: product.packagingItemId || ''
      });
      setPrintAreaIds(product.printAreas.map(a => a.id));
      setPricing(product.pricing.map(p => ({ ...p })));
      setVariants(product.variants.map(v => ({ ...v })));
    } else {
      setDraft(blankDraft());
      setPrintAreaIds([]);
      setPricing([]);
      setVariants([]);
    }
  }, [isOpen, product]);

  const category = reference?.categories.find(c => c.id === draft.categoryId) || null;
  const availableAreas = category?.printAreas || [];
  const selectedAreas = availableAreas.filter(a => printAreaIds.includes(a.id));
  const decorations = reference?.decorationTypes || [];

  const blanks = useMemo(() => inventory.filter(i => i.category !== 'packaging'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);

  const blank = inventory.find(i => i.id === draft.blankItemId);
  const box = inventory.find(i => i.id === draft.packagingItemId);
  const stockCost =
    (blank ? blank.landedCostPerUnit || blank.costPerUnit || 0 : 0) +
    (box ? box.landedCostPerUnit || box.costPerUnit || 0 : 0);

  if (!isOpen) return null;

  const priceFor = (decId: string, areaId: string) =>
    pricing.find(p => p.decorationTypeId === decId && p.printAreaId === areaId) || null;

  const setPrice = (decId: string, areaId: string, field: 'setupCost' | 'unitCost' | 'minCharge', raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setPricing(prev => {
      const i = prev.findIndex(p => p.decorationTypeId === decId && p.printAreaId === areaId);
      if (i === -1) {
        return [...prev, { decorationTypeId: decId, printAreaId: areaId, setupCost: 0, unitCost: 0, minCharge: 0, [field]: value } as ProductPricing];
      }
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const toggleArea = (areaId: string) => {
    setPrintAreaIds(prev => {
      if (prev.includes(areaId)) {
        // Dropping an area drops its pricing with it, so nothing is orphaned
        setPricing(p => p.filter(x => x.printAreaId !== areaId));
        return prev.filter(x => x !== areaId);
      }
      return [...prev, areaId];
    });
  };

  const changeCategory = (categoryId: string) => {
    setDraft(d => ({ ...d, categoryId }));
    // Print areas belong to a category, so a change invalidates the selection
    setPrintAreaIds([]);
    setPricing([]);
  };

  const fetchImage = async () => {
    if (!draft.supplierProductLink.trim()) {
      setImageNote('Paste the supplier product link first.');
      return;
    }
    setFetchingImage(true);
    setImageNote(null);
    try {
      const r = await fetch('/api/products/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: draft.supplierProductLink.trim() })
      });
      const d = await r.json();
      if (!r.ok) {
        setImageNote(d.error || 'Could not read an image from that page.');
      } else {
        setDraft(prev => ({ ...prev, imageUrl: d.imageUrl, name: prev.name || d.title || '' }));
        setImageNote('Image found. Check it looks right below.');
      }
    } catch {
      setImageNote('Could not reach that page.');
    } finally {
      setFetchingImage(false);
    }
  };

  const save = async () => {
    setError(null);
    if (!draft.sku.trim()) return fail('Product SKU is required.');
    if (!draft.name.trim()) return fail('Product name is required.');

    setSaving(true);
    try {
      const r = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product?.id,
          ...draft,
          printAreaIds,
          // Only rows the operator actually filled in are worth storing
          pricing: pricing.filter(p => p.setupCost || p.unitCost || p.minCharge),
          variants: variants.filter(v => v.brand || v.quality || v.baseCost)
        })
      });
      const d = await r.json();
      if (!r.ok) {
        fail(d.error || 'Could not save the product.');
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      fail(e.message || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';
  const label = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {product ? `Edit ${product.sku}` : 'New product'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              A sellable configuration, linked to the blank it consumes from stock.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {error && (
            <div ref={errorRef} className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ---------------------------------------------------- identity */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={label}>Product SKU *</label>
              <input className={field} value={draft.sku} placeholder="PRD-MUG-11-WHT"
                onChange={e => setDraft({ ...draft, sku: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Product name *</label>
              <input className={field} value={draft.name} placeholder="Mug - White 11oz"
                onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className={label}>Category</label>
              <select className={field} value={draft.categoryId} onChange={e => changeCategory(e.target.value)}>
                <option value="">Select a category</option>
                {reference?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Colour</label>
              <input className={field} value={draft.colour} placeholder="White"
                onChange={e => setDraft({ ...draft, colour: e.target.value })} />
            </div>
            <div>
              <label className={label}>Size</label>
              <input className={field} value={draft.size} placeholder="11oz"
                onChange={e => setDraft({ ...draft, size: e.target.value })} />
            </div>
          </section>

          {/* ------------------------------------------------- stock link */}
          <section className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <Package className="w-3.5 h-3.5 text-indigo-500" /> What this consumes from stock
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className={label}>Blank</label>
                <select className={field} value={draft.blankItemId}
                  onChange={e => setDraft({ ...draft, blankItemId: e.target.value })}>
                  <option value="">Not linked</option>
                  {blanks.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Packaging</label>
                <select className={field} value={draft.packagingItemId}
                  onChange={e => setDraft({ ...draft, packagingItemId: e.target.value })}>
                  <option value="">Not linked</option>
                  {packaging.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <div className="pb-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Stock cost per unit</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">£{stockCost.toFixed(4)}</div>
                <div className="text-[11px] text-slate-500">
                  {blank
                    ? `${blank.currentStock.toLocaleString()} ${blank.sku} in stock`
                    : 'Link a blank to price against real landed cost'}
                </div>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------- supplier/image */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={label}>Supplier</label>
              <input className={field} value={draft.supplierName} placeholder="e.g. Orca Coatings"
                onChange={e => setDraft({ ...draft, supplierName: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Supplier product link</label>
              <div className="flex gap-2">
                <input className={field} value={draft.supplierProductLink} placeholder="https://supplier.com/product/..."
                  onChange={e => setDraft({ ...draft, supplierProductLink: e.target.value })} />
                <button onClick={fetchImage} disabled={fetchingImage}
                  className="shrink-0 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50 flex items-center gap-1.5">
                  {fetchingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Get image
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={label}>Image URL</label>
              <input className={field} value={draft.imageUrl} placeholder="https://.../product.jpg"
                onChange={e => setDraft({ ...draft, imageUrl: e.target.value, })} />
              {imageNote && <p className="text-[11px] text-slate-500 mt-1.5">{imageNote}</p>}
            </div>
            <div>
              <div className="w-full h-28 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                {draft.imageUrl
                  ? <img src={draft.imageUrl} alt="" className="max-h-full max-w-full object-contain"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  : <ImageIcon className="w-6 h-6 text-slate-300" />}
              </div>
            </div>
          </section>

          {/* -------------------------------------------------- print areas */}
          <section>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Print areas offered</h3>
            {!category ? (
              <p className="text-sm text-slate-500">Choose a category to see its print areas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableAreas.map(a => {
                  const on = printAreaIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleArea(a.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        on ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                           : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ----------------------------------------------- pricing matrix */}
          <section>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
              Decoration pricing
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Setup is charged once per job, unit cost per item, and the minimum charge is the floor for small runs.
              Leave a row blank where that decoration is not offered.
            </p>
            {selectedAreas.length === 0 ? (
              <p className="text-sm text-slate-500">Select at least one print area to price it.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left font-bold px-3 py-2">Decoration</th>
                      <th className="text-left font-bold px-3 py-2">Print area</th>
                      <th className="text-right font-bold px-3 py-2 w-28">Setup £</th>
                      <th className="text-right font-bold px-3 py-2 w-28">Unit £</th>
                      <th className="text-right font-bold px-3 py-2 w-28">Min £</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {decorations.flatMap(dec =>
                      selectedAreas.map((area, ai) => {
                        const row = priceFor(dec.id, area.id);
                        const numeric = 'w-full text-right px-2 py-1 rounded border border-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30';
                        return (
                          <tr key={`${dec.id}-${area.id}`} className="hover:bg-slate-50/60">
                            <td className="px-3 py-1.5 font-semibold text-slate-700">
                              {ai === 0 ? dec.name : ''}
                            </td>
                            <td className="px-3 py-1.5 text-slate-600">{area.name}</td>
                            {(['setupCost', 'unitCost', 'minCharge'] as const).map(f => (
                              <td key={f} className="px-3 py-1.5">
                                <input type="number" min="0" step="0.01" className={numeric}
                                  value={row?.[f] ? String(row[f]) : ''}
                                  placeholder="0.00"
                                  onChange={e => setPrice(dec.id, area.id, f, e.target.value)} />
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* --------------------------------------------------- variants */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Brand / quality options</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Optional. Use where the same product is offered at different quality tiers.
                </p>
              </div>
              <button
                onClick={() => setVariants([...variants, { brand: '', quality: '', baseCost: 0, priceAdjustment: 0 }])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {variants.length > 0 && (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input className={`${field} col-span-4`} placeholder="Brand" value={v.brand || ''}
                      onChange={e => setVariants(variants.map((x, xi) => xi === i ? { ...x, brand: e.target.value } : x))} />
                    <input className={`${field} col-span-3`} placeholder="Quality" value={v.quality || ''}
                      onChange={e => setVariants(variants.map((x, xi) => xi === i ? { ...x, quality: e.target.value } : x))} />
                    <input type="number" step="0.01" className={`${field} col-span-2 text-right`} placeholder="Cost"
                      value={v.baseCost || ''}
                      onChange={e => setVariants(variants.map((x, xi) => xi === i ? { ...x, baseCost: Number(e.target.value) || 0 } : x))} />
                    <input type="number" step="0.01" className={`${field} col-span-2 text-right`} placeholder="Adj."
                      value={v.priceAdjustment || ''}
                      onChange={e => setVariants(variants.map((x, xi) => xi === i ? { ...x, priceAdjustment: Number(e.target.value) || 0 } : x))} />
                    <button onClick={() => setVariants(variants.filter((_, xi) => xi !== i))}
                      className="col-span-1 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 justify-self-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <label className={label}>Notes</label>
            <textarea className={`${field} min-h-[70px]`} value={draft.notes} placeholder="Anything the sales team should know when quoting this."
              onChange={e => setDraft({ ...draft, notes: e.target.value })} />
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {product ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>
    </div>
  );
};
