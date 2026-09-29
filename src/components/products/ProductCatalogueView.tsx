import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, ImageIcon, ExternalLink, Pencil, Trash2,
  AlertTriangle, Package, Tag
} from 'lucide-react';
import { Product, ProductReference } from '../../types';
import { ProductEditorModal } from './ProductEditorModal';

/**
 * The quoting catalogue: sellable configurations with their decoration
 * pricing. Each one points at the blank it consumes so a quote can be
 * priced against real landed cost.
 */
export const ProductCatalogueView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [reference, setReference] = useState<ProductReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([
        fetch('/api/products').then(x => x.json()),
        fetch('/api/products/reference').then(x => x.json())
      ]);
      if (p.error) throw new Error(p.error);
      setProducts(p);
      setReference(r);
    } catch (e: any) {
      setError(e.message || 'Could not load the catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p =>
      (!categoryId || p.categoryId === categoryId) &&
      (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
        (p.blankSku || '').toLowerCase().includes(q))
    );
  }, [products, search, categoryId]);

  const unlinked = products.filter(p => !p.blankItemId).length;
  const unpriced = products.filter(p => p.pricing.length === 0).length;

  const remove = async (p: Product) => {
    if (!window.confirm(`Delete ${p.sku} (${p.name})? Its pricing goes with it. This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      const r = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete that product.');
    } finally {
      setDeletingId(null);
    }
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setEditorOpen(true); };

  /** Cheapest unit cost across the matrix — what a quote would start from. */
  const fromPrice = (p: Product) => {
    const units = p.pricing.filter(x => x.unitCost > 0).map(x => x.unitCost);
    return units.length ? Math.min(...units) : null;
  };

  return (
    <div className="space-y-5 pt-6">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {loading ? ' ' : `${filtered.length} of ${products.length} product${products.length === 1 ? '' : 's'}`}
        </p>
        <button onClick={openNew}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" /> Create product
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(unlinked > 0 || unpriced > 0) && !loading && products.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unlinked > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
              {unlinked} product{unlinked === 1 ? '' : 's'} not linked to a blank — those quote on decoration cost alone
            </span>
          )}
          {unpriced > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
              {unpriced} with no decoration pricing yet
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            placeholder="Search SKU, name or blank"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {reference?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading catalogue…
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white">
          <Tag className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No products yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Add the products you quote on — a mug, a t-shirt, a tote — link each to the blank
            it consumes, and set the price for each decoration and print area.
          </p>
          <button onClick={openNew}
            className="mt-4 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create the first product
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-white">
          Nothing matches that search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const from = fromPrice(p);
            return (
              <div key={p.id}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-md hover:border-slate-300 transition-all flex flex-col">

                <div className="h-36 bg-slate-50 border-b border-slate-100 flex items-center justify-center overflow-hidden">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className="max-h-full max-w-full object-contain"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    : <ImageIcon className="w-7 h-7 text-slate-300" />}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{p.name}</h3>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">{p.sku}</p>
                    </div>
                    {p.categoryName && (
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                        {p.categoryName}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Stock cost</div>
                      <div className="font-bold text-slate-800 tabular-nums">£{p.stockCost.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Decoration from</div>
                      <div className="font-bold text-slate-800 tabular-nums">
                        {from !== null ? `£${from.toFixed(2)}` : <span className="text-slate-400 font-medium">Not priced</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3 h-3 shrink-0" />
                      {p.blankSku ? (
                        <span className="truncate">
                          {p.blankSku}
                          {p.blankStock !== null && (
                            <span className={p.blankStock! > 0 ? 'text-slate-500' : 'text-amber-600 font-semibold'}>
                              {' '}· {p.blankStock!.toLocaleString()} in stock
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold">No blank linked</span>
                      )}
                    </div>
                    <div>
                      {p.printAreas.length} print area{p.printAreas.length === 1 ? '' : 's'} · {p.pricing.length} priced combination{p.pricing.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                    <button onClick={() => openEdit(p)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {p.supplierProductLink && (
                      <a href={p.supplierProductLink} target="_blank" rel="noopener noreferrer"
                        title="Open supplier page"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button onClick={() => remove(p)} disabled={deletingId === p.id} title="Delete product"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50">
                      {deletingId === p.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProductEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={load}
        reference={reference}
        product={editing}
      />
    </div>
  );
};
