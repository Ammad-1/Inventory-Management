import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, ImageIcon, Link2, AlertTriangle, Plus, Trash2, Package, Pencil
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { Product, ProductReference, ProductPricing, ProductVariant } from '../../types';
import { requestQuoteForProduct } from '../../lib/quoteHandoff';

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
  categoryId: '', type: '', colour: '', size: '',
  supplierName: '', supplierProductLink: '', imageUrl: '',
  blankItemId: '', packagingItemId: ''
});

const F = 'w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 disabled:bg-slate-50';
const L = 'block text-[12px] font-bold text-slate-700 mb-1';
const REQ = <span className="text-rose-500"> *</span>;
const PANEL = 'rounded-lg border border-slate-300 bg-white';

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

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setImageNote(null);
    if (product) {
      setDraft({
        sku: product.sku || '', name: product.name || '',
        description: product.description || '', notes: product.notes || '',
        categoryId: product.categoryId || '', type: product.type || '',
        colour: product.colour || '', size: product.size || '',
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
  const allAreas = category?.printAreas || [];
  const selectedAreas = allAreas.filter(a => printAreaIds.includes(a.id));

  /** A category offers a defined set of decorations; empty means all of them. */
  const decorations = useMemo(() => {
    const all = reference?.decorationTypes || [];
    if (!category || category.decorationTypeIds.length === 0) return all;
    return all.filter(d => category.decorationTypeIds.includes(d.id));
  }, [reference, category]);

  const blanks = useMemo(() => inventory.filter(i => i.category !== 'packaging'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);

  const blank = inventory.find(i => i.id === draft.blankItemId);
  const boxItem = inventory.find(i => i.id === draft.packagingItemId);
  const stockCost =
    (blank ? blank.landedCostPerUnit || blank.costPerUnit || 0 : 0) +
    (boxItem ? boxItem.landedCostPerUnit || boxItem.costPerUnit || 0 : 0);

  if (!isOpen) return null;

  const toggleArea = (areaId: string) => {
    setPrintAreaIds(prev => {
      if (prev.includes(areaId)) {
        // Dropping an area drops its pricing rows with it
        setPricing(p => p.filter(x => x.printAreaId !== areaId));
        return prev.filter(x => x !== areaId);
      }
      return [...prev, areaId];
    });
  };

  const changeCategory = (categoryId: string) => {
    setDraft(d => ({ ...d, categoryId }));
    // Print areas and decorations both belong to a category
    setPrintAreaIds([]);
    setPricing([]);
  };

  const addPricingRow = () => {
    if (selectedAreas.length === 0) {
      return setError('Choose at least one print area before adding pricing.');
    }
    setPricing([...pricing, {
      decorationTypeId: decorations[0]?.id || '',
      printAreaId: selectedAreas[0].id,
      setupCost: 0, unitCost: 0, minCharge: 0, notes: '', active: 1
    }]);
  };

  const setRow = (i: number, patch: Partial<ProductPricing>) =>
    setPricing(pricing.map((p, x) => (x === i ? { ...p, ...patch } : p)));

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
      if (!r.ok) setImageNote(d.error || 'Could not read an image from that page.');
      else {
        setDraft(prev => ({ ...prev, imageUrl: d.imageUrl, name: prev.name || d.title || '' }));
        setImageNote('Image found — check it looks right.');
      }
    } catch {
      setImageNote('Could not reach that page.');
    } finally {
      setFetchingImage(false);
    }
  };

  const save = async (thenQuote: boolean) => {
    setError(null);
    if (!draft.sku.trim()) return setError('Product SKU is required.');
    if (!draft.name.trim()) return setError('Product name is required.');

    setSaving(true);
    try {
      const r = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product?.id, ...draft, printAreaIds,
          pricing: pricing.filter(p => p.decorationTypeId && p.printAreaId),
          variants: variants.filter(v => v.brand || v.quality || v.baseCost)
        })
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error || 'Could not save the product.');
      onSaved();
      onClose();
      if (thenQuote && d.id) {
        // Saved first, so the quote is built against a product that exists
        requestQuoteForProduct(d.id);
      }
    } catch (e: any) {
      setError(e.message || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-[1280px] my-4">

        {/* -------------------------------------------------------- header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white rounded-t-2xl sticky top-0 z-30">
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">
              {product ? 'Edit' : 'Create'}
            </h2>
            <p className="text-sm text-slate-500 leading-tight">PrintBerry Product</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {error && (
            <div ref={errorRef} className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {/* ------------------------------------------- identity + decos */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-2.5">
              <div>
                <label className={L}>Category{REQ}</label>
                <select className={F} value={draft.categoryId} onChange={e => changeCategory(e.target.value)}>
                  <option value="">Select…</option>
                  {reference?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={L}>Colour{REQ}</label>
                <input className={F} value={draft.colour} placeholder="White"
                  onChange={e => setDraft({ ...draft, colour: e.target.value })} />
              </div>
              <div>
                <label className={L}>Product SKU{REQ}</label>
                <input className={F} value={draft.sku} placeholder="Enter product SKU…"
                  onChange={e => setDraft({ ...draft, sku: e.target.value })} />
              </div>
              <div>
                <label className={L}>Supplier Name</label>
                <input className={F} value={draft.supplierName} placeholder="e.g. Ralawise"
                  onChange={e => setDraft({ ...draft, supplierName: e.target.value })} />
              </div>
              <div className="row-span-2">
                <label className={L}>Description</label>
                <textarea className={`${F} h-[94px] resize-none`} value={draft.description}
                  placeholder="Enter product description…"
                  onChange={e => setDraft({ ...draft, description: e.target.value })} />
              </div>

              <div>
                <label className={L}>Size{REQ}</label>
                <input className={F} value={draft.size} placeholder="11oz"
                  onChange={e => setDraft({ ...draft, size: e.target.value })} />
              </div>
              <div>
                <label className={L}>Type{REQ}</label>
                <input className={F} value={draft.type} placeholder="Standard Mug"
                  onChange={e => setDraft({ ...draft, type: e.target.value })} />
              </div>
              <div>
                <label className={L}>Product Notes</label>
                <input className={F} value={draft.notes} placeholder="Add product notes…"
                  onChange={e => setDraft({ ...draft, notes: e.target.value })} />
              </div>
              <div>
                <label className={L}>Supplier Product Link</label>
                <div className="flex gap-1.5">
                  <input className={F} value={draft.supplierProductLink} placeholder="Enter product link…"
                    onChange={e => setDraft({ ...draft, supplierProductLink: e.target.value })} />
                  <button onClick={fetchImage} disabled={fetchingImage} title="Read the product image from that page"
                    className="shrink-0 px-2.5 rounded-md bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">
                    {fetchingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Decoration types offered by this category */}
            <div className={`${PANEL} p-3`}>
              <h3 className="text-[13px] font-bold text-slate-900 text-center mb-2">Decoration Types</h3>
              {!category ? (
                <p className="text-[11px] text-slate-500 text-center py-3">Choose a category.</p>
              ) : (
                <div className="grid grid-cols-2 border border-slate-300 rounded overflow-hidden">
                  {decorations.map((d, i) => (
                    <div key={d.id}
                      className={`px-2 py-1.5 text-[12px] text-slate-700 text-center ${
                        i % 2 === 0 ? 'border-r border-slate-300' : ''
                      } ${i >= 2 ? 'border-t border-slate-300' : ''}`}>
                      {d.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* -------------------------------- print areas + their diagram */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4">
            <section className={`${PANEL} p-4`}>
              <h3 className="text-[15px] font-bold text-slate-900 mb-3">Available Print Areas</h3>
              {!category ? (
                <p className="text-sm text-slate-500">Choose a category to see its print areas.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 border border-slate-300 rounded overflow-hidden">
                    {allAreas.map((a, i) => {
                      const on = printAreaIds.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleArea(a.id)}
                          className={`px-3 py-2 text-[13px] text-left transition-colors ${
                            i % 2 === 0 ? 'border-r border-slate-300' : ''
                          } ${i >= 2 ? 'border-t border-slate-300' : ''} ${
                            on ? 'bg-indigo-50 text-indigo-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                          }`}>
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Click the areas this product offers. {printAreaIds.length} selected.
                  </p>
                </>
              )}
            </section>

            <section className={`${PANEL} p-4`}>
              <h3 className="text-[15px] font-bold text-slate-900 mb-3">Print Area Diagram</h3>
              {!category ? (
                <p className="text-sm text-slate-500">Choose a category.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-300 rounded overflow-hidden">
                  {allAreas.map(a => {
                    const on = printAreaIds.includes(a.id);
                    return (
                      <button key={a.id} onClick={() => toggleArea(a.id)}
                        className={`border-r border-b border-slate-300 last:border-r-0 p-2 transition-colors ${
                          on ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'
                        }`}>
                        <div className={`text-[10px] font-bold text-center mb-1 uppercase tracking-wide ${
                          on ? 'text-indigo-700' : 'text-slate-700'
                        }`}>
                          {a.name}
                        </div>
                        <div className="h-[72px] flex items-center justify-center">
                          {a.imagePath
                            ? <img src={a.imagePath} alt={a.name} className="max-h-full max-w-full object-contain"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                            : <ImageIcon className="w-5 h-5 text-slate-300" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ----------------------------------------------- stock linkage */}
          <section className={`${PANEL} p-4`}>
            <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-500" /> What this consumes from stock
            </h3>
            <p className="text-[12px] text-slate-500 italic mb-3">
              Links the product to real landed cost, so a quote prices against stock rather than a guess.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className={L}>Blank</label>
                <select className={F} value={draft.blankItemId}
                  onChange={e => setDraft({ ...draft, blankItemId: e.target.value })}>
                  <option value="">Not linked</option>
                  {blanks.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <div>
                <label className={L}>Packaging</label>
                <select className={F} value={draft.packagingItemId}
                  onChange={e => setDraft({ ...draft, packagingItemId: e.target.value })}>
                  <option value="">Not linked</option>
                  {packaging.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <div className="pb-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Stock cost per unit</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">£{stockCost.toFixed(4)}</div>
                <div className="text-[11px] text-slate-500">
                  {blank ? `${blank.currentStock.toLocaleString()} ${blank.sku} in stock` : 'Link a blank to price on real cost'}
                </div>
              </div>
            </div>
          </section>

          {/* --------------------------------------------------- variants */}
          <section className={`${PANEL} p-4`}>
            <h3 className="text-[15px] font-bold text-slate-900">Product Variants</h3>
            <p className="text-[12px] text-slate-500 italic mb-3">
              Add all available brands and qualities for this product.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-300 rounded">
                <thead className="bg-slate-50 text-[12px] font-bold text-slate-700">
                  <tr>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300">Brand</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300">Qualities</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300">Colour</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-32">Base Cost</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-36">Price Adjustment</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-slate-300 w-32">Final Price</th>
                    <th className="w-10 border-b border-slate-300"></th>
                  </tr>
                </thead>
                <tbody>
                  {variants.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-[13px] text-slate-500 py-4">
                      No variants yet.
                    </td></tr>
                  )}
                  {variants.map((v, i) => {
                    const final = (Number(v.baseCost) || 0) + (Number(v.priceAdjustment) || 0);
                    const set = (patch: Partial<ProductVariant>) =>
                      setVariants(variants.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1.5 border-r border-slate-200">
                          <input className={F} value={v.brand || ''} placeholder="PrintBerry"
                            onChange={e => set({ brand: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-200">
                          <input className={F} value={v.quality || ''} placeholder="Heavy Cotton"
                            onChange={e => set({ quality: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-200">
                          <input className={F} value={v.colour || ''} placeholder="White"
                            onChange={e => set({ colour: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-200">
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] text-slate-500 px-1.5 py-1.5 bg-slate-100 rounded-l-md border border-slate-300">£</span>
                            <input type="number" step="0.01" className={`${F} text-right`} value={v.baseCost || ''}
                              onChange={e => set({ baseCost: Number(e.target.value) || 0 })} />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-200">
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] text-slate-500 px-1.5 py-1.5 bg-slate-100 rounded-l-md border border-slate-300">£</span>
                            <input type="number" step="0.01" className={`${F} text-right`} value={v.priceAdjustment || ''}
                              placeholder="+0.00"
                              onChange={e => set({ priceAdjustment: Number(e.target.value) || 0 })} />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">
                          £{final.toFixed(2)}
                        </td>
                        <td className="px-1 text-center">
                          <button onClick={() => setVariants(variants.filter((_, xi) => xi !== i))}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={() => setVariants([...variants, { brand: '', quality: '', colour: draft.colour, baseCost: 0, priceAdjustment: 0 }])}
              className="mt-2 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add variant
            </button>
          </section>

          {/* ---------------------------------------------------- pricing */}
          <section className={`${PANEL} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Pricing by Decoration Type and Print Area</h3>
                <p className="text-[12px] text-slate-500 italic">
                  Enter setup and unit costs for each combination of decoration type and print area.
                </p>
              </div>
              <button onClick={addPricingRow}
                className="shrink-0 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add pricing
              </button>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border border-slate-300 rounded">
                <thead className="bg-slate-50 text-[12px] font-bold text-slate-700">
                  <tr>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-40">Decoration Type</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-40">Print Area</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-28">Setup Cost</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-28">Unit Cost</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-28">Min. Charge</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300">Notes</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-r border-slate-300 w-16">Active</th>
                    <th className="text-center font-bold px-2 py-2 border-b border-slate-300 w-14">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-[13px] text-slate-500 py-4">
                      No pricing yet. Select print areas above, then add a row.
                    </td></tr>
                  )}
                  {pricing.map((p, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 border-r border-slate-200">
                        <select className={F} value={p.decorationTypeId}
                          onChange={e => setRow(i, { decorationTypeId: e.target.value })}>
                          {decorations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 border-r border-slate-200">
                        <select className={F} value={p.printAreaId}
                          onChange={e => setRow(i, { printAreaId: e.target.value })}>
                          {selectedAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      {(['setupCost', 'unitCost', 'minCharge'] as const).map(f => (
                        <td key={f} className="px-2 py-1.5 border-r border-slate-200">
                          <div className="flex items-center">
                            <span className="text-[12px] text-slate-500 px-1.5 py-1.5 bg-slate-100 rounded-l-md border border-r-0 border-slate-300">£</span>
                            <input type="number" min="0" step="0.01"
                              className={`${F} rounded-l-none text-right`} value={p[f] || ''} placeholder="0.00"
                              onChange={e => setRow(i, { [f]: Number(e.target.value) || 0 } as Partial<ProductPricing>)} />
                          </div>
                        </td>
                      ))}
                      <td className="px-2 py-1.5 border-r border-slate-200">
                        <input className={F} value={p.notes || ''} placeholder="e.g. Full colour on main body"
                          onChange={e => setRow(i, { notes: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-center">
                        <button onClick={() => setRow(i, { active: p.active === 0 ? 1 : 0 })}
                          title={p.active === 0 ? 'Not offered' : 'Offered'}
                          className={`w-10 h-5 rounded-full transition-colors relative ${
                            p.active === 0 ? 'bg-slate-300' : 'bg-emerald-500'
                          }`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                            p.active === 0 ? 'left-0.5' : 'left-[22px]'
                          }`} />
                        </button>
                      </td>
                      <td className="px-1 text-center">
                        <button onClick={() => setPricing(pricing.filter((_, x) => x !== i))}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ------------------------------------------------- product image */}
          <section className={`${PANEL} p-4 flex items-start gap-4`}>
            <div className="w-28 h-28 rounded border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {draft.imageUrl
                ? <img src={draft.imageUrl} alt="" className="max-h-full max-w-full object-contain"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : <ImageIcon className="w-6 h-6 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <label className={L}>Product image URL</label>
              <input className={F} value={draft.imageUrl} placeholder="https://…/product.jpg"
                onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} />
              <p className="text-[11px] text-slate-500 mt-1.5">
                {imageNote || 'Paste a link, or use the button beside the supplier link to read the image from their page.'}
              </p>
            </div>
          </section>
        </div>

        {/* -------------------------------------------------------- footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-white rounded-b-2xl sticky bottom-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back to list
          </button>
          <button onClick={() => save(false)} disabled={saving}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {product ? 'Save product' : 'Create product'}
          </button>
          <button onClick={() => save(true)} disabled={saving}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            Create quote
          </button>
        </div>
      </div>
    </div>
  );
};
