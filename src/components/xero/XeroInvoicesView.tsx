import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { XeroSyncMode, XeroInvoice } from '../../types';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { XeroWebhookHub } from './XeroWebhookHub';
import { 
  FileText, 
  Plus, 
  CheckCircle2, 
  RefreshCw, 
  Zap, 
  Trash2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Key,
  ShieldCheck,
  DownloadCloud,
  LogOut,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface XeroInvoicesViewProps {
  onOpenCreateInvoice: () => void;
}

export const XeroInvoicesView: React.FC<XeroInvoicesViewProps> = ({ onOpenCreateInvoice }) => {
  const { 
    invoices, 
    deductXeroInvoice, 
    deleteXeroInvoice, 
    mockGenerateXeroInvoice,
    xeroOAuthStatus,
    saveXeroCredentials,
    disconnectXero,
    syncRealXeroInvoices
  } = useInventory();
  
  const [filter, setFilter] = useState<'all' | 'pending' | 'deducted'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);

  // Real Xero OAuth form states
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [redirectUriInput, setRedirectUriInput] = useState('http://localhost:5000/api/xero/callback');
  const [showSecret, setShowSecret] = useState(false);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(true);

  // Invoice sync date filter
  const today = new Date().toISOString().slice(0, 10);
  const [syncMode, setSyncMode] = useState<XeroSyncMode>('recent');
  const [syncLimit, setSyncLimit] = useState(5);
  const [detailInvoice, setDetailInvoice] = useState<XeroInvoice | null>(null);
  const [syncDate, setSyncDate] = useState(today);
  const [syncFromDate, setSyncFromDate] = useState(today);
  const [syncToDate, setSyncToDate] = useState(today);

  // Hydrate the form from stored settings exactly once, when they first arrive.
  // This must not depend on the input state it writes: an earlier version
  // re-applied the stored value whenever the input happened to equal the
  // default, which made the default URI impossible to type - every keystroke
  // that completed it was immediately reverted.
  const hasHydratedForm = useRef(false);
  useEffect(() => {
    if (hasHydratedForm.current || !xeroOAuthStatus) return;
    hasHydratedForm.current = true;

    if (xeroOAuthStatus.clientId) setClientIdInput(xeroOAuthStatus.clientId);
    if (xeroOAuthStatus.redirectUri) setRedirectUriInput(xeroOAuthStatus.redirectUri);
  }, [xeroOAuthStatus]);

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUriInput.trim());
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2200);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdInput.trim() || !clientSecretInput.trim()) {
      setActionMessage({ type: 'error', text: 'Please enter both Client ID and Client Secret from your Xero App.' });
      return;
    }
    setIsSavingCreds(true);
    setActionMessage(null);
    const res = await saveXeroCredentials(clientIdInput.trim(), clientSecretInput.trim(), redirectUriInput.trim());
    setIsSavingCreds(false);
    if (res.success) {
      setActionMessage({ type: 'success', text: 'Credentials & Redirect URI saved! Now click "Connect with Xero" below.' });
      setClientSecretInput('');
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
  };

  const handleConnectWithXero = () => {
    window.location.href = '/api/xero/oauth/connect';
  };

  const handleDisconnectXero = async () => {
    if (!window.confirm('Are you sure you want to disconnect from your real Xero organisation?')) return;
    setIsDisconnecting(true);
    const res = await disconnectXero();
    setIsDisconnecting(false);
    if (res.success) {
      setActionMessage({ type: 'success', text: 'Disconnected from Xero. You can connect again at any time.' });
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
  };

  const handleSyncRealInvoices = async () => {
    // Fetching everything can pull thousands of invoices and burn the daily
    // Xero rate limit, so it never runs without an explicit yes.
    if (syncMode === 'all' && !window.confirm(
      'Fetch EVERY invoice in your Xero organisation?\n\n' +
      'This can import thousands of records and use most of your 5,000/day Xero API limit. ' +
      'Use "Latest" or a date filter instead unless you really want a full import.'
    )) return;

    setIsSyncing(true);
    setActionMessage(null);
    const res = await syncRealXeroInvoices(
      syncMode === 'date'
        ? { mode: 'date', date: syncDate }
        : syncMode === 'range'
        ? { mode: 'range', fromDate: syncFromDate, toDate: syncToDate }
        : syncMode === 'all'
        ? { mode: 'all' }
        : { mode: 'recent', limit: syncLimit }
    );
    setIsSyncing(false);
    if (res.success) {
      setActionMessage({ 
        type: 'success', 
        text: res.message || `Successfully synced ${res.importedCount ?? 0} invoices from Xero!` 
      });
      setTimeout(() => setActionMessage(null), 5000);
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (filter === 'pending') return inv.stockDeducted === 0;
    if (filter === 'deducted') return inv.stockDeducted === 1;
    return true;
  });

  const handleDeduct = async (invoiceId: string) => {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!window.confirm(
      `Deduct stock for invoice ${invoice?.invoiceNumber ?? invoiceId}?\n\n` +
      `This writes the deduction to the stock ledger and cannot be undone.`
    )) return;
    setProcessingId(invoiceId);
    const res = await deductXeroInvoice(invoiceId);
    setProcessingId(null);
    if (res.success) {
      setFeedback({ id: invoiceId, message: res.message });
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const handleDelete = async (invoiceId: string) => {
    if (!window.confirm("Are you sure you want to delete this invoice?")) return;
    setProcessingId(invoiceId);
    const res = await deleteXeroInvoice(invoiceId);
    setProcessingId(null);
    if (res.success) {
      setFeedback({ id: invoiceId, message: res.message });
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const totalInvoiceRevenue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalTrueLandedCost = invoices.reduce((sum, inv) => sum + (inv.totalLandedCost || 0), 0);
  const totalTrueGrossProfit = totalInvoiceRevenue - totalTrueLandedCost;
  const averageMargin = totalInvoiceRevenue > 0 ? (totalTrueGrossProfit / totalInvoiceRevenue) * 100 : 0;
  const pendingCount = invoices.filter(i => i.stockDeducted === 0).length;

  const isConnected = !!xeroOAuthStatus?.connected;
  const hasSavedCreds = !!xeroOAuthStatus?.hasCredentials;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-slate-900 font-heading">
                Xero Invoices & Automated Stock Deductions
              </h2>
              {isConnected ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Connected: {xeroOAuthStatus.tenantName || 'Xero'}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                  Setup Required (Real OAuth 2.0)
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Natural language parsing of invoice line descriptions (e.g. "11oz white mugs custom printed"), smart matching with blank inventory SKUs, and accurate real-time COGS & profit margins.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 self-start md:self-auto flex-wrap gap-y-2">
          {isConnected ? (
            <button
              onClick={handleSyncRealInvoices}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Live Invoices...' : 'Sync Invoices from Real Xero'}</span>
            </button>
          ) : (
            <button
              onClick={() => mockGenerateXeroInvoice()}
              className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Simulate Inbound Invoice</span>
            </button>
          )}

          <button
            onClick={onOpenCreateInvoice}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md shadow-slate-900/10 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-300" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Real Xero OAuth 2.0 Step-by-Step Connection Section */}
      <div className={`rounded-2xl border transition-all ${
        isConnected 
          ? 'bg-gradient-to-r from-emerald-50/60 via-white to-blue-50/40 border-emerald-200 p-5 shadow-[0_2px_12px_rgba(16,185,129,0.06)]' 
          : 'bg-white border-indigo-200/80 p-6 shadow-[0_2px_16px_rgba(79,70,229,0.06)]'
      }`}>
        
        {/* Connected State Banner */}
        {isConnected ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Connected to Real Xero Organisation
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wide">
                    Live Active
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Organisation: <strong className="text-slate-900 font-semibold">{xeroOAuthStatus.tenantName || 'PrintBerry Ltd'}</strong></span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="font-mono text-slate-500 text-[11px]">Tenant ID: {xeroOAuthStatus.tenantId ? `${xeroOAuthStatus.tenantId.slice(0, 14)}...` : 'Connected'}</span>
                  {xeroOAuthStatus.connectedAt && (
                    <>
                      <span className="text-slate-300">&bull;</span>
                      <span className="text-slate-400">Connected: {new Date(xeroOAuthStatus.connectedAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
              {/* Date filter for the invoice pull */}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <span className="text-xs font-semibold text-slate-600 mr-0.5">Fetch:</span>

                {([
                  { id: 'recent', label: 'Latest' },
                  { id: 'date', label: 'Single day' },
                  { id: 'range', label: 'Date range' },
                  { id: 'all', label: 'All invoices' }
                ] as { id: XeroSyncMode; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSyncMode(opt.id)}
                    aria-pressed={syncMode === opt.id}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      syncMode === opt.id
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}

                {syncMode === 'recent' && (
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 25, 50].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSyncLimit(n)}
                        aria-pressed={syncLimit === n}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          syncLimit === n
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <span className="sr-only">Number of most recent invoices to fetch</span>
                      <input
                        type="number"
                        min={1}
                        max={250}
                        value={syncLimit}
                        onChange={e => setSyncLimit(Math.min(250, Math.max(1, Number(e.target.value) || 1)))}
                        className="w-16 px-2 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                )}

                {syncMode === 'date' && (
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <span className="sr-only">Invoice date to fetch</span>
                    <input
                      type="date"
                      value={syncDate}
                      max={today}
                      onChange={e => setSyncDate(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                )}

                {syncMode === 'range' && (
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <span>From</span>
                      <input
                        type="date"
                        value={syncFromDate}
                        max={syncToDate}
                        onChange={e => setSyncFromDate(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <span>To</span>
                      <input
                        type="date"
                        value={syncToDate}
                        min={syncFromDate}
                        max={today}
                        onChange={e => setSyncToDate(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 text-right">
                {syncMode === 'recent' && `Fetches the ${syncLimit} newest invoice${syncLimit === 1 ? '' : 's'} by invoice date - 1 API call`}
                {syncMode === 'date' && `Only invoices dated ${syncDate}`}
                {syncMode === 'range' && `Invoices dated ${syncFromDate} to ${syncToDate} inclusive`}
                {syncMode === 'all' && 'Every AUTHORISED, PAID and SUBMITTED invoice - can be thousands'}
              </p>

            <div className="flex items-center space-x-2.5 justify-end">
              <button
                onClick={handleSyncRealInvoices}
                disabled={isSyncing}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer active:scale-95"
              >
                <DownloadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Fetch Live Invoices'}</span>
              </button>

              <button
                onClick={handleDisconnectXero}
                disabled={isDisconnecting}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer"
                title="Disconnect Xero account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
            </div>
          </div>
        ) : (
          /* Step-by-Step Connection Wizard */
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 font-bold">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 font-heading">
                    Connect Real Xero Account (3 Simple Steps)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Follow this checklist to authenticate PrintBerry IQ with your real Xero organisation via official OAuth 2.0.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSetupGuide(!showSetupGuide)}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center space-x-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span>{showSetupGuide ? 'Hide Instructions' : 'Show Instructions'}</span>
                {showSetupGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showSetupGuide && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Step 1 */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
                      <span>Create Free App in Xero</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11.5px]">
                      Sign in to the Xero Developer Portal and click <strong>"New App"</strong>.
                    </p>
                    <div className="space-y-1.5 pt-1 text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
                      <div><strong>Type:</strong> Web app</div>
                      <div><strong>App name:</strong> PrintBerry IQ</div>
                      <div>
                        <strong>Company URL:</strong> <span className="text-emerald-700 font-bold">https://printberry.co.uk</span>
                        <span className="text-[10px] text-slate-400 block font-sans">*(Xero requires https:// for Company URL)*</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href="https://developer.xero.com/app/manage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3.5 inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-indigo-600 border border-slate-200 font-semibold shadow-2xs transition-colors"
                  >
                    <span>Open developer.xero.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Step 2 */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                      <span>Set OAuth 2.0 Redirect URI</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11.5px]">
                      In your Xero App configuration, add your Redirect URI:
                    </p>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-slate-900 font-mono text-[10.5px] break-all select-all flex items-center justify-between gap-1 shadow-2xs">
                      <span>{redirectUriInput}</span>
                      <button
                        onClick={handleCopyUri}
                        title="Copy to clipboard"
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0 cursor-pointer"
                      >
                        {copiedUri ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {copiedUri && (
                      <span className="text-[10px] text-emerald-600 font-semibold block">Copied to clipboard!</span>
                    )}
                    <div className="text-[10.5px] text-slate-500 space-y-1 bg-amber-50/60 p-2 rounded border border-amber-200/60">
                      <p>
                        &bull; <strong>Local testing:</strong> Xero allows <code className="bg-white px-1 py-0.5 rounded border text-slate-800">http://localhost:5000/api/xero/callback</code> (localhost exception).
                      </p>
                      <p>
                        &bull; <strong>HTTPS Tunnel:</strong> If you prefer full HTTPS, run <code className="bg-white px-1 py-0.5 rounded border text-slate-800">npx localtunnel --port 5000</code> and paste your HTTPS address.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 pt-1">
                    Click "Generate a secret" inside Xero to get your Client Secret.
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                      <span>Authorize Organisation</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11.5px]">
                      Save your credentials below, then click <strong>"Connect with Xero"</strong> to authorize PrintBerry IQ with your organisation.
                    </p>
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 inline mr-1" />
                      Free Tier: 5,000 API calls/month, no monthly Xero developer fee required.
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 pt-2">
                    Uses official OAuth 2.0 with offline_access for auto-refresh.
                  </div>
                </div>
              </div>
            )}

            {/* Credential Inputs Form */}
            <form onSubmit={handleSaveCredentials} className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Xero Client ID
                  </label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="e.g. 5D8F9A4B-3C2E-4F81-912A-18F42C12D3A1"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Xero Client Secret
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      {showSecret ? 'Mask Secret' : 'Show Secret'}
                    </button>
                  </div>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder={hasSavedCreds ? '•••••••••••••••••••••••• (Credential stored)' : 'Paste generated client secret'}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    OAuth 2.0 Redirect URI
                  </label>
                  <input
                    type="text"
                    value={redirectUriInput}
                    onChange={(e) => setRedirectUriInput(e.target.value)}
                    placeholder="http://localhost:5000/api/xero/callback"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                <div className="text-xs text-slate-500">
                  {hasSavedCreds ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Client ID stored in secure SQLite. Ready to authorize.
                    </span>
                  ) : (
                    <span>Credentials are stored locally in your database.</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="submit"
                    disabled={isSavingCreds}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCreds ? 'Saving...' : 'Save Settings'}
                  </button>

                  <button
                    type="button"
                    onClick={handleConnectWithXero}
                    disabled={!hasSavedCreds && !clientIdInput}
                    className="px-5 py-2 rounded-xl bg-[#13b5ea] hover:bg-[#0fa0cf] text-white text-xs font-bold shadow-md shadow-[#13b5ea]/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Connect with Xero</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Action Alert Banner */}
        {actionMessage && (
          <div className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
            >
              &times;
            </button>
          </div>
        )}

      </div>

      {/* 4 Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="text-[11px] font-semibold text-slate-400 uppercase">Invoiced to Clients</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 font-heading">
            £{totalInvoiceRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">{invoices.length} Total Invoices</div>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="text-[11px] font-semibold text-slate-400 uppercase">True Landed COGS</div>
          <div className="text-2xl font-extrabold text-amber-600 mt-1 font-heading">
            £{totalTrueLandedCost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Real production & material cost</div>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="text-[11px] font-semibold text-slate-400 uppercase">Real Gross Profit</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1 font-heading">
            £{totalTrueGrossProfit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-emerald-600 font-bold mt-1">Average Margin: {averageMargin.toFixed(1)}%</div>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="text-[11px] font-semibold text-slate-400 uppercase">Pending Deductions</div>
          <div className={`text-2xl font-extrabold mt-1 font-heading ${pendingCount > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
            {pendingCount} Invoices
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">
            {pendingCount > 0 ? 'Requires stock confirmation' : 'All stock reconciled'}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === 'all' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === 'pending' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Pending Deduction ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('deducted')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === 'deducted' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Deducted & Closed ({invoices.filter(i => i.stockDeducted === 1).length})
        </button>
      </div>

      {/* Invoices List */}
      <div className="space-y-4">
        {filteredInvoices.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 border border-indigo-100">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800">
              {isConnected ? 'No invoices loaded yet' : 'Database Cleaned — Ready for Real Testing'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              {isConnected 
                ? 'Your Xero account is connected! Click "Sync Invoices from Real Xero" above to import your live invoices, or create a test invoice.'
                : 'All dummy test invoices have been wiped from the system. Follow the 3-step guide above to connect your real Xero organisation and test live syncing.'}
            </p>
            <div className="flex items-center justify-center space-x-3 mt-5">
              {isConnected ? (
                <button
                  onClick={handleSyncRealInvoices}
                  disabled={isSyncing}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <DownloadCloud className="w-3.5 h-3.5 inline mr-1.5" />
                  <span>Sync Invoices from Xero</span>
                </button>
              ) : (
                <button
                  onClick={handleConnectWithXero}
                  disabled={!hasSavedCreds}
                  className="px-4 py-2 rounded-xl bg-[#13b5ea] hover:bg-[#0fa0cf] text-white text-xs font-bold shadow-md shadow-[#13b5ea]/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <ExternalLink className="w-3.5 h-3.5 inline mr-1.5" />
                  <span>Connect with Xero</span>
                </button>
              )}

              <button
                onClick={onOpenCreateInvoice}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                <span>Create Manual Invoice</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th scope="col" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice</th>
                    <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                    <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Date</th>
                    <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</th>
                    <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                    <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">COGS</th>
                    <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Gross profit</th>
                    <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Stock</th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => {
                    const isDeducted = inv.stockDeducted === 1;
                    const unmatched = (inv.lines || []).filter(l => !l.nonStock && !l.matchedBlankId).length;
                    const profit = inv.trueGrossProfit ?? 0;

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setDetailInvoice(inv)}
                        className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setDetailInvoice(inv); }}
                            className="font-mono text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="max-w-[240px] truncate font-medium text-slate-800" title={inv.customerName}>
                            {inv.customerName}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{inv.invoiceDate}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{(inv.lines || []).length}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          £{(inv.totalAmount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-700 tabular-nums whitespace-nowrap">
                          £{(inv.totalLandedCost || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <span className={`font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            £{profit.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {inv.marginPercent !== undefined && (
                            <span className="ml-1.5 text-xs text-slate-500 tabular-nums">{inv.marginPercent}%</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {isDeducted ? (
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              Deducted {inv.deductedAt?.slice(0, 10)}
                            </span>
                          ) : unmatched > 0 ? (
                            <span className="inline-flex items-center rounded-md border border-pink-200 bg-pink-50 px-2 py-0.5 text-xs font-semibold text-pink-700 whitespace-nowrap">
                              {unmatched} line{unmatched === 1 ? '' : 's'} unmatched
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 whitespace-nowrap">
                              Ready to deduct
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleDelete(inv.id); }}
                              aria-label={`Delete invoice ${inv.invoiceNumber}`}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <span className="text-xs text-slate-500">
                Showing {filteredInvoices.length} of {invoices.length} · newest first
              </span>
              <span className="text-xs text-slate-500">Click any row to match lines and deduct stock</span>
            </div>
          </div>
        )}
      </div>

      {/* Webhook verification lives with the rest of the Xero screens */}
      <XeroWebhookHub />

      <InvoiceDetailModal
        invoice={detailInvoice ? invoices.find(i => i.id === detailInvoice.id) ?? null : null}
        onClose={() => setDetailInvoice(null)}
      />

    </div>
  );
};
