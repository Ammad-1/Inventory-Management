import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  ShoppingBag, Check, AlertTriangle, RefreshCw, Link2, Eye, EyeOff, Save, Webhook
} from 'lucide-react';

interface ShopifySettings {
  shopDomain: string;
  shopName: string;
  apiVersion: string;
  autoDeduct: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  tokenExpiresAt: string | null;
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  registeredWebhooks: { topic: string; id: string; address: string }[];
}

interface SkuRow {
  sku: string;
  title: string;
  count: number;
  resolvedVia: string;
  mapped: boolean;
}

export const ShopifyConnectPanel: React.FC = () => {
  const { inventory, refreshAll } = useInventory();

  const [settings, setSettings] = useState<ShopifySettings | null>(null);
  const [shopDomain, setShopDomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [autoDeduct, setAutoDeduct] = useState(false);

  const [syncMode, setSyncMode] = useState<'recent' | 'date' | 'range'>('recent');
  const [syncLimit, setSyncLimit] = useState(10);
  const today = new Date().toISOString().slice(0, 10);
  const [syncDate, setSyncDate] = useState(today);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [deductOnSync, setDeductOnSync] = useState(false);

  const [callbackUrl, setCallbackUrl] = useState('');
  const [skus, setSkus] = useState<SkuRow[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const blanks = useMemo(() => inventory.filter(i => i.category === 'blank'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);

  const loadSettings = async () => {
    try {
      const s = await fetch('/api/shopify/settings').then(r => r.json());
      setSettings(s);
      setShopDomain(s.shopDomain || '');
      setAutoDeduct(!!s.autoDeduct);
    } catch {
      /* panel simply shows as disconnected */
    }
  };

  const loadSkus = async () => {
    try {
      const d = await fetch('/api/shopify/unmapped-skus').then(r => r.json());
      setSkus(d.skus || []);
    } catch {
      setSkus([]);
    }
  };

  useEffect(() => {
    loadSettings();
    loadSkus();
  }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const data = await fn();
      if (data?.error) setError(data.error);
      else if (data?.message) setNotice(data.message);
      return data;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSave = () =>
    run('save', async () => {
      const body: any = { shopDomain, autoDeduct };
      if (clientId.trim()) body.clientId = clientId.trim();
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      const data = await fetch('/api/shopify/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(r => r.json());
      if (!data.error) {
        setClientId('');
        setClientSecret('');
        await loadSettings();
      }
      return data;
    });

  const handleTest = () =>
    run('test', async () => {
      const data = await fetch('/api/shopify/test', { method: 'POST' }).then(r => r.json());
      await loadSettings();
      return data;
    });

  const handleSync = () =>
    run('sync', async () => {
      const body =
        syncMode === 'date'
          ? { mode: 'date', date: syncDate, deduct: deductOnSync }
          : syncMode === 'range'
          ? { mode: 'range', fromDate, toDate, deduct: deductOnSync }
          : { mode: 'recent', limit: syncLimit, deduct: deductOnSync };
      const data = await fetch('/api/shopify/orders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(r => r.json());
      if (!data.error) {
        await Promise.all([loadSkus(), refreshAll(), loadSettings()]);
      }
      return data;
    });

  const handleRegisterWebhooks = () =>
    run('hooks', async () => {
      const data = await fetch('/api/shopify/webhooks/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl: callbackUrl.trim() })
      }).then(r => r.json());
      await loadSettings();
      return data;
    });

  const saveMapping = (sku: string, blankItemId: string, packagingItemId: string) =>
    run('map', async () => {
      const data = await fetch('/api/shopify/sku-map', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifySku: sku, blankItemId: blankItemId || null, packagingItemId: packagingItemId || null })
      }).then(r => r.json());
      if (!data.error) await loadSkus();
      return data;
    });

  const field =
    'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const label = 'text-xs font-semibold text-slate-600';
  const unmappedCount = skus.filter(s => !s.mapped).length;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Shopify</h3>
            <p className="text-xs text-slate-500">
              {settings?.connected
                ? `Connected${settings.shopName ? ` to ${settings.shopName}` : ''} · API ${settings.apiVersion}`
                : 'Dev Dashboard app — client ID and secret are exchanged for a 24-hour token automatically.'}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            settings?.connected
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {settings?.connected ? 'Credentials saved' : 'Not connected'}
        </span>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1.4fr_1.4fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor="shop-domain" className={label}>Shop domain</label>
          <input
            id="shop-domain"
            type="text"
            value={shopDomain}
            onChange={e => setShopDomain(e.target.value)}
            placeholder="your-store.myshopify.com"
            className={`${field} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="client-id" className={label}>
            Client ID {settings?.hasClientId && <span className="font-normal text-emerald-700">· saved</span>}
          </label>
          <input
            id="client-id"
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder={settings?.hasClientId ? '•••••••• (leave blank to keep)' : 'From Dev Dashboard → Settings'}
            className={`${field} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="client-secret" className={label}>
              Client secret {settings?.hasClientSecret && <span className="font-normal text-emerald-700">· saved</span>}
            </label>
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id="client-secret"
            type={showSecret ? 'text' : 'password'}
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={settings?.hasClientSecret ? '•••••••• (leave blank to keep)' : 'shpss_…'}
            className={`${field} font-mono`}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy === 'save'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={busy === 'test' || !settings?.hasClientSecret}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" /> {busy === 'test' ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        The secret is stored server-side and never returned to this screen. If it has ever been shared or screenshotted,
        rotate it in the Dev Dashboard and save the new one here.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {settings?.connected && (
        <>
          {/* Order sync */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={label}>Fetch orders</span>
              {(['recent', 'date', 'range'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSyncMode(m)}
                  aria-pressed={syncMode === m}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    syncMode === m
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m === 'recent' ? 'Latest' : m === 'date' ? 'Single day' : 'Date range'}
                </button>
              ))}

              {syncMode === 'recent' && (
                <input
                  type="number" min={1} max={250} value={syncLimit}
                  onChange={e => setSyncLimit(Math.min(250, Math.max(1, Number(e.target.value) || 1)))}
                  aria-label="Number of recent orders"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs tabular-nums"
                />
              )}
              {syncMode === 'date' && (
                <input type="date" value={syncDate} max={today} onChange={e => setSyncDate(e.target.value)} aria-label="Order date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              )}
              {syncMode === 'range' && (
                <>
                  <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} aria-label="From date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                  <input type="date" value={toDate} min={fromDate} max={today} onChange={e => setToDate(e.target.value)} aria-label="To date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                </>
              )}

              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={deductOnSync} onChange={e => setDeductOnSync(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
                Deduct stock for fully-mapped orders
              </label>
              <button
                type="button"
                onClick={handleSync}
                disabled={busy === 'sync'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                {busy === 'sync' ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
            {settings.lastSyncedAt && (
              <p className="text-xs text-slate-500">Last fetched {new Date(settings.lastSyncedAt).toLocaleString('en-GB')}</p>
            )}
          </div>

          {/* Webhooks */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={label}>Live webhooks</span>
              <input
                type="url"
                value={callbackUrl}
                onChange={e => setCallbackUrl(e.target.value)}
                placeholder="https://your-tunnel.ngrok-free.dev/api/shopify/webhook"
                aria-label="Webhook callback URL"
                className={`${field} flex-1 font-mono`}
              />
              <button
                type="button"
                onClick={handleRegisterWebhooks}
                disabled={busy === 'hooks' || !callbackUrl.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Webhook className="h-3.5 w-3.5" /> {busy === 'hooks' ? 'Registering…' : 'Register'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Shopify requires HTTPS. Orders also arrive via Fetch above, so webhooks are optional.
            </p>
            {settings.registeredWebhooks?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {settings.registeredWebhooks.map(w => (
                  <span key={w.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-800">
                    {w.topic}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SKU mapping */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between">
              <span className={label}>
                SKU mapping {unmappedCount > 0 && <span className="ml-1 text-pink-700">· {unmappedCount} unmapped</span>}
              </span>
              <span className="text-xs text-slate-500">{skus.length} SKU{skus.length === 1 ? '' : 's'} seen on orders</span>
            </div>

            {skus.length === 0 ? (
              <p className="text-xs text-slate-500">Fetch some orders and the SKUs they sold will appear here to map.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Sold SKU</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Blank consumed</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Packaging</th>
                      <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skus.map(row => (
                      <tr key={row.sku} className={`border-b border-slate-100 last:border-0 ${row.mapped ? '' : 'bg-pink-50/40'}`}>
                        <td className="px-3 py-1.5">
                          <span className="font-mono font-semibold text-slate-800">{row.sku}</span>
                          <span className="ml-2 text-slate-500">{row.title?.slice(0, 30)}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            aria-label={`Blank consumed by ${row.sku}`}
                            defaultValue=""
                            onChange={e => saveMapping(row.sku, e.target.value, '')}
                            className="rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                          >
                            <option value="">— choose —</option>
                            {blanks.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            aria-label={`Packaging used by ${row.sku}`}
                            defaultValue=""
                            onChange={e => saveMapping(row.sku, '', e.target.value)}
                            className="rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                          >
                            <option value="">None</option>
                            {packaging.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          {row.mapped ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                              {row.resolvedVia === 'exact_sku' ? 'matches a catalogue SKU' : 'mapped'}
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
