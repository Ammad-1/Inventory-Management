import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  Truck, Check, AlertTriangle, RefreshCw, Link2, Eye, EyeOff, Save, PackageMinus, Trash2
} from 'lucide-react';

interface Store {
  storeId: number;
  storeName: string;
  marketplace: string | null;
  active: number;
}

interface Settings {
  hasApiKey: boolean;
  hasApiSecret: boolean;
  connected: boolean;
  autoDeduct: boolean;
  deductOnStatus: 'awaiting_shipment' | 'shipped';
  connectedAt: string | null;
  lastSyncedAt: string | null;
  stores: Store[];
}

interface SkuRow {
  sku: string;
  title: string;
  count: number;
  units: number;
  resolvedVia: string;
  mapped: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  any: 'Any status'
};

export const ShipStationPanel: React.FC = () => {
  const { inventory, refreshAll } = useInventory();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const [orderStatus, setOrderStatus] = useState('awaiting_shipment');
  const [storeId, setStoreId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pages, setPages] = useState(1);
  const [deductOnSync, setDeductOnSync] = useState(false);

  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestBlank, setSuggestBlank] = useState<Record<string, string>>({});
  const [suggestBox, setSuggestBox] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const blanks = useMemo(() => inventory.filter(i => i.category === 'blank'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);

  const load = async () => {
    try {
      setSettings(await fetch('/api/shipstation/settings').then(r => r.json()));
    } catch { /* shows as disconnected */ }
  };
  const loadSkus = async () => {
    try {
      const d = await fetch('/api/shipstation/unmapped-skus').then(r => r.json());
      setSkus(d.skus || []);
    } catch { setSkus([]); }
  };

  const loadRules = async () => {
    try {
      const [r, sg] = await Promise.all([
        fetch('/api/shipstation/rules').then(x => x.json()),
        fetch('/api/shipstation/rules/suggest').then(x => x.json())
      ]);
      setRules(Array.isArray(r) ? r : []);
      setSuggestions(sg.suggestions || []);
    } catch { setRules([]); setSuggestions([]); }
  };

  useEffect(() => { load(); loadSkus(); loadRules(); }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label); setError(null); setNotice(null);
    try {
      const data = await fn();
      if (data?.error) setError(data.error);
      else if (data?.message) setNotice(data.message);
      return data;
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const handleSave = () => run('save', async () => {
    const body: any = {};
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    if (apiSecret.trim()) body.apiSecret = apiSecret.trim();
    const data = await fetch('/api/shipstation/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());
    if (!data.error) { setApiKey(''); setApiSecret(''); await load(); }
    return data;
  });

  const handleTest = () => run('test', async () => {
    const data = await fetch('/api/shipstation/test', { method: 'POST' }).then(r => r.json());
    await load();
    return data;
  });

  const handleSetting = (patch: Record<string, any>) => run('setting', async () => {
    const data = await fetch('/api/shipstation/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
    }).then(r => r.json());
    await load();
    return data;
  });

  const handleSync = () => run('sync', async () => {
    const data = await fetch('/api/shipstation/orders/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderStatus,
        storeId: storeId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        pages,
        deduct: deductOnSync
      })
    }).then(r => r.json());
    if (!data.error) await Promise.all([loadSkus(), refreshAll(), load()]);
    return data;
  });

  const saveMapping = (sku: string, blankItemId: string, packagingItemId: string) =>
    run('map', async () => {
      const data = await fetch('/api/shipstation/sku-map', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, blankItemId: blankItemId || null, packagingItemId: packagingItemId || null })
      }).then(r => r.json());
      if (!data.error) { await loadSkus(); await refreshAll(); }
      return data;
    });

  const applyRule = (pattern: string, blankItemId: string, packagingItemId: string) =>
    run('rule', async () => {
      const saved = await fetch('/api/shipstation/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, blankItemId, packagingItemId: packagingItemId || null })
      }).then(r => r.json());
      if (saved.error) return saved;
      // A new rule only helps if it reaches orders already fetched
      const re = await fetch('/api/shipstation/orders/reresolve', { method: 'POST' }).then(r => r.json());
      await Promise.all([loadRules(), loadSkus(), refreshAll()]);
      return { message: `${saved.message}. ${re.message || ''}`.trim() };
    });

  const deleteRule = (id: string) =>
    run('rule', async () => {
      const data = await fetch(`/api/shipstation/rules/${id}`, { method: 'DELETE' }).then(r => r.json());
      await Promise.all([loadRules(), loadSkus(), refreshAll()]);
      return data;
    });

  const reresolve = () =>
    run('reresolve', async () => {
      const data = await fetch('/api/shipstation/orders/reresolve', { method: 'POST' }).then(r => r.json());
      await Promise.all([loadSkus(), loadRules(), refreshAll()]);
      return data;
    });

  const field = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const label = 'text-xs font-semibold text-slate-600';
  const unmapped = skus.filter(s => !s.mapped).length;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">ShipStation</h3>
            <p className="text-xs text-slate-500">
              {settings?.connected
                ? `${settings.stores.length} store${settings.stores.length === 1 ? '' : 's'} — every channel in one feed`
                : 'One connection covering Shopify, Amazon, eBay and TikTok, with SKUs already normalised.'}
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
          settings?.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          {settings?.connected ? 'Credentials saved' : 'Not connected'}
        </span>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1.4fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor="ss-key" className={label}>
            API key {settings?.hasApiKey && <span className="font-normal text-emerald-700">· saved</span>}
          </label>
          <input id="ss-key" type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? '•••••••• (leave blank to keep)' : 'ShipStation → Settings → API'}
            className={`${field} font-mono`} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="ss-secret" className={label}>
              API secret {settings?.hasApiSecret && <span className="font-normal text-emerald-700">· saved</span>}
            </label>
            <button type="button" onClick={() => setShowSecret(v => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
              {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
          <input id="ss-secret" type={showSecret ? 'text' : 'password'} value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            placeholder={settings?.hasApiSecret ? '•••••••• (leave blank to keep)' : 'API secret'}
            className={`${field} font-mono`} />
        </div>
        <div className="flex items-end gap-2">
          <button type="button" onClick={handleSave} disabled={busy === 'save'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={handleTest} disabled={busy === 'test' || !settings?.hasApiSecret}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Link2 className="h-3.5 w-3.5" /> {busy === 'test' ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span>
        </div>
      )}

      {settings?.connected && (
        <>
          {/* Stores */}
          {settings.stores.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={label}>Stores</span>
              {settings.stores.map(s => (
                <span key={s.storeId} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {s.storeName}
                </span>
              ))}
            </div>
          )}

          {/* Fetch */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="ss-status" className={label}>Status</label>
                <select id="ss-status" value={orderStatus} onChange={e => setOrderStatus(e.target.value)} className={field}>
                  <option value="awaiting_shipment">Awaiting Shipment</option>
                  <option value="shipped">Shipped</option>
                  <option value="any">Any status</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ss-store" className={label}>Store</label>
                <select id="ss-store" value={storeId} onChange={e => setStoreId(e.target.value)} className={field}>
                  <option value="">All stores</option>
                  {settings.stores.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ss-from" className={label}>From</label>
                <input id="ss-from" type="date" value={fromDate} max={toDate || undefined}
                  onChange={e => setFromDate(e.target.value)} className={field} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ss-to" className={label}>To</label>
                <input id="ss-to" type="date" value={toDate} min={fromDate || undefined}
                  onChange={e => setToDate(e.target.value)} className={field} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ss-pages" className={label}>Pages (100 each)</label>
                <input id="ss-pages" type="number" min={1} max={10} value={pages}
                  onChange={e => setPages(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                  className={`${field} w-24 font-mono tabular-nums`} />
              </div>

              <button type="button" onClick={handleSync} disabled={busy === 'sync'}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                {busy === 'sync' ? 'Fetching…' : 'Fetch orders'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={deductOnSync} onChange={e => setDeductOnSync(e.target.checked)}
                  className="h-3.5 w-3.5 accent-indigo-600" />
                Deduct stock for fully-mapped orders
              </label>

              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>Deduct when status is</span>
                <select
                  value={settings.deductOnStatus}
                  onChange={e => handleSetting({ deductOnStatus: e.target.value })}
                  aria-label="Status at which stock is deducted"
                  className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                >
                  <option value="awaiting_shipment">Awaiting Shipment</option>
                  <option value="shipped">Shipped</option>
                </select>
              </label>

              {settings.lastSyncedAt && (
                <span className="ml-auto text-xs text-slate-500">
                  Last fetched {new Date(settings.lastSyncedAt).toLocaleString('en-GB')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Rate limited to 40 requests a minute by ShipStation, so each page of 100 orders is one request.
            </p>
          </div>

          {/* Mapping rules */}
          <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className={label}>Mapping rules</span>
                <p className="text-xs text-slate-500">
                  One rule covers a whole family of SKUs, including designs you haven&rsquo;t sold yet.
                </p>
              </div>
              <button
                type="button"
                onClick={reresolve}
                disabled={busy === 'reresolve'}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'reresolve' ? 'Re-checking…' : 'Re-check orders'}
              </button>
            </div>

            {/* Suggested patterns */}
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-indigo-700">
                  Suggested from your unmapped SKUs
                </span>
                {suggestions.map(sg => (
                  <div key={sg.pattern} className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 py-2">
                    <span className="font-mono text-xs font-bold text-slate-800">{sg.pattern}</span>
                    <span className="text-xs text-slate-600">
                      {sg.skuCount} SKUs · {sg.units} units
                    </span>
                    <span className="max-w-[220px] truncate text-xs text-slate-500" title={sg.sample.join(', ')}>
                      {sg.sample.slice(0, 2).join(', ')}
                    </span>

                    <select
                      aria-label={`Blank for ${sg.pattern}`}
                      value={suggestBlank[sg.pattern] || ''}
                      onChange={e => setSuggestBlank(v => ({ ...v, [sg.pattern]: e.target.value }))}
                      className="ml-auto rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                    >
                      <option value="">— blank —</option>
                      {blanks.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                    </select>
                    <select
                      aria-label={`Packaging for ${sg.pattern}`}
                      value={suggestBox[sg.pattern] || ''}
                      onChange={e => setSuggestBox(v => ({ ...v, [sg.pattern]: e.target.value }))}
                      className="rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                    >
                      <option value="">no packaging</option>
                      {packaging.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                    </select>
                    <button
                      type="button"
                      disabled={!suggestBlank[sg.pattern] || busy === 'rule'}
                      onClick={() => applyRule(sg.pattern, suggestBlank[sg.pattern], suggestBox[sg.pattern] || '')}
                      className="rounded-lg border border-indigo-700 bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Create rule
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active rules */}
            {rules.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Active rules</span>
                {rules.map(r => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                    <span className="font-mono text-xs font-bold text-slate-800">{r.pattern}</span>
                    <span className="text-xs text-slate-500">→</span>
                    <span className="font-mono text-xs text-emerald-700">{r.blankSku}</span>
                    {r.packagingSku && <span className="font-mono text-xs text-slate-600">+ {r.packagingSku}</span>}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      matches {r.matchCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      aria-label={`Remove rule ${r.pattern}`}
                      className="ml-auto rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {rules.length === 0 && suggestions.length === 0 && (
              <p className="text-xs text-slate-500">Fetch orders and suggested rules appear here.</p>
            )}
          </div>

          {/* SKU mapping */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between">
              <span className={label}>
                SKU mapping {unmapped > 0 && <span className="ml-1 text-pink-700">· {unmapped} unmapped</span>}
              </span>
              <span className="text-xs text-slate-500">{skus.length} SKU{skus.length === 1 ? '' : 's'} seen on orders</span>
            </div>

            {skus.length === 0 ? (
              <p className="text-xs text-slate-500">Fetch orders and the SKUs they sold appear here to map.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Sold SKU</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">Units</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Blank consumed</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Packaging</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skus.map(row => (
                      <tr key={row.sku} className={`border-b border-slate-100 last:border-0 ${row.mapped ? '' : 'bg-pink-50/40'}`}>
                        <td className="px-3 py-1.5">
                          <div className="font-mono font-semibold text-slate-800">{row.sku}</div>
                          <div className="max-w-[220px] truncate text-slate-500" title={row.title}>{row.title}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{row.units}</td>
                        <td className="px-3 py-1.5">
                          <select aria-label={`Blank consumed by ${row.sku}`} defaultValue=""
                            onChange={e => saveMapping(row.sku, e.target.value, '')}
                            className="rounded border border-slate-200 px-1.5 py-1 font-mono text-xs">
                            <option value="">— choose —</option>
                            {blanks.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select aria-label={`Packaging used by ${row.sku}`} defaultValue=""
                            onChange={e => saveMapping(row.sku, '', e.target.value)}
                            className="rounded border border-slate-200 px-1.5 py-1 font-mono text-xs">
                            <option value="">None</option>
                            {packaging.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          {row.mapped ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                              <PackageMinus className="h-3 w-3" />
                              {row.resolvedVia === 'exact_sku' ? 'matches catalogue' : row.resolvedVia === 'rule' ? 'by rule' : 'mapped'}
                            </span>
                          ) : (
                            <span className="rounded bg-pink-100 px-1.5 py-0.5 font-semibold text-pink-700">not mapped</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
